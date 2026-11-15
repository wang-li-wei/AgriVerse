import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  Leaf,
  LoaderCircle,
  Microscope,
  Settings2,
  WifiOff,
  X,
} from "lucide-react";
import { useStore } from "./store";
import { roles } from "./agent/roles";
import { AgentPanel } from "./components/AgentPanel";
import { ScenePanel } from "./components/ScenePanel";
import { Insights } from "./components/Insights";
import { Settings } from "./components/Settings";
import { BrandMark } from "./components/Icons";
import type { Role } from "./types";

export default function App() {
  const role = useStore((s) => s.role),
    mode = useStore((s) => s.mode),
    connected = useStore((s) => s.connected),
    error = useStore((s) => s.error),
    busy = useStore((s) => s.busy),
    world = useStore((s) => s.world);
  const [modal, setModal] = useState<"settings" | "guide" | null>(null);
  useEffect(() => {
    void useStore.getState().init();
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  return (
    <div className={`app role-${role}`}>
      <header className="site-header">
        <a className="brand" href="/" aria-label="AgriVerse 茄境智农首页">
          <BrandMark />
          <span>
            <strong>
              AgriVerse<span>茄境智农</span>
            </strong>
            <small>BOTANICAL INTELLIGENCE</small>
          </span>
        </a>
        <nav className="main-navigation" aria-label="主导航">
          <span className="current">
            <span className="nav-orbit" />
            智能温室
          </span>
          <button onClick={() => setModal("guide")}>
            探索指南
            <ArrowUpRight size={12} />
          </button>
        </nav>
        <div className="header-right">
          <span className={`mode-pill ${mode === "REAL_AGENT" ? "real" : ""}`}>
            <span />
            {mode === "DEMO" ? "本地演示模式" : "模型连接模式"}
          </span>
          <div className="header-divider" />
          <button
            className="icon-button"
            aria-label="体验指南"
            title="体验指南"
            onClick={() => setModal("guide")}
          >
            <CircleHelp size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="设置"
            title="设置"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={18} />
          </button>
          <span className="user-avatar">A</span>
        </div>
      </header>
      <main>
        <section className="page-intro">
          <div>
            <div className="breadcrumb">
              我的工作空间
              <ChevronRight size={11} />
              <span>智能温室</span>
            </div>
            <h1>
              生长，自有智慧<span>。</span>
            </h1>
            <p>一个农业三维世界，与懂你的智能体一起探索。</p>
          </div>
          <div className="role-switch-area">
            <span className="role-switch-label">
              以不同视角，走进同一座温室
            </span>
            <div
              className="role-switch"
              role="tablist"
              aria-label="选择用户角色"
            >
              {(["farmer", "student", "expert"] as Role[]).map((r) => {
                const Icon =
                  r === "farmer"
                    ? Leaf
                    : r === "student"
                      ? GraduationCap
                      : Microscope;
                return (
                  <button
                    key={r}
                    role="tab"
                    aria-selected={role === r}
                    disabled={busy}
                    className={role === r ? "active" : ""}
                    onClick={() => useStore.getState().setRole(r)}
                  >
                    <Icon size={16} strokeWidth={1.6} />
                    {roles[r].short}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
        {error && (
          <div className="error-banner" role="alert">
            <WifiOff size={16} />
            <span>
              {error}
              {!connected && " · 请运行 ./scripts/start.sh 启动服务"}
            </span>
            {!connected && (
              <button onClick={() => void useStore.getState().init()}>
                重试连接
              </button>
            )}
            <button
              className="icon-button"
              aria-label="关闭错误提示"
              onClick={() => useStore.getState().clearError()}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="workspace">
          <div className="world-column">
            {world ? (
              <>
                <ScenePanel />
                <Insights />
              </>
            ) : (
              <div className="loading-world">
                <LoaderCircle size={28} className="spin" />
                <h2>正在准备你的温室</h2>
                <p>连接本地场景与农业技能…</p>
                {!connected && (
                  <button
                    className="primary"
                    onClick={() => void useStore.getState().init()}
                  >
                    重新连接
                  </button>
                )}
              </div>
            )}
          </div>
          <AgentPanel />
        </div>
        <footer className="page-footer">
          <span>
            <span className="footer-flower">✳</span>让智能扎根，让农业生长。
          </span>
          <span>
            <i className="status-dot" />
            {connected ? "本地场景已连接" : "等待服务连接"}
            <i className="footer-divider" />
            所有数据均为演示预置
            <button onClick={() => setModal("guide")}>
              <BookOpen size={12} />
              体验指南
            </button>
            <small>AgriVerse v0.1</small>
          </span>
        </footer>
      </main>
      {modal && <Settings tab={modal} close={() => setModal(null)} />}
    </div>
  );
}
