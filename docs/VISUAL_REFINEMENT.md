# 第三轮：番茄植株视觉优化

本轮只调整几何、材质、冠层参数和取景。未修改 Agent、Skill、SceneMotion、Zustand、动作协议、startedAt、对象注册和业务果实数据；没有新增依赖。12 片复叶、128 个小叶、两个三果果串及全部 ID 保持。

## 修改文件

| 文件 | 内容 |
| --- | --- |
| `src/scene/geometry.ts` | 三种更宽的非对称浅裂轮廓，大小不同的齿缘、轻微叶面起伏；成熟/嫩叶色差；六个大小不一、曲面贴合的模拟病斑；独立萼片共享几何 |
| `src/scene/Plants.tsx` | 主小叶加宽与比例差异，左右错位、方向和垂角差异；保持间生小叶小巧；病叶保持正常绿色，避免选中后被高亮漂白；果梗加粗、自然弯曲，并精确连接到可见果串轴；保留原采摘运动 |
| `data/plant_structure.json` | 仅增加六片中下部/中部复叶的展开尺度；不增加小叶数量，不改变 ID、遮挡关系或动作参数 |
| `src/scene/Greenhouse.tsx` | 全景/正面构图；Detail 使用既有注册对象定位病叶/果实，普通复叶按包围盒中心取景；增加局部观察的可缩放距离 |
| `src/components/ScenePanel.tsx` | 模拟病斑局部放大/返回入口，复用现有按钮风格，不改页面布局 |
| `tests/e2e/plant.spec.ts` | 三视角遮挡、局部观察、拨叶前后截图、果实 UUID/连续位置采样、最终入箱状态/坐标、失败回滚和重置；录制实际浏览器运行过程 |
| `docs/VISUAL_REFINEMENT.md`、`docs/screenshots/round3/` | 本次交付记录、实际截图和录像 |

## 视觉与交互

- 叶片仍是 CompoundLeaf → Petiole/Rachis → 独立 Leaflet/Petiolule → Blade/Veins 层级。主要小叶使用更宽的三种不规则轮廓和不同长宽比；顶生小叶横向展开；间生小叶保留较小比例。
- 几何、材质和萼片仍共享。背景六株继续使用原简化网格；没有增加高精度背景叶片。
- 果串小果梗的起点投影到实际果串曲线上，末端与果实短柄相接，避免控制点附近的连接间隙。总梗和串轴更清晰；萼片独立于宽叶几何，避免变成宽叶星盘。
- 模拟病斑有灰褐中心、深褐不规则边缘、浅黄晕圈和少量黑点，仍直接使用叶面参数坐标计算。尺寸比上一轮收敛，通过相机局部放大观察，不依赖夸张的大圆点。
- Detail 保留周围组织和机器人接触区域；病斑放大可返回。相机只读取既有对象位置，不写入动作状态，也不参与回执。
- 采摘仍使用原果实 Group，果梗和果串保持挂载。业务规则、成熟度、颜色、分数不变，T06 揭示后仍暂缓采摘。

## 验收证据

运行入口与此前一致。截图是本地实际浏览器/WebGL 画面，不是效果图。`harvest-complete.png` 和 `basket-complete.png` 均在后端状态提交后拍摄；后者同时显示 T01“已采摘”、收集箱 3 颗及已采总数 03。

- [Overview](screenshots/round3/overview.png)
- [Front](screenshots/round3/front.png)
- [P01 复叶近景](screenshots/round3/leaf-closeup.png)
- [模拟病斑局部放大](screenshots/round3/lesion-zoom.png)
- [拨叶前](screenshots/round3/reveal-before.png) / [拨叶后](screenshots/round3/reveal-after.png)
- [采摘完成全景](screenshots/round3/harvest-complete.png) / [原果实入箱](screenshots/round3/basket-complete.png)
- [拨叶与采摘全过程录像](screenshots/round3/reveal-and-harvest.mp4)

## 测试结果

- `npm run build`：成功（2558 个模块，未增加依赖）。
- `.venv/bin/python -m pytest -q tests/test_agent.py`：10 passed；仅第三方 TestClient 的弃用提示。
- `npm run test:e2e`：3 passed，约 2.5 分钟。覆盖三角色完整流程、报告和环境趋势、窄屏、三视角遮挡、拨叶后真实可见、局部放大、原果实连续采样、入箱、重置及失败回滚；无页面脚本错误。
- T01 最终箱内世界坐标 `[1.48, 0.38, 1.18]`，采摘前/过程中/完成后/重置后保持原 UUID；完成截图显示“已采摘”及收集箱 3 颗。
- 另做浏览器运行检查：T01 果梗的父 Group 和管道 Mesh 在采摘前后 UUID 均相同，管道仍可见、仍有 147 个顶点，确认果梗保留。该检查只读取运行对象，未修改 SceneMotion。
- 复叶近景另拍摄了 P01_LEAF_09，展示较完整的宽叶轮廓与上部嫩叶；中部冠层特写保存在 `leaf-middle-closeup.png`。

## 范围边界

形态是需求给定依据下的程序化模拟，不声称特定品种农艺精确性；病斑不是检测结果。未引入物理仿真、软体、逆运动学或新的碰撞求解。遮挡验证针对预设视角；用户任意旋转相机时，不会实时改写业务遮挡字段。无真实 GPU 的 FPS/显存测量数据。
