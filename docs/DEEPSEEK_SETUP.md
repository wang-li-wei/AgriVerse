# DeepSeek 模型接入

## 当前连接

服务商模式为 `deepseek`，使用官方 `https://api.deepseek.com/chat/completions`；本次账号模型列表返回 `deepseek-flash` 和 `deepseek-v4-pro`，配置选择 `deepseek-flash`。

密钥只存在开发机本地 `.env`，权限 0600，已被 Git 忽略。公开仓库的 `.env.example` 只有无密钥配置示例。其他账号需自行获取凭证，不共享本地会话数据库。

## 配置和启动

复制 `.env.example` 为本地 `.env`，填写：

```dotenv
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
LLM_API_KEY=在本地填写自己的凭证
```

执行 `./scripts/start.sh`，或单独启动后端：

```bash
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

配置在后端启动时读取；修改后需重启后端。新建会话会获取当前模式，刷新页面可更新前端模式显示。`GET /api/health` 的 mode/provider/model 是配置状态，不是模型服务探活结果。

## 接口适配

- `backend/providers.py` 新增 deepseek 模式，仍使用项目现有 httpx，不安装 SDK。
- 默认地址/模型可被本地配置覆盖；空密钥不能启用真实模式。
- 默认 `thinking=disabled`，每次输出上限 2048 tokens。只读取公开回复和工具调用；隐藏推理不进入前端或新模型历史。
- 稳定接口不发送 beta-only 的 `strict` 标志。工具 Schema 及服务端 Pydantic 参数、角色、任务授权和验证检查继续执行。
- 返回 `tool_calls=null` 作为正常最终回复处理；输出截断不能当作已完成任务。
- 既有 DEMO / Responses 工具历史在 Chat 请求边界转换，保留调用 ID、工具参数与返回值，不修改原记录。反向切换回 Responses 尚未实现同等转换，建议新建会话。
- 不在远程请求失败时回退 DEMO；错误继续通过现有 Run/Skill 机制报告。
- 统计工具增加 basket_count，保留原 collected 字段，含义都是收集箱内已提交数量。

官方依据：[基础调用](https://api-docs.deepseek.com/)、[Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)、[Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)。模型名称/可用性可能变化，以实际账号的模型列表和服务商文档为准。

## 验证与费用边界

手动检查：

```bash
.venv/bin/python scripts/check_model.py
```

此脚本发送最多两次真实模型请求，执行一次只读 query_crop_status。使用独立的模拟 World，不读取或修改浏览器当前 Session，不采摘、不拨叶；只输出模型名称、成功状态、统计和公开回复，错误不打印响应体或密钥。

日常后端回归使用 Mock Provider / MockTransport；Playwright 启动的后端显式设为 DEMO，不使用本地真实密钥。若 8000 端口已有真实模型服务，先停止该服务再运行原预置浏览器测试，避免复用模式不符的服务器。

## 本轮验证记录

- 2026-11-15：实际模型列表认证成功。
- 已完成真实模型选择 query_crop_status → 后端 Skill 执行 → 工具结果返回 DeepSeek → 模型生成最终回答的两轮调用。
- 实际浏览器连接生产页面，通过 FastAPI / NDJSON 完成 T01 计划 → 人工确认 → 模型选择 play_robot_action → 真实场景八阶段 → 原果实 Group 回执 → 后端提交 → 模型结束任务。
- 同一个 Mission 跨两个 Run，最终 status=success、T01=harvested、收集箱=1；原对象 UUID 及场景验证通过。其他果实未被采摘。
- 实际模型选择的工具为 inspect_greenhouse、identify_tomatoes、get_harvest_plan、play_robot_action；确认后未切回固定列表执行器。
- `npm run build` 成功；后端原有及新增测试合计 46 passed；三角色/报告/环境/窄屏 DEMO 浏览器回归 1 passed（1.4 分钟）。没有把该 DEMO 回归描述成三角色全部完成真实模型验收。

农业感知与机器人仍是仿真。接入真实语言模型不会自动启用相机、YOLO 或硬件控制；病斑仍是模拟观察，不提供真实诊断结论。


### 保存的真实模型证据

- [DeepSeek 单果全过程录屏](evidence/deepseek/live-single-harvest.webm)
- [等待确认的真实模型计划](evidence/deepseek/confirmed-plan.png)
- [采摘完成与入箱截图](evidence/deepseek/harvest-completed.png)
- [公开事件样本](evidence/deepseek/events.json)
- [验证摘要](evidence/deepseek/validation.json)

录屏中的语言模型是真实 DeepSeek，农业状态与机械臂执行仍是 Three.js 仿真。证据不含密钥、请求认证头或隐藏推理；会话 ID 和对象 UUID 仅为本地仿真实测标识。
