# Domain — aldercowork 领域知识图谱
> 新开发者读完此文件即可独立工作。只描述当前真相，不记录历史变更。

## 系统架构
- **Monorepo**: pnpm workspace — `apps/desktop`(Tauri v2 + Vite + Vue 3) + `packages/{kernel-manager, sdk, skill-schema}`
- **Rust 壳** (`src-tauri/`): sidecar 生命周期 (`kernel.rs`) + IPC 命令 (`main.rs`) + `DataPaths` 平台目录隔离
- **前端**: Vue Router 4 + Pinia — 四路由 (`/` Chat, `/skills`, `/runbooks`, `/settings`)
- **设计系统**: `tokens.css`(dark/light) + `reset.css` + `markdown.css`；双层材质 Shell(Layer0) / Content(Layer1)
- **SDK**: 官方 `@opencode-ai/sdk` 直连，`@aldercowork/sdk` 当前未消费

## 核心数据流
```text
App.vue → AppShell (Header/Sidebar/Content) → router-view
  ChatView: useChat → SSE event.subscribe → promptAsync → part-centric message model (12 Part types)
    render pacing: useChat commit barrier (rAF scheduler + post-paint yield, ~30fps) → StreamingMarkdown jitter buffer (fast render while streaming, idle-upgrade to rich highlight)
  SkillsView: skillStore → useSkillImport (filesystem scan) → SkillListItem / SkillDetail
  SettingsView: providers / engine / theme / shortcuts

Kernel: main.rs setup → sidecar `opencode serve --port {random}`
  env: XDG_{CONFIG,DATA}_HOME={kernel-state} + OPENCODE_CLIENT=desktop + provider_env
  readiness: poll /health (2xx + 身份校验)

Data dirs (macOS): ~/Library/Application Support/com.aldercowork.desktop/
  ├─ settings.json       ← AlderCowork 配置
  ├─ kernel-state/       ← OpenCode 隔离运行时（config.json, DB, skills/ symlinks）
  ├─ skills/             ← 技能存储库（导入的 SKILL.md 源文件）
  └─ workspace/          ← 默认工作区
```

## 架构决策
| 决策 | 说明 | 理由 |
|---|---|---|
| Kernel Data Isolation | XDG_CONFIG_HOME + XDG_DATA_HOME 重定向到 `kernel-state/opencode/` | 与用户 `~/.config/opencode` 完全隔离 |
| Skill Three-Layer Model | 存储(`{APP_DATA}/skills/`) → 全局激活(symlink 到 `{kernel-state}/opencode/.agents/skills/{leaf}`) → 工作区激活(symlink 到 `{workspace}/.agents/skills/{leaf}`) | 利用 OpenCode 原生 `.agents` 代理兼容目录发现；一个技能可同时激活到全局和工作区 |
| Skill Activation IPC | `activate_skill(id, scope, ws_path)` / `deactivate_skill` / `get_skill_activations` — Rust 管理 symlink 创建/删除 | 安装 ≠ 激活；删除自动清理两个范围的 symlink |
| Skill Recursive Discovery | `discover_skills_recursive` 递归扫描含 SKILL.md 的目录，ID 为相对路径（如 `monorepo/sub-skill`） | 支持 monorepo 布局 |
| Skill Import | 压缩包 `unzip`/`tar` CLI 解压 + hoist；Git `--depth=1` 浅克隆。`sanitize_skill_name` 清理目录名 | 复用系统工具，零 Rust 解压依赖 |
| Skill Frontmatter Parser | 对齐 OpenCode 官方标准：仅解析 SKILL.md 的 YAML frontmatter（name/description/license/compatibility/metadata），支持多行 block scalar（`\|` / `>`） | 与内核行为一致；无 skill.yaml 双轨 |
| Part-Centric Message Model | `RichMessage { parts: MessagePart[] }` — 12 种 Part type 同构 SDK | 新增 Part Type 只需添加渲染组件 |
| SSE Stream Contract | `event.subscribe(/event) → promptAsync → session.idle`，结束后 `session.messages` 对齐 | 与 OpenCode 官方流式协议一致 |
| File-based Settings | `settings.json` 通过 Tauri IPC 读写，`settingsStore` 唯一写入者 | 跨窗口/进程一致 |
| Provider Config | OpenCode `config.json` 唯一配置源（API Key/Base URL），变更后重启内核生效 | 消除双轨漂移 |
| Data Path Security | `write_data_file` 校验 relative path + canonical parent + `O_NOFOLLOW`，进程级写锁 | 阻断 TOCTOU + symlink 逃逸 |
| Provider Env Guard | env key 仅允许 `OPENAI_`/`ANTHROPIC_` 前缀，禁止系统敏感变量 | 收敛注入面 |
| Permission Reply | `permission.reply(requestID)` 回传 `once/always/reject`（默认拒绝） | 避免权限悬挂 |
| Model Selection | 无显式模型时不传 `model` 字段让内核决定；显式选择经 `provider.list` 校验 | Auto 模式与 SDK 行为一致 |
| Per-Request Directory | SDK client 通过 `x-opencode-directory` header 传递工作区路径，切换工作区重建 client —— 内核无需重启 | sidecar 进程无状态，工作目录 per-request 级 |
| i18n | 所有用户可见文本通过 `t()` 从 `zh.ts`/`en.ts` 读取 | 中英双语 |

## 设计系统
- `tokens.css`: Typography / Radius / Motion / Layout + dark/light 双主题
- 双层材质: Shell(`--shell`) 包裹 Content(`--content`)，Content 区域 `--r-2xl` 圆角
- 基础组件: `AppButton(brand/ghost/subtle)` / `AppBadge` / `AppIcon` / `AppCodeBlock`
- Part 渲染: `StreamingMarkdown`(morphdom 增量) / `ReasoningBlock`(折叠思维链) / `TokenStats` / `PatchDiff` / `FileAttachment`
- Streaming 约束: 流式期默认 fast markdown（禁用 highlight.js）降低 CPU + 限制渐显动画只作用于 block 节点；结束后 idle 时段升级 rich render（语法高亮 + copy button）
