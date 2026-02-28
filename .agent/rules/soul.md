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
- **Stream lifecycle ownership**: 任何流式读取都必须具备超时、可取消入口与 finally 清理（cancel/release），否则视为资源泄漏风险。
- **Bounded retry budget**: 自动重试/重连必须具备上限与指数退避，只对可恢复故障生效，禁止无限重试放大故障。
- **Bounded reactive memory**: 对长生命周期前端状态（消息列表/附件队列）必须设置容量预算与窗口化策略，禁止无上限累积。
- **Modal focus containment**: 任何阻断式弹层都必须具备 focus trap、初始焦点与焦点恢复，防止键盘焦点穿透背景。
- **Incremental DOM for streaming**: 流式内容禁止使用 innerHTML 全量替换（CSS 动画每帧重启）；必须用 DOM diff（morphdom/vdom）做增量 patch + TypeWriter buffer 做自适应速率释放，保证旧节点稳定、新节点渐显。

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
- **Multi-writer state file**: 多个模块并发写同一 JSON/配置文件，最终状态取决于写入时序；应收敛单写者或事务合并层。
- **Post-write path validation**: 先写文件再做 canonical/path-root 校验会产生 TOCTOU 漏洞窗口；必须先约束 fd 再写入。
- **Blind artifact execution**: 下载产物未经完整性验证就 `chmod + exec`，会把供应链风险直接转化为本地 RCE；应默认零信任。
- **Parameter-option conflation**: 在代码生成 SDK 中把 `signal/timeout` 塞进业务 parameters 会被静默丢弃；必须区分 endpoint 参数与 transport options。
- **Unbounded reconnect loop**: 把连接中断直接 `while(true)` 重试会放大雪崩并掩盖根因；应使用有限重试 + 退避 + 明确失败出口。
- **Nested interactive controls**: 在可点击容器内再嵌套 `<button>/<a>` 会破坏语义树与键盘行为；应改为容器 `role="button" + tabindex + Enter/Space`，内部动作保留真实按钮并阻断事件冒泡。
- **Unbounded reactive collection**: 在 UI 层直接全量渲染与缓存增长型数组（消息/附件）会线性放大内存与重绘成本；应做限额、裁剪或虚拟化。
- **Leaky global delegate**: 全局 `addEventListener` 无幂等 guard/卸载句柄会在 HMR 或重复挂载后触发多次副作用；必须成对注册与注销。
