import structure from "../../data/plant_structure.json";
import type { Vec3 } from "../types";

export interface LeafDefinition {
  leaf_id: string;
  position: Vec3;
  rotation: Vec3;
  scale: number;
  pairs: number;
  variant: number;
  terminal_scale?: number;
}
export interface TrussDefinition {
  truss_id: string;
  position: Vec3;
  axis: Vec3[];
  fruit_ids: string[];
  attachments: Vec3[];
  nearby_leaf_ids: string[];
}
export const plantModel = structure as unknown as {
  plant_id: string;
  stem_points: Vec3[];
  leaves: LeafDefinition[];
  trusses: TrussDefinition[];
  reveal: {
    region_id: string;
    occluding_leaf_id: string;
    carrier_leaf_id: string;
    leaflet_id: string;
    affected_leaf_ids: string[];
    fruit_ids: string[];
    contact_position: Vec3;
    open_rotation: Vec3;
  };
  robot: { home: Vec3; basket: Vec3; shoulder: Vec3 };
};
export function basketPosition(index: number): Vec3 {
  return [1.48 + (index % 2) * 0.4, 0.38, 1.18 + Math.floor(index / 2) * 0.32];
}
export function trussForFruit(id: string) {
  return plantModel.trusses.find((truss) => truss.fruit_ids.includes(id));
}
