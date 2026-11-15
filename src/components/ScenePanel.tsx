import { useState } from "react";
import {
  ArrowUpRight,
  Box,
  Check,
  ChevronDown,
  Expand,
  Focus,
  Layers3,
  Leaf,
  LoaderCircle,
  MousePointer2,
  RotateCcw,
  ScanLine,
  Wind,
  X,
} from "lucide-react";
import { Greenhouse } from "../scene/Greenhouse";
import { useStore } from "../store";

export function ScenePanel() {
  const world = useStore((s) => s.world),
    selected = useStore((s) => s.selected),
    action = useStore((s) => s.action),
    actionProgress = useStore((s) => s.actionProgress),
    role = useStore((s) => s.role),
    ready = useStore((s) => s.sceneReady);
  const [views, setViews] = useState(false),
    [expanded, setExpanded] = useState(false),
    [observationZoom, setObservationZoom] = useState(false);
  const fruit = world?.fruits.find((f) => f.fruit_id === selected);
  const observation =
    selected === "LEAF_01" || selected?.startsWith("P01_LEAF_");
  const title = fruit
    ? `果实 ${fruit.fruit_id}`
    : selected === "P01"
      ? "P01 · 示范植株"
      : observation
        ? selected === "LEAF_01"
          ? "LEAF_01 · 模拟异常区域"
          : `${selected} · 复叶`
        : selected === "FLOWER"
          ? "花序 · 生命的起点"
          : "";
  return (
    <section
      className={`scene-panel ${expanded ? "expanded" : ""}`}
      aria-label="三维温室场景"
    >
      <div className="scene-topbar">
        <div className="scene-name">
          <Box size={16} strokeWidth={1.5} />
          <span>
            01 <i>/</i> 番茄温室
          </span>
          <span className="scene-badge">3D 数字场景</span>
        </div>
        <div className="scene-top-actions">
          <span>
            <i className="status-dot" />
            {action ? "机械臂执行中" : "场景就绪"}
          </span>
          <button
            className="icon-button"
            aria-label={expanded ? "退出放大场景" : "放大场景"}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <X size={15} /> : <Expand size={15} />}
          </button>
        </div>
      </div>
      <div className="scene-canvas">
        <Greenhouse
          observationZoom={
            observationZoom && selected === "LEAF_01" && !!world?.revealed
          }
        />
        <div className="scene-context">
          <span className="scene-location">AGRIVERSE GREENHOUSE</span>
          <h2>
            在一座温室里，
            <br />
            看见农业的更多可能<span>。</span>
          </h2>
          <span className="context-coordinate">
            <span />
            P01 · 普罗旺斯番茄 · 结果期
          </span>
        </div>
        <div className="environment-strip">
          <span>
            <span className="mini-sun">☀</span>
            <b>
              24.2<small>°C</small>
            </b>
          </span>
          <i />
          <span>
            <Wind size={15} />
            <b>
              68<small>% RH</small>
            </b>
          </span>
          <span className="fixture-tag">预置环境</span>
        </div>
        {!ready && (
          <div className="scene-loading">
            <LoaderCircle className="spin" size={22} />
            正在构建你的温室…
          </div>
        )}
        {title && !action && (
          <div className="selection-card">
            <div className="selection-title">
              <ScanLine size={14} />
              <b>{title}</b>
              <button
                aria-label="关闭对象信息"
                onClick={() => useStore.getState().select("")}
              >
                <X size={13} />
              </button>
            </div>
            {fruit ? (
              <>
                <div className="selection-properties">
                  <span>
                    成熟度{" "}
                    <b>
                      {
                        { red: "红熟", turning: "转色期", green: "绿熟" }[
                          fruit.ripeness_stage
                        ]
                      }{" "}
                      · {Math.round(fruit.ripeness_score * 100)}%
                    </b>
                  </span>
                  <span>
                    当前状态{" "}
                    <b>
                      {fruit.status === "harvested"
                        ? "已采摘"
                        : fruit.harvestable
                          ? "可采摘"
                          : fruit.occluded
                            ? "需进一步观察"
                            : fruit.fruit_id === "T06"
                              ? "暂缓采摘"
                              : "继续生长"}
                    </b>
                  </span>
                </div>
                {fruit.occluded && <p>存在遮挡，暂缓采摘</p>}
                {!fruit.occluded && fruit.note && <p>{fruit.note}</p>}
              </>
            ) : (
              <p>
                {selected === "P01"
                  ? "植株 P01 · 6 颗果实 · 第 9 周"
                  : selected === "LEAF_01"
                    ? world?.revealed
                      ? "复叶小叶上的斑枯病外观模拟病斑，待专家核实，非检测结论。"
                      : "前方叶片遮挡，可切换专家模式辅助观察。"
                    : selected === "FLOWER"
                      ? "番茄花经过授粉，可发育成果实。"
                      : "叶片利用光照制造植株生长所需的养分。"}
              </p>
            )}
            <button
              className="text-button"
              onClick={() => {
                setObservationZoom(false);
                useStore.getState().setCamera("detail");
              }}
            >
              近景观察
              <ArrowUpRight size={12} />
            </button>
            {selected === "LEAF_01" && world?.revealed && (
              <button
                className="text-button"
                onClick={() => {
                  setObservationZoom((v) => !v);
                  useStore.getState().setCamera("detail");
                }}
              >
                {observationZoom ? "返回病叶与周围组织" : "放大模拟病斑"}
                <Focus size={12} />
              </button>
            )}
          </div>
        )}
        {action && (
          <div className="action-overlay">
            <div className="action-status-icon">
              <LoaderCircle size={19} className="spin" />
            </div>
            <div>
              <span>AGENT → ROBOT SKILL</span>
              <strong>
                {action.action_type === "harvest"
                  ? `正在采摘 ${action.target_id}`
                  : "正在拨开遮挡叶片"}
              </strong>
              <small>
                {actionProgress?.stage ?? "正在准备动作"} ·{" "}
                {Math.round((actionProgress?.progress ?? 0) * 100)}%
              </small>
            </div>
            <div
              className="action-progress"
              style={{
                width: `${(actionProgress?.progress ?? 0) * 100}%`,
                animation: "none",
              }}
              key={action.id}
            />
          </div>
        )}
        <div className="scene-controls">
          <span className="interaction-hint">
            <MousePointer2 size={12} />
            拖动旋转 <i>·</i> 滚轮缩放 <i>·</i> 点击观察
          </span>
          <div className="view-controls">
            <div className="view-menu-anchor">
              <button onClick={() => setViews((v) => !v)} aria-expanded={views}>
                <Layers3 size={14} />
                场景视角
                <ChevronDown size={12} />
              </button>
              {views && (
                <div className="view-menu">
                  {(
                    [
                      ["overview", "温室全景"],
                      ["front", "植株正视"],
                      ["detail", "果实近景"],
                    ] as const
                  ).map(([preset, label]) => (
                    <button
                      key={preset}
                      onClick={() => {
                        useStore.getState().setCamera(preset);
                        setViews(false);
                      }}
                    >
                      <Focus size={13} />
                      {label}
                      {useStore.getState().camera === preset && (
                        <Check size={12} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              aria-label="重置视角"
              title="重置视角"
              onClick={() => useStore.getState().setCamera("overview")}
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>
      <div className="fruit-inventory">
        <div className="inventory-title">
          <Leaf size={14} />
          <span>{role === "student" ? "观察与选择" : "主植株果实"}</span>
          <small>P01</small>
        </div>
        <div className="fruit-pills">
          {world?.fruits.map((f) => (
            <button
              key={f.fruit_id}
              className={`fruit-pill ${selected === f.fruit_id ? "selected" : ""} ${f.status === "harvested" ? "harvested" : ""}`}
              onClick={() => useStore.getState().select(f.fruit_id)}
              aria-label={`选择 ${f.fruit_id} ${f.status === "harvested" ? "已采摘" : { red: "红熟", turning: "转色", green: "绿熟" }[f.ripeness_stage]}`}
            >
              <span className={`tomato-dot ${f.ripeness_stage}`}>
                {f.status === "harvested" && <Check size={9} />}
              </span>
              <b>{f.fruit_id}</b>
              <small>
                {f.status === "harvested"
                  ? "已采"
                  : f.fruit_id === "T06"
                    ? "暂缓"
                    : { red: "红熟", turning: "转色", green: "绿熟" }[
                        f.ripeness_stage
                      ]}
              </small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
