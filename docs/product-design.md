# AlderCowork 产品方案

> 最后更新：2026-03-02

---

## 一、产品定位

**AlderCowork = Team AI Skill Runtime**（团队 AI 技能运行时）

> *让你的 AI 学会你团队的工作方式，并在整个团队中一致执行*

基于 [OpenCode](https://github.com/anomalyco/opencode) 构建的桌面 AI 协作应用（支持 macOS 与 Windows）。面向普通用户、团队和企业，将 AI 能力封装为可管理、可分发、可复用的 Skills，让 AI 和 Skill 生态面向组织易用化和标准化。

### 核心差异化

- Skills 不是 prompt 技巧，是**可执行、可治理、可复用的团队知识资产**
- 完全开源（MIT 协议），面向个人、团队、企业均免费
- 不重写引擎，只做包装 — OpenCode 是可升级的内核，AlderCowork 是外壳

### 不是什么

- 不是 IDE（Cursor / Windsurf 的战场）
- 不是聊天框 — 是能力层
- 不是 OpenCode 的 Fork — 是 SDK 包装

---

## 二、技术架构（当前实现）

```
┌─────────────────────────────────────────────────────┐
│  AlderCowork Desktop (Tauri v2 + WebView)           │
│  Vue 3 + TypeScript + CSS 设计系统                  │
│  Chat │ Skill Panel │ Runbooks │ Settings           │
└────────────────────────┬────────────────────────────┘
                         │ @opencode-ai/sdk (HTTP + SSE)
┌────────────────────────▼────────────────────────────┐
│  OpenCode Kernel (sidecar, headless mode)            │
│  LLM Providers │ Tools │ Skills │ Sessions          │
└─────────────────────────────────────────────────────┘
```

### 集成方式

| 接口 | 状态 | 用途 |
|------|------|------|
| 官方 `@opencode-ai/sdk` | ✅ 已接入 | Session CRUD、SSE 流式消息、Provider / Model 查询 |
| Sidecar 进程管理 | ✅ 已实现 | Rust 管理 OpenCode 生命周期，环境变量隔离 |
| 原生 Skill 发现 | ✅ 已实现 | 通过 symlink 桥接全局 / 工作区两层发现路径 |

### 数据隔离

```
~/Library/Application Support/com.aldercowork.desktop/
├─ settings.json               ← AlderCowork 配置（唯一写入者：settingsStore）
├─ skills/                     ← 技能存储库（导入的源文件）
├─ kernel-state/               ← OpenCode 隔离运行时
│  └─ opencode/
│     ├─ config.json           ← Provider 配置
│     ├─ opencode.db           ← Session 数据
│     └─ skills/               ← 全局激活 symlinks
└─ workspace/                  ← 默认工作区
```

通过 `XDG_CONFIG_HOME` + `XDG_DATA_HOME` 将内核数据重定向，与用户 `~/.config/opencode` 完全隔离。

---

## 三、Skills 系统（核心差异化）

### 三层管理模型

```
存储（安装）     {APP_DATA}/skills/{id}/        ← 导入即存储，仅此一处
                          ↓ per-skill symlink
全局激活         {kernel-state}/opencode/skills/{leaf}/
                          ↓ per-skill symlink
工作区激活       {workspace}/.agents/skills/{leaf}/
```

- **安装 ≠ 激活** — 导入的技能可按需激活到全局或工作区（或两者同时）
- **OpenCode 原生发现** — 利用 OpenCode 内置的 `skill` 工具，从两个路径递归发现 SKILL.md
- **Monorepo 支持** — 一次 Git clone 递归发现所有子技能

### Skill 包规范

```
my-skill/
  SKILL.md          # 人 / 模型可读指令（必须）
  skill.yaml        # 机器契约（可选，元数据增强）
  scripts/          # CLI 脚本（可选）
  resources/        # 参考文档（可选）
```

### 导入方式（已实现）

| 方式 | 状态 | 说明 |
|------|------|------|
| 压缩包 (.zip / .tar.gz / .tgz) | ✅ | 系统 CLI 解压 + 目录名清理 + 单层目录 hoist |
| Git 仓库 URL | ✅ | `git clone --depth=1` 浅克隆，删除 `.git` |
| Hub 同步 | 🔲 | 未实现 |

### Skill 交互流程（UI 已实现）

```
1. Browse    → 技能面板列表（搜索 + 过滤）
2. Inspect   → 查看 SKILL.md 预览、权限、触发器
3. Activate  → 双 Toggle：全局 / 工作区（per-skill symlink）
4. Remove    → 自动清理两个范围的 symlink + 删除源文件
```

---

## 四、前端架构（当前实现）

### 路由

| 路径 | 页面 | 状态 |
|------|------|------|
| `/` | ChatView — 对话界面 | ✅ Part-centric 渲染，12 种 Part type + 文件成果带 / 会话收集区 |
| `/skills` | SkillsView — 技能管理 | ✅ 列表 + 详情 + 导入 + 激活 |
| `/runbooks` | RunbooksView | 🔲 占位 |
| `/settings` | SettingsView — 配置 | ✅ Provider / Engine / Theme / Shortcuts |

### 聊天系统

- **SSE 流式渲染**：`event.subscribe` → `promptAsync` → Part-centric 增量更新
- **Part 类型支持**：text / reasoning / file / tool / step / patch / agent / retry / compaction / subtask
- **文件成果可视化**：`file.edited` live 占位 + `session.diff` 回填，Assistant 消息尾部展示本轮 `Artifact Band`，线程底部展示会话级 `Artifact Shelf`
- **流式 Markdown**：morphdom 增量 DOM patch（StreamingMarkdown 组件）
- **权限系统**：`permission.reply` 回传 once / always / reject

### 设计系统

- `tokens.css`：dark / light 双主题 CSS 变量
- 双层材质：Shell (Layer 0) 包裹 Content (Layer 1)
- 中英双语 i18n

---

## 五、Roadmap

| 阶段 | 方向 | 关键交付 |
|------|------|----------|
| **Phase 1** | 体验优化 | Chat 流式交互打磨、错误恢复、性能优化、会话管理 |
| **Phase 2** | 技能深化 | 技能搜索 / 推荐、Eval 评估、技能版本管理、Hub 同步 |
| **Phase 3** | Runbook | 会话片段沉淀为可复用资产、参数化执行、团队共享 |
| **Phase 4** | 组织能力 | 私有技能仓库、技能分发治理、审计日志 |
| **Phase 5** | 通知 | 异步任务完成通知、@mention 提醒、执行状态推送 |
| **Phase 6** | 移动端 | 依赖 PC 客户端的轻量伴侣应用（通知 + 审批 + 查看） |

---

## 六、风险

| 风险 | 状态 | 对策 |
|------|------|------|
| OpenCode API 变动 | 可管理 | SDK 包装的适配成本远低于 Fork 维护 |
| 内核 CWD 未传递 | 已知 | 工作区技能需要设置 sidecar CWD（待实现） |

---

## 七、开源协议

[MIT](../LICENSE)
