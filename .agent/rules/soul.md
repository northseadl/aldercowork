# Soul — Agent 技术原则与设计哲学
> 跨项目通用的高维判断力。每条法则都必须通过"删掉它 Agent 会变蠢"的测试。

## 架构原则 (Architectural Principles)
- **Source-over-docs**: 文档只是假设，源码与可复现实验才是事实来源。
- **Fail-fast boundaries**: 在系统边界做输入校验与错误显式化，尽早失败，避免脏状态扩散。
- **Idempotent operations**: 脚本、构建、迁移默认可重复执行且结果一致。
- **Stateless-first services**: 业务状态优先下沉到明确存储层，服务层保持可替换。
- **Observability baseline**: 关键路径必须可观测（日志、错误上下文、性能基线）。
- **Validate-before-side-effects**: 边界校验必须发生在副作用之前（尤其是文件写入/进程启动）；“写后校验”视为漏洞模式。
- **Single-writer persistence**: 同一持久化文件/键空间必须有唯一写入所有者，避免读改写竞态导致状态回滚。
- **Executable integrity gate**: 任何“下载后执行”的二进制都必须先通过 checksum/签名校验，校验失败必须硬阻断。
- **Quarantine-before-install**: 任何外部下载的扩展/插件/技能都必须先进入隔离区做结构校验与风险审计，禁止直接落入正式运行目录。
- **Profile-root tenant isolation**: 多租户桌面应用的隔离边界必须是整棵 profile 数据根 + 运行时上下文（workspace/kernel-state/credentials/marketplace），只隔离单一子目录属于伪隔离。
- **Stream lifecycle ownership**: 任何流式读取都必须具备超时、可取消入口与 finally 清理（cancel/release），否则视为资源泄漏风险。
- **Bounded retry budget**: 自动重试/重连必须具备上限与指数退避，只对可恢复故障生效，禁止无限重试放大故障。
- **Bounded reactive memory**: 对长生命周期前端状态（消息列表/附件队列）必须设置容量预算与窗口化策略，禁止无上限累积。
- **Modal focus containment**: 任何阻断式弹层都必须具备 focus trap、初始焦点与焦点恢复，防止键盘焦点穿透背景。
- **Viewport-bounded overlays**: 任何承载动态列表/表单的弹层或引导页都必须受视口高度约束，并把滚动限制在内容区而非整张卡片；主操作区应尽量固定，避免内容增长时按钮被挤出可视区。
- **Incremental DOM for streaming**: 流式内容禁止使用 innerHTML 全量替换（CSS 动画每帧重启）；必须用 DOM diff（morphdom/vdom）做增量 patch + TypeWriter buffer 做自适应速率释放，保证旧节点稳定、新节点渐显。
- **Backpressured streaming renders**: 流式消费者必须 await 一个“帧级 commit barrier”（rAF 调度 + paint 后 yield），让事件摄入速度不可能跑赢浏览器绘制；“节流直接 return 但不 yield”会把更新压成 burst，造成卡顿与节奏失真。
- **UI intent parity**: 交互可用态（按钮可点/快捷键可发）必须与执行入口 guard 条件一致，禁止“前端显示可执行但 handler 直接 return”的静默失败。
- **Durable-final reconciliation**: 流式 UI 的 transient state（tool status / optimistic card / live counters）必须在结束阶段按实体粒度与后端 durable state 合并校正；禁止用“只要已有文本就不 reconcile”这类全局门控让局部状态永远停留在过期值。

## 代码哲学 (Code Philosophy)
- **NLOC mindset**: 优先复用生态能力，减少自研样板与不可维护代码。
- **Semantic naming**: 命名表达业务语义而非实现细节，降低注释依赖。
- **Type as contract**: 类型系统用于约束输入/输出契约，避免运行期猜测。
- **Single responsibility modules**: 每个模块只解决一个清晰问题，避免隐式耦合。
- **Comment on why**: 注释只写“为什么/风险”，不复述代码“做了什么”。

## 反模式档案 (Anti-Pattern Archive)
- **Append-only memory**: 把规则文件当日志持续追加，导致信息熵飙升；应周期性替换与压缩。
- **Spec-only implementation**: 仅按说明文档盲写，不验证工具链真实行为；应通过 probe/命令验真。
- **Compatibility reflex**: 未被要求仍过度兼容旧路径，牺牲当前架构整洁度。
- **Zombie code retention**: 保留注释掉/未引用代码“以备将来”，导致维护成本持续上升。
- **History-mutating git hooks**: 在 pre-commit/pre-push 中执行 `git commit --amend` / `git tag -f` / 自动改历史会破坏开发者意图并引入不可复现的 push；应把 hook 设计为纯校验门禁，修复动作交给显式脚本/命令。
- **Worktree-based commit gates**: 用工作区文件而不是 index(staged) 内容做门禁（密钥扫描/格式检查）会与实际提交内容脱节；应基于 `git diff --cached -z` 枚举文件，并用 `git show :path` 扫描 staged blob。
- **Force detection by CLI parsing**: 通过解析 `git push` 命令行参数/父进程 args 来判断 force push 不可靠（平台差异/alias/GUI）；应使用 `git merge-base --is-ancestor <old> <new>` 判断 non-fast-forward 更新。
- **Multi-writer state file**: 多个模块并发写同一 JSON/配置文件，最终状态取决于写入时序；应收敛单写者或事务合并层。
- **Post-write path validation**: 先写文件再做 canonical/path-root 校验会产生 TOCTOU 漏洞窗口；必须先约束 fd 再写入。
- **Blind artifact execution**: 下载产物未经完整性验证就 `chmod + exec`，会把供应链风险直接转化为本地 RCE；应默认零信任。
- **Parameter-option conflation**: 在代码生成 SDK 中把 `signal/timeout` 塞进业务 parameters 会被静默丢弃；必须区分 endpoint 参数与 transport options。
- **Unbounded reconnect loop**: 把连接中断直接 `while(true)` 重试会放大雪崩并掩盖根因；应使用有限重试 + 退避 + 明确失败出口。
- **Nested interactive controls**: 在可点击容器内再嵌套 `<button>/<a>` 会破坏语义树与键盘行为；应改为容器 `role="button" + tabindex + Enter/Space`，内部动作保留真实按钮并阻断事件冒泡。
- **Unbounded reactive collection**: 在 UI 层直接全量渲染与缓存增长型数组（消息/附件）会线性放大内存与重绘成本；应做限额、裁剪或虚拟化。
- **Leaky global delegate**: 全局 `addEventListener` 无幂等 guard/卸载句柄会在 HMR 或重复挂载后触发多次副作用；必须成对注册与注销。
- **Throttle-without-yield**: 在流式 UI 中节流渲染但不 yield（继续在同一 task 消费事件）会导致 UI 长时间不 paint，最终一次性跳帧；应使用共享的 awaitable commit barrier（rAF + post-paint yield）提供背压。
- **Lossy config shadow state**: 用布尔/枚举影子态（如 `hasKey=true`）代替真实配置值做变更探测，会漏掉“值变了但影子不变”的关键事件（如密钥轮换）；应以真实配置 hash/revision 作为重启与同步触发源。
- **Route-hop volatile payload**: 跨路由只依赖 `window.dispatchEvent` 传递一次性负载会因组件尚未挂载而丢失；必须提供 durable handoff（sessionStorage/store）兜底。
- **Text-gated state repair**: 用“是否已有文本内容”决定是否跳过整条消息的最终 reconcile，会让 tool/file/patch 等非文本 part 失去最终态修正机会；应按 part 类型与 id 做选择性 merge。
- **Late-bound tenant writes**: 在多租户/多 profile 应用里，如果持久化目标在“写入时”才按 active tenant 解析，而前端又有 debounce/异步 reload，旧租户的延迟写入会污染新租户；必须在上下文切换时取消 pending writes，并在 reload 前先把内存状态重置为 tenant-local 基线。
- **Hot-swapped store API drift**: 在 HMR/热更新环境里，旧的状态容器实例不一定立即获得新 action；app 层 orchestration 直接调用新增方法会出现 `x is not a function`。对关键切换链路应优先调用稳定基元，或做 feature-detect fallback。
- **Pinia-proxied SDK instance**: 将依赖 `this` 绑定的 SDK class 实例存入 Pinia store 的 `shallowRef` 后，外部通过 `store.prop` 读取时 Pinia 的 `reactive()` 会自动解包 shallowRef 但可能对嵌套属性访问产生中间 proxy，导致 destructured method call 丢失 `this`（`'undefined is not an object (evaluating this.client)'`）；应通过独立 `ref()`/`useClient()` 持有原始实例，store 仅用于 null/非 null 判断和简单 CRUD。
