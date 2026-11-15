import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  Code2,
  GraduationCap,
  Leaf,
  LoaderCircle,
  MessageSquare,
  Microscope,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../store";
import { roles } from "../agent/roles";
import type { ToolLog } from "../types";
import { ExecutionTimeline } from "./ExecutionTimeline";
import { BrandMark } from "./Icons";

const avatars = { farmer: Leaf, student: GraduationCap, expert: Microscope };
function ToolRow({ log }: { log: ToolLog }) {
  return (
    <details className={`tool-row ${log.status}`}>
      <summary>
        <span className="tool-icon">
          {log.status === "success" ? (
            <Check size={13} />
          ) : log.status === "failed" ? (
            <XCircle size={13} />
          ) : (
            <LoaderCircle size={13} className="spin" />
          )}
        </span>
        <span className="tool-label">{log.label.split("，")[0]}</span>
        <ChevronRight size={12} />
      </summary>
      <div className="tool-detail">
        {log.started_at && (
          <span>
            开始{" "}
            {new Date(log.started_at).toLocaleTimeString("zh-CN", {
              hour12: false,
            })}
            {log.finished_at
              ? ` · 结束 ${new Date(log.finished_at).toLocaleTimeString("zh-CN", { hour12: false })}`
              : ""}
          </span>
        )}
        <code>{log.name}</code>
        <span>
          {
            {
              queued: "等待执行",
              running: "执行中",
              success: "执行成功",
              failed: "执行失败",
            }[log.status]
          }
        </span>
        <pre>
          {JSON.stringify({ 参数: log.args, 结果: log.result }, null, 2)}
        </pre>
      </div>
    </details>
  );
}
function ConfirmationCard() {
  const confirmation = useStore((s) => s.confirmation),
    role = useStore((s) => s.role),
    busy = useStore((s) => s.busy),
    ready = useStore((s) => s.sceneReady),
    world = useStore((s) => s.world);
  if (!confirmation || confirmation.role !== role) return null;
  const harvest = confirmation.kind === "harvest";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="confirmation-card"
      data-testid="confirmation-card"
    >
      <div className="confirmation-eyebrow">
        <ShieldCheck size={13} />
        等待你的确认
      </div>
      <h3>{harvest ? "本次模拟采摘计划" : "辅助观察 · 拨叶计划"}</h3>
      {harvest ? (
        <>
          <div className="target-tags">
            {confirmation.targets.map((t) => (
              <span key={t}>
                <i />
                {t}
                <small>红熟</small>
              </span>
            ))}
          </div>
          <p>
            {confirmation.targets.length} 颗符合条件 · 已排除未成熟与遮挡果实
          </p>
        </>
      ) : (
        <p>拨开 LEAF_01 前方遮挡叶片，切换近景，补充观察预置模拟异常。</p>
      )}
      <button
        className="primary full"
        disabled={busy || !ready}
        onClick={() =>
          void useStore
            .getState()
            .send(
              harvest ? "确认计划，开始模拟采摘" : "确认拨叶，补充观察",
              confirmation.id,
            )
        }
      >
        {harvest ? "确认并模拟采摘" : "确认拨叶并查看"}
        <ArrowUpRight size={16} />
      </button>
      {harvest && role === "student" && world?.learning === "ready" && (
        <small>选择正确！接下来观察机械臂如何完成采摘。</small>
      )}
    </motion.div>
  );
}
export function AgentPanel() {
  const role = useStore((s) => s.role),
    messages = useStore((s) => s.messages[s.role]),
    logs = useStore((s) => s.logs[s.role]),
    busy = useStore((s) => s.busy),
    world = useStore((s) => s.world),
    selected = useStore((s) => s.selected),
    connected = useStore((s) => s.connected),
    confirmation = useStore((s) => s.confirmation);
  const [input, setInput] = useState(""),
    [tab, setTab] = useState<"chat" | "tools">("chat");
  const bottom = useRef<HTMLDivElement>(null),
    config = roles[role],
    Avatar = avatars[role];
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, logs.length, confirmation, world?.learning]);
  useEffect(() => {
    setTab("chat");
    setInput("");
  }, [role]);
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    void useStore.getState().send(text);
  };
  const canSubmit =
    role === "student" &&
    world?.learning === "select" &&
    selected?.startsWith("T");
  return (
    <aside className="agent-panel">
      <div className="agent-heading">
        <div className={`agent-avatar ${role}`}>
          <Avatar size={21} strokeWidth={1.6} />
          <span />
        </div>
        <div>
          <h2>
            {config.name}
            <span className="beta">AGENT</span>
          </h2>
          <p>{config.subtitle}</p>
        </div>
        <Sparkles className="agent-sparkle" size={17} strokeWidth={1.5} />
      </div>
      <div className="agent-tabs">
        <button
          className={tab === "chat" ? "active" : ""}
          onClick={() => setTab("chat")}
        >
          <MessageSquare size={14} />
          对话助手
        </button>
        <button
          className={tab === "tools" ? "active" : ""}
          onClick={() => setTab("tools")}
        >
          <Terminal size={14} />
          技能记录
          {logs.length > 0 && <span className="tab-count">{logs.length}</span>}
        </button>
        <span className="shared-brain">统一智能体</span>
      </div>
      <ExecutionTimeline />
      <div className="conversation" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div
            key={role + tab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "chat" ? (
              <>
                <div className="agent-message welcome">
                  <div className="message-sender">
                    <BrandMark small />
                    <span>AgriVerse</span>
                    <small>你的{config.name}</small>
                  </div>
                  <p>{config.greeting}</p>
                </div>
                {messages.length === 0 && (
                  <button
                    className="start-task"
                    onClick={() => send(config.prompt)}
                    disabled={busy || !connected}
                  >
                    <span className="task-eyebrow">
                      {role === "farmer"
                        ? "今日推荐任务"
                        : role === "student"
                          ? "今天的探索任务"
                          : "待补充观察"}
                    </span>
                    <strong>
                      {role === "farmer"
                        ? "一起看看，哪些番茄成熟了？"
                        : role === "student"
                          ? "认识番茄，体验智能采摘"
                          : "为 P01 补充一次近景观察"}
                    </strong>
                    <span className="task-description">
                      {role === "farmer"
                        ? "巡检温室，生成你的第一份采摘计划"
                        : role === "student"
                          ? "观察 · 思考 · 选择 · 亲手实践"
                          : "定位模拟异常，查看环境与巡检记录"}
                      <ArrowUpRight size={18} />
                    </span>
                    <div className="task-bottom">
                      <span>
                        <i />
                        真实执行本地技能
                      </span>
                      <span>
                        开始任务 <ChevronRight size={12} />
                      </span>
                    </div>
                  </button>
                )}
                {messages.map((message) => (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={message.id}
                    className={`agent-message ${message.role}`}
                  >
                    {message.role === "assistant" && (
                      <div className="message-sender">
                        <BrandMark small />
                        <span>AgriVerse</span>
                      </div>
                    )}
                    <p>{message.text}</p>
                  </motion.div>
                ))}
                {logs.length > 0 && (
                  <div className="execution-block">
                    <div className="execution-header">
                      <span>
                        {busy ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : (
                          <Check size={13} />
                        )}{" "}
                        {busy
                          ? "技能正在执行"
                          : logs.some((l) => l.status === "failed")
                            ? "存在失败的技能"
                            : "技能记录"}
                      </span>
                      <button onClick={() => setTab("tools")}>
                        {logs.filter((l) => l.status === "success").length} /{" "}
                        {logs.length}
                        <Code2 size={12} />
                      </button>
                    </div>
                    {logs.map((log) => (
                      <ToolRow log={log} key={log.id} />
                    ))}
                  </div>
                )}
                <ConfirmationCard />
                {role === "student" && world?.learning === "select" && (
                  <div className="learning-callout">
                    <GraduationCap size={18} />
                    <strong>轮到你来选择了</strong>
                    <p>点击场景中的果实或下方果实列表，然后提交答案。</p>
                    <button
                      className="primary full"
                      disabled={!canSubmit || busy}
                      onClick={() =>
                        void useStore
                          .getState()
                          .send(
                            `我选择 ${selected}，它适合采摘吗？`,
                            undefined,
                            selected ?? undefined,
                          )
                      }
                    >
                      {canSubmit
                        ? `提交答案 · ${selected}`
                        : "请先选择一颗果实"}
                      <Send size={14} />
                    </button>
                  </div>
                )}
                {busy && (
                  <div className="thinking">
                    <span />
                    <span />
                    <span />
                    <small>
                      {useStore.getState().action
                        ? "正在等待场景动作完成"
                        : "正在处理你的任务"}
                    </small>
                  </div>
                )}
              </>
            ) : (
              <div className="tools-view">
                <div className="tools-view-title">
                  <Terminal size={18} />
                  <h3>每一步，都有迹可循</h3>
                </div>
                <p>
                  记录来自后端实际执行事件。展开一项，查看技能名称、参数与结构化结果。
                </p>
                {logs.length ? (
                  logs.map((log) => <ToolRow key={log.id} log={log} />)
                ) : (
                  <div className="tools-empty">
                    <Leaf size={30} strokeWidth={1} />
                    <p>
                      发起一个任务，
                      <br />
                      在这里看见 Agent 的工作过程。
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <div ref={bottom} />
      </div>
      <div className="composer-area">
        <div className="quick-commands">
          {config.quick.map((q, i) => (
            <button
              key={q}
              disabled={busy || !connected}
              onClick={() => send(i === 0 ? config.prompt : q)}
            >
              {i === 0 && <Sparkles size={11} />} {q}
            </button>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            aria-label="向智能体发送消息"
            rows={2}
            value={input}
            maxLength={4000}
            disabled={!connected}
            placeholder={
              role === "student"
                ? "你想了解番茄的什么？"
                : "说说你想完成的任务…"
            }
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <div className="composer-bottom">
            <span>
              <Sparkles size={12} />
              与场景一起思考
            </span>
            <button
              type="submit"
              className="send-button"
              disabled={busy || !input.trim() || !connected}
              aria-label="发送消息"
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <ArrowUp size={18} />
              )}
            </button>
          </div>
        </form>
        <div className="composer-note">
          <ShieldCheck size={11} />
          农业场景与数据为演示预置，操作仅为模拟
        </div>
      </div>
    </aside>
  );
}
