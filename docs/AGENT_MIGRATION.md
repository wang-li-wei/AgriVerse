# Agent-First 第一阶段迁移说明

## 兼容项

技术栈、19 个 Skill 名称、三角色、NDJSON 旧类型、确认卡、run_id/action UUID、startedAt、阶段、原果实连续移动、失败回滚和植株结构保持。新增模块接入原调用链，无额外依赖，没有 Git reset/clean/提交操作。

## 有意变更

| 旧行为 | 新行为 |
| --- | --- |
| 确认后 continue_confirmed 固定循环 | 恢复 Mission，再次进入同一 Provider 决策循环 |
| 循环开始时建立一次上下文 | 每轮重新生成 World/Observation/Mission 上下文 |
| 暴露 update_fruit_status 给模型 | 19 项注册保留，模型 Schema 隐藏，直接分发拒绝，只能验证器内部提交 |
| success=true 无证据可提交 | 旧 ack 结构仍可接收，但无证据为不确定，禁止业务提交 |
| 任意工具失败永久导致 Run 失败 | 最终任务状态与工具错误分离，可在有限恢复后成功 |
| World.snapshot 返回列表引用 | 深拷贝、版本号、观察来源标记 |
| 内存 Session/事件 | SQLite 检查点、任务与公开事件查询；运行中重启转不确定 |
| 专家采摘后调用农户专用报告 | 仅农户模拟策略调用该报告，真实模式按角色 Schema 选择 |

## 开发与测试

不需要新增依赖。仓库已附带 Node 时使用：

```bash
export PATH="$PWD/.tools/bin:$PATH"
npm run build
.venv/bin/python -m pytest -q tests/test_agent.py
.venv/bin/python -m pytest -q tests/test_missions.py
npm run test
```

真实模型配置沿用 `.env.example`；不会在模型请求失败后自动转入规则演示。没有配置时会明确展示模拟规则模式。真实 Provider 的 Responses / Chat Completions 协议分别有本地 MockTransport 测试，Fake/Test Provider 仅在测试中使用，不是线上模型服务验证。

原后端成功动作测试补充模拟证据，避免继续依赖裸 true 回执；事件选择测试兼容新增的全场观察/工具选择事件，同时保留原状态、顺序和失败断言。

## 存储与重启

默认 `.runtime/agent.sqlite3`，可用 AGRIVERSE_MEMORY_PATH 改路径。请备份 SQLite 后再做人工清理；没有自动删库或数据迁移。当前新增建表均为 IF NOT EXISTS；此前项目没有数据库。

单进程使用原会话锁。服务重启后按 Session ID 恢复世界与任务；浏览器 sessionStorage 仍负责持有这个 ID。浏览器丢失 ID 时不会自动找到旧会话；没有账号绑定或多设备登录。空闲会话从进程缓存清理后仍可从 SQLite 加载；事件目前没有自动留存期限。

## 未包含的能力

没有训练或连接 YOLO、RGB-D、AlohaMini、ROS、LeRobot、ACT、SmolVLA；没有真实碰撞/可达求解。没有向量记忆、经验学习、长任务后台调度或多实例一致性。计划支持目标范围/前后置条件/版本和步骤结果，不是通用任务图搜索器。默认 simulation_policy 仍是有限意图规则，不声称具备真实模型自主性。

第一阶段重点是可验证的模型工具闭环；真实服务商在线表现与硬件安全需在后续配置与适配后单独验收。


## 本轮文件清单

| 文件 | 实际改动 |
| --- | --- |
| backend/agent.py | 替换固定确认循环，加入 Mission 恢复、最新上下文、工具返回/再决策、预算、幂等和独立完成检查 |
| backend/models.py | Mission/Plan 类型、独立 World 快照与 revision、Session 检查点字段 |
| backend/skills.py | 19 项标准元数据、内部提交保护、观察适配、安全/验证接入、超时和错误类型 |
| backend/main.py | SQLite 恢复、任务/事件/观察 API、独立 ack 核验、取消后锁释放修复 |
| backend/execution.py | mission/step/action/revision 关联，事件持久化，恢复后的任务终态 |
| backend/missions.py（新增） | 版本化计划、确认、安全检查及步骤结果 |
| backend/observations.py（新增） | 感知协议、模拟实体图、统一资格判断、观察管理 |
| backend/verification.py（新增） | 三态验证、结构化失败与旧场景 Robot Adapter |
| backend/memory.py（新增） | SQLite 事件、四类记忆记录、检查点恢复 |
| backend/simulation.py（新增） | 明示离线规则策略，与真实 Provider 路径区分 |
| src/store.ts | 恢复公开任务历史、同 Mission 恢复请求、保留原动画时钟/ack |
| src/types.ts | 确认、世界、执行事件新增关联字段 |
| src/components/ExecutionTimeline.tsx | Mission/版本/决策来源、折叠时间线、输入/结果/依据、失败后恢复按钮 |
| src/styles.css | 紧凑展开记录和恢复按钮样式 |
| tests/test_agent.py | 成功动作补充模拟验证证据；保留原有业务断言并兼容新增观察事件 |
| tests/test_missions.py（新增） | 动态模型闭环、授权、错误恢复、证据、预算、版本、幂等、重启、协议测试 |
| tests/e2e/execution.spec.ts | 短暂阶段改为真实阶段请求监听/更密集采样，不更改动作时长或放宽业务断言 |
| tests/e2e/missions.spec.ts（新增） | 刷新恢复、断流取消、锁释放、同任务新计划再次确认 |
| .gitignore | 忽略运行时 SQLite 目录 |
| README.md | 纠正旧固定循环/无持久化说明，补充新入口和能力边界 |
| docs/AGENT_ARCHITECTURE.md（新增） | 实际模块、数据、权限、安全与未实现项 |
| docs/AGENT_EXECUTION_FLOW.md（新增） | 实际执行、事件、确认与验证流程 |
| docs/AGENT_MIGRATION.md（新增） | 兼容性、文件清单和验证记录 |

World.world_revision 是业务数据版本；Zustand 原 worldRevision 仍仅用于场景重置，没有把业务版本绑定为每次重新创建三维对象的 key。SceneMotion、Robot、Plants、Greenhouse 和 plant_structure.json 的校验和与改造前一致。


## 本轮实际验证结果

使用仓库已有 `.tools/bin` 加入 PATH，没有安装依赖。

| 命令 | 实际结果 |
| --- | --- |
| `npm run build` | 成功，最终前端构建 3.82 秒 |
| `.venv/bin/python -m pytest -q tests/test_agent.py tests/test_missions.py` | 38 passed，3.74 秒；含原有 15 项和新增 23 项 |
| `npm run test` | 10 passed，6.3 分钟；包括原有 9 项和新增断流恢复 1 项 |
| `npm run test -- tests/e2e/execution.spec.ts -g '多果独立执行'` | 完成态记录默认折叠后复测，1 passed，45.0 秒 |

完整浏览器回归完成后仅调整完成态折叠和决策事件目标事实字段：前者通过多果浏览器复测，后者通过后端 38 项复测。没有声称针对最终微调再次跑完整 10 项。

测试过程中真实发现并修复 ASGI 断流后的会话锁泄漏；新增恢复测试验证了取消、查询、同 Mission 恢复和新版本再次确认。hold 阶段只有 640ms，旧每秒轮询可能漏检，已改为监听真实 SceneMotion 阶段请求。没有延长动画或放宽叶片/果实结果断言。

有一条现有 Starlette/httpx 测试客户端弃用提示，不影响结果；未为消除提示安装新依赖。

### 保存的浏览器证据

- [多果完整执行录屏](evidence/agent-first/multi-harvest.webm)
- [三果入箱、业务已提交与折叠时间线截图](evidence/agent-first/multi-completed.png)
- [本次逐条执行事件](evidence/agent-first/multi-events.json)
- [验证范围、运行 ID 与源码校验和](evidence/agent-first/validation.json)

这些录制使用模拟规则策略，不是大模型联网决策的录像。真实模型未配置；动态选择/重规划/确认后继续模型循环由测试 Provider 验证，Responses/Chat Completions 协议由本地 MockTransport 验证。没有连接 YOLO、相机或真实机器人。
