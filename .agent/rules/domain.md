# Domain — aldercowork 领域知识图谱
> 新开发者读完此文件即可独立工作。只描述当前真相，不记录历史变更。

## 系统架构
- **Monorepo**: pnpm workspace — `apps/desktop`(Tauri v2 + Vite + Vue 3) + `packages/{kernel-manager, sdk, skill-schema}`
- **Rust 壳** (`src-tauri/`): sidecar 生命周期 (`kernel.rs`) + active profile / tenant registry (`profile.rs`) + IPC/数据路径 (`main.rs`) + Skill 市场/分阶段安装/审计/激活 (`skill.rs`)
- **前端**: Vue Router 4 + Pinia — 五路由 (`/` Chat, `/skills`, `/runbooks`, `/workflow`, `/settings`)；全局 profile 由 `profileStore` 管理，Skills 域拆为 `installedSkillStore` / `marketplaceSkillStore` / `skillAuditStore`
- **设计系统**: `tokens.css`(dark/light) + `reset.css` + `markdown.css`；双层材质 Shell(Layer0) / Content(Layer1)
- **SDK**: 官方 `@opencode-ai/sdk/v2/client` 子路径导入（禁止使用 `v2` 入口，会拖入 server.js + node:child_process）
- **发布目标**: 仅支持 macOS (arm64/x64) 与 Windows (x64)，CI/Release 不再包含 Linux

## 核心数据流
```text
App.vue → AppShell (Header/Sidebar/Content) → router-view
  ChatView: useChat → SSE event.subscribe → promptAsync → part-centric message model (12 Part types) + artifact aggregation (`file.edited` live / tool attachments / active `session.diff(messageID)` / workspace snapshot fallback / optional git status delta / `session.get.summary.diffs` history restore)
    render pacing: useChat commit barrier (rAF scheduler + post-paint yield, ~30fps) → StreamingMarkdown jitter buffer (fast render while streaming, idle-upgrade to rich highlight)
  SkillsView: marketplaceSkillStore + installedSkillStore + skillAuditStore → 市场搜索 / staged install / 本地审计报告 / SkillDetail
  RunbooksView: runbookStore (body+steps model, CRUD + JSON persist via read/write_data_file) -> RunbookListItem (progress bar) / RunbookEditor (textarea + step list, zero-markdown editing UX, no block model)
  SettingsView: providers / engine / theme / shortcuts

Kernel: main.rs setup → inject_modality_overrides(config) → sidecar `opencode serve --port {random}`
  env: XDG_{CONFIG,DATA}_HOME={engine} + OPENCODE_CLIENT=desktop + provider_env
  readiness: poll /health (仅 HTTP 2xx)

Profile registry:
  settings/Profile tab → `connect_enterprise_profile` / `switch_active_profile`
    → Rust profile registry (`global/profile-registry.json`)
    → resolve_data_paths(activeProfile)
    → kernel restart + frontend profile-bound store reload

Data dirs (macOS): ~/Library/Application Support/aldercowork/
  ├─ global/profile-registry.json
  └─ profiles/
      ├─ local~default/
      │   ├─ config/              ← user intent (settings, credentials)
      │   │   ├─ settings.json
      │   │   ├─ runbooks.json
      │   │   └─ credentials/.hub-token
      │   ├─ skills/              ← installed skill sources (JetBrains plugins equivalent)
      │   ├─ skill-staging/       ← staging area for audit
      │   ├─ audit-reports/
      │   ├─ engine/              ← OpenCode XDG isolation target
      │   │   └─ opencode/
      │   │       ├─ config.json / prompts/ / opencode.db / log/ / storage/
      │   │       └─ .agents/skills/  ← symlinks to ../../skills/{id}
      │   └─ workspace/
      └─ enterprise~{hash}~{org}~{user}/  ← same structure
```

## 架构决策
| 决策 | 说明 | 理由 |
|---|---|---|
| SDK Client Subpath | 前端必须使用 `@opencode-ai/sdk/v2/client` 而非 `v2` 导入。`v2/index.js` 会 re-export `server.js`（含 `node:child_process`），Vite 无法 tree-shake → production bundle 白屏 | WebView 非 Node.js 环境 |
| Sidecar Root Placement | `externalBin: ["opencode"]`，sidecar 放在 `src-tauri/opencode-{triple}`（非 `binaries/` 子目录）。开发模式查找 `src-tauri/opencode-{triple}`，生产 bundle 查找 `Contents/MacOS/opencode` | Tauri bundle 扁平化 sidecar 到 MacOS/ 但 `relative_command_path()` 保留子目录前缀 |
| Kernel Data Isolation | XDG_CONFIG_HOME + XDG_DATA_HOME 重定向到 `engine/opencode/` | 与用户 `~/.config/opencode` 完全隔离 |
| Skill Install Pipeline | 市场/手动导入 → `skill-staging/` 隔离区 → 本地审计(`audit-reports/`) → 用户批准后写入 `{APP_DATA}/skills/` | 阻断“下载即执行/安装”，把供应链风险前移到 staging 阶段 |
| Skill Marketplace Abstraction | 前端以 `SkillMarketplaceProvider` 统一开源市场与企业 Hub；Rust IPC 负责搜索/详情/下载/stage/audit/update | 普通版与企业版共用 UI/状态机，只替换目录源与鉴权 |
| Runtime Tenant Model | 编译期 `APP_MODE` 仅是 startup hint；真实身份来自运行时 active profile（`local` / `enterprise`） | 普通用户可连接多个企业并切换身份，避免 build-time fork |
| Profile-root Data Isolation | `config/credentials/skills/skill-staging/audit-reports/engine/workspace` 全部挂在 active profile 根目录下 | 企业隔离边界必须是完整数据根，不能只隔离技能目录 |
| Profile Switch Reload Discipline | `App.vue` 在 profile 切换后先 `refreshPaths()`，再重载 `settings/workspace/skills/runbooks/workflow`；`settingsStore.init()` 先回到默认快照，`workspaceStore` 在 reload 前清空内存状态并取消 debounce save timer | data path 是按 active profile 动态解析的；若不先清基线并取消延迟写入，旧 profile 状态会串写到新 profile |
| Session Bootstrap Discipline | `sessionStore.reloadForProfile(restoredId)` 是 profile-bound session 状态的唯一入口：先失效旧异步代次并 reset，再在当前 client 存在时显式 `loadSessions()`；`App.vue` 在 `reloadProfileBoundState()` 中 `await` 该流程，而不是只依赖 client watcher | 解决“client 先完成 list，随后 profile bootstrap reset 把列表清空”的首次启动竞态；最近会话必须由可等待的原子流程恢复，不能依赖 watcher 时序碰运气 |
| Enterprise Profile Minimalism | `ConnectEnterpriseProfileRequest` 仅需 `hubUrl` + `label?` + `authToken?`；Rust 侧硬编码 org/user = auto 等待 Hub 认证填充。catalogPath 由客户端唯一真理定义，managedSettings 概念完全删除：无 lockedSections/forcedModel/workspaceRoot/providerOverrides。供应商/模型/工作区操作始终可编辑 | 这些配置应由 Hub 认证后下发而非用户手填；锁定行为是客户端实现自身行为，不是可配置项 |
| Skill Discovery Bridge | 启动时在 config.json 注入 `skills.paths = ["{engine}/opencode/.agents/skills"]`；`kernel.rs` 注入 `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` 关闭 OpenCode 内置的 `EXTERNAL_DIRS=[".claude",".agents"]` 扫描（home 目录 + 项目目录向上遍历）。XDG 重定向已将 `Config.directories()` 层（`.opencode/{skill,skills}/**/SKILL.md`）收敛到 engine 目录 | OpenCode 四层扫描：①EXTERNAL_DIRS(~/.claude+~/.agents)→已禁用 ②项目.claude/.agents→已禁用 ③Config.directories→XDG重定向 ④skills.paths→我们注入。仅③④生效 |
| Local Audit Gate | 审计包含 checksum/结构/权限/脚本模式检查；`critical/high` 默认阻断安装 | 企业 Hub 只做目录与鉴权，安全责任不外包给远端服务 |
| Release Target Scope | GitHub Actions CI/Release 仅保留 `macos-14`(arm64) / `macos-latest`(x64 target) / `windows-latest`(x64)，移除 Linux runner 与 Linux bundles | 降低发布矩阵复杂度，消除 Linux 打包链路引入的不稳定性 |
| Branch Model | `main`(生产) / `develop`(集成) / `feat|fix/*`(工作分支)。发布走 develop → main PR → tag → Release CI | 线性历史优先，禁止直推 main/develop |
| Git Hooks Gateway | `.githooks/` 由三个入口 hook + `.githooks/lib/*.sh` 共享库组成：pre-commit 基于 staged 内容做 secret scan 和条件 `cargo check`/`vue-tsc`，对“检测器定义文件/CI secrets 变量名”采用显式 path+pattern allowlist；commit-msg 做 Conventional Commits 校验；pre-push 只依据 ref/OID 拓扑判断 protected branch non-fast-forward 与 tag rewrite，并对 `vX.Y.Z` 做 SemVer gate + 版本文件对齐；`package.json prepare` 自动激活 `core.hooksPath .githooks`，`scripts/hooks-smoke.sh` 负责只读 smoke | 零外部依赖（纯 bash），规则可测试，避免把 `--no-verify` 变成常态流程 |
| Release Convention | `v{major}.{minor}.{patch}` annotated tag 触发 `release.yml` → `tauri-action` → GitHub Draft Release。发版前版本同步由 `scripts/sync-version-from-tag.sh` 统一处理（本地与 CI 同源） | Tag-driven release，发版与代码改动解耦 |
| Skill Activation IPC | `activate_skill(id, scope, ws_path)` / `deactivate_skill` / `get_skill_activations` — Rust 管理 symlink 创建/删除 | 安装 ≠ 激活；删除自动清理两个范围的 symlink |
| Skill Recursive Discovery | `discover_skills_recursive` 递归扫描含 SKILL.md 的目录，ID 为相对路径（如 `monorepo/sub-skill`） | 支持 monorepo 布局 |
| Skill Import | 压缩包通过 Rust crate 解压（`zip` / `flate2` + `tar`）+ hoist；Git 支持普通仓库 URL（`--depth=1` 浅克隆）和平台子目录 URL（`/tree/{branch}/{path}` → sparse-checkout + hoist），但统一落入 `skill-staging/` | 所有手动导入与市场下载共享同一审计/批准流程 |
| Skill Manifest Parsing | `skill.rs` 使用 `serde_yaml` 解析 `skill.yaml`，并从 `SKILL.md` frontmatter 提取 `name`/`description`/preview | 前端不再维护手写 YAML 解析器，避免 schema 漂移与权限展示错误 |
| Part-Centric Message Model | `RichMessage { parts: MessagePart[] }` — 12 种 Part type 同构 SDK | 新增 Part Type 只需添加渲染组件 |
| @ File/Symbol Reference | `useReference` composable 通过 SDK `find.files()` / `find.symbols()` 搜索，选中后构造 `FilePartInput { source: FilePartSource }` 推入 `promptAsync.parts`。`@` 在 textarea 中触发 popover（防抖 200ms），三种引用源：`FileSource`(路径) / `SymbolSource`(LSP) / `ResourceSource`(MCP)。引用与 attachments 并行，但渲染为 brand 色 chip 以视觉区分 | 与 OpenCode TUI `@` 引用协议完全对齐；零 sidecar 变更 |
| SSE Stream Contract | 上游真实语义：`event.subscribe(/event)` 返回的是惰性 SSE stream，直到第一次 `stream.next()` 才真正发起 `GET /event`；服务端连接建立后会立刻先发 `server.connected`。`session.promptAsync` 命中 `/:sessionID/prompt_async`，服务端只做“accepted + 204 立即返回”，真实消息/状态通过 SSE 异步推送；`session.command` 命中同步 `/:sessionID/command`，其内部 `await prompt()` 后才返回；同步 `POST /session/:id/message` 对长任务也可能先在客户端 timeout，而 session 仍继续执行直到落盘并发布 `session.idle`。前端必须在 dispatch 前 prime 到首个 `server.connected`，然后再 arm consumer；turn 归属锚点是客户端自生成的上游兼容 `messageID`，assistant 通过 `parentID === userMessageID` 归属到该 turn。完成态只认 `session.idle`，且不能再要求“assistant part 已出现”才允许结束，因为某些合法 turn 会只持久化 user message（立即 abort / reject / no-output），这类 turn 也必须在 `session.idle` 后收尾并回落到 reconcile/`(No response)` 分支；当最终 assistant `finish=content-filter|length` 且无正文时，UI 必须补可见终止说明，不能只剩 reasoning/tool 过程态 | 这是从上游源码（`server/routes/session.ts` + `server/server.ts` + SDK `serverSentEvents.gen.js` + `session/prompt.ts` + `message-v2.ts`）、本地 engine log 与 `opencode.db` 的 durable state 交叉验证出的事实；直接决定前端 streaming consumer 与最终渲染的正确完成模型 |
| Provider Moderation Boundary | 当前默认模型 `kimi-for-coding/k2p5` 对“实时中文热搜”类任务存在数据依赖的内容过滤边界：同一天同源（新浪）下，`科技/财经` 子集深度研究可 `finish=stop` 并产出完整 Markdown，但“全量热搜深挖”“全量热搜客观摘要”以及部分“标题+一句摘要”任务都可能 `finish=content-filter`；相同主题切换到 `kimi-k2-thinking` 可完成，但耗时显著更长 | 这是通过直接调用 sidecar `/session/:id/message`、比对 `message.finish`/`part` 持久化与引擎日志得到的当前真实行为；因此这类“中断”首先应判定为 provider/model 边界，而不是前端 SSE/渲染故障 |
| Tool Lifecycle UI Source | `SkillCard` 两层渲染：completed 工具压缩为 28px 紧凑行，active/failed 保持完整卡片（spinner + badge + timer + expandable I/O） | 完成态工具视觉退后，注意力自动聚焦到正在运行的工具 |
| Chat Artifact Aggregation | `useChat` 以 turn 为中心聚合多信号文件成果：`file.edited` live 占位、tool `attachments`、回合结束后主动 `session.diff(messageID)` 回填、workspace `file.list` 快照兜底新增/删除、可用时叠加 `file.status()` git delta、`session.get().summary.diffs` 负责历史恢复；`ChatThread` 在 Assistant 消息尾部渲染 `ArtifactBand`，在线程底部渲染可折叠 `ArtifactShelf`。`FileOutcomeCard` 为单行操作型组件（点击用 Tauri shell open 打开文件），不做内联 diff 预览 | 多信号聚合保住即时可见；展示层从展示型卡片重构为操作型 FileRow，聚焦打开文件核心交互 |
| File-based Settings | `settings.json` 通过 Tauri IPC 读写，`settingsStore` 唯一写入者 | 跨窗口/进程一致 |
| Provider Config | OpenCode `config.json` 唯一配置源（API Key/Base URL/Model Modalities），变更后重启内核生效 | 消除双轨漂移 |
| Modality Compat Layer | `main.rs inject_modality_overrides()` 在启动时向 config.json 注入 `provider.*.models.*.modalities`，覆盖 models.dev 中滞后的能力声明。**仅对 image 有效**——`@ai-sdk/openai-compatible` 的 `convertToOpenAICompatibleChatMessages()` 只支持 `image/*`，对 PDF/audio/video 会抛 `UnsupportedFunctionalityError`。详见 `docs/engine-modality-compat.md` | 双重关卡：Stage1 引擎守卫（config 可控）+ Stage2 SDK 转换（npm 包决定）。声明 provider SDK 不支持的模态会导致运行时崩溃 |
| Provider UI Shadow State | Settings UI 读取 `settings.json.providers` 的 `hasKey/baseUrl` 作为展示状态；未在启动时从 `config.json` 反向水合 | 读取体验快，但存在“配置真实值与 UI 投影”漂移风险 |
| Provider Restart Trigger | 默认由 `App.vue` 监听 `settingsStore.providerStates` 快照差异并在 2s 防抖后 `kernel.restart()`；额外在 `SettingsProvider` 对 `hasKey=true→true` 的密钥轮换做定向重启补偿 | 既避免初始化阶段误重启，又覆盖“影子态不变但密钥值已轮换”的漏检场景 |
| Welcome Overlay Layout | `WelcomeScreen` 采用受视口高度约束的卡片布局：品牌区固定、step body 独立滚动、底部操作区固定；provider 列表使用 auto-fit grid 压缩垂直占用 | provider 注册表是数据驱动且会继续增长，欢迎页必须在“小屏 + 多 provider”下保持完整可达 |
| Data Path Security | `write_data_file` 校验 relative path + canonical parent + `O_NOFOLLOW`，进程级写锁 | 阻断 TOCTOU + symlink 逃逸 |
| Provider Env Guard | env key 仅允许 `OPENAI_`/`ANTHROPIC_` 前缀，禁止系统敏感变量 | 收敛注入面 |
| Permission Reply | `permission.reply(requestID)` 回传 `once/always/reject`（默认拒绝） | 避免权限悬挂 |
| Model Selection | 无显式模型时不传 `model` 字段让内核决定；显式选择经 `provider.list` 校验 | Auto 模式与 SDK 行为一致 |
| Model Switch Apply | Chat 内 `ModelPicker` 写入 `config.json model` 后触发内核重启（250ms 防抖）并先取消当前流 | 消除“模型已选中但内核未重载配置”的假成功状态 |
| Per-Request Directory | SDK client 通过 `x-opencode-directory` header 传递工作区路径，切换工作区重建 client —— 内核无需重启 | sidecar 进程无状态，工作目录 per-request 级 |
| Session Title Lifecycle | 前端即时命名（截取前40字 → `session.update` 持久化）+ 内核自动摘要（SSE `session.updated` → `updateSessionTitle` 实时覆盖） | 策略B：即时反馈+后端覆盖，两条链路互补 |
| Session History Fetch | 当前 `session.list()` / `session.messages()` 走默认参数（未使用 start/search/limit） | 接入简单，但大规模历史下缺少分页与搜索控制面 |
| Runbook JSON Persistence | `runbooks.json` 通过 `read_data_file`/`write_data_file` IPC 读写，`runbookStore` 唯一写入者。Runbook 是 `body`（纯文本任务描述）+ `steps`（有序步骤列表）的结构化模型，支持从旧 Block model 自动迁移。发送时 `serializeForPrompt` 生成包含 todowrite 引导的 prompt | NLOC: 删除 Block 编辑器(874 LOC)，回到用户认知模型 |
| Runbook->Chat Send | RunbooksView 通过 `sessionStore.setPendingPrompt(prompt, { durable: true })` 存入 prompt（Pinia 内存态 + `sessionStorage` fallback）→ `router.push('/')` → ChatView 消费 `consumePendingPrompt()` 并调用 `useChat.send()` 完整流式管道（SSE 订阅 + promptAsync + 流式渲染）。不直接调用 SDK `promptAsync`（会绕过 SSE 监听导致无流式响应） | 跨路由一次性负载不能只依赖 volatile in-memory handoff；必须有 durable fallback 才能抗导航 / client 初始化时序 |
| User-facing Terminology | 中文主界面用“操作手册”表达 `runbook`、用“流程模板”表达 `workflow`，并将 provider/kernel 相关文案统一收敛为“AI 服务/服务密钥/安全检查”等用户语言；实现术语只保留在安全、导入或高级诊断场景 | 产品目标用户是普通办公用户；概念命名必须先服务理解成本，再暴露实现细节 |
| SSE Error Strategy | `consumer.ts` 对 `session.error` 和 `message.updated.error` 采用优雅降级（插入 ⚠️ text part）而非 throw。引擎的 agent loop 在工具调用解析失败时会发布 `session.error` SSE 事件，throw 会杀死整个 SSE 消费者导致对话"崩溃"。正确做法：surface error → let stream continue → 等待 `session.idle` 自然结束 | 工具调用失败是可预期的 agent 生命周期事件，不是致命异常 |
| i18n | 所有用户可见文本通过 `t()` 从 `zh.ts`/`en.ts` 读取 | 中英双语 |

## 设计系统
- `tokens.css`: Typography / Radius / Motion / Layout + dark/light 双主题（`--on-brand`, `--syntax-{string,function,number,literal}` 等 token 在两个主题块均有定义）
- 双层材质: Shell(`--shell`) 包裹 Content(`--content`)，Content 区域 `--r-2xl` 圆角
- 基础组件: `AppButton(brand/ghost/subtle)` / `AppBadge` / `AppIcon` / `AppCodeBlock`
- Part 渲染: `StreamingMarkdown`(morphdom 增量) / `ReasoningBlock`(折叠思维链) / `TokenStats` / `PatchDiff` / `FileAttachment`；文件成果层由 `ArtifactBand` / `ArtifactShelf`(折叠态) / `FileOutcomeCard`(单行可点击 FileRow，`plugin:shell|open` 打开文件) 独立于 Part union 渲染
- Streaming 约束: 流式期默认 fast markdown（禁用 highlight.js）降低 CPU + 限制渐显动画只作用于 block 节点；结束后 idle 时段升级 rich render（语法高亮 + copy button）
- Theme: `useTheme()` composable 是唯一 writer — 三态 preference (`system|dark|light`, 默认 `system`) + `matchMedia` OS 监听 + reactive DOM sync。ThemeToggle / SettingsTheme / main.ts 均消费此 composable
