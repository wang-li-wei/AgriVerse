# AgriVerse 茄境智农

面向设施农业的多角色三维智能体原型。一个程序化番茄温室、一个共享场景状态、三个角色，以及 19 个可执行农业 Skill。

多人协作、Fork / Pull Request 流程和提交前检查见 [协作开发说明](CONTRIBUTING.md)。

## 一键启动

需要 **Node.js 22+、Python 3.11+**。本次开发环境已经准备好项目内 `.tools/bin/node` 和 `.venv`；脚本会优先使用它们，不修改系统 Node/Python。

```bash
./scripts/start.sh
```

打开 **http://127.0.0.1:5173**。首次运行脚本会在缺少依赖时安装 npm 包和 Python 虚拟环境依赖；Ctrl+C 停止服务。默认没有任何密钥也可完成全部 DEMO 流程。端口 5173、8000 需要空闲。

单端口生产预览（构建前端并由 FastAPI 托管）：

```bash
./scripts/start.sh --production
# http://127.0.0.1:8000
```

## 分别启动

```bash
# 后端
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 另一个终端：前端
# 若使用本项目附带运行时，先执行 export PATH="$PWD/.tools/bin:$PATH"
npm ci
npm run dev
```

API 文档：http://127.0.0.1:8000/api/docs。Vite 将 `/api` 代理至本地 FastAPI；生产模式不需要跨域配置。

## 三条演示流程

1. **农户采摘**：默认农户角色，点击「一起看看，哪些番茄成熟了？」或输入「帮我检查哪些番茄成熟了，模拟采摘。」。模拟规则策略读取会话数据，在默认场景筛出 T01/T03/T05 并生成计划；这不是相机检测或模型自主推理。点击「确认并模拟采摘」，观察三个连续的目标动作、果实分离与收集箱计数，最后点击「采摘报告」查看并下载结果。T02 转色、T04 绿熟、T06 遮挡暂缓。
2. **学生研学**：先在设置中「重置整个演示」，切换研学学生，点击「认识番茄，体验智能采摘」。场景依次高亮茎、叶、花、果。挑战开始后，选择 T02 再提交会得到不适合采摘的反馈；选择 T01/T03/T05，再「提交答案」和「确认并模拟采摘」，完成一颗果实的采摘体验，底部显示四步学习进度。
3. **专家会诊**：切换农业专家，点击「为 P01 补充一次近景观察」或输入「帮我查看P01的疑似病害区域，并调取最近几天的环境信息。」。确认「拨叶并查看」后，机械臂拨叶，遮挡叶片侧移，场景自动切换近景；Agent 查询生长阶段、七天环境历史与巡检记录，生成会诊辅助摘要。点击底部「会诊摘要」「历史巡检」「查看环境趋势」查看证据分类、记录和图表。

三种角色共用已采摘状态与观察状态。要分别演示完整采摘流程，需在设置中重置场景；切换角色本身不会重建 Canvas 或重置果实。鼠标拖动旋转、滚轮缩放；点击果实、植株、叶片或花序查看信息；底部六个果实按钮也可选择目标。场景支持全景、正视、近景、视角复位与放大。

## DEMO 与 REAL_AGENT

**DEMO**：未配置密钥或服务商为 `demo` 时启用。由后端本地规则选择预置任务流程，调用与模型模式相同的 SkillRunner，执行真实函数、更新场景并产生结构化事件。不是大模型自主推理。界面明确显示「本地演示模式」。支持三条主任务、环境查询、管理报告和本地知识检索；不是通用自然语言系统。

**REAL_AGENT**：复制 `.env.example` 为 `.env`，填写后端变量并重启后端：

```dotenv
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=在本地填写密钥
LLM_MODEL=填写你的服务商支持的模型ID
```

`openai` 使用 Responses API 的 `function_call` / `function_call_output` 循环；`compatible` 使用 OpenAI 兼容的 Chat Completions 工具调用。模型获得当前角色、同角色历史对话、当前场景状态和允许的工具，每次请求最多执行 48 轮决策、每个任务最多调用 64 次工具，并有 180 秒请求预算。严格结构参数经过 Pydantic 校验，工具权限由服务端执行器强制检查。工具失败返回结构化错误供模型继续判断。

采摘与拨叶始终需要前端确认卡。确认后恢复同一个 Mission 并继续 Provider 工具循环，每轮重读版本化 World 和 Observation；授权限定目标范围，模型可以动态选择顺序，扩大范围或世界状态变化时须重新确认。每个工具结果进入模型下一轮输入，采摘状态由独立验证后的内部受控提交产生。真实模型调用失败不会自动回退为模拟规则。

密钥只由 FastAPI 从 `.env` 读取，`.env` 已忽略；前端不读取任何密钥。真实模式仍使用同一份预置农业数据，不代表真实作业或真实监测。没有密钥时不会擅自调用付费服务。

实现参考：[OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling)、[R3F 安装与 React 兼容说明](https://r3f.docs.pmnd.rs/getting-started/installation)。前端使用 React 19、R3F 9、Drei 10；具体安装版本见 `package-lock.json`。

## 架构与数据流

```text
React 界面 / Zustand 共享状态
  → POST /api/sessions/{id}/chat
  → Mission + 版本化观察 + 明示模拟规则 / Provider 模型工具循环
  → SkillRunner（校验、权限、可执行函数）
  → NDJSON 流：tool queued/running/success/failed
  → action 事件 → R3F 机械臂关键帧动画
  → 前端 POST 动作 ack → 后端工具拿到结果
  → 独立结果验证 → 内部 update_fruit_status → state → 再观察/模型决策
  → 管理报告 / 学习反馈 / 专家辅助摘要
```

采摘状态仅在动画成功回执及几何证据通过验证后提交；裸 success=true 为不确定，不提交。动画失败、超时或断连不会自动视为成功，已完成的逐果实操作保留。动作 35 秒未收到回执会失败。服务端按会话加锁，避免任务并发改变场景；浏览器刷新可通过 sessionStorage 恢复场景、最近任务的公开聊天/工具/事件记录；历史 action 不重播。SQLite 保存世界、Mission、计划、对话上下文及事件。重启时，未完成动作转为不确定，需重新观察和确认；最多缓存 100 个会话，闲置两小时的缓存可清理，持久记录保留。

```text
src/
  scene/         程序化温室、植物几何体、机械臂与相机控制
  components/    场景面板、Agent 对话、技能日志、角色信息、设置
  agent/roles.ts 前端角色名称、快捷指令与文案
  store.ts       NDJSON 客户端、共享状态、动作回执
  types.ts       前端领域与事件类型
backend/
  main.py        FastAPI、会话、流式端点、动作确认
  agent.py       有预算的动态 Mission 循环、确认后恢复模型决策
  missions.py    版本化计划、授权、安全检查与步骤结果
  observations.py 模拟观察、世界实体关系与感知 Adapter
  verification.py 独立验证、仿真机器人 Adapter
  memory.py      SQLite 检查点与事件查询
  simulation.py  明示的离线规则策略（非 LLM）
  providers.py   Responses / 兼容服务商适配
  roles.py       后端角色提示词与技能权限
  skills.py      19 个技能、参数 schema、错误和执行事件
  models.py      演示领域状态与请求验证
data/            果实、植株、环境历史、巡检、动作、知识 JSON
tests/           后端行为测试、浏览器端到端流程
scripts/start.sh 开发/生产启动
```

## Skill 工具清单

每个 Skill 在 `backend/skills.py` 的注册表中声明，通过 `SkillRunner.run(name,args)` 执行并发出生命周期事件；参数以 Pydantic 验证。没有参数的函数接收空对象。完整 JSON Schema 由 `tool_definitions(role)` 生成。

| Skill                     | 参数                   | 行为与返回                                             |
| ------------------------- | ---------------------- | ------------------------------------------------------ |
| inspect_greenhouse        | 无                     | 温室、植株与果实数量                                   |
| identify_tomatoes         | 无                     | 六颗果实的实时会话状态                                 |
| select_harvest_targets    | 无                     | 排除遮挡、未成熟、已采摘果实的 ID                      |
| get_harvest_plan          | target_ids             | 校验目标，生成服务端待确认计划                         |
| play_robot_action         | action_type, target_id | 发送 harvest/reveal 动画，验证证据并内部提交；必须有确认授权 |
| update_fruit_status       | target_id              | 仅供内部验证提交；模型不可调用，防重复提交       |
| search_agri_knowledge     | query                  | 查询本地 JSON 知识                                     |
| generate_farm_report      | 无                     | 累计采摘与剩余目标报告                                 |
| query_crop_status         | 无                     | 生长与采摘统计                                         |
| query_environment_history | days (1–7)             | 预置环境历史与明确的数据来源                           |
| explain_plant_part        | part                   | 茎、叶、花、果实解释与场景高亮                         |
| explain_ripeness_stage    | 无                     | 三阶段知识与综合判断提示                               |
| generate_learning_task    | 无                     | 切换至选果学习状态                                     |
| evaluate_student_answer   | target_id              | 判断答案，正确则生成单果确认卡                         |
| inspect_plant_health      | plant_id               | 预置模拟异常、遮挡状态，不返回诊断                     |
| reveal_occluded_area      | 无                     | 创建 LEAF_01 拨叶观察确认卡                            |
| query_growth_stage        | plant_id               | 品种与生长阶段                                         |
| query_inspection_records  | plant_id               | 预置巡检与管理记录                                     |
| generate_expert_summary   | 无                     | 模拟事实、历史、辅助判断、待专家核实四类证据           |

角色权限见 `backend/roles.py`。植物 ID 限 P01、果实 T01–T06、异常叶片 LEAF_01。机械臂动作轨迹与果实坐标以本地数据为准。T06 即使拨叶后仍是暂缓对象，不会自动进入采摘计划。

## 验证命令

```bash
npm run build
.venv/bin/python -m pytest -q tests/test_agent.py tests/test_missions.py
# E2E 会自动启动缺失的本地服务，也可以复用已运行服务：
npx playwright install chromium --only-shell
npm run test
# npm run test:e2e 仍为兼容入口
```

后端测试覆盖农户确认后逐果采摘、重复确认、学生错误/正确选果、专家拨叶和摘要、失败动画不提交、角色权限、会话隔离、模型工具调用往返（假 Provider）与 API 输入验证。E2E 使用本地浏览器覆盖三条完整流程、真实动画回执、报告与趋势弹窗、1440px/390px 布局及脚本错误。

## 本轮植株与联动升级

P01 现为 12 片独立复叶、两个三果果串。T06 和 LEAF_01 共用 P01_LEAF_06 遮挡复叶；病斑属于 P01_LEAF_07 的顶生小叶。拨叶会更新两处遮挡字段，但不会改变 T06 的成熟度或原采摘资格。原果实 Group 连续移动入箱，角色切换和刷新仍读取相同会话状态。

完整结构、动作与交付说明见 [本轮升级说明](docs/PLANT_UPGRADE.md)。

第三轮进一步调整宽叶浅裂轮廓、冠层、果梗连接和专家取景，保留动作与业务架构。修改清单、完整验收结果、截图与录像见 [视觉优化交付](docs/VISUAL_REFINEMENT.md)。

## 执行过程可视化

采摘现为单果 9 秒、拨叶 8 秒。右侧实时显示任务、目标、动作阶段与验证记录；场景只保留小型提示。阶段来自真实场景帧，经原 NDJSON 流推送，原 ack 增加可选几何证据。动作时钟、UUID、原果实 Group、角色与 Skill 保持兼容。

完整根因分析、事件协议、修改清单、单果/多果/拨叶录像、失败测试与限制见 [执行过程交付](docs/EXECUTION_VISIBILITY.md)。Agent-First 第一阶段已替换确认后固定循环，真实模型路径支持结果驱动的再观察/再决策；默认离线模式仍是明确标注的规则策略，没有真实视觉识别。

## 当前边界 / 未实现功能

- 无真实机器人、传感器、病害识别或诊断，叶斑为附着在小叶曲面上的斑枯病外观模拟，非检测或确诊。
- 无真实逆运动学、碰撞检测或物理仿真；机械臂为插值关键帧，连杆随端点可视化，收集箱使用简化排布。
- 已有标准库 SQLite 持久化（`.runtime/agent.sqlite3`），但没有账号、多设备会话绑定、多实例锁或自动留存清理。重启不自动重放不确定动作。
- 真实模型适配层已经实现并以假 Provider 测试工具循环；未配置 API 密钥，未做真实服务商的联网端到端验证。不同兼容服务商对工具 strict schema 的支持可能不同。
- DEMO 只覆盖预置任务意图；不做开放领域自主规划。知识库是小型本地样例，没有联网搜索。
- 暂无模型逐 token 输出、长时间后台任务和通用任务图搜索。支持断流取消、有限工具错误恢复、任务查询/显式恢复；动画仍需页面保持前台，后台节流可能导致回执超时。
- 主要按桌面 1440×900 设计，窄屏采用场景与对话上下排列；需要 WebGL 2。无障碍提供标签、键盘按钮和减少 UI 动画偏好，三维对象也有对应 DOM 果实选择按钮。
- UI 采用自定义 CSS 与 Lucide，不强行引入 Tailwind/shadcn；图表采用 SVG，减少原型依赖。3D 全部程序生成，无远程模型或图片；字体使用可选 Web 字体与系统后备字体。

依赖通过 npm/PyPI 安装，保留各自开源许可证；没有复制第三方项目架构或使用外部 3D 模型。


## Agent-First 第一阶段

模型工具结果 → 最新模拟观察 → 模型再决策已接入确认后的实际调用链。保留 19 个注册 Skill，其中 `update_fruit_status` 为内部验证提交接口，不向模型开放。每个 Mission/计划/观察和公开事件可关联查询；默认未配置模型时仍明示为模拟规则 Agent。

- [实际架构、能力边界与适配接口](docs/AGENT_ARCHITECTURE.md)
- [执行、确认、验证与事件流](docs/AGENT_EXECUTION_FLOW.md)
- [迁移与兼容说明](docs/AGENT_MIGRATION.md)

任务查询：`GET /api/sessions/{sid}/missions`；事件重放：`GET /api/sessions/{sid}/events?mission_id={mid}&after={cursor}`；显式恢复：在原 chat 请求增加 `mission_id`，重新观察和请求必要授权。SQLite 位置可用 `AGRIVERSE_MEMORY_PATH` 指定。

第一阶段测试结论见本次交付报告；Mock Provider 与本地模拟通过不等于真实模型/硬件已经验收。
