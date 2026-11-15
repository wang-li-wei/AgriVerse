# 协作开发

本项目包含前端、后端、模拟数据、测试、架构文档和演示证据。请先阅读 [README](README.md) 和 [Agent 架构说明](docs/AGENT_ARCHITECTURE.md)。

## 获取并运行项目

```bash
git clone https://github.com/wang-li-wei/AgriVerse.git
cd AgriVerse
./scripts/start.sh
```

需要 Node.js 22+ 和 Python 3.11+。启动脚本会在缺少依赖时安装到项目本地；`.tools` 和 `.venv` 不随仓库上传。默认无需密钥，运行明确标记的模拟规则模式。模型配置参照 `.env.example`，真实密钥只放本地 `.env`。

## 多账号协作方式

- 有仓库写权限：从默认分支创建任务分支，推送分支并创建 Pull Request。
- 没有写权限：先 Fork 到自己的账号，再从 Fork 的任务分支向本仓库提交 Pull Request。
- 仓库拥有者可在 GitHub 的 Settings → Collaborators 中邀请需要直接推送的账号。公开访问本身不会授予推送权限。

尽量保持一个分支只处理一个任务。提交前同步默认分支；避免直接向默认分支推送未验证的改动，不使用强制推送覆盖其他人的提交。

```bash
git switch master
git pull --ff-only
git switch -c codex/your-task
# 完成修改与验证后：
git add <本次修改的文件>
git commit -m "Describe the change"
git push -u origin codex/your-task
```

Fork 协作时，`origin` 指向自己的 Fork，并将本仓库设为 `upstream`；同步基线时从 `upstream/master` 获取最新提交。

## 提交前验证

```bash
npm run build
.venv/bin/python -m pytest -q tests/test_agent.py tests/test_missions.py
# 首次运行浏览器测试需准备本地 Chromium：
npx playwright install chromium --only-shell
npm run test
```

Pull Request 请说明改动目的、影响范围、实际测试结果，以及未验证的部分。模型 Mock 测试和模拟动画成功不能描述成真实模型或真实机器人验收。

## 需要保留的约定

- 三角色、19 项 Skill 注册及权限、NDJSON、动作 UUID、startedAt、ack 和结果验证保持兼容。
- 业务采摘状态只能由验证后的内部提交产生；模型不能直接修改。
- 未经任务明确要求，不改动既有植株模型、稳定对象 ID 或原果实 Group 连续移动机制。
- 不提交 `.env`、凭证、会话数据库、依赖目录、构建缓存和临时测试输出。
- 不同开发者使用各自的本地环境与数据库；共享代码和预置模拟数据，不共享个人会话状态。

架构迁移及验证记录见 [AGENT_MIGRATION](docs/AGENT_MIGRATION.md)。
