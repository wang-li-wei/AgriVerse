# AgriVerse 空间智能体工作台：交互审查与产品方案

审查日期：2026-11-15。源码基线：`df95c2a`。本轮交付审查、信息架构、线框、事件映射、组件/状态方案、分阶段计划；不修改应用业务、NDJSON、Mission、Provider、Skill 或动画实现。

阅读方式：本文的“现状”均对应源码或明确标注的已保存事件；“建议/拟新增”是下一阶段设计，不代表已经实现。[可交互线框](workbench-wireframes.html) 与 [线框总览](workbench-overview.png) 仅展示布局/信息关系，不调用后端、模型或机器人。

## 一、当前交互问题审查报告

### 1.1 结论

后端已有可以支撑空间工作台的事实：版本化世界、Mission/Run/动作 ID、原对象注册表、观察/决策/验证事件和持久事件查询。当前前端仍以“左侧展示温室、右侧聊天”为骨架，将运行过程不断加入右栏，没有建立独立的任务过程、空间注意和结果对比视图。

建议在现有协议上增加**前端事件投影和交互组织层**，先解决信息和状态语义，再迁移布局。无需增加模型能力或重做场景。

### 1.2 审查范围和证据

- 阅读 App、AgentPanel、ExecutionTimeline、ScenePanel、Insights、Zustand、类型、角色、样式、CameraRig、SceneMotion、对象注册相关代码。
- 追踪 backend/agent.py、skills.py、execution.py、models.py、main.py、memory.py、observations.py 中与呈现、提交和恢复相关的实际路径。
- 当前用户页面只读检查：1330×897 视口，workspace 1239×623，scene-canvas 823×326，AgentPanel 宽 392，对话滚动区高 191，已折叠运行区高 131；场景画布约占视口面积 22.5%。这是一份实际布局测量，不是所有屏幕的固定表现，也不是性能测试。
- 已保存真实模型事件：[DeepSeek events](../evidence/deepseek/events.json)，66 条，1 个 Mission、2 个 Run，包含 state；另一个 [Agent-First 前端样本](../evidence/agent-first/multi-events.json) 为筛选后的 82 条执行事件，不含 state/confirmation/action，不能单独重建完整 World Diff。
- 本轮未发送新模型任务、未执行采摘/拨叶/重置。以下未来验收项没有在本轮作为新功能测试运行。

### 1.3 问题清单

| 优先级 | 现状与用户影响 | 实际依据 | 设计处理 |
| --- | --- | --- | --- |
| P1 | 场景上方介绍、下方 Insights 和右侧固定聊天共同占空间，场景还承载宣传语、环境条、选中卡、动作提示 | [App:156](../../src/App.tsx#L156)、[styles:260](../../src/styles.css#L260)、[styles:329](../../src/styles.css#L329)、[ScenePanel:78](../../src/components/ScenePanel.tsx#L78) | 紧凑任务栏、常驻场景、独立聊天和底部过程区；Insights 下沉为对象/任务上下文 |
| P1 | 运行区是右栏不可压缩子元素，对话只能使用剩余高度；展开记录会进一步压缩聊天 | [AgentPanel:196](../../src/components/AgentPanel.tsx#L196)、[styles:1129](../../src/styles.css#L1129)、[styles:2601](../../src/styles.css#L2601) | Trajectory 移至场景下方，不再位于聊天高度流中 |
| P1 | 同一工具同时出现在聊天执行块、技能页和时间线，用户需要辨认三份相似记录 | [AgentPanel:271](../../src/components/AgentPanel.tsx#L271)、[AgentPanel:337](../../src/components/AgentPanel.tsx#L337)、[ExecutionTimeline:5](../../src/components/ExecutionTimeline.tsx#L5) | 一份 canonical 事件记录，多个摘要视图；工具原始详情只保留一个入口 |
| P1 | 时间线按最后一个 run_id 过滤，同 Mission 的计划/确认前后会断开 | [ExecutionTimeline:19](../../src/components/ExecutionTimeline.tsx#L19)、[agent:181](../../backend/agent.py#L181) | Mission 为一级过程，Run 为段落，动作/目标为子节点 |
| P1 | 运行标题来自当前 Run 的请求；确认阶段容易显示“确认计划”而非原任务目标；无任务目录选择 | [ExecutionTimeline:76](../../src/components/ExecutionTimeline.tsx#L76)、[main:136](../../backend/main.py#L136) | 任务栏使用已有 Mission.goal/status/plan；保留每轮输入在对应 Run 中 |
| P1 | state 仅覆盖 world；执行数组又只保存部分事件，因此既无 before/after，也缺完整提交依据 | [store:65](../../src/store.ts#L65)、[store:238](../../src/store.ts#L238)、[store:258](../../src/store.ts#L258) | 保留原始事件和权威快照，构建只读差异投影 |
| P1 | 用户选择和 Agent 动作目标共用 selected；action 到来会覆盖用户选择并切镜头 | [store:196](../../src/store.ts#L196)、[store:312](../../src/store.ts#L312) | 用户检查、Agent 当前关注、历史事件对象三种独立状态 |
| P1 | 观察和决策没有场景联动入口，当前时间线行仅文本/JSON；只有 action/camera 自动定位 | [ExecutionTimeline:113](../../src/components/ExecutionTimeline.tsx#L113)、[store:317](../../src/store.ts#L317) | 明确“定位对象”“查看依据”“查看变化”，由只读空间适配层解析稳定 ID |
| P1 | confirmation 和学生提交位于聊天 tab 深处，切换技能 tab 会隐藏；旧卡存在失效风险 | [AgentPanel:297](../../src/components/AgentPanel.tsx#L297)、[store:212](../../src/store.ts#L212)、[agent:172](../../backend/agent.py#L172) | 唯一实时 ApprovalDock；历史卡只读；终态/重连通过现有任务 API 核对 pending |
| P2 | 新任务会在后端清空旧 pending，但前端非确认发送会保留 confirmation，且当前该路径未发送 clear_confirmation | [agent:172](../../backend/agent.py#L172)、[store:212](../../src/store.ts#L212)、[store:306](../../src/store.ts#L306) | 前端派生当前有效卡和失效历史卡；后端仍是最终授权裁决者，不新增协议 |
| P2 | Insights 的可采数只用 harvestable+on_plant，与后端完整资格规则不一致；对象卡优先显示 harvestable | [Insights:49](../../src/components/Insights.tsx#L49)、[ScenePanel:141](../../src/components/ScenePanel.tsx#L141)、[observations:10](../../backend/observations.py#L10) | 优先采用最新后端 eligible_ids/available；缺依据时标记待核验，不再单独推导“安全可采” |
| P2 | 总数 06、生长观察 03、生长阶段和部分环境预览写死；详情趋势才读取 world.environment | [Insights:89](../../src/components/Insights.tsx#L89)、[Insights:112](../../src/components/Insights.tsx#L112)、[Insights:225](../../src/components/Insights.tsx#L225)、[ScenePanel:90](../../src/components/ScenePanel.tsx#L90) | 统一可追溯的字段选择器，保留“预置历史”来源，不变成实时传感器 UI |
| P2 | 报告、环境和巡检以遮罩弹窗展示，与空间对象分离；专家报告的四类字段被展开为普通段落 | [Insights:288](../../src/components/Insights.tsx#L288)、[Insights:318](../../src/components/Insights.tsx#L318) | 同一对象的证据抽屉，明确事实/历史/辅助判断/待核实；空间仍可见 |
| P2 | 模型 Markdown 回复直接放入 p，列表/表格语法没有结构化渲染，长回复易形成文字块 | [AgentPanel:268](../../src/components/AgentPanel.tsx#L268)；当前页面只读观察可见表格文本 | 关键状态以结构化事件卡表达；公开回复可做有限格式展示，但不能从其文本推断业务成功 |
| P2 | 执行事件截断为最后 600 条，刷新只取每角色最近 Mission；消息重新生成随机 ID，难以建立稳定引用 | [store:71](../../src/store.ts#L71)、[store:88](../../src/store.ts#L88)、[store:251](../../src/store.ts#L251) | Mission 目录、稳定事件引用、按 cursor 懒加载；截断显示“历史未完整加载” |
| P2 | 手机变为 520px 场景、Insights、650px Agent 顺排，观察与输入需要跨较长页面 | [styles:2391](../../src/styles.css#L2391)、[styles:2402](../../src/styles.css#L2402)、[styles:2459](../../src/styles.css#L2459) | 常驻紧凑场景 + 单个底部工作抽屉；切 tab 不卸载 Canvas |

上述“卡片失效、统计不一致”是实际代码可推导的边界问题，不声称已在当前用户会话触发；本轮不修复业务代码。

## 二、新版页面信息架构

### 2.1 页面骨架

```text
WorkbenchShell
├─ WorkspaceHeader：项目、模式（模型 / 规则）、场景仿真标识、角色、连接状态
├─ MissionBar：原始目标、当前 Mission/plan_version、真实任务状态、对象数量摘要
├─ WorkspaceBody
│  ├─ ContextRail：对象 / 本角色任务 / 资料索引，可折叠
│  ├─ SpatialViewport：唯一且常驻的现有 Canvas
│  │  ├─ 视角控制与用户“跟随当前动作”开关
│  │  ├─ 用户检查 / Agent 关注 / 操作对象的少量定位标记
│  │  └─ 简短阶段条，不放对话、报告或原始 JSON
│  ├─ ConversationPane：独立滚动对话与输入器，可收起
│  └─ 下方与场景同列
│     ├─ ApprovalDock：只有当前等待用户输入时占位
│     └─ TrajectoryDock：过程 / 世界变化 / 证据；独立高度和滚动
└─ StatusBar：来源、连接、历史是否完整；原始 ID 按需展开
```

桌面建议：顶部约 48–56px，任务栏 44–56px；左索引 48px 折叠/180–220px 展开；聊天 300–360px；过程默认 176–220px、可收至 36px。尺寸是设计建议，后续实现须用实际 viewport 验证，不是本轮新页面实测结果。

场景占据其余宽高。默认 1330/1440 桌面收起左索引时，以 Canvas 占可见视口约 40% 以上为首轮目标；打开对象/聊天时允许降低。不能靠遮住重要对象或把聊天移到不可见区域达标。

环境、统计和报告从常驻大块 Insights 改为 MissionBar 小摘要 + ContextRail / 证据面板。场景扩大不切换 Canvas 实例，不按 role、Mission 或后端 revision 更换其 key。

### 2.2 场景与对话的协作关系

- 对话负责表达目标、追问和解释，不重复铺满工具日志。
- 过程区回答“做到了哪一步、依据是什么、操作了哪个对象、结果是否提交”。
- 场景负责定位和观察实际对象，点击只改变检查上下文，不直接触发机器人。
- 证据面板负责详细参数、来源、观察快照、报告和历史。原始 JSON 在二级详情，不做一级界面。
- 当前确认只出现一次；聊天可有“查看待确认计划”链接，不能复制一套可执行卡。
- 历史浏览是只读事实回看；“回到当前执行”恢复跟随，不重播 action、不写 world。

### 2.3 关键线框

[交互版](workbench-wireframes.html) 可切三角色、查看已提交/等待/验证中/失败设计状态、选择对象。示意图形不是新植物模型，不调用现有模型或 Skill。

- [农户空间工作台](farmer-wireframe.png)：目标、候选对象、单一确认入口、独立过程与对话。
- [专家观察工作台](expert-wireframe.png)：区域、遮挡叶、承载叶、观察来源和证据并列。
- [学生探索与窄屏](student-mobile-wireframe.png)：学生选择与 Agent 关注分开，移动端保持场景与提交上下文。

线框中的 T01 差异采用已保存 DeepSeek 实测的 v0→v1；其他状态明确为设计示意，不是声称又执行了新任务。

## 三、Agent Trajectory：事件到 UI 的映射

### 3.1 分层与身份

一级 Mission（原目标/角色/计划版本），二级 Run（请求或确认），三级对象/操作，四级实际事件。观察、决策、工具、确认、动作、验证、提交是不同节点类型，不能硬拼为每次必经的固定步骤。

服务端事件主键：`sessionId + run_id + seq`。持久查询的 cursor 用于跨 Run 排序/分页；实时消息按接收顺序建立 Run 顺序，Run 内按 seq。不能把两个 Run 的 seq 直接混排，也不能只用 timestamp 排序。

客户端合成 run_failed 的 seq 可能与后续服务端事件冲突（[store:375](../../src/store.ts#L375)）；为其生成独立 client UI key，保留 source=client，不冒充服务端事实。

### 3.2 映射表（保持原 NDJSON 不变）

| 原事件 | UI 表达和归并 | 空间关联 | 能否提交 World Diff |
| --- | --- | --- | --- |
| run_started | 新 Run 段，归入 mission_id；标题读取 Mission.goal，显示本轮请求 | 无结构化目标时不猜测 | 否 |
| observation | 观察节点；识别 result.summary、result.entities/relations、result.observation 或局部目标事实等实际形状；保留来源与版本 | target_id、实体 ID、明确的遮挡关系；全场观察不等于聚焦所有对象 | 否，观察变化不是业务提交 |
| decision | 公开决策摘要、tool_name、args、evidence；不补写模型内部理由 | 优先 target_id，再 args.target_id/target_ids，再 evidence.target.id | 否；只是选择工具或目标 |
| tool | 按工具 id 归并 queued/running/success/failed，保存输入、返回和时间 | 已知 target/plant 参数，未映射的工具无空间目标 | 只作上下文，success 不能独自证明采摘提交 |
| tool_call | 与 tool.id=call_id 对应时合并为同一生命周期；无 tool 的 router/cache 调用独立显示 | 同上；复用结果标记“未重新执行” | 否 |
| confirmation | 独立等待节点，存原 ID/plan/version/scope；仅当前有效 pending 可操作 | 多目标授权范围；reveal 需区分区域和被拨叶 | 否，授权不是结果 |
| clear_confirmation | 结束当前确认的可操作状态；保留历史卡 | 清理待确认范围标记，不删除历史关注 | 否 |
| action | 操作节点，id/action_uuid、kind、target、leaf/truss/affected IDs；原传输器继续启动动画 | 目标、夹爪、操作叶和邻叶；只读关联对象 | 否，不把目标位置当作落箱结果 |
| action_stage | 同 action_uuid+stage 的开始/完成子记录；保留所有原始引用及真正时间 | 当前操作对象及必要接触对象 | 否；verify 阶段或 100% 也不是提交 |
| verification | 区分 progress / completed 与 result.outcome / task_verified / commit；不同事件不压成一个勾 | 对应目标和证据对象 | 采摘须匹配后续权威 state；详见下一节 |
| state | 保存独立权威快照，并更新当前共享世界；记录 inner/outer revision | 更新对象业务属性，不覆盖用户检查目标 | 提供差异数据，须匹配验证证据才能称采摘/拨叶已验证 |
| camera / highlight | 作为空间指令/讲解注记，不伪装观察或感知 | 复用现有 camera preset / part 高亮；部位 token 非具体检测对象 | 否 |
| message | 公开回复，关联 Mission/Run；保留聊天入口 | 文本中 ID 最多作为“提及对象”的导航，不认作 Agent 观察或动作目标 | 否 |
| run_completed | 区分 awaiting_input / mission_status；查询完成、等待确认与作业验证完成用不同文案 | 可定位已提交对象，不能自行选新目标 | 否，不能替代逐动作验证和 state |
| run_failed / error | 标记失败、取消或不确定；客户端错误单独来源；保留已提交操作 | 清理当前执行关注；保留用户选择和失败目标入口 | 不新增成功差异；已确认提交的历史结果保留 |
| done | 传输完成标记，不作为任务成功节点 | 无 | 否 |

现场/历史都要保留 raw envelope，不能继续只存 ExecutionEvent 类型子集。`src/types.ts` 目前对 state/confirmation/action 等没有完整声明运行时 envelope 字段；未来通过前端类型/解析补齐，不修改后端发送格式。

### 3.3 归并边界

- tool 与镜像 tool_call 的相同调用只算一次工具执行；保留原始事件查看入口。
- action_stage 的 started/completed 可以显示成一行，但开始、结束和缺失数据不可被覆盖丢失。
- 有同 observation_id 的摘要/完整结构可合并；没有 observation_id 的局部观察保留独立引用，不能按同文案强行合并。
- decision 与后续调用缺少统一 decision_id，可按当前代码中的相邻顺序、工具名、参数形成“顺序关联”；缺字段时不宣称精确因果 ID。
- action 与阶段/验证按 action_uuid 关联。state 无 action_id，只能按同 Run 的顺序、目标字段、版本、已存在的验证匹配；不伪造后端原本没有的关联字段。
- 重试保留每次尝试；任务后来成功不会抹掉失败尝试。恢复也不把已完成动作显示成再次执行。
- 流中断/缓存截断/历史缺口显示“记录未完整加载”；不能将未收到的阶段画成已完成。
- 只有 actionProgress 有真实动画百分比；等待模型返回时使用不定百分比的处理中状态，不编造总体完成率或“正在识别某对象”。

## 四、Spatial Attention：业务对象与实际场景关联

### 4.1 当前可复用条件与缺口

实际注册入口为 [SceneMotion:56](../../src/scene/SceneMotion.tsx#L56)。`useSceneRegistry()` 可在生产场景内读取；`window.__agriverseScene` 仅 DEV 构建存在（[SceneMotion:273](../../src/scene/SceneMotion.tsx#L273)），不能作为新产品依赖。

| 业务对象 | 当前场景锚点 | 可用性 / 建议 |
| --- | --- | --- |
| T01–T06 | Tomato root 用 fruit_id 注册，[Plants:408](../../src/scene/Plants.tsx#L408) | 可直接读取实际 getWorldPosition，入箱后继续跟随原 Group |
| P01 | MainPlant root，[Plants:668](../../src/scene/Plants.tsx#L668) | 可定位整株；不是每个主茎节点都已注册 |
| P01_LEAF_01–12 | CompoundLeaf root / CONTACT，[Plants:244](../../src/scene/Plants.tsx#L244) | 根部与接触点用途不同；显示复叶范围可使用实际 Box3 |
| P01_TRUSS_01/02 | FruitTruss root，[Plants:603](../../src/scene/Plants.tsx#L603) | 可定位；新增强调不更改果串变换 |
| LEAF_01 | 病斑所在叶面 marker，[Plants:111](../../src/scene/Plants.tsx#L111) | 与遮挡叶不是同一对象 |
| 主要/间生/顶生小叶 | d.id 命名 Group，健康叶面的 marker 注册为 `${leafletId}_SURFACE`，病斑叶面使用 LEAF_01 | 需要显式别名解析，不能假设后端 Leaflet ID 能直接查到 Group |
| ROBOT | 现有 ROBOT 为 Actor ID，实际注册的空间锚点是 ROBOT_GRIP，[Robot:24](../../src/scene/Robot.tsx#L24) | 使用夹爪定位须标明“末端”，不能冒充整个机械臂中心 |
| BASKET / FLOWER / CAMERA / P01_STEM | 后端实体或选择 token 并不全有独立 Object3D 注册，[Basket:134](../../src/scene/Greenhouse.tsx#L134) | 先显示业务详情或整株语义入口；下一阶段可补只读锚点，不能虚构当前坐标 |

### 4.2 三种注意状态

1. **用户检查对象**：由点击场景、对象树或“定位”产生，持续到用户改变；是 Inspector 的对象。
2. **Agent 当前关注**：来自当前实时结构化 observation/decision/action，不覆盖用户检查。动作期间优先展示实际 action target。
3. **历史事件关联对象**：用户选择历史节点时显示，仅作为历史上下文；在当前场景定位须标注“当前空间中的该对象”，不声称是历史姿态。

同时存在时用实线/虚线、文字与颜色区分，最多突出一个主目标和少量关联对象。不能靠给所有叶片加亮替代注意模型。

### 4.3 遮挡与病斑示例

```text
P01_LEAF_06 ── occludes ──> T06
       └───── occludes ──> LEAF_01 模拟疑似病斑区域
                              └─ part_of → P01_LEAF_07_TERMINAL
                                               └─ part_of → P01_LEAF_07
```

来源是 `plant_structure.json.reveal`、plants/fruits 字段及模拟 Observation relations，必须标注“模拟业务遮挡关系”。它不是当前相机视角的像素级检测结果。客户端真实几何可见性如需展示应另标“当前视角几何检查”，并明确单点射线与视锥检查的范围；不新增伪感知结论。

### 4.4 只读空间适配层（拟新增）

- 输入稳定业务 ID、对象角色（关注/遮挡/承载/邻近）、事件引用和版本；输出真实锚点、可定位能力或 unavailable。
- 在现有 SceneMotionProvider 内读取注册表，通过 DOM 投影标记显示；不要改写原对象 position/rotation/material，也不复制或重挂载果实。
- 优先用 DOM / Html 覆盖层，避免新 Three Mesh 进入 `regionVisible()` 的射线检测，意外改变拨叶 ack（[SceneMotion:371](../../src/scene/SceneMotion.tsx#L371)）。辅助穿透标记要明示，不能冒充真实可见。
- 每帧只更新投影位置/ref，不能每帧写入事件日志、发送请求或调用模型。
- 镜头默认“显示关注，不强制跳转”；用户点击定位或开启跟随才移动。动作已有取景策略继续复用；不要在每条 observation/stage 上反复 setCamera。
- 用户拖动后暂停自动跟随，提供“回到当前执行”。拨叶验证目前与相机到区域的几何检查有关，不能将新相机策略与验证脱钩后仍宣称保证成功。
- 历史浏览、角色切换、面板折叠和窄屏切换都不能改变 action.startedAt、重新发送 ack 或创建新 Tomato Group。

## 五、World Diff：事实、验证与提交

### 5.1 必须区分三类信息

| 类型 | 来源 | 文案 |
| --- | --- | --- |
| 观察/业务字段变化 | 两个后端 World 快照 | “后端状态变化”，来源无法精确归因时直说 |
| 模拟空间执行证据 | action ack / verification.evidence | “仿真几何回执”，不是物理作业证明 |
| 已验证的业务操作差异 | 权威快照变化 + 对应已完成验证/提交结果 | “采摘已提交 / 拨叶观察状态已提交” |

不能从模型回复、action_stage=verify、100% 动画或前端视觉入箱直接更新成功差异。

### 5.2 已保存的真实顺序

DeepSeek 样本的同一 Mission：

| Run / seq | 原事件 | 真实含义 |
| --- | --- | --- |
| 计划 Run / 28 | state：v0、T01 on_plant、collected=[] | 可作权威 before |
| 计划 Run / 32 | run_completed，awaiting_input=true，waiting_approval | 等待确认，任务未完成 |
| 执行 Run / 9 | action，T01 | 动作开始 |
| 执行 Run / 26 | verification progress，outcome=SUCCESS，task_verified=true，v0 | 几何回执已通过，但还没有 commit；不能显示已提交 |
| 执行 Run / 27 | verification completed，v1，commit={fruit_id:T01,status:harvested,basket_count:1} | 提交结果已返回，等待快照核对 |
| 执行 Run / 28 | state：v1，T01 harvested，collected=[T01] | 权威 after，与提交一致，允许确认差异 |
| 执行 Run / 34 | run_completed，mission_status=success | 汇总；不再次增加计数 |

代码顺序见 [skills:239](../../backend/skills.py#L239)、[skills:249](../../backend/skills.py#L249)、[skills:275](../../backend/skills.py#L275)、[skills:152](../../backend/skills.py#L152)。

### 5.3 客户端只读判定流程（拟实现）

```text
收到权威快照 → 独立保存，并建立可用 baseline
动作发生 → 关联 action_uuid / target / 当前 baseline
verification progress → 仅记录证据，不提交展示成功
verification completed + SUCCESS/task_verified（采摘还须有 commit）→ 等待匹配的权威 after
state 到达 → 对比实际字段，并核对目标、版本和 commit
一致 → diff 标记 verified_committed；不一致/缺快照 → pending 或 uncorrelated
失败/不确定/断流 → 未确认的操作不产生成功差异；已确认结果保留
```

拨叶最终结果的 commit 当前为 null；使用其 action_id、task_verified 和权威 after 核对，不能套用采摘 commit 的必需条件。

采摘至少核对目标由 on_plant→harvested、collected 新增该 ID、数量与 commit.basket_count 一致。下一个目标必须有各自验证，不能一条成功为整批背书。

拨叶核对 revealed、区域 occluded 和相关果实 occluded 的实际变化，以及同目标/动作的最终验证与场景证据。已有 reveal 中会先发一条无 action_id 的 completed（[skills:261](../../backend/skills.py#L261)），再发带 action_id 的最终 completed；必须等待后者和 after，不能错误合并早期节点。T06 的 harvestable、成熟度未变时明确显示“资格未改变”；diagnosis=null 不是“已诊断无病”。

报告和学习状态的差异来自 state 与相关工具结果；无需伪造机器人验证，文案应为“学习状态更新/报告新增”，不归为采摘成果。

### 5.4 展示字段与恢复边界

- T01：`status: on_plant → harvested`；`collected: [] → [T01]`；收集箱 `0 → 1`。
- 不显示 fruit.position 已变为箱内：该字段在业务 World 中保留静止坐标。箱内世界位置来自场景证据/模拟观察投影，另列来源。
- 不显示 Three.js parent 已重挂到箱子：当前 Tomato 通过父级 worldToLocal 连续移动，原父 Group 可继续保留；业务 attached_to 和 Three 层级不是同一概念。
- World revision 包含报告/学习等变化，revision+1 不等于采摘一颗。
- 相同 revision 的重复 state 去重展示，但保留来源引用；不同内容却同 revision 需标异常，不能静默覆盖证据。
- sessionId、reset 分段、Mission/Run/seq/cursor 共同确定快照范围；reset 后版本可从 0 开始，不能只用 revision 做全局主键。版本倒退/缺少 reset 边界时建立新分段，不跨段对比。
- 历史缺少 before 时显示“缺少操作前快照”，只读显示已知 after；不能用 data/fruits.json 冒充该会话的真实 before。
- 网络恢复后先加载现有 events/Mission/World 进行核对；不能根据客户端失败事件否定一个服务端已经提交的操作，也不能因为 GET 快照有变化就补造原本缺失的验证。
- 回看只改变 viewedSnapshot，绝不替换 live world、重放 action 或调用 finishAction。

## 六、三角色在共享世界中的差异化体验

| 维度 | 农户 | 学生 | 专家 |
| --- | --- | --- | --- |
| 首屏任务 | 当前安全可采目标与结果 | 观察任务与我的选择 | 需要补充的观察与证据缺口 |
| 默认空间关注 | 作业目标、果串、收集箱 | 当前学习部位、学生主动选择 | LEAF_01、遮挡叶、病斑承载叶 |
| 过程摘要 | 选择→授权→执行→验证→已提交 | 认识→观察→选果→评价→确认→体验；仅标真实状态 | 观察不足→授权拨叶→已暴露→再次观察→待核实 |
| 默认详情 | 可采依据、暂缓原因、已验证数量 | 简单概念；精确分数/规则可在提示或评价后揭示，不提前代答 | 来源、版本、遮挡关系、原始参数/结果与历史 |
| 确认范围 | 明确目标列表和版本 | 先通过现有 evaluate_student_answer，保持用户本人选择 | 明确“拨动哪片叶”“补充哪个区域”，不称诊断 |
| World Diff | 已提交采摘、收集箱变化、保留目标 | 我完成了什么；共享世界已有采摘需说明 | 观察条件改变与仍未核实事项；不制造诊断字段 |
| 资料入口 | 管理报告、历史环境 | 植物部位知识、研学进度 | 事实/历史/辅助判断/待核实四块证据 |

角色只改变呈现和任务入口，不复制 World，不在前端授予新 Skill 权限。执行中沿用当前禁止切角色/重置的保护。学生新挑战若需重置必须显式说明影响共享世界，不能悄悄恢复已采果实。

共享世界在此指同一个 Session 的三个角色；当前不是多账号同时操控同一物理温室的协作平台，不设计未实现的在线成员/协同机器人状态。

## 七、组件拆分与状态管理方案

### 7.1 拟拆分组件（均为未来实现）

| 拟组件/模块 | 复用来源 | 责任 |
| --- | --- | --- |
| WorkbenchShell / MissionBar / ContextRail | App、roles、已有 Mission API | 固定工作区布局、任务目标/状态、角色入口，不接管 Agent 决策 |
| SpatialViewport | ScenePanel + 原 Greenhouse | 常驻 Canvas、原视角/动作条、可访问对象入口 |
| ObjectInspector | ScenePanel selection-card + Insights | 展示用户选中对象的业务事实与来源 |
| SpatialAttentionLayer / resolveSceneAnchor | useSceneRegistry / 已有稳定 ID | 独立 DOM 定位与注意关系；不改变 Actor 或对象变换 |
| ConversationPane / Composer | AgentPanel 对话/输入 | 公开对话与追问；不复制全部工具记录 |
| ApprovalDock / StudentAnswerDock | ConfirmationCard / learning-callout | 唯一当前确认、学生提交，继续原 store.send 参数与保护 |
| MissionTrajectory / RunSection / StepRow | ExecutionTimeline | 跨 Run 过程，保留原始事件，支持跟随/查看历史 |
| ToolEvidence / ObservationEvidence | ToolRow / 原 JSON 详情 | 同一调用的唯一详情入口，结构化摘要优先 |
| WorldDiffPanel / EvidenceDrawer | Insights + state/verifications | 只读前后状态、报告、趋势和专家证据 |
| RoleExperienceConfig | src/agent/roles.ts + Insights 三分支 | 默认面板、字段揭示与任务文案；不代替后端权限 |

拟目录：`src/workbench/events.ts`、`trajectory.ts`、`worldDiff.ts`、`attention.ts`、`selectors.ts` 负责纯投影/适配；组件放 `src/components/workbench/`。本轮不创建这些生产模块，不将拟目录冒充现有实现。

### 7.2 状态分层

保持现有 Zustand 作为状态中心和**唯一事件/动作传输器**，先分逻辑 slice/selector，不引入第二套框架或动画控制器。

| 状态层 | 内容 | 约束 |
| --- | --- | --- |
| Domain | 当前 world、sessionId、server revision | 只从后端 state/快照更新，角色共享 |
| Transport / Motion | 原 busy、connected、action、actionProgress、startedAt、ack 队列、worldRevision | 沿用现有路径，不由历史视图覆盖 |
| Record | 全量 RawEvent envelope、Mission 索引、runToMission、事件顺序、快照与证据引用 | 不保存密钥或隐藏推理；与当前展示 tab 无关 |
| Derived | Trajectory 节点、有效确认、Diff、对象关系与角色统计 | 从事实派生，不在多个组件各写一份判断 |
| Presentation | viewedMissionId、viewedEventKey、followLive、用户检查 ID、Agent 关注、面板尺寸/开关、查看的快照 | 只影响显示；不序列化 Three.Object3D，不改变世界或权限 |

拟客户端引用模型：

```ts
// 设计类型，不是新增 NDJSON 字段或本轮实现。
type EventRef = {
  sessionId: string; runId?: string; seq?: number; cursor?: number;
  origin: 'server' | 'client' | 'transport'; uiKey: string;
};
type TrajectoryNode = {
  key: string; missionId: string; runId?: string;
  kind: 'observation' | 'decision' | 'tool' | 'approval' | 'action' | 'verification' | 'change';
  objectIds: string[]; eventRefs: EventRef[];
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'uncertain' | 'incomplete';
};
type WorldDiffView = {
  beforeRef?: EventRef; afterRef?: EventRef; verificationRefs: EventRef[];
  actionUuid?: string; targetId?: string;
  evidenceState: 'pending' | 'verified_committed' | 'state_only' | 'missing_baseline' | 'incomplete';
};
```

新的 onAgentEvent 入口在执行原处理时附加记录/投影，不让查看历史的 reducer 再走执行 action 的分支。快照深拷贝，按完整标识建立索引；当前动作与其验证/baseline 在缓存回收中不可被静默丢弃。后台历史按现有 cursor API 懒加载；不要每个动画帧请求观察或写日志。

### 7.3 恢复和来源优先级

- 初始读取 /missions、/events、World 继续沿用现有接口；不新增 NDJSON 消息类型或修改字段。
- 模式标签优先用各 Run 的 run_started.source / decision.source；当前全局 REAL_AGENT 或最新 Mission.mode 不能反推旧 Run 也用了模型。
- 历史回放与实时收到同事件按服务端引用去重；source=client 的提示独立保留。
- 角色切换仅切 RoleExperienceConfig 和可见历史，不重新连接/初始化世界、不重挂 Canvas。
- 待确认和学生答题是任务状态，不等于 busy HTTP 连接仍在；不能用单一 busy 决定所有交互状态。
- UI 可以展示恢复入口，仍调用原 send(..., mission_id) 并重新确认，不自动提交待定操作。

## 八、分阶段开发计划与验收标准

以下为后续实施顺序，不是本轮已完成的开发或测试。

| 阶段 | 产出与主要范围 | 可验收标准 |
| --- | --- | --- |
| 0：事件语义与回放基线 | 纯前端 RawEvent 解析、身份/顺序、快照和投影定义；使用现有 DeepSeek/多果样本 | 同 Mission 两个 Run 连续呈现；事件重复/seq 重置/客户端 seq 冲突无重复调用；progress task_verified 不产生已提交 Diff；缺 state 的 82 条样本明确不完整；无模型/动作网络请求 |
| 1：空间工作区骨架 | App/styling、独立对话和 TrajectoryDock、Insights 分流；保留原场景与业务组件 | 1330×897、1440×900、1920×1080 和 390×844 检查；常规宽屏默认收起索引时 Canvas 约≥40%视口；对话和过程独立滚动；折叠/角色切换/移动 tab 不增加 Canvas/对象实例或改变 UUID |
| 2：统一 Trajectory 与授权 | Mission 目录、跨 Run 节点、唯一工具详情、ApprovalDock、真实任务状态 | 不再三处重复显示全部日志；等待卡不因切 tab 消失；查询完成不写“作业已验证”；新任务取消旧 pending 后旧卡只读；使用原 confirmation_id/version，旧卡服务端拒绝仍有效 |
| 3：Spatial Attention | 只读锚点解析、用户/Agent/历史分离、遮挡关系、镜头跟随开关 | T01/T06/LEAF_01/叶6/叶7/果串定位正确；病斑/遮挡叶不混同；未知锚点显示 unavailable；关注标记不进入验证射线、不改任何对象 transform；用户看其他对象时动作仍同步 |
| 4：World Diff 与结果证据 | 快照索引、逐操作提交关联、差异面板、断流核对 | 原样本执行 Run seq26 无成功；seq27 等快照；seq28 才显示 T01 与箱数变化；三果分别验证；错 UUID/坏位置/超时无成功差异；已提交首果在后续失败时保留；缺 baseline 和 reset 分段不编造 |
| 5：三角色与可用性收尾 | RoleExperienceConfig、学生揭示策略、专家证据分类、上下文资料和适配 | 同世界切角色结果一致且权限不变；学生选择不被 Agent 覆盖、不跳过原评价；专家“暴露”不等于“确诊”；原农户报告/学生挑战/专家拨叶/环境/重置/窄屏流程通过 |

每阶段先验证其投影或 UI 变化，再运行相应既有回归。合入最终工作台前执行：

```bash
npm run build
LLM_PROVIDER=demo .venv/bin/python -m pytest -q tests/test_agent.py tests/test_missions.py tests/test_providers.py
npm run test
```

预置浏览器测试须连接 DEMO 服务，不能复用已有真实模型进程而产生意外付费或固定流程断言误判。模型在线验证单独明确范围；本轮设计不要求重新调用 DeepSeek。

### 关键硬性不变量

1. Provider、19 项 Skill、角色权限和 Mission/NDJSON 格式保持。
2. action UUID、startedAt、原 SceneMotion 时钟、原 Tomato Group、stage/ack、失败回滚不被 UI 投影改变。
3. UI 历史读取/对象定位不发送机器人操作，不自动确认、提交或重置。
4. 后端提交和验证证据缺失时不显示已验证操作成果。
5. 所有感知仍按实际 simulation 来源标识，无新增真实传感器/识别结果或隐藏思维链展示。

## 九、本轮交付与待确认范围

本轮只新增设计文档/线框及交接入口，生产源码与数据不改；按既有约定更新 agent.md 并同步 GitHub。线框的点击只切换设计视图，不与现有工作台连通。

实际交付检查：128 个本地文档链接/源码行号锚点存在且未越界；独立 HTML 的 ID 唯一、脚本语法检查通过、无外部依赖，CSP 禁止连接后端；浏览器检查了角色切换、验证中不生成成功差异、已提交 T01 的 v0→v1、用户检查 T03 而 Agent 仍关注 T01，以及窄屏打开对话时学生提交入口仍可见。三张角色/适配线框均已作图像检查。以上只验证设计资产，不是工作台功能验收；本轮没有重跑构建、后端或 E2E 业务测试。

尚需下一阶段实现后才能确认：新的真实视口构图、屏幕阅读器/触屏体验、长 Mission 性能、断流/分页投影行为、未知锚点的覆盖率、注意层与现有验证射线的完整兼容、三角色真实模型长任务体验。当前没有用户可用性实验或新性能测量，不声称这些项目已通过。
