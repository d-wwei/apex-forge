# labloop — Experiment Config

## Research Goal

优化 design-to-code-runner skill 和前端实现代码，使 Paper MCP 中的设计文件在 `frontend/` 页面中实现：
1. 视觉像素级还原（颜色、间距、字体、圆角、阴影等 100% 匹配设计稿）
2. 功能 100% 可用（所有交互、动画、响应式行为与设计意图一致）

## Files

### Editable (agent can modify)

- `design-to-code/skills/design-to-code-runner/SKILL.md`
- `design-to-code/skills/design-to-code-runner/references/*.md`
- `frontend/app.js`
- `frontend/index.html`
- `frontend/styles.css`

### Read-only (do NOT modify)

- `design-to-code/benchmark/*`
- `design-to-code/docs/*`
- `design-to-code/specs/*`
- `design-to-code/templates/*`
- `design-to-code/workflows/*`
- `design-to-code/AGENTS.md`
- `front-end design/*`
- `labloop.md`（本文件）
- 所有其他未列在 Editable 中的文件

## Experiment

### Run command

```bash
# 启动前端静态服务器（后台），截图由 agent 通过 MCP 工具完成
cd frontend && python3 -m http.server 8765 &
SERVER_PID=$!
sleep 2
echo "server_pid: $SERVER_PID"
echo "server_url: http://localhost:8765"
echo "server_ready: true"
```

### Metric

- **Name**: visual_fidelity
- **Direction**: higher_is_better
- **Extract method**: AI visual comparison（MCP 工具链）

#### 评估流程（每轮实验）

1. **获取设计参考**：读取 `front-end design/gold version/final/` 中的 PNG 设计稿
2. **获取前端截图**：使用 `mcp__macos-desktop-control__screenshot` 截取浏览器中 `http://localhost:8765` 的页面
3. **视觉对比打分**（0-100）：

| 分数段 | 标准 |
|--------|------|
| 0-20 | 布局结构完全不同，缺少主要区域 |
| 20-40 | 结构正确但视觉偏差显著（配色/间距/字体大面积不对） |
| 40-60 | 整体还原但中等偏差（部分颜色/间距/圆角不准确） |
| 60-80 | 接近还原，仅有少量可见差异（间距偏移几px、色值略偏等） |
| 80-95 | 近乎像素级还原，仅细微差异（1-2px 偏移、opacity 微调） |
| 95-100 | 像素级完美还原 |

4. **记录分数**：`echo "visual_fidelity: <score>" >> labloop-run.log`

#### 辅助工具

- `mcp__paper__get_computed_styles` — 获取设计中的精确 CSS 参数
- `mcp__paper__get_tree_summary` — 理解设计层级结构
- `mcp__paper__get_jsx` — 获取设计的参考代码
- `mcp__paper__get_node_info` — 获取节点精确尺寸
- `mcp__macos-desktop-control__screenshot` — 截取前端实际渲染效果

### Timeout

900 seconds per experiment

## Constraints

- 不能安装新的 npm/python 包或外部依赖
- 不能修改 Editable 之外的任何文件
- 前端必须保持纯静态（HTML/CSS/JS），不引入框架
- 每次修改必须保持现有功能完整（SSE 连接、项目列表、侧边栏切换、Dashboard 等）
- `front-end design/gold version/final/` 中的 PNG 为 ground truth（唯一权威设计源）
- Paper MCP 工具可用于获取精确设计参数，但以 PNG 效果图为最终标准
- 每次实验只改一个方面（隔离变量），不要同时改 5 个东西

## Research Hints

- `front-end design/gold version/` 和 `silver version/` 有设计稿 PNG 可作为额外视觉参考
- 当前 design-to-code-runner skill 的核心问题：模板太抽象，缺乏像素级约束指导
- 优化方向优先级（从高到低）：
  1. **前端 CSS 精确对齐** — 使用 Paper MCP 的 `get_computed_styles` 获取精确设计参数（颜色、间距、字体、圆角等），直接写入 CSS
  2. **SKILL.md 增加 Paper MCP 工具链指导** — 教 agent 如何用 Paper MCP 提取精确设计参数
  3. **references/acceptance-loop.md 增加 MCP 截图对比步骤** — 将视觉对比作为验收必要条件
  4. **references/task-artifacts.md 增加像素级精度要求** — spec 和 checklist 必须包含精确数值
  5. **SKILL.md 增加 "anti-generic" 硬约束** — 禁止使用 Tailwind 近似值（如 py-2.5），必须用精确 inline style
- 设计 token → CSS 变量映射是关键：确保 Paper MCP 设计中的每个 token 都有对应的 CSS variable
- 功能还原方面：重点关注交互状态（hover、active、focus）、动画过渡、响应式断点
