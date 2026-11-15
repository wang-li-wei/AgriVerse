import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ClipboardList,
  GraduationCap,
  Leaf,
  Microscope,
  MoveUpRight,
  Plus,
  TrendingUp,
  X,
} from "lucide-react";
import { useStore } from "../store";
import type { Report } from "../types";

export function downloadReport(report: Report) {
  const text = [
    "AgriVerse 茄境智农",
    report.title,
    "预置演示数据 · 非真实作业/诊断",
    report.text,
    report.facts,
    report.history,
    report.inference,
    report.questions,
  ]
    .filter(Boolean)
    .join("\n\n");
  const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = `AgriVerse-${report.type}-report.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
export function Insights() {
  const role = useStore((s) => s.role),
    world = useStore((s) => s.world),
    busy = useStore((s) => s.busy),
    connected = useStore((s) => s.connected);
  const [modal, setModal] = useState<
      "report" | "environment" | "records" | null
    >(null),
    [metric, setMetric] = useState<"temperature" | "humidity">("humidity");
  const count = world?.collected.length ?? 0,
    available =
      world?.fruits.filter((f) => f.harvestable && f.status === "on_plant")
        .length ?? 0;
  const report = world?.reports
    .filter((r) => r.type === (role === "expert" ? "expert" : "farm"))
    .at(-1);
  const values = world?.environment.map((e) => e[metric]) ?? [],
    min = Math.min(...values) - 2,
    max = Math.max(...values) + 2;
  const points = values
    .map((v, i) => `${18 + i * 45},${70 - ((v - min) / (max - min)) * 48}`)
    .join(" ");
  return (
    <section className="insights-panel">
      {role === "farmer" ? (
        <>
          <div className="insights-heading">
            <div>
              <ClipboardList size={15} />
              <h3>生长与收获</h3>
              <span>每一颗果实，都心中有数</span>
            </div>
            <button
              className="text-button"
              onClick={() =>
                report
                  ? setModal("report")
                  : void useStore.getState().send("生成管理报告")
              }
              disabled={busy || !connected}
            >
              采摘报告
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="farmer-stats">
            <div className="stat-item">
              <span>果实总数</span>
              <div>
                <b>06</b>
                <small>颗</small>
                <span className="tiny-trend">
                  <Leaf size={12} /> P01
                </span>
              </div>
            </div>
            <div className="stat-item">
              <span>
                <i className="stat-dot ripe" />
                可采摘
              </span>
              <div>
                <b>{String(available).padStart(2, "0")}</b>
                <small>颗</small>
              </div>
            </div>
            <div className="stat-item">
              <span>
                <i className="stat-dot orange" />
                生长与观察
              </span>
              <div>
                <b>03</b>
                <small>颗</small>
              </div>
            </div>
            <div className="stat-item collected-stat">
              <span>
                <i className="stat-dot collected" />
                已采摘
              </span>
              <div>
                <b data-testid="basket-count">
                  {String(count).padStart(2, "0")}
                </b>
                <small>颗</small>
                {count > 0 && <Check size={15} />}
              </div>
            </div>
            <div className="harvest-note">
              <div
                className="mini-donut"
                style={{
                  background: `conic-gradient(#d77959 0deg ${available * 60}deg, #a6b89a ${available * 60}deg ${360 - count * 60}deg, #dfe4d9 ${360 - count * 60}deg)`,
                }}
              >
                <span />
              </div>
              <p>
                {count > 0 ? "每一份收获都有记录" : "成熟有时，收获有序"}
                <small>
                  {count > 0
                    ? `收集箱已入库 ${count} 颗`
                    : world?.revealed
                      ? "T06 已补充观察，仍暂缓"
                      : "T06 遮挡暂缓，继续观察"}
                </small>
              </p>
            </div>
          </div>
        </>
      ) : role === "student" ? (
        <>
          <div className="insights-heading">
            <div>
              <GraduationCap size={16} />
              <h3>我的温室探索</h3>
              <span>观察，是最好的开始</span>
            </div>
            <span className="learning-progress">
              {world?.learning === "complete" ? "探索完成 ✓" : "正在探索"}
            </span>
          </div>
          <div className="learning-steps">
            {["认识植株", "观察成熟度", "选择一颗果实", "体验机器人采摘"].map(
              (title, i) => {
                const done =
                  i === 0
                    ? (world?.learned_parts.length ?? 0) >= 4
                    : i === 1
                      ? world?.learning !== "idle"
                      : i === 2
                        ? ["ready", "complete"].includes(world?.learning ?? "")
                        : world?.learning === "complete";
                return (
                  <div className={done ? "done" : ""} key={title}>
                    <span>
                      {done ? (
                        <Check size={15} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <strong>{title}</strong>
                    <small>
                      {i === 0
                        ? "茎 · 叶 · 花 · 果实"
                        : i === 1
                          ? "绿熟 → 转色 → 红熟"
                          : i === 2
                            ? "结合颜色与状态判断"
                            : "让知识在实践中生长"}
                    </small>
                  </div>
                );
              },
            )}
          </div>
        </>
      ) : (
        <>
          <div className="insights-heading">
            <div>
              <Microscope size={15} />
              <h3>P01 · 观察档案</h3>
              <span>模拟异常，待专家核实</span>
            </div>
            <button
              className="text-button"
              onClick={() =>
                report
                  ? setModal("report")
                  : void useStore
                      .getState()
                      .send("查看P01的疑似异常，生成会诊摘要")
              }
              disabled={busy || !connected}
            >
              会诊摘要
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="expert-insights">
            <div>
              <span className="insight-label">生长阶段</span>
              <strong>
                结果期 <small>第 9 周</small>
              </strong>
              <button
                className="text-button"
                onClick={() => setModal("records")}
              >
                历史巡检 <ArrowUpRight size={12} />
              </button>
            </div>
            <div>
              <span className="insight-label">LEAF_01 · 模拟异常</span>
              <strong className="abnormal-status">
                {world?.revealed ? "已补充观察" : "等待拨叶观察"}
              </strong>
              <small className="muted">
                {world?.revealed
                  ? "浅褐色模拟斑点，原因待核实"
                  : "前方叶片遮挡，信息不充分"}
              </small>
            </div>
            <button
              className="trend-preview"
              onClick={() => setModal("environment")}
            >
              <div>
                <span className="insight-label">近 7 天湿度</span>
                <b>
                  68<small>%</small>
                  <TrendingUp size={13} />
                </b>
              </div>
              <svg viewBox="0 0 180 50" aria-label="7天湿度变化">
                <path
                  d="M0 42 28 36 55 30 83 8 111 3 139 23 178 37"
                  fill="none"
                  stroke="#8ba385"
                  strokeWidth="2"
                />
                <path
                  d="M0 42 28 36 55 30 83 8 111 3 139 23 178 37V50H0Z"
                  fill="#eaf0e5"
                  opacity="0.7"
                />
              </svg>
              <MoveUpRight size={13} />
            </button>
          </div>
        </>
      )}
      <button
        className="environment-link"
        onClick={() => setModal("environment")}
      >
        <span>
          <span className="status-dot" />
          预置演示数据
        </span>
        <span>
          查看环境趋势
          <Plus size={11} />
        </span>
      </button>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "report"
                ? "执行报告"
                : modal === "records"
                  ? "历史巡检"
                  : "环境趋势"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭弹窗"
              onClick={() => setModal(null)}
            >
              <X size={19} />
            </button>
            <div className="eyebrow">AGRIVERSE · DEMO DATA</div>
            {modal === "report" && report ? (
              <>
                <h2>{report.title}</h2>
                <p className="modal-description">
                  从实际 Skill 执行结果生成 · 预置演示场景
                </p>
                <div className="report-content">
                  {[
                    report.text,
                    report.facts,
                    report.history,
                    report.inference,
                    report.questions,
                  ]
                    .filter(Boolean)
                    .map((t, i) => (
                      <p key={i}>{t}</p>
                    ))}
                </div>
                <button
                  className="primary"
                  onClick={() => downloadReport(report)}
                >
                  <ArrowDownToLine size={15} />
                  下载文本报告
                </button>
              </>
            ) : modal === "records" ? (
              <>
                <h2>历史巡检记录</h2>
                <p className="modal-description">P01 · 预置巡检与管理数据</p>
                <div className="records-list">
                  {world?.records.map((r) => (
                    <article key={r.date}>
                      <time>{r.date}</time>
                      <h3>
                        {r.part}
                        <span>{r.status}</span>
                      </h3>
                      <p>{r.observation}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2>温室环境，循迹可见</h2>
                <p className="modal-description">
                  11/08 — 11/14 · 7 天预置演示记录 · 非实时数据
                </p>
                <div className="chart-tabs">
                  <button
                    className={metric === "humidity" ? "active" : ""}
                    onClick={() => setMetric("humidity")}
                  >
                    相对湿度 %
                  </button>
                  <button
                    className={metric === "temperature" ? "active" : ""}
                    onClick={() => setMetric("temperature")}
                  >
                    温度 °C
                  </button>
                </div>
                <svg
                  className="environment-chart"
                  viewBox="0 0 320 105"
                  role="img"
                  aria-label={metric === "humidity" ? "湿度趋势" : "温度趋势"}
                >
                  {[25, 48, 71].map((y) => (
                    <line
                      key={y}
                      x1="15"
                      x2="300"
                      y1={y}
                      y2={y}
                      stroke="#e4e6de"
                      strokeDasharray="3 4"
                    />
                  ))}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#5a7c56"
                    strokeWidth="2"
                  />
                  {values.map((v, i) => (
                    <g key={i}>
                      <circle
                        cx={18 + i * 45}
                        cy={70 - ((v - min) / (max - min)) * 48}
                        r="3"
                        fill="#5a7c56"
                      />
                      <text
                        x={18 + i * 45}
                        y={60 - ((v - min) / (max - min)) * 48}
                        textAnchor="middle"
                        fontSize="8"
                        fill="#596954"
                      >
                        {v}
                      </text>
                      <text
                        x={18 + i * 45}
                        y="93"
                        textAnchor="middle"
                        fontSize="8"
                        fill="#858b81"
                      >
                        {world?.environment[i].date}
                      </text>
                    </g>
                  ))}
                </svg>
                <div className="environment-reading">
                  <span>
                    光照
                    <strong>
                      21,600 <small>lx</small>
                    </strong>
                  </span>
                  <span>
                    CO₂
                    <strong>
                      756 <small>ppm</small>
                    </strong>
                  </span>
                  <span>
                    基质含水量
                    <strong>
                      62 <small>%</small>
                    </strong>
                  </span>
                </div>
                <p className="data-note">
                  历史湿度波动仅供演示观察。不能据此判定病害，也不代表真实温室的当前状态。
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
