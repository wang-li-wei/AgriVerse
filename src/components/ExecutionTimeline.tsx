import { useEffect, useRef } from "react";
import { Check, LoaderCircle, XCircle } from "lucide-react";
import { useStore } from "../store";
import type { ExecutionEvent } from "../types";
const kinds: Record<string, string> = {
  observation: "观察",
  decision: "决策",
  tool_call: "技能",
  action_stage: "动作",
  verification: "验证",
};
export function ExecutionTimeline() {
  const events = useStore((s) => s.execution[s.role]),
    action = useStore((s) => s.action),
    progress = useStore((s) => s.actionProgress),
    world = useStore((s) => s.world);
  const send = useStore((s) => s.send), busy = useStore((s) => s.busy);
  const bottom = useRef<HTMLDivElement>(null);
  const runId = events.at(-1)?.run_id;
  const current = events.filter((e) => e.run_id === runId);
  const last = current.at(-1);
  const rows = new Map<string, ExecutionEvent>();
  for (const e of current) {
    if (!kinds[e.type]) continue;
    const key =
      e.type === "action_stage"
        ? `${e.action_id}:${e.stage}`
        : e.type === "tool_call"
          ? (e.call_id ?? String(e.seq))
          : e.type === "verification"
            ? `${e.target_id}:verification`
            : String(e.seq);
    rows.set(key, e);
  }
  const timeline = [...rows.values()].sort((a, b) => a.seq - b.seq);
  const failed = last?.type === "run_failed";
  const finished = last?.type === "run_completed" && !failed;
  const targetId =
    action?.target_id ??
    [...current].reverse().find((e) => e.target_id)?.target_id;
  const fruit = world?.fruits.find((f) => f.fruit_id === targetId);
  const stage =
    progress?.id === action?.id
      ? progress?.stage
      : [...current].reverse().find((e) => e.type === "action_stage")?.message;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);
  if (!runId) return null;
  return (
    <section
      className={`run-panel ${failed ? "failed" : ""}`}
      aria-label="Agent 执行过程"
      data-testid="execution-timeline"
    >
      <div className="run-heading">
        <b>
          {failed ? (
            <XCircle size={13} />
          ) : finished ? (
            <Check size={13} />
          ) : (
            <LoaderCircle className="spin" size={13} />
          )}
          {failed
            ? "执行未成功"
            : finished
              ? last.result?.awaiting_input
                ? "等待你的操作"
                : "本轮已验证完成"
              : "Agent 正在执行"}
        </b>
        <small>Mission {last?.mission_id?.slice(0, 8) ?? "—"} · Run {runId.slice(0, 8)} · v{last?.world_revision ?? "—"}</small>
      </div>
      <small>{current.some((e) => e.source === "model_tool_call" || e.source === "model") ? "模型工具决策 · 仿真执行" : "模拟规则 Agent · 非大模型决策"}</small>
      <p className="run-task">{current[0]?.message}</p>
      <div className="run-current">
        <strong>
          {targetId ?? "P01"}
          {fruit
            ? ` · ${Math.round(fruit.ripeness_score * 100)}% · ${{ red: "红熟", turning: "转色", green: "绿熟" }[fruit.ripeness_stage]}`
            : ""}
        </strong>
        <span data-testid="current-stage">
          {failed
            ? last?.message
            : action
              ? stage
              : finished
                ? last.message
                : last?.message}
        </span>
      </div>
      {action && (
        <div
          className="run-progress"
          role="progressbar"
          aria-label="场景动画进度"
          aria-valuenow={Math.round((progress?.progress ?? 0) * 100)}
        >
          <i style={{ width: `${(progress?.progress ?? 0) * 100}%` }} />
        </div>
      )}
      <details open={!finished && !failed}>
      <summary>执行记录 · {timeline.length} 条（可折叠）</summary>
      <ol className="run-timeline">
        {timeline.map((raw) => {
          const e =
            failed && (raw.status === "started" || raw.status === "progress")
              ? { ...raw, status: "failed", message: `${raw.message}（中止）` }
              : raw;
          return (
            <li
              key={`${e.type}:${e.action_id ?? e.call_id ?? e.seq}:${e.stage ?? ""}`}
              data-status={e.status}
              data-event-seq={e.seq}
              data-event-type={e.type}
            >
              <time>
                {new Date(e.timestamp).toLocaleTimeString("zh-CN", {
                  hour12: false,
                })}
              </time>
              <span className="run-kind">{kinds[e.type]}</span>
              <span>
                {e.target_id && `${e.target_id} · `}
                {e.message}
                {(e.args || e.result || e.evidence) && (
                  <details className="run-evidence">
                    <summary>参数 / 返回结果 / 依据</summary>
                    <pre>{JSON.stringify({ input: e.args, result: e.result, evidence: e.evidence }, null, 2)}</pre>
                  </details>
                )}
              </span>
              <b>
                {e.status === "completed"
                  ? "✓"
                  : e.status === "failed"
                    ? "×"
                    : "进行中"}
              </b>
            </li>
          );
        })}
        <div ref={bottom} />
      </ol>
      </details>
      {failed && last?.mission_id && !busy && (
        <button className="run-resume" onClick={() => void send("重新观察并恢复任务", undefined, undefined, last.mission_id)}>
          重新观察并恢复任务（操作需重新确认）
        </button>
      )}
      {finished &&
        Array.isArray(last.result?.collected) &&
        last.result.collected.length > 0 && (
          <p className="run-result">
            已采摘 {last.result.collected.join("、")} · 收集箱{" "}
            {String(last.result.basket_count)} 颗<br />
            {(
              last.result.remaining as {
                target_id: string;
                ripeness_stage: string;
                harvestable: boolean;
                occluded: boolean;
              }[]
            )
              .map(
                (f) =>
                  `${f.target_id} ${f.occluded || (!f.harvestable && f.ripeness_stage === "red") ? "暂缓" : "继续观察"}`,
              )
              .join(" · ")}
          </p>
        )}
    </section>
  );
}
