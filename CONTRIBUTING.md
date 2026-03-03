# AlderCowork 贡献指南

## 分支模型

```
main (生产)  ←── PR ── develop (开发集成) ←── PR ── feat/xxx | fix/xxx
  │                       │
  └── tag v* → Release    └── CI 持续验证
```

| 分支 | 用途 | 保护级别 |
|------|------|---------|
| `main` | 生产发布基线。仅通过 develop → main 的 PR 合入 | 禁止直推、禁止 force push |
| `develop` | 开发集成。所有特性分支合入此处 | 禁止直推、禁止 force push |
| `feat/*` | 新功能开发。从 develop 分出，PR 合回 develop | 自由 |
| `fix/*` | Bug 修复。从 develop 分出，PR 合回 develop | 自由 |
| `hotfix/*` | 紧急修复。从 main 分出，PR 同时合入 main 和 develop | 自由 |
| `release/*` | 发布准备（可选）。从 develop 分出，合入 main 后打 tag | 自由 |

## 工作流

### 日常开发

```bash
# 1. 从 develop 创建特性分支
git checkout develop && git pull
git checkout -b feat/my-feature

# 2. 开发、提交（hooks 自动校验格式 + 类型检查）
git add -A && git commit -m "feat: 新增XX功能"

# 3. 推送并创建 PR → develop
git push -u origin feat/my-feature
gh pr create --base develop
```

### 发布流程

```bash
# 1. 从 develop 创建 PR → main
gh pr create --base main --head develop --title "release: v0.2.0"

# 2. 合并后打 tag 触发 Release 构建
git checkout main && git pull
git tag v0.2.0
git push origin v0.2.0
# → GitHub Actions 自动构建 3 个目标（macOS arm64/x64 + Windows x64）并发布到 Releases
```

### 紧急修复

```bash
# 从 main 创建 hotfix
git checkout main && git pull
git checkout -b hotfix/critical-bug

# 提交修复
git commit -m "fix: 修复关键问题"

# PR 合入 main + cherry-pick 到 develop
gh pr create --base main
# 合并后 cherry-pick
git checkout develop && git cherry-pick <commit-hash>
```

## 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)，中文描述：

```
<type>[(scope)]: <subject>

[body]
```

| Type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不新增功能、不修复 Bug） |
| `perf` | 性能优化 |
| `docs` | 文档 |
| `style` | 代码格式（不影响逻辑） |
| `test` | 测试 |
| `build` | 构建系统 / 外部依赖 |
| `ci` | CI/CD 配置 |
| `chore` | 杂项 |
| `revert` | 回退 |

### 示例

```
feat(skill): 新增 Git 子目录导入支持
fix: 修复 Windows 归档解压路径问题
refactor: 提取 skill.rs 模块，main.rs 瘦身 816 行
ci: 添加 3 目标矩阵构建（macOS arm64/x64 + Windows x64）
```

## Git Hooks

项目使用 `.githooks/` 目录管理 hooks，首次克隆后需激活：

```bash
git config core.hooksPath .githooks
```

| Hook | 检查项 |
|------|--------|
| `pre-commit` | 分支保护 + 密钥泄漏扫描 + cargo check + vue-tsc |
| `commit-msg` | Conventional Commits 格式校验 |
| `pre-push` | 禁止 force push 保护分支 + main 推送确认 |

### 绕过方式

```bash
# 紧急直推受保护分支
ALLOW_DIRECT_COMMIT=1 git commit -m "fix: 紧急修复"

# 跳过所有 hooks（不推荐）
git commit --no-verify -m "chore: 临时跳过"
```

## GitHub 仓库设置建议

在 GitHub Settings > Branches 中配置 Branch Protection Rules：

### `main` 分支
- [x] Require a pull request before merging
- [x] Require status checks to pass (CI)
- [x] Require branches to be up to date
- [x] Do not allow force pushes
- [x] Do not allow deletions

### `develop` 分支
- [x] Require status checks to pass (CI)
- [x] Do not allow force pushes
- [x] Do not allow deletions
