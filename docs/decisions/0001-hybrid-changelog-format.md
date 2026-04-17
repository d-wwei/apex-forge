# ADR-0001: Hybrid CHANGELOG Format

## Status

Accepted

Date: 2026-04-17

## Context

apex-forge 的 CHANGELOG.md 使用自定义叙事格式（背景分析 + 策略命名 + 大白话解释），信息密度高但不易快速扫描具体变更。用户提出采用 Keep a Changelog 标准格式，但纯 Keep a Changelog 会丢失"背景、理由、取舍"信息。

## Decision

采用混合格式：每个版本条目顶部 3-5 行叙事（背景 + 策略概要），底部使用 Keep a Changelog 的 Added/Changed/Fixed/Removed 分类列出具体条目。

叙事部分限制在 5 行以内，避免变成技术博客。旧版本条目保持原样，新格式从下个版本起生效。

## Rejected Alternatives

- **纯 Keep a Changelog**: 结构清晰但完全没有"为什么"。读完知道发生了什么，不知道为什么发生。对于 AI agent 执行协议这种需要理解设计意图的项目，丢失决策理由是不可接受的。
- **保持现有叙事格式**: 信息密度高但不易快速扫描。当版本条目超过 50 行时，读者找不到"到底改了哪些文件"。

## Consequences

- 每个版本条目需要同时写叙事和分类，写作成本略增
- 旧条目与新条目风格不一致（可接受，不回溯）
- Ship stage 的 CHANGELOG 模板需要更新以反映混合格式
