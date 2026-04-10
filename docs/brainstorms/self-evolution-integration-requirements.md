---
title: UDD Kit + UpdateKit Integration
scope: standard
status: approved
created: 2026-04-10
approved_by: Eli
---

## Problem Statement
Apex Forge 作为开源分发产品，缺少自动更新和自愈贡献机制。需要将 UDD Kit 和 UpdateKit 作为 npm 依赖集成，实现"安装即完整"的分发闭环。

## Acceptance Criteria
1. `apex update-check` 检测 GitHub 新版本
2. `apex update` 执行安全更新（pull + rebuild + verify）
3. `apex heal --error "..."` 触发 UDD 自愈流程
4. `apex contribute` 将本地修复提交为 PR
5. 预置 udd.config.json 和 update.config.json
6. CLI 启动时自动 quickCheck（< 5ms cached）
7. 所有新命令支持 --json

## Constraints
- udd-kit 未发布到 npm，需用 GitHub 依赖或先发布
- update-kit 在 npm 上为 v0.1.12
- 不改变现有 CLI 命令行为
- 二进制需在更新后重编译

## Solution Shape
npm 依赖 + build-time 打包。创建 adapter + config + CLI 命令。
