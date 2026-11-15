import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Info,
  RotateCcw,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useStore } from "../store";

export function Settings({
  close,
  tab,
}: {
  close: () => void;
  tab: "settings" | "guide";
}) {
  const mode = useStore((s) => s.mode),
    busy = useStore((s) => s.busy);
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tab === "guide" ? "体验指南" : "演示设置"}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close icon-button"
          aria-label="关闭弹窗"
          onClick={close}
        >
          <X size={19} />
        </button>
        <div className="eyebrow">WELCOME TO AGRIVERSE</div>
        <h2>
          {tab === "guide" ? "一个温室，三种视角。" : "让每一步，都清晰可见。"}
        </h2>
        <p className="modal-description">
          茄境智农 · 面向设施农业的多角色三维智能体
        </p>
        {tab === "guide" ? (
          <div className="guide-list">
            {[
              {
                name: "农户 · 从巡检到收获",
                text: "点击推荐任务 → 查看 3 颗成熟果实的计划 → 确认模拟采摘 → 观察果实入箱并查看报告。",
              },
              {
                name: "研学学生 · 在观察中学习",
                text: "切换研学角色 → 开始挑战 → 观察各部位高亮 → 选择 T02 可体验答错反馈，选择 T01/T03/T05 → 提交 → 确认采摘。",
              },
              {
                name: "农业专家 · 让观察更充分",
                text: "切换专家角色 → 观察 P01 模拟异常 → 确认拨叶 → 观察近景变化 → 查看环境、巡检与辅助会诊摘要。",
              },
            ].map((g, i) => (
              <article key={g.name}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{g.name}</h3>
                  <p>{g.text}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <>
            <div className="settings-row">
              <span>
                <Settings2 size={16} />
                Agent 运行模式
              </span>
              <b>{mode === "DEMO" ? "本地演示模式" : "模型连接模式"}</b>
            </div>
            <p className="data-note">
              {mode === "DEMO"
                ? "本地预设任务编排，真实执行后端 Skill 函数；不代表大模型自主推理。"
                : "由后端模型选择工具；确认后恢复同一任务，依据最新观察继续决策，执行结果通过验证后才提交。"}
            </p>
            <div className="settings-row">
              <span>
                <ShieldCheck size={16} />
                数据来源
              </span>
              <b>JSON 预置演示数据</b>
            </div>
            <p className="data-note">
              机械臂采用 Three.js
              关键帧动画，无真实机器人连接。病斑仅为模拟异常，不作病害诊断。
            </p>
            <div className="settings-row">
              <span>
                <CheckCircle2 size={16} />
                共享场景
              </span>
              <b>三种角色共用当前状态</b>
            </div>
            <p className="data-note">
              配置真实模型：复制根目录 .env.example 为
              .env，填写后端服务商、地址、模型和密钥，再重启后端。密钥不会发送到前端。
            </p>
            <button
              className="reset-demo"
              disabled={busy}
              onClick={() => {
                void useStore.getState().reset();
                close();
              }}
            >
              <RotateCcw size={15} />
              重置整个演示<span>恢复六颗果实，清空对话与报告</span>
            </button>
          </>
        )}
        <div className="settings-footer">
          <Info size={13} />
          所有环境数据为预置记录 · 仅用于产品概念验证
        </div>
        <a
          className="docs-link"
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen size={13} />
          浏览后端 API 文档
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
