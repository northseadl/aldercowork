# Domain — aldercowork 领域知识图谱
> 新开发者读完此文件即可独立工作。只描述当前真相，不记录历史变更。

## 系统架构
- **Monorepo**: pnpm workspace — `apps/desktop`(Tauri v2 + Vite + Vue 3) + `packages/{kernel-manager, sdk, skill-schema}`
- **Rust 壳** (`src-tauri/`): sidecar 生命周期 (`kernel.rs`) + IPC/数据路径 (`main.rs`) + Skill 管理/归档/激活 (`skill.rs`) + `DataPaths` 平台目录隔离
- **前端**: Vue Router 4 + Pinia — 四路由 (`/` Chat, `/skills`, `/runbooks`, `/settings`)
- **设计系统**: `tokens.css`(dark/light) + `reset.css` + `markdown.css`；双层材质 Shell(Layer0) / Content(Layer1)
- **SDK**: 官方 `@opencode-ai/sdk/v2/client` 子路径导入（禁止使用 `v2` 入口，会拖入 server.js + node:child_process）
- **发布目标**: 仅支持 macOS (arm64/x64) 与 Windows (x64)，CI/Release 不再包含 Linux

## 核心数据流
```text
App.vue → AppShell (Header/Sidebar/Content) → router-view
  ChatView: useChat → SSE event.subscribe → promptAsync → part-centric message model (12 Part types)
    render pacing: useChat commit barrier (rAF scheduler + post-paint yield, ~30fps) → StreamingMarkdown jitter buffer (fast render while streaming, idle-upgrade to rich highlight)
  SkillsView: skillStore → useSkillImport (filesystem scan) → SkillListItem / SkillDetail
  RunbooksView: runbookStore (CRUD + JSON persist via read/write_data_file) → RunbookListItem / RunbookEditor (textarea + @skill highlight + todo checkbox preview)
  SettingsView: providers / engine / theme / shortcuts

Kernel: main.rs setup → sidecar `opencode serve --port {random}`
  env: XDG_{CONFIG,DATA}_HOME={kernel-state} + OPENCODE_CLIENT=desktop + provider_env
  readiness: poll /health (仅 HTTP 2xx)

Data dirs (macOS): ~/Library/Application Support/com.aldercowork.desktop/
  ├─ settings.json       ← AlderCowork 配置
  ├─ runbooks.json       ← 运行手册数据（JSON 数组）
  ├─ kernel-state/       ← OpenCode 隔离运行时（config.json, DB, skills/ symlinks）
  ├─ skills/             ← 技能存储库（导入的 SKILL.md 源文件）
  └─ workspace/          ← 默认工作区
```

## 架构决策
| 决策 | 说明 | 理由 |
|---|---|---|
| SDK Client Subpath | 前端必须使用 `@opencode-ai/sdk/v2/client` 而非 `v2` 导入。`v2/index.js` 会 re-export `server.js`（含 `node:child_process`），Vite 无法 tree-shake → production bundle 白屏 | WebView 非 Node.js 环境 |
| Sidecar Root Placement | `externalBin: ["opencode"]`，sidecar 放在 `src-tauri/opencode-{triple}`（非 `binaries/` 子目录）。开发模式查找 `src-tauri/opencode-{triple}`，生产 bundle 查找 `Contents/MacOS/opencode` | Tauri bundle 扁平化 sidecar 到 MacOS/ 但 `relative_command_path()` 保留子目录前缀 |
| Kernel Data Isolation | XDG_CONFIG_HOME + XDG_DATA_HOME 重定向到 `kernel-state/opencode/` | 与用户 `~/.config/opencode` 完全隔离 |
| Skill Three-Layer Model | 存储(`{APP_DATA}/skills/`) → 全局激活(symlink 到 `{kernel-state}/opencode/.agents/skills/{leaf}`) → 工作区激活(symlink 到 `{workspace}/.agents/skills/{leaf}`) | 利用 OpenCode 原生 `.agents` 代理兼容目录发现；一个技能可同时激活到全局和工作区 |
| Skill Discovery Bridge | 启动时在 config.json 注入 `skills.paths = ["{kernel-state}/opencode/.agents/skills"]` | **XDG 隔离只影响 config/data，不影响技能发现**（OpenCode 硬编码 `os.homedir()/.agents/skills/`）。需要 `skills.paths` 桥接 |
| Release Target Scope | GitHub Actions CI/Release 仅保留 `macos-14`(arm64) / `macos-latest`(x64 target) / `windows-latest`(x64)，移除 Linux runner 与 Linux bundles | 降低发布矩阵复杂度，消除 Linux 打包链路引入的不稳定性 |
| Skill Activation IPC | `activate_skill(id, scope, ws_path)` / `deactivate_skill` / `get_skill_activations` — Rust 管理 symlink 创建/删除 | 安装 ≠ 激活；删除自动清理两个范围的 symlink |
| Skill Recursive Discovery | `discover_skills_recursive` 递归扫描含 SKILL.md 的目录，ID 为相对路径（如 `monorepo/sub-skill`） | 支持 monorepo 布局 |
| Skill Import | 压缩包通过 Rust crate 解压（`zip` / `flate2` + `tar`）+ hoist；Git 支持普通仓库 URL（`--depth=1` 浅克隆）和平台子目录 URL（`/tree/{branch}/{path}` → sparse-checkout + hoist）。`sanitize_skill_name` 清理目录名，子目录 URL 从 subpath 叶节点推导名称 | 纯 Rust 归档解压，跨平台（Windows 无 unzip/tar 命令）；用户可直接粘贴 GitHub 子目录链接 |
| Skill Frontmatter Parser | 对齐 OpenCode 官方标准：仅解析 SKILL.md 的 YAML frontmatter（name/description/license/compatibility/metadata），支持多行 block scalar（`\|` / `>`） | 与内核行为一致；无 skill.yaml 双轨 |
| Part-Centric Message Model | `RichMessage { parts: MessagePart[] }` — 12 种 Part type 同构 SDK | 新增 Part Type 只需添加渲染组件 |
| @ File/Symbol Reference | `useReference` composable 通过 SDK `find.files()` / `find.symbols()` 搜索，选中后构造 `FilePartInput { source: FilePartSource }` 推入 `promptAsync.parts`。`@` 在 textarea 中触发 popover（防抖 200ms），三种引用源：`FileSource`(路径) / `SymbolSource`(LSP) / `ResourceSource`(MCP)。引用与 attachments 并行，但渲染为 brand 色 chip 以视觉区分 | 与 OpenCode TUI `@` 引用协议完全对齐；零 sidecar 变更 |
| SSE Stream Contract | `event.subscribe(/event) → promptAsync → session.idle`，结束后 `session.messages` 对齐 | 与 OpenCode 官方流式协议一致 |
| File-based Settings | `settings.json` 通过 Tauri IPC 读写，`settingsStore` 唯一写入者 | 跨窗口/进程一致 |
| Provider Config | OpenCode `config.json` 唯一配置源（API Key/Base URL），变更后重启内核生效 | 消除双轨漂移 |
| Provider UI Shadow State | Settings UI 读取 `settings.json.providers` 的 `hasKey/baseUrl` 作为展示状态；未在启动时从 `config.json` 反向水合 | 读取体验快，但存在“配置真实值与 UI 投影”漂移风险 |
| Provider Restart Trigger | 默认由 `App.vue` 监听 `settingsStore.providerStates` 快照差异并在 2s 防抖后 `kernel.restart()`；额外在 `SettingsProvider` 对 `hasKey=true→true` 的密钥轮换做定向重启补偿 | 既避免初始化阶段误重启，又覆盖“影子态不变但密钥值已轮换”的漏检场景 |
| Data Path Security | `write_data_file` 校验 relative path + canonical parent + `O_NOFOLLOW`，进程级写锁 | 阻断 TOCTOU + symlink 逃逸 |
| Provider Env Guard | env key 仅允许 `OPENAI_`/`ANTHROPIC_` 前缀，禁止系统敏感变量 | 收敛注入面 |
| Permission Reply | `permission.reply(requestID)` 回传 `once/always/reject`（默认拒绝） | 避免权限悬挂 |
| Model Selection | 无显式模型时不传 `model` 字段让内核决定；显式选择经 `provider.list` 校验 | Auto 模式与 SDK 行为一致 |
| Model Switch Apply | Chat 内 `ModelPicker` 写入 `config.json model` 后触发内核重启（250ms 防抖）并先取消当前流 | 消除“模型已选中但内核未重载配置”的假成功状态 |
| Per-Request Directory | SDK client 通过 `x-opencode-directory` header 传递工作区路径，切换工作区重建 client —— 内核无需重启 | sidecar 进程无状态，工作目录 per-request 级 |
| Session Title Lifecycle | 前端即时命名（截取前40字 → `session.update` 持久化）+ 内核自动摘要（SSE `session.updated` → `updateSessionTitle` 实时覆盖） | 策略B：即时反馈+后端覆盖，两条链路互补 |
| Session History Fetch | 当前 `session.list()` / `session.messages()` 走默认参数（未使用 start/search/limit） | 接入简单，但大规模历史下缺少分页与搜索控制面 |
| Runbook JSON Persistence | `runbooks.json` 通过 `read_data_file`/`write_data_file` IPC 读写，`runbookStore` 唯一写入者。Runbook 是带 `@skill` 引用和 `- [ ]` todo 标记的结构化笔记，整体作为 prompt 执行 | 零 Rust 变更复用已有 IPC；内容即 prompt，无需执行引擎 |
| Runbook→Chat Handoff | Runbook 发送聊天使用双通道：`sessionStorage` durable 草稿 + `window` 事件即时投递；ChatView 挂载时消费并清除草稿 | 规避跨路由事件先发后挂载导致的 payload 丢失，同时保留同页即时响应 |
| i18n | 所有用户可见文本通过 `t()` 从 `zh.ts`/`en.ts` 读取 | 中英双语 |

## 设计系统
- `tokens.css`: Typography / Radius / Motion / Layout + dark/light 双主题（`--on-brand`, `--syntax-{string,function,number,literal}` 等 token 在两个主题块均有定义）
- 双层材质: Shell(`--shell`) 包裹 Content(`--content`)，Content 区域 `--r-2xl` 圆角
- 基础组件: `AppButton(brand/ghost/subtle)` / `AppBadge` / `AppIcon` / `AppCodeBlock`
- Part 渲染: `StreamingMarkdown`(morphdom 增量) / `ReasoningBlock`(折叠思维链) / `TokenStats` / `PatchDiff` / `FileAttachment`
- Streaming 约束: 流式期默认 fast markdown（禁用 highlight.js）降低 CPU + 限制渐显动画只作用于 block 节点；结束后 idle 时段升级 rich render（语法高亮 + copy button）
- Theme: `useTheme()` composable 是唯一 writer — 三态 preference (`system|dark|light`, 默认 `system`) + `matchMedia` OS 监听 + reactive DOM sync。ThemeToggle / SettingsTheme / main.ts 均消费此 composable
