# Agent 动态执行与事件流

## 请求与确认

1. 用户输入 → Zustand.send → FastAPI chat → run_agent。
2. 创建 Mission；每轮获取最新模拟 Observation 和独立 World Snapshot。
3. 真实模式调用 Provider.turn；离线模式调用明确标记的 SimulationPolicy。
4. 模型选择工具 → SkillRunner 参数/权限/超时检查 → 工具结果加入同角色工具历史。
5. get_harvest_plan / reveal_occluded_area 产生版本化计划和确认卡；循环立即等待用户。
6. confirmation_id 验证后恢复同 Mission，重新读取当前世界，继续 Provider.turn；不再调用固定逐果执行器。

## 单果动作

```text
模型选择 play_robot_action
  → SafetyManager 前置检查
  → SimulationRobotAdapter 发送原 action UUID
  → SceneMotion 依据 startedAt 和真实动画进度运行
  → 前端 stage POST → NDJSON action_stage
  → 原果实 Group 连续跟随与入箱
  → 前端 ack + 几何证据
  → VerificationManager（SUCCESS / FAILED / UNCERTAIN）
  → SafetyManager 再检查版本/目标
  → 内部受控提交 harvested / collected
  → verification + state + tool result
  → 重新观察
  → Provider 根据新状态决定下一工具或重新生成确认计划
```

每个果实仍为 9 秒，拨叶仍为 8 秒；没有添加思考延时或独立 CSS 计时器。前端执行进度仍来自既有 SceneMotion 帧。

## 拨叶

用户确认后由模型选择 reveal 动作；验证遮挡叶移动且区域可见后提交 revealed 和相关遮挡字段。动作结果只意味着模拟区域暴露，不意味着病害识别。后续 inspect_plant_health 的新观察与报告是独立工具结果；T06 不会因此修改成熟度或采摘资格。

## 动态重规划验收

`tests/test_missions.py::test_confirmed_mission_uses_model_and_replans_from_changed_observation` 用明确的测试 Provider：初始 T03 遮挡，先授权 T01/T05；T01 验证后，模拟观察变为 T03 可见/T05 遮挡。Provider 从新上下文选择为 T03 创建新版本计划，等待扩大范围授权；确认后采 T03，不采 T05。此测试证明调度闭环和上下文传递，不证明某个真实模型已通过该任务。

## 公开事件

保留 run_started、observation、decision、tool、tool_call、confirmation、action、action_stage、verification、state、message、run_completed、run_failed；NDJSON 逐条发送。

ExecutionRun 为事件附加 mission_id、run_id、seq、timestamp、event_type、world_revision。action 的 id 同时作为 action_uuid；其阶段/验证事件关联 step_id。decision 记录工具名、实际参数、来源和本轮 observation_id/revision；不输出隐藏思维链。tool_call 记录输入/输出/失败；时间线可展开检查。

run_id 对应一次 HTTP 执行；mission_id 可跨请求与确认；seq 在每个 Run 内严格递增。SQLite cursor 用于跨 Run 分页重放，不能将 seq 当作全会话游标。

## 失败、重试和恢复

- 工具错误以结构化结果进入下一轮模型；可选择替代观察工具或有限重试。
- 连续相同参数失败最多真实执行两次，回合/工具/时间预算限制继续循环。
- 只有 success=true 且结果证据通过，才能提交业务状态。缺少证据为 UNCERTAIN；对象 UUID 不一致、未入箱或跟随误差过大为 FAILED。
- 只有业务验证通过后才有 task_verified。工具正常返回或模型声称完成不等于任务完成。
- 连接断开/动作超时停止待定动作，保留已提交结果；会话锁由执行任务的 finally 释放，避免 ASGI 取消流清理时泄漏锁；重连查询任务和事件，恢复需重新观察和确认，不自动重播不确定动作。
- 当前仿真验证信任本地浏览器提供的几何证据，服务端不能独立测量 Three.js 世界或真实硬件；不构成防恶意客户端的证明。
