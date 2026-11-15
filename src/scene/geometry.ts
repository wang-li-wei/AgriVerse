import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Unequal serrations and shallow lobes, shared by blade geometry, veins and lesions.
// Broad, asymmetric lobes: hand placed shoulders/notches, not a repeated wave.
const OUTLINES = [
  [
    0.025, 0.2, 0.37, 0.31, 0.58, 0.76, 0.63, 0.88, 0.77, 0.66, 0.91, 1, 0.82,
    0.94, 0.72, 0.6, 0.81, 0.71, 0.55, 0.65, 0.47, 0.38, 0.48, 0.32, 0.27, 0.34,
    0.19, 0.22, 0.12, 0.08, 0,
  ],
  [
    0.02, 0.23, 0.46, 0.39, 0.69, 0.82, 0.67, 0.93, 0.81, 1, 0.88, 0.74, 0.95,
    0.85, 0.66, 0.79, 0.61, 0.72, 0.5, 0.59, 0.41, 0.49, 0.32, 0.37, 0.24, 0.29,
    0.16, 0.18, 0.09, 0.055, 0,
  ],
  [
    0.025, 0.16, 0.34, 0.29, 0.56, 0.7, 0.61, 0.89, 0.76, 0.93, 0.7, 0.88, 1,
    0.84, 0.96, 0.75, 0.62, 0.81, 0.65, 0.5, 0.61, 0.43, 0.5, 0.34, 0.25, 0.32,
    0.2, 0.23, 0.12, 0.07, 0,
  ],
];
export function leafSurface(t: number, u: number, variant = 0): THREE.Vector3 {
  const outline = OUTLINES[variant % 3];
  const shifted = t + (u < 0 ? 0.018 * Math.sin(t * Math.PI) : 0);
  const x = THREE.MathUtils.clamp(shifted, 0, 1) * (outline.length - 1),
    i = Math.min(Math.floor(x), outline.length - 2);
  const edge = THREE.MathUtils.lerp(outline[i], outline[i + 1], x - i);
  const sideWidth =
    [0.335, 0.365, 0.305][variant % 3] *
    (1 + 0.075 * Math.sin(variant * 2.1 + u * 2.4 + t * 3));
  return new THREE.Vector3(
    t * (0.73 + variant * 0.025),
    Math.sin(t * Math.PI) * (0.07 + variant * 0.012) -
      Math.pow(Math.abs(u), 1.4) * 0.045 +
      0.038 * t * t +
      u * t * 0.024 * Math.cos(variant + 1) +
      0.012 * Math.sin(t * 11 + u * 3 + variant) * Math.abs(u),
    u * edge * sideWidth,
  );
}
export function surfaceNormal(t: number, u: number, variant = 0) {
  const dt = leafSurface(Math.min(0.999, t + 0.001), u, variant).sub(
    leafSurface(Math.max(0.001, t - 0.001), u, variant),
  );
  const du = leafSurface(t, Math.min(0.999, u + 0.001), variant).sub(
    leafSurface(t, Math.max(-0.999, u - 0.001), variant),
  );
  return du.cross(dt).normalize();
}
export function leafGeometry(
  variant = 0,
  simple = false,
): THREE.BufferGeometry {
  const vertices: number[] = [],
    indices: number[] = [],
    colors: number[] = [],
    rows = simple ? 18 : 70,
    cols = simple ? 2 : 6;
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= cols; j++) {
      const t = i / rows,
        u = (j / cols) * 2 - 1,
        p = leafSurface(t, u, variant);
      vertices.push(p.x, p.y, p.z);
      const tint =
        0.82 + 0.15 * (1 - Math.abs(u)) + 0.035 * Math.sin(t * 14 + variant);
      colors.push(tint, tint, tint * 0.96);
    }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j,
        b = a + cols + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
function veinGeometry(variant: number) {
  const parts: THREE.BufferGeometry[] = [];
  const tube = (samples: THREE.Vector3[], radius: number) =>
    parts.push(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(samples),
        8,
        radius,
        3,
        false,
      ),
    );
  tube(
    Array.from({ length: 9 }, (_, i) =>
      leafSurface(0.03 + i * 0.115, 0, variant).add(
        new THREE.Vector3(0, 0.004, 0),
      ),
    ),
    0.004,
  );
  for (const t of [0.22, 0.38, 0.54, 0.7])
    for (const side of [-1, 1]) {
      tube(
        [
          leafSurface(t, 0, variant),
          leafSurface(t + 0.05, side * 0.45, variant),
          leafSurface(t + 0.1, side * 0.82, variant),
        ].map((p) => p.add(new THREE.Vector3(0, 0.003, 0))),
        0.0018,
      );
    }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}
// Every lesion vertex is evaluated on the same curved blade surface, with a tiny normal offset.
export function lesionGeometry(variant: number) {
  const vertices: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const spots = [
    { t: 0.31, u: -0.3, r: 0.047, phase: 0.4 },
    { t: 0.49, u: 0.18, r: 0.055, phase: 2 },
    { t: 0.68, u: -0.2, r: 0.04, phase: 4.1 },
    { t: 0.57, u: -0.55, r: 0.031, phase: 1.3 },
    { t: 0.4, u: 0.56, r: 0.022, phase: 3.2 },
    { t: 0.72, u: 0.32, r: 0.019, phase: 5.2 },
  ];
  const colorRings = [
    "#c8c2ae",
    "#bfb49a",
    "#624a30",
    "#a19650",
    "#8f9b50",
    "#486738",
  ];
  const add = (t: number, u: number, color: string) => {
    const p = leafSurface(t, u, variant).addScaledVector(
      surfaceNormal(t, u, variant),
      0.0018,
    );
    vertices.push(p.x, p.y, p.z);
    const c = new THREE.Color(color);
    colors.push(c.r, c.g, c.b);
  };
  for (const spot of spots) {
    const base = vertices.length / 3,
      segments = 18,
      rings = [0, 0.4, 0.64, 0.78, 0.9, 1];
    for (let r = 0; r < rings.length; r++)
      for (let j = 0; j < segments; j++) {
        const a = (j / segments) * Math.PI * 2,
          rough =
            1 +
            0.1 * Math.sin(a * 3 + spot.phase) +
            0.055 * Math.cos(a * 7 - spot.phase);
        add(
          spot.t + Math.cos(a) * spot.r * rings[r] * rough,
          spot.u + Math.sin(a) * spot.r * 2.65 * rings[r] * rough,
          colorRings[r],
        );
      }
    for (let r = 0; r < rings.length - 1; r++)
      for (let j = 0; j < segments; j++) {
        const a = base + r * segments + j,
          b = base + r * segments + ((j + 1) % segments);
        indices.push(a, b, a + segments, b, b + segments, a + segments);
      }
    for (let d = 0; d < 3; d++) {
      const t = spot.t + Math.cos(d * 2.4 + spot.phase) * spot.r * 0.26,
        u = spot.u + Math.sin(d * 2.4 + spot.phase) * spot.r * 0.9,
        start = vertices.length / 3;
      for (let j = 0; j < 7; j++) {
        const a = (j / 7) * Math.PI * 2;
        add(t + Math.cos(a) * 0.004, u + Math.sin(a) * 0.014, "#34382a");
      }
      for (let j = 1; j < 6; j++) indices.push(start, start + j, start + j + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
export const leafGeometries = [0, 1, 2].map((v) => leafGeometry(v));
export const simpleLeafGeometries = [0, 1, 2].map((v) => leafGeometry(v, true));
export const veinGeometries = [0, 1, 2].map(veinGeometry);
export const diseaseGeometries = [0, 1, 2].map(lesionGeometry);
export const leafGeo = leafGeometries[0];
export const leafMaterials = ["#355c35", "#4d713c", "#809451"].map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.92,
      side: THREE.DoubleSide,
      vertexColors: true,
    }),
);
export const leafMat = leafMaterials[1];
// A separate narrow sepal keeps the broadened leaf blade out of the fruit calyx.
export const sepalGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0, 0.055, 0.025, -0.029, 0.1, 0.014, -0.016, 0.19, -0.035, 0, 0.1,
        0.014, 0.019, 0.055, 0.025, 0.032,
      ],
      3,
    ),
  );
  g.setIndex([0, 1, 5, 1, 2, 4, 1, 4, 5, 2, 3, 4]);
  g.computeVertexNormals();
  return g;
})();
export const calyxMat = new THREE.MeshStandardMaterial({
  color: "#58723a",
  side: THREE.DoubleSide,
  roughness: 0.94,
});
export const leafHighlightMat = new THREE.MeshStandardMaterial({
  color: "#8fa45c",
  roughness: 0.9,
  side: THREE.DoubleSide,
  vertexColors: true,
});
export const veinMat = new THREE.MeshStandardMaterial({
  color: "#92a16a",
  roughness: 0.95,
});
export const diseaseMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  side: THREE.DoubleSide,
  roughness: 1,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -2,
});
export const stemMat = new THREE.MeshStandardMaterial({
  color: "#657d40",
  roughness: 0.95,
});
export function tomatoGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(0.18, 32, 24),
    p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      angle = Math.atan2(z, x),
      lobe =
        1 +
        0.055 *
          Math.cos(angle * 7) *
          Math.sin(Math.acos(Math.min(1, Math.max(-1, y / 0.18))));
    p.setXYZ(i, x * lobe, y * 0.88, z * lobe);
  }
  geometry.computeVertexNormals();
  return geometry;
}
export const tomatoGeo = tomatoGeometry();
export const matureMat = new THREE.MeshPhysicalMaterial({
  color: "#cc5131",
  roughness: 0.42,
  clearcoat: 0.18,
  clearcoatRoughness: 0.6,
});
export const turningMat = new THREE.MeshPhysicalMaterial({
  color: "#dea24c",
  roughness: 0.45,
  clearcoat: 0.12,
});
export const greenMat = new THREE.MeshPhysicalMaterial({
  color: "#93a94c",
  roughness: 0.5,
  clearcoat: 0.08,
});
