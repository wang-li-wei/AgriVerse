export type Role = "farmer" | "student" | "expert";
export type Vec3 = [number, number, number];
export interface Fruit {
  fruit_id: string;
  plant_id: string;
  position: Vec3;
  ripeness_stage: "red" | "turning" | "green";
  ripeness_score: number;
  harvestable: boolean;
  occluded: boolean;
  status: "on_plant" | "harvested";
  action_id: string;
  truss_id?: string;
  occluding_leaf_id?: string;
  note?: string;
}
export interface Environment {
  date: string;
  temperature: number;
  humidity: number;
  light_intensity: number;
  co2: number;
  soil_moisture: number;
}
export interface Report {
  type: "farm" | "expert";
  title: string;
  text?: string;
  collected?: string[];
  remaining?: number;
  facts?: string;
  history?: string;
  inference?: string;
  questions?: string;
}
export interface World {
  world_revision?: number;
  fruits: Fruit[];
  plants: {
    plant_id: string;
    cultivar: string;
    growth_stage: string;
    observation_status: string;
  }[];
  collected: string[];
  revealed: boolean;
  learning: string;
  learned_parts: string[];
  reports: Report[];
  environment: Environment[];
  records: {
    date: string;
    plant_id: string;
    part: string;
    observation: string;
    status: string;
  }[];
  demo_data: boolean;
}
export interface Confirmation {
  mission_id?: string;
  plan_id?: string;
  plan_version?: number;
  world_revision?: number;
  id: string;
  kind: "harvest" | "reveal";
  targets: string[];
  role: Role;
}
export interface RobotAction {
  id: string;
  action_type: "harvest" | "reveal";
  target_id: string;
  position: Vec3;
  approach_offset?: Vec3;
  duration_ms: number;
  startedAt: number;
  leaf_id?: string | null;
  truss_id?: string | null;
  affected_leaf_ids?: string[];
  ackSent?: boolean;
  run_id?: string;
}
export interface SceneEvidence {
  verified: boolean;
  fruit_uuid?: string;
  original_uuid?: string;
  position?: number[];
  max_grip_error?: number;
  leaf_moved?: boolean;
  region_visible?: boolean;
  reason?: string;
}
export interface ExecutionEvent {
  mission_id?: string;
  world_revision?: number;
  action_uuid?: string;
  evidence?: Record<string, unknown>;
  type:
    | "run_started"
    | "observation"
    | "decision"
    | "tool_call"
    | "action_stage"
    | "verification"
    | "run_completed"
    | "run_failed";
  run_id: string;
  seq: number;
  timestamp: string;
  phase: string;
  target_id?: string;
  tool_name?: string;
  action_id?: string;
  call_id?: string;
  stage?: string;
  status: "started" | "progress" | "completed" | "failed";
  message: string;
  progress?: number;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  source?: string;
}
export interface ToolLog {
  id: string;
  name: string;
  label: string;
  args: Record<string, unknown>;
  status: "queued" | "running" | "success" | "failed";
  result?: Record<string, unknown>;
  started_at?: string;
  finished_at?: string;
  run_id?: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}
export type AgentEvent =
  | ExecutionEvent
  | ({ type: "tool" } & ToolLog)
  | { type: "state"; state: World }
  | ({ type: "confirmation" } & Confirmation)
  | ({ type: "action" } & Omit<RobotAction, "startedAt">)
  | { type: "message" | "error"; text: string }
  | {
      type: "camera";
      preset: "overview" | "front" | "detail";
      target_id?: string;
    }
  | { type: "highlight"; part: string }
  | { type: "done" | "clear_confirmation" };
