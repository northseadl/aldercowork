---
description: AlderCowork Desktop 开发环境启动（Tauri + Vite）
---

// turbo-all

## 完整桌面客户端启动

```bash
source "$HOME/.cargo/env" && cd /Users/norix/scratch/aldercowork/apps/desktop && pnpm tauri:dev
```

这会同时启动：
- Vite dev server (前端 HMR)
- Tauri Rust 后端 (内核管理)
- macOS 桌面窗口

## 仅前端热重载（不启动 Tauri）

```bash
cd /Users/norix/scratch/aldercowork/apps/desktop && pnpm dev
```

仅在 http://localhost:5173/ 运行 UI，无内核管理功能。

## 构建验证

```bash
cd /Users/norix/scratch/aldercowork/apps/desktop && pnpm build
```

```bash
source "$HOME/.cargo/env" && cd /Users/norix/scratch/aldercowork/apps/desktop/src-tauri && cargo build
```
