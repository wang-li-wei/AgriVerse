import { create } from "zustand";
import type {
  World,
  Role,
  Message,
  ToolLog,
  Confirmation,
  RobotAction,
  AgentEvent,
  ExecutionEvent,
  SceneEvidence,
} from "./types";

interface Store {
  sessionId: string | null;
  world: World | null;
  role: Role;
  mode: string;
  busy: boolean;
  connected: boolean;
  error: string | null;
  messages: Record<Role, Message[]>;
  logs: Record<Role, ToolLog[]>;
  execution: Record<Role, ExecutionEvent[]>;
  actionProgress: { id: string; stage: string; progress: number } | null;
  confirmation: Confirmation | null;
  selected: string | null;
  action: RobotAction | null;
  camera: "overview" | "front" | "detail";
  cameraRevision: number;
  highlight: string | null;
  sceneReady: boolean;
  worldRevision: number;
  init: () => Promise<void>;
  setRole: (role: Role) => void;
  select: (id: string) => void;
  setCamera: (preset: "overview" | "front" | "detail") => void;
  send: (
    message: string,
    confirmationId?: string,
    selectedId?: string,
    missionId?: string,
  ) => Promise<void>;
  reportStage: (
    id: string,
    index: number,
    stage: string,
    progress: number,
  ) => void;
  failRun: (message: string) => void;
  finishAction: (
    id: string,
    success: boolean,
    evidence?: SceneEvidence,
  ) => Promise<void>;
  reset: () => Promise<void>;
  clearError: () => void;
  setSceneReady: (ready?: boolean) => void;
}
const empty = <T>(): Record<Role, T[]> => ({
  farmer: [],
  student: [],
  expert: [],
});
const executionTypes = new Set([
  "run_started", "observation", "decision", "tool_call", "action_stage",
  "verification", "run_completed", "run_failed",
]);

// Restore public events only. Never replay saved action commands or model reasoning items.
async function restoreEvents(sid: string) {
  const data = await (await request(`/api/sessions/${sid}/missions`)).json();
  const execution = empty<ExecutionEvent>();
  const messages = empty<Message>();
  const logs = empty<ToolLog>();
  for (const role of ["farmer", "student", "expert"] as Role[]) {
    const mission = data.missions.filter((m: { role: Role }) => m.role === role).at(-1);
    if (!mission) continue;
    let after = 0;
    const restored: AgentEvent[] = [];
    for (;;) {
      const batch = await (await request(`/api/sessions/${sid}/events?mission_id=${mission.id}&after=${after}`)).json();
      restored.push(...batch.events);
      if (batch.events.length < 500) break;
      after = batch.events.at(-1).cursor;
    }
    execution[role] = restored.filter((e) => executionTypes.has(e.type)) as ExecutionEvent[];
    messages[role] = restored.flatMap<Message>((e) => e.type === "message" ? [{
      id: crypto.randomUUID(), role: "assistant" as const, text: e.text,
    }] : e.type === "run_started" ? [{
      id: crypto.randomUUID(), role: "user" as const, text: e.message,
    }] : []);
    const toolMap = new Map<string, ToolLog>();
    for (const e of restored) if (e.type === "tool") toolMap.set(e.id, e);
    logs[role] = [...toolMap.values()];
  }
  return { execution, messages, logs, confirmation: data.pending as Confirmation | null };
}
async function request(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(
    path,
    body === undefined
      ? { signal }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        },
  );
  if (!response.ok) {
    let detail = "服务连接失败";
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {
      /* non-JSON gateway error */
    }
    throw new Error(detail);
  }
  return response;
}
const stageQueues = new Map<string, Promise<void>>();
const stageIndices = new Map<string, number>();
let activeStream: AbortController | null = null;
let initializing: Promise<void> | null = null;
export const useStore = create<Store>((set, get) => ({
  sessionId: null,
  world: null,
  role: "farmer",
  mode: "DEMO",
  busy: false,
  connected: false,
  error: null,
  messages: empty<Message>(),
  logs: empty<ToolLog>(),
  execution: empty<ExecutionEvent>(),
  actionProgress: null,
  confirmation: null,
  selected: null,
  action: null,
  camera: "overview",
  cameraRevision: 0,
  highlight: null,
  sceneReady: false,
  worldRevision: 0,
  init: async () => {
    if (initializing) return initializing;
    initializing = (async () => {
      try {
        const saved = sessionStorage.getItem("agriverse-session");
        if (saved) {
          try {
            const world: World = await (
              await request(`/api/sessions/${saved}`)
            ).json();
            const health = await (await request("/api/health")).json();
            const restored = await restoreEvents(saved);
            set({
              sessionId: saved,
              world,
              mode: health.mode,
              connected: true,
              error: null,
              ...restored,
              ...(restored.confirmation ? { role: restored.confirmation.role } : {}),
            });
            return;
          } catch {
            sessionStorage.removeItem("agriverse-session");
          }
        }
        const data = await (await request("/api/sessions", {})).json();
        sessionStorage.setItem("agriverse-session", data.session_id);
        set({
          sessionId: data.session_id,
          world: data.state,
          mode: data.mode,
          connected: true,
          error: null,
        });
      } catch (e) {
        set({
          error:
            e instanceof Error ? e.message : "无法连接后端，请运行启动脚本。",
          connected: false,
        });
      } finally {
        initializing = null;
      }
    })();
    return initializing;
  },
  setRole: (role) => {
    if (!get().busy) set({ role, highlight: null });
  },
  select: (selected) => set({ selected }),
  setCamera: (camera) =>
    set((s) => ({ camera, cameraRevision: s.cameraRevision + 1 })),
  clearError: () => set({ error: null }),
  setSceneReady: (ready = true) => set({ sceneReady: ready }),
  send: async (message, confirmationId, selectedId, missionId) => {
    const { busy, sessionId, role } = get();
    if (busy || !sessionId) return;
    if (confirmationId && !get().sceneReady) {
      set({ error: "三维场景尚未准备就绪，请稍后再试。" });
      return;
    }
    const id = crypto.randomUUID();
    set((s) => ({
      busy: true,
      error: null,
      confirmation: confirmationId ? null : s.confirmation,

      messages: {
        ...s.messages,
        [role]: [...s.messages[role], { id, role: "user", text: message }],
      },
    }));
    let finished = false;
    const controller = new AbortController();
    activeStream = controller;
    try {
      const response = await request(
        `/api/sessions/${sessionId}/chat`,
        {
          role,
          message,
          confirmation_id: confirmationId,
          selected_id: selectedId,
          mission_id: missionId,
        },
        controller.signal,
      );
      const reader = response.body?.getReader();
      if (!reader) throw new Error("浏览器不支持流式响应。");
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (event: AgentEvent) => {
        switch (event.type) {
          case "run_started":
          case "observation":
          case "decision":
          case "tool_call":
          case "action_stage":
          case "verification":
          case "run_completed":
          case "run_failed":
            set((s) => ({
              execution: {
                ...s.execution,
                [role]: [...s.execution[role], event].slice(-600),
              },
              ...(event.type === "run_failed"
                ? { action: null, error: event.message }
                : {}),
            }));
            break;
          case "state":
            set((s) => ({
              world: event.state,
              action:
                s.action &&
                ((s.action.action_type === "harvest" &&
                  event.state.fruits.some(
                    (f) =>
                      f.fruit_id === s.action?.target_id &&
                      f.status === "harvested",
                  )) ||
                  (s.action.action_type === "reveal" && event.state.revealed))
                  ? null
                  : s.action,
            }));
            break;
          case "tool":
            if (event.name === "play_robot_action" && event.status === "failed")
              set({ action: null });
            set((s) => {
              const logs = s.logs[role];
              return {
                logs: {
                  ...s.logs,
                  [role]: logs.some((l) => l.id === event.id)
                    ? logs.map((l) => (l.id === event.id ? event : l))
                    : [...logs, event],
                },
              };
            });
            break;
          case "message":
          case "error":
            set((s) => ({
              error: event.type === "error" ? event.text : s.error,
              messages: {
                ...s.messages,
                [role]: [
                  ...s.messages[role],
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    text: event.text,
                  },
                ],
              },
            }));
            break;
          case "confirmation":
            set({ confirmation: event });
            break;
          case "clear_confirmation":
            set({ confirmation: null });
            break;
          case "action":
            set({
              action: { ...event, startedAt: performance.now() },
              actionProgress: null,
            });
            get().setCamera("detail");
            get().select(event.target_id);
            break;
          case "camera":
            get().setCamera(event.preset);
            if (event.target_id) get().select(event.target_id);
            break;
          case "highlight":
            set({ highlight: event.part });
            break;
          case "done":
            finished = true;
            break;
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 1);
          if (line.trim()) handle(JSON.parse(line) as AgentEvent);
        }
        if (done) break;
      }
      if (!finished) throw new Error("连接中断，已完成的操作会保留。请重试。");
    } catch (e) {
      const message =
        controller.signal.aborted || e instanceof TypeError
          ? "执行连接已中断，结果未确认；已提交的操作保留。"
          : e instanceof Error
            ? e.message
            : "任务失败，请重试。";
      if (get().action) await get().finishAction(get().action!.id, false);
      get().failRun(message);
      set({ error: message });
      try {
        set({
          world: await (await request(`/api/sessions/${sessionId}`)).json(),
        });
      } catch {
        /* retain last known world */
      }
    } finally {
      if (get().action) {
        try {
          set({
            world: await (await request(`/api/sessions/${sessionId}`)).json(),
          });
        } catch {
          /* preserve last server snapshot */
        }
      }
      if (activeStream === controller) activeStream = null;
      set({ busy: false, action: null, actionProgress: null, highlight: null });
    }
  },
  failRun: (message) => {
    const { role, execution } = get();
    const latest = execution[role].at(-1);
    if (latest?.type === "run_failed") return;
    const event: ExecutionEvent = {
      type: "run_failed",
      run_id: latest?.run_id ?? crypto.randomUUID(),
      mission_id: latest?.mission_id,
      world_revision: latest?.world_revision,
      seq: (latest?.seq ?? 0) + 1,
      timestamp: new Date().toISOString(),
      phase: "task",
      status: "failed",
      message,
      source: "client",
    };
    set((s) => ({
      execution: { ...s.execution, [role]: [...s.execution[role], event] },
    }));
  },
  reportStage: (id, index, stage, progress) => {
    const s = get();
    if (s.action?.id !== id || s.action.ackSent) return;
    const rounded = Math.floor(progress * 100) / 100;
    if (
      s.actionProgress?.progress !== rounded ||
      s.actionProgress.stage !== stage
    )
      set({ actionProgress: { id, stage, progress: rounded } });
    if (stageIndices.get(id) === index) return;
    stageIndices.set(id, index);
    const pending = (stageQueues.get(id) ?? Promise.resolve())
      .then(async () => {
        if (get().action?.id !== id) return;
        await request(`/api/sessions/${s.sessionId}/actions/${id}/stage`, {
          index,
          progress,
        });
      })
      .catch(async () => {
        set({ action: null, error: "动作阶段连接失败，结果未确认。" });
        get().failRun("动作阶段连接失败，停止执行并核对服务端状态。");
        try {
          await request(`/api/sessions/${s.sessionId}/actions/${id}/ack`, {
            success: false,
          });
        } catch {
          /* disconnected */
        } finally {
          stageQueues.delete(id);
          stageIndices.delete(id);
          activeStream?.abort();
        }
      });
    stageQueues.set(id, pending);
  },
  finishAction: async (id, success, evidence) => {
    const sid = get().sessionId;
    if (get().action?.id !== id || get().action?.ackSent) return;
    set((s) => ({
      action: success && s.action ? { ...s.action, ackSent: true } : null,
    }));
    try {
      if (success) await stageQueues.get(id);
      if (success && get().action?.id !== id) return;
      await request(`/api/sessions/${sid}/actions/${id}/ack`, {
        success,
        evidence,
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "动作回执失败，结果未确认。";
      set({ error: message, action: null });
      get().failRun(message);
      // If delivery itself failed, explicitly revoke the pending action where possible.
      try {
        await request(`/api/sessions/${sid}/actions/${id}/ack`, {
          success: false,
        });
      } catch {
        /* server may already have rejected it */
      } finally {
        activeStream?.abort();
      }
    } finally {
      stageQueues.delete(id);
      stageIndices.delete(id);
    }
  },
  reset: async () => {
    const { busy, sessionId } = get();
    if (busy || !sessionId) return;
    try {
      const world = await (
        await request(`/api/sessions/${sessionId}/reset`, {})
      ).json();
      set((s) => ({
        world,
        worldRevision: s.worldRevision + 1,
        messages: empty<Message>(),
        logs: empty<ToolLog>(),
        execution: empty<ExecutionEvent>(),
        actionProgress: null,
        confirmation: null,
        selected: null,
        highlight: null,
        action: null,
        camera: "overview",
        cameraRevision: s.cameraRevision + 1,
        error: null,
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "重置失败" });
    }
  },
}));
