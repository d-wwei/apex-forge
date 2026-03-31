# labloop — Experiment Config

## Research Goal

提升 design-to-code 脚手架的还原度：优化 spec 模板、组件映射模板、workflow SOP、和生成提示，使 coding agent（Claude Code）从设计稿生成的前端代码在结构、布局、视觉、排版方面尽可能接近设计原稿。基准测试用例：ACP Browser Client 的 Welcome State 画面。

## Files

### Editable (agent can modify)

- `specs/implementation-spec.template.yaml`
- `specs/component-map.template.json`
- `workflows/agent-execution-sop.md`
- `templates/acceptance-checklist.md`
- `skills/design-to-code-runner/SKILL.md`
- `skills/design-to-code-runner/references/*.md`
- `docs/architecture.md`
- `docs/agent-entry/claude-code.md`
- `AGENTS.md`
- `benchmark/run.sh`

### Read-only (do NOT modify)

- `benchmark/design-structure.json`
- `benchmark/evaluate.py`
- `labloop.md`

## Experiment

### Run command

```bash
bash benchmark/run.sh
```

### Metric

- **Name**: structural_score
- **Direction**: higher_is_better
- **Extract command**: `grep "^structural_score:" labloop-run.log | tail -1 | awk '{print $2}'`

### Timeout

600 seconds per experiment

## Constraints

- 每次实验会调用 `claude --print`，消耗 API token（约 $0.50-2.00/次）
- 不要修改 benchmark/evaluate.py 和 benchmark/design-structure.json（这是固定的评估基准）
- 不要修改 labloop.md 本身
- 优化目标是脚手架文件（spec 模板、workflow、agent 入口文档等），不是生成提示本身
- benchmark/run.sh 可以修改（比如改进 prompt 的组装方式），但核心评估逻辑不变

## Research Hints

- 当前 scaffold 是通用模板，充满 placeholder，agent 生成代码时缺乏具体指导
- 关键问题：模板太抽象，没有传达「必须精确还原设计稿中每个像素级细节」的约束
- 可以尝试的方向：
  1. 在 workflow SOP 中增加「视觉还原度优先」的硬性规则
  2. 在 spec 模板中增加更具体的 token 映射指导（不是 placeholder）
  3. 在 agent-entry/claude-code.md 中增加 Claude Code 专属的还原度优化提示
  4. 在 acceptance-checklist 中增加像素级检查项
  5. 改进 benchmark/run.sh 中 prompt 的组装方式，更好地利用 scaffold 文件
  6. 在 AGENTS.md 中增加「反 generic」的强约束
  7. 在 architecture.md 中定义设计 token → CSS 变量的映射规范
