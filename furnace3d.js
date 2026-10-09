/* 3D dot-matrix industrial blast furnace, beside the pixel laboratory.
   以数据为料，以算力为火，以模型为丹: data spirals in as feedstock, compute
   fires the hearth, and the refined model floats above the charging tower.
   Scrolling refines the whole furnace into a neural network.
   Raw WebGL without libraries: geometry is built once, and every particle
   moves in the vertex shader. */
(() => {
  "use strict";
  const root = document.documentElement;
  const canvas = document.getElementById("hero-3d");
  const tagLayer = document.querySelector(".hero-3d-tags");
  const tags = [...tagLayer.querySelectorAll(".hero-tag")];
  const furnace = window.AIchemyFurnace;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const MODES = ["pixel", "3d"];
  const TAU = Math.PI * 2;
  const DISTANCE = 7;
  const FLOOR = -1.35;
  const PILL_HEIGHT = 2.1;
  const PILL_X = 0.12;
  const FRONT = Math.PI / 2;
  const STRIDE = 13; // position 3, aux 3, network target 3, meta 4
  // Callout anchors in furnace space: the data streams, the fire and the pill.
  const ANCHORS = {
    data: [1.95, 0.55, 0.5],
    fire: [-0.5, -1.12, 0.45],
    pill: [0.36 + PILL_X, PILL_HEIGHT, 0],
  };
  let mode = root.classList.contains("furnace-3d") ? "3d" : "pixel";

  /* ---------- Geometry ---------- */

  // mulberry32: a fixed seed keeps the dot matrix identical on every load.
  let seed = 1;
  function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  // Revolves a profile into rings of evenly spaced dots, offset every other ring.
  function lathe(curve, spacing, emit) {
    const lengths = [0];
    for (let i = 1; i < curve.length; i++)
      lengths.push(
        lengths[i - 1] +
          Math.hypot(
            curve[i][0] - curve[i - 1][0],
            curve[i][1] - curve[i - 1][1],
          ),
      );
    const total = lengths[lengths.length - 1];
    let index = 1;
    let ring = 0;
    for (let s = spacing / 2; s < total; s += spacing, ring++) {
      while (lengths[index] < s) index++;
      const a = curve[index - 1];
      const b = curve[index];
      const length = lengths[index] - lengths[index - 1] || 1;
      const k = (s - lengths[index - 1]) / length;
      const r = a[0] + (b[0] - a[0]) * k;
      const y = a[1] + (b[1] - a[1]) * k;
      const nr = (b[1] - a[1]) / length;
      const ny = (a[0] - b[0]) / length;
      const count = Math.max(3, Math.round((TAU * r) / spacing));
      for (let j = 0; j < count; j++)
        emit(r, y, ((j + (ring % 2) / 2) / count) * TAU, nr, ny);
    }
  }

  function build(quality) {
    seed = 20260926;
    const data = [];
    // Kinds: 0 steelwork, 1 skip, 2 fire, 3 data, 4 model, 5 sparks, 6 floor, 7 dust, 8 field, 9 iron.
    const add = (kind, x, y, z, a = 0, b = 0, c = 0, accent = 0) =>
      data.push(x, y, z, a, b, c, 0, 0, 0, kind, random(), accent, -1);
    const gap = 0.034 / Math.sqrt(quality);
    const fine = 0.018 / Math.sqrt(quality);
    const count = (base) => Math.round(base * quality);

    // A blast furnace has a tapered shaft, broad bosh and a straight refractory hearth.
    // Keep the existing world-space scale; the steelwork expands its silhouette.
    const shell = [
      [0, -1.12], [0.72, -1.12], [0.72, -0.64], [0.91, -0.22],
      [0.91, 0.04], [0.57, 1.03], [0.43, 1.17], [0.43, 1.4],
    ];
    const radiusAt = (y) => {
      for (let i = 2; i < shell.length; i++) {
        const [r0, y0] = shell[i - 1];
        const [r1, y1] = shell[i];
        if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0 || 1);
      }
      return 0.43;
    };
    const fromFront = (theta) =>
      Math.atan2(Math.sin(theta - FRONT), Math.cos(theta - FRONT));
    lathe(shell, gap, (r, y, theta, nr, ny) => {
      // A front cutaway exposes the incandescent hearth and the tapping opening.
      if (Math.abs(fromFront(theta)) < 0.48 && y > -1.01 && y < -0.45) return;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      add(0, c * r, y, s * r, c * nr, ny, s * nr);
    });

    const edge = (a, b, accent = 0, kind = 0) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(...a.map((v, i) => b[i] - v)) / fine));
      for (let i = 0; i <= steps; i++) {
        const p = a.map((v, k) => v + (b[k] - v) * i / steps);
        add(kind, ...p, 0, 0, 1, accent);
      }
    };
    const ring = (r, y, accent = 0, cx = 0, cz = 0) => {
      const total = Math.ceil(TAU * r / fine);
      for (let i = 0; i < total; i++) {
        const a = i / total * TAU;
        const c = Math.cos(a);
        const s = Math.sin(a);
        add(0, cx + c * r, y, cz + s * r, c, 0, s, accent);
      }
    };
    const box = (center, size, accent = 0, kind = 0) => {
      for (let axis = 0; axis < 3; axis++) {
        for (const u of [-1, 1]) for (const v of [-1, 1]) {
          const a = center.slice();
          const b = center.slice();
          a[axis] -= size[axis] / 2;
          b[axis] += size[axis] / 2;
          for (const [offset, sign] of [[1, u], [2, v]]) {
            const side = (axis + offset) % 3;
            a[side] = b[side] = center[side] + sign * size[side] / 2;
          }
          edge(a, b, accent, kind);
        }
      }
    };
    // Point-sampled pipes, with a local orthonormal cross section at each segment.
    const pipe = (path, radius, accent = 0) => {
      for (let k = 1; k < path.length; k++) {
        const a = path[k - 1];
        const b = path[k];
        const delta = b.map((v, i) => v - a[i]);
        const length = Math.hypot(...delta);
        const d = delta.map((v) => v / length);
        const side = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [-d[2], 0, d[0]];
        const norm = Math.hypot(...side);
        const u = side.map((v) => v / norm);
        const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
        const steps = Math.ceil(length / gap);
        const sides = Math.max(8, Math.ceil(TAU * radius / gap));
        for (let j = 0; j <= steps; j++) {
          for (let i = 0; i < sides; i++) {
            const theta = (i + (j % 2) * 0.5) / sides * TAU;
            const n = u.map((value, axis) => value * Math.cos(theta) + v[axis] * Math.sin(theta));
            const p = a.map((value, axis) => value + delta[axis] * j / steps + n[axis] * radius);
            add(0, ...p, ...n, accent);
          }
        }
      }
    };

    // Steel cooling bands and longitudinal ribs make the tall shell legible.
    for (const y of [-1.1, -0.88, -0.64, -0.22, 0.04, 0.36, 0.7, 1.03, 1.19, 1.38]) {
      ring(radiusAt(y) + 0.012, y, y < -0.6 ? 1 : 0);
      ring(radiusAt(y) + 0.012, y + 0.025);
    }
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU;
      for (const [y0, y1] of [[-0.62, -0.23], [0.05, 1.03]]) {
        edge([Math.cos(a) * (radiusAt(y0) + 0.02), y0, Math.sin(a) * (radiusAt(y0) + 0.02)],
          [Math.cos(a) * (radiusAt(y1) + 0.02), y1, Math.sin(a) * (radiusAt(y1) + 0.02)]);
      }
    }
    // Rectangular inspection frame around the glowing hearth.
    box([0, -0.74, 0.72], [0.66, 0.55, 0.06], 1);

    // Two walkways, with grated decks, guardrails and evenly spaced stanchions.
    for (const [y, inner, outer] of [[0.14, 0.9, 1.12], [1.04, 0.56, 0.81]]) {
      ring(inner, y);
      ring(outer, y, 1);
      ring(outer, y + 0.2);
      ring(outer, y + 0.11);
      for (let k = 0; k < 40; k++) {
        const a = k / 40 * TAU;
        const c = Math.cos(a);
        const s = Math.sin(a);
        edge([c * inner, y, s * inner], [c * outer, y, s * outer]);
        if (k % 2 === 0) edge([c * outer, y, s * outer], [c * outer, y + 0.2, s * outer]);
      }
    }

    // Four steel columns and cross-bracing support the furnace, leaving its front open.
    for (const x of [-0.94, 0.94]) for (const z of [-0.72, 0.72]) {
      box([x, -0.54, z], [0.065, 1.6, 0.065]);
      box([x, FLOOR + 0.035, z], [0.25, 0.07, 0.25], 1);
    }
    for (const x of [-0.94, 0.94]) {
      edge([x, -1.28, -0.72], [x, 0.17, 0.72]);
      edge([x, -1.28, 0.72], [x, 0.17, -0.72]);
    }

    // Off-gas uptakes join a large external downcomer; collars read as bolted flanges.
    for (const x of [-0.31, 0.31]) {
      pipe([[x, 1.26, -0.22], [x, 1.62, -0.22]], 0.065);
    }
    pipe([[-0.31, 1.62, -0.22], [0.92, 1.62, -0.22]], 0.065);
    pipe([[0.92, 1.62, -0.22], [1.17, 1.42, -0.22], [1.17, -0.69, -0.22], [1.02, -0.8, -0.22]], 0.125);
    for (const y of [-0.63, -0.1, 0.5, 1.1, 1.4]) {
      ring(0.145, y, 1, 1.17, -0.22);
      ring(0.145, y + 0.035, 0, 1.17, -0.22);
    }
    // The hot-blast bustle pipe encircles the bosh and feeds eight tuyeres.
    const bustle = Array.from({ length: 65 }, (_, i) => [Math.cos(i / 64 * TAU) * 1.01, -0.58, Math.sin(i / 64 * TAU) * 1.01]);
    pipe(bustle, 0.052);
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) / 8 * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pipe([[c * 1.01, -0.58, s * 1.01], [c * 0.95, -0.8, s * 0.95], [c * 0.73, -0.86, s * 0.73]], 0.035, 1);
    }

    // Charging hopper and sloping skip hoist on the opposite side of the downcomer.
    lathe([[0.18, 1.37], [0.18, 1.46], [0.4, 1.58], [0.4, 1.64]], gap, (r, y, a, nr, ny) => {
      add(0, Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a) * nr, ny, Math.sin(a) * nr);
    });
    ring(0.4, 1.64, 1);
    for (const z of [-0.36, -0.08]) edge([-1.52, -1.25, z], [-0.37, 1.5, z]);
    for (let i = 0; i <= 32; i++) {
      const u = i / 32;
      const x = -1.52 + 1.15 * u;
      const y = -1.25 + 2.75 * u;
      edge([x, y, -0.36], [x, y, -0.08]);
    }
    box([0, 0, 0], [0.26, 0.2, 0.27], 1, 1);
    for (let x = -0.1; x <= 0.1; x += gap) {
      for (let z = -0.1; z <= 0.1; z += gap) add(1, x, 0.075 + random() * 0.05, z, 0, 1, 0, 1);
    }

    // A straight casting runner carries molten iron from the open hearth toward the viewer.
    for (const side of [-1, 1]) {
      edge([side * 0.1, -1.02, 0.71], [0.86 + side * 0.1, -1.23, 1.5], 1);
      edge([side * 0.1, -1.08, 0.71], [0.86 + side * 0.1, -1.29, 1.5]);
    }
    for (let i = 0; i < count(800); i++) {
      add(9, random(), (random() - 0.5) * 0.14, random(), 0.2 + random() * 0.16);
    }

    // White-hot tuyeres and a second, tall fire inside the hearth.
    for (let i = 0; i < count(1500); i++) {
      const r = 0.58 * Math.sqrt(random());
      const a = random() * TAU;
      const height = 0.1 + 0.3 * random() + 0.45 * random() * (1 - r / 0.58);
      add(2, Math.cos(a) * r, -1.17, Math.sin(a) * r, 0.5 + random() * 0.45, height);
    }
    for (let i = 0; i < count(1400); i++) {
      const r = 0.6 * Math.sqrt(random());
      const a = random() * TAU;
      const height = 0.45 + 0.55 * random() * (1 - r / 0.6);
      add(2, Math.cos(a) * r, -0.86, Math.sin(a) * r, 0.32 + random() * 0.3, height, 0, 1);
    }

    // Seven data streams, each a train of packets spiralling into the furnace.
    for (let stream = 0; stream < 7; stream++) {
      const radius = 3 + random() * 1.6;
      const angle = (stream / 7) * TAU + random() * 0.4;
      const height = -0.9 + random() * 2.6;
      const turns = 0.75 + random() * 0.5;
      const speed = 1 / (13 + random() * 6);
      const phase = random();
      for (let i = 0; i < count(560); i++) {
        const packet = Math.floor(random() * 30) / 30;
        const offset = phase + packet + (random() - 0.5) * 0.01;
        add(3, radius, angle, height, turns, speed, offset, stream % 3 === 1 ? 1 : 0);
      }
    }

    // The pill: a Fibonacci sphere of dots and two armillary rings.
    const sphere = count(1000);
    for (let i = 0; i < sphere; i++) {
      const y = 1 - (2 * (i + 0.5)) / sphere;
      const ring = Math.sqrt(1 - y * y);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      add(4, Math.cos(a) * ring, y, Math.sin(a) * ring, 0.3);
    }
    for (const [radius, tilt, speed, accent] of [
      [0.5, 1.15, 0.45, 1],
      [0.6, -0.85, -0.32, 2],
    ]) {
      const total = count(240);
      for (let i = 0; i < total; i++)
        add(4, (i / total) * TAU, 0, 0, radius, tilt, speed, accent);
    }

    // Refined model signals rising from the charging tower, with embers from the hearth.
    for (let i = 0; i < count(500); i++) add(5, 0, 0, 0, 0.35 + random() * 0.3);
    for (let i = 0; i < count(380); i++) {
      const a = random() * TAU;
      const r = 0.45 + random() * 0.5;
      const y = -1 + random() * 0.35;
      add(5, Math.cos(a) * r, y, Math.sin(a) * r, 0.1 + random() * 0.14, 1.4 + random() * 1.6, 0, 1);
    }

    const morphing = data.length / STRIDE;

    // A dot-matrix casting floor with concentric process rings beneath the steelwork.
    const grid = 0.17 / Math.sqrt(quality);
    const rows = Math.ceil(5 / (grid * 0.866));
    for (let row = -rows; row <= rows; row++) {
      for (let col = -rows; col <= rows; col++) {
        const x = (col + (row % 2) / 2) * grid;
        const z = row * grid * 0.866;
        if (Math.hypot(x, z) < 5) add(6, x, FLOOR, z);
      }
    }
    const circle = (radius, accent, speed) => {
      const total = Math.round((TAU * radius) / fine);
      for (let i = 0; i < total; i++) {
        const a = (i / total) * TAU;
        add(6, Math.cos(a) * radius, FLOOR, Math.sin(a) * radius, speed, 0, 0, accent);
      }
    };
    const segment = (r0, a0, r1, a1, accent, speed) => {
      const x0 = Math.cos(a0) * r0;
      const z0 = Math.sin(a0) * r0;
      const x1 = Math.cos(a1) * r1;
      const z1 = Math.sin(a1) * r1;
      const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / fine));
      for (let i = 0; i <= steps; i++)
        add(6, x0 + ((x1 - x0) * i) / steps, FLOOR, z0 + ((z1 - z0) * i) / steps, speed, 0, 0, accent);
    };
    circle(1.2, 1, 0.05);
    circle(1.32, 1, 0.05);
    circle(2.3, 2, -0.07);
    for (let k = 0; k < 72; k++)
      segment(k % 6 === 0 ? 1.95 : 2.12, (k * TAU) / 72, 2.22, (k * TAU) / 72, 2, -0.07);
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU;
      segment(1.34, a, 1.7, a, 1, 0.05);
      segment(1.7, a, 1.7, a + TAU / 36, 1, 0.05);
    }

    for (let i = 0; i < count(500); i++) {
      const r = 2.5 + random() * 3.5;
      const a = random() * TAU;
      add(7, Math.cos(a) * r, -1.2 + random() * 4.2, Math.sin(a) * r);
    }

    // Two continuous particle surfaces span the viewport, independently of the furnace scale.
    // Their open center leaves the title legible while connecting the outer instruments.
    const fieldColumns = Math.round(160 * Math.sqrt(quality));
    const fieldRows = Math.round(22 * Math.sqrt(quality));
    for (let band = 0; band < 2; band++) {
      for (let row = 0; row <= fieldRows; row++) {
        for (let col = 0; col <= fieldColumns; col++) {
          add(
            8,
            (col + (row % 2) * 0.5) / fieldColumns,
            row / fieldRows * 2 - 1,
            random(), 0, 0, 0, band,
          );
        }
      }
    }

    // Network targets: five layers along x, each node joined to four nearest nodes ahead.
    const nodes = [];
    [5, 8, 10, 8, 5].forEach((total, layer) => {
      const radius = [0.75, 1.1, 1.3, 1.1, 0.75][layer];
      for (let i = 0; i < total; i++) {
        const a = (i / total) * TAU + layer * 0.5;
        nodes.push({ layer, x: (layer - 2) * 1.25, y: Math.cos(a) * radius, z: Math.sin(a) * radius });
      }
    });
    const edges = [];
    nodes.forEach((a, i) => {
      nodes
        .map((b, j) => [(b.y - a.y) ** 2 + (b.z - a.z) ** 2, j, b.layer])
        .filter(([, , layer]) => layer === a.layer + 1)
        .sort((p, q) => p[0] - q[0])
        .slice(0, 4)
        .forEach(([, j]) => edges.push([i, j]));
    });
    const order = Array.from({ length: morphing }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((index, rank) => {
      const share = rank / morphing;
      const o = index * STRIDE;
      if (share < 0.35) {
        // Nodes: dense clusters.
        const node = nodes[rank % nodes.length];
        const r = 0.09 * Math.cbrt(random());
        const a = random() * TAU;
        const b = Math.acos(2 * random() - 1);
        data[o + 6] = node.x + r * Math.sin(b) * Math.cos(a);
        data[o + 7] = node.y + r * Math.cos(b);
        data[o + 8] = node.z + r * Math.sin(b) * Math.sin(a);
      } else if (share < 0.9) {
        // Edges: dots along the connection; meta.w carries edge id + position for signal pulses.
        const id = rank % edges.length;
        const a = nodes[edges[id][0]];
        const b = nodes[edges[id][1]];
        const t = random();
        data[o + 6] = a.x + (b.x - a.x) * t;
        data[o + 7] = a.y + (b.y - a.y) * t;
        data[o + 8] = a.z + (b.z - a.z) * t;
        data[o + 12] = id + t * 0.999;
      } else {
        // A loose halo of dust around the finished model.
        const r = 2.6 + random() * 1.4;
        const a = random() * TAU;
        const b = Math.acos(2 * random() - 1);
        data[o + 6] = r * Math.sin(b) * Math.cos(a);
        data[o + 7] = r * Math.cos(b) * 0.7;
        data[o + 8] = r * Math.sin(b) * Math.sin(a);
        data[o + 12] = -2;
      }
    });
    return new Float32Array(data);
  }

  /* ---------- Shaders ---------- */

  const POINT_VERTEX = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aAux;
attribute vec3 aTarget;
attribute vec4 aMeta;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec3 uFocus;
uniform float uUnit;
uniform float uYaw;
uniform float uPitch;
uniform float uTime;
uniform float uMorph;
uniform float uIntro;
uniform float uPortrait;
uniform float uPixel;
varying vec3 vColor;
varying float vAlpha;

const float TAU = 6.2831853;
const float PI = 3.1415927;
const float DISTANCE = ${DISTANCE.toFixed(1)};
const vec3 CYAN = vec3(0.48, 0.86, 0.9);
const vec3 TEAL = vec3(0.26, 0.52, 0.47);
const vec3 GOLD = vec3(1.0, 0.78, 0.46);
const vec3 FLAME = vec3(1.0, 0.6, 0.24);
const vec3 EMBER = vec3(0.86, 0.22, 0.07);
const vec3 PURPLE = vec3(0.78, 0.64, 1.0);
const vec3 WHITE = vec3(1.0, 0.96, 0.88);

float hash(float n) {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}
vec3 rotY(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
vec3 rotX(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

void main() {
  float kind = aMeta.x;
  float seed = aMeta.y;
  float accent = aMeta.z;
  float t = uTime;
  vec3 scatter = vec3(hash(seed * 13.0), hash(seed * 29.0), hash(seed * 47.0)) - 0.5;
  vec3 p = aPos;
  vec3 normal = vec3(0.0, 0.0, 1.0);
  vec3 color = CYAN;
  float alpha = 0.4;
  float size = 0.022;
  float lit = 0.0;

  if (kind < 1.5) {
    // Stationary steelwork and a skip car carrying glowing feed up the inclined tracks.
    normal = aAux;
    if (kind > 0.5) {
      float cycle = 0.5 - 0.5 * cos(t * 0.55);
      float lift = smoothstep(0.04, 0.96, cycle);
      p = aPos + mix(vec3(-1.52, -1.2, -0.22), vec3(-0.37, 1.55, -0.22), lift);
    }
    lit = 1.0;
    float warm = 1.0 - smoothstep(-0.95, 0.15, p.y);
    float flicker = 0.85 + 0.15 * sin(t * 9.0 + p.x * 6.0) * sin(t * 5.3 + p.z * 5.0);
    color = mix(CYAN, FLAME, warm * 0.8 * flicker);
    alpha = 0.36;
    if (accent > 0.5) {
      color = GOLD;
      alpha = 0.7;
      size = 0.025;
    }
    float scan = p.y - mix(-1.45, 1.8, fract(t / 6.5));
    scan = exp(-scan * scan * 256.0);
    color = mix(color, WHITE, scan * 0.6);
    alpha += scan * 0.8;
  } else if (kind < 2.5) {
    // Fire: rises, narrows and cools from white to deep ember.
    float life = fract(t * aAux.x + seed * 13.0);
    vec2 sway = vec2(sin(t * 3.1 + seed * 40.0 + life * 5.0), cos(t * 2.6 + seed * 31.0 + life * 4.0)) * 0.07 * life;
    float shrink = 1.0 - life * 0.75;
    p = vec3(aPos.x * shrink + sway.x, aPos.y + life * aAux.y, aPos.z * shrink + sway.y);
    color = life < 0.3 ? mix(WHITE, FLAME, life / 0.3) : mix(FLAME, EMBER, (life - 0.3) / 0.7);
    alpha = smoothstep(0.0, 0.08, life) * pow(1.0 - life, 1.3) * (accent > 0.5 ? 0.55 : 0.85);
    size = mix(0.06, 0.018, life);
  } else if (kind < 3.5) {
    // Data packets spiral into the charging hopper at the top of the shaft.
    float u = fract(t * aAux.y + aAux.z);
    float radius = 0.16 + (aPos.x - 0.16) * pow(1.0 - u, 1.5);
    float angle = aPos.y + aAux.x * TAU * pow(u, 1.6);
    vec2 lane = (vec2(hash(seed * 91.0), hash(seed * 57.0)) - 0.5) * (0.03 + radius * 0.025);
    p = vec3(cos(angle) * radius, mix(aPos.z, 1.64, smoothstep(0.0, 0.95, u)) + lane.y, sin(angle) * radius);
    p += vec3(-sin(angle), 0.0, cos(angle)) * lane.x;
    float bit = step(0.86, hash(seed * 17.0));
    color = mix(accent > 0.5 ? PURPLE : CYAN, WHITE, bit * 0.55);
    alpha = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.88, 1.0, u)) * (0.5 + bit * 0.5);
    size = 0.022 + bit * 0.012;
  } else if (kind < 4.5) {
    // The pill: a breathing golden sphere with two armillary rings.
    vec3 center = vec3(${PILL_X}, ${PILL_HEIGHT} + sin(t * 0.9) * 0.05, 0.0);
    if (accent < 0.5) {
      vec3 dir = rotY(aPos, t * 0.35);
      float band = 0.5 + 0.5 * sin(dir.y * 16.0 - t * 2.4);
      p = center + dir * aAux.x * (1.0 + 0.025 * sin(t * 2.2));
      normal = dir;
      lit = 0.6;
      color = mix(GOLD, WHITE, band * 0.7);
      alpha = 0.32 + band * 0.4;
    } else {
      float angle = aPos.x + t * aAux.z;
      p = center + rotY(rotX(vec3(cos(angle), 0.0, sin(angle)) * aAux.x, aAux.y), t * 0.25);
      float head = pow(fract(aPos.x / TAU - t * 0.18), 6.0);
      color = mix(accent < 1.5 ? GOLD : CYAN, WHITE, head * 0.5);
      alpha = 0.2 + head * 0.9;
      size = 0.02 + head * 0.012;
    }
  } else if (kind < 5.5) {
    float life = fract(t * aAux.x + seed * 9.0);
    if (accent < 0.5) {
      // Model signals climbing from the charging tower to the suspended core.
      float angle = seed * TAU + life * 9.0;
      float radius = 0.07 + 0.1 * sin(life * PI);
      p = vec3(cos(angle) * radius + ${PILL_X} * life, 1.67 + life * ${(PILL_HEIGHT - 1.85).toFixed(2)}, sin(angle) * radius);
      color = mix(GOLD, WHITE, life);
      alpha = sin(life * PI) * 0.6;
      size = 0.022;
    } else {
      // Embers thrown up by the fire.
      vec3 spread = normalize(vec3(aPos.x, 0.0, aPos.z)) * 0.5;
      vec3 sway = vec3(sin(t * 2.0 + seed * 30.0), 0.0, cos(t * 1.7 + seed * 20.0)) * 0.06;
      p = aPos + (spread + sway + vec3(0.0, aAux.y, 0.0)) * life;
      color = mix(FLAME, EMBER, life);
      alpha = (1.0 - life) * smoothstep(0.0, 0.1, life) * (0.5 + 0.5 * sin(t * 12.0 + seed * 60.0));
      size = 0.02;
    }
  } else if (kind < 6.5) {
    // Floor: a ripple crosses the casting floor and rotating process markings.
    p = rotY(aPos, t * aAux.x);
    float r = length(aPos.xz);
    if (accent < 0.5) {
      float wave = r - fract(t * 0.2) * 5.5;
      wave = exp(-wave * wave * 5.8);
      color = mix(TEAL, CYAN, wave);
      alpha = (0.14 + wave * 0.45) * (1.0 - smoothstep(2.0, 5.0, r));
      size = 0.02;
    } else {
      color = accent < 1.5 ? GOLD : CYAN;
      alpha = 0.42 + 0.2 * sin(t * 1.5 + r * 3.0);
      size = 0.021;
    }
    alpha *= 1.0 - uMorph;
  } else if (kind < 7.5) {
    // Dust drifting through the room.
    p = aPos + vec3(sin(t * 0.13 + seed * 20.0), sin(t * 0.17 + seed * 13.0) * 0.5, cos(t * 0.11 + seed * 17.0)) * 0.25;
    color = mix(TEAL, CYAN, hash(seed * 3.0));
    alpha = 0.16 * (0.6 + 0.4 * sin(t * 1.4 + seed * 50.0));
    size = 0.018;
  } else if (kind < 8.5) {
    // Panoramic data field: a travelling crest across layered rows of points.
    float crest = pow(0.5 + 0.5 * sin(aPos.x * 14.0 - t * 0.7 + aPos.y * 1.8), 8.0);
    color = mix(TEAL, accent < 0.5 ? CYAN : GOLD, 0.35 + crest * 0.5);
    alpha = (0.22 + crest * 0.42) * pow(1.0 - abs(aPos.y), 0.65);
    alpha *= 1.0 - smoothstep(0.0, 1.0, uMorph) * 0.8;
    size = 1.5 + crest * 0.9;
  } else {
    // Continuous molten iron runs downhill, with ripples travelling toward the runner's lip.
    float flow = fract(aPos.x + t * aAux.x);
    p = mix(vec3(0.0, -1.035, 0.72), vec3(0.86, -1.245, 1.5), flow);
    p.x += aPos.y;
    p.y += sin(flow * 26.0 - t * 5.0 + seed * 20.0) * 0.016;
    p.z += (aPos.z - 0.5) * 0.06;
    color = mix(WHITE, FLAME, 0.35 + flow * 0.6);
    alpha = 0.45 + 0.2 * sin(t * 8.0 + seed * 25.0);
    size = 0.024 + 0.008 * hash(seed * 31.0);
  }

  if (kind < 5.5 || kind > 8.5) {
    // Scroll refines the furnace into a network: each dot bursts out, then settles.
    float m = clamp(uMorph * 1.7 - seed * 0.7, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);
    if (m > 0.0) {
      vec3 q = rotX(aTarget, t * 0.12);
      if (uPortrait > 0.5) q = vec3(q.y, q.x, q.z) * 0.82;
      p = mix(p, q, m) + scatter * 2.6 * sin(m * PI);
      float layer = clamp(aTarget.x / 5.0 + 0.5, 0.0, 1.0);
      vec3 net = layer < 0.5 ? mix(CYAN, PURPLE, layer * 2.0) : mix(PURPLE, GOLD, layer * 2.0 - 1.0);
      float netAlpha = 0.14;
      float netSize = 0.026;
      if (aMeta.w > -0.5) {
        float d = fract(aMeta.w) - fract(t * 0.32 + hash(floor(aMeta.w) + 0.5));
        float pulse = exp(-d * d * 260.0);
        net = mix(net, WHITE, pulse * 0.7);
        netAlpha = 0.18 + pulse * 0.9;
        netSize = 0.018 + pulse * 0.014;
      } else if (aMeta.w < -1.5) {
        netAlpha = 0.12;
        netSize = 0.016;
      }
      color = mix(color, net, m);
      alpha = mix(alpha, netAlpha, m);
      size = mix(size, netSize, m);
      lit *= 1.0 - m;
    }
  }

  // Entrance: every dot flies in from a scattered cloud.
  float intro = clamp(uIntro * 1.8 - seed * 0.8, 0.0, 1.0);
  intro = intro * intro * (3.0 - 2.0 * intro);
  p += scatter * 7.0 * (1.0 - intro);
  alpha *= intro;

  vec3 v = rotX(rotY(p - uFocus, uYaw), uPitch);
  float persp = DISTANCE / max(0.6, DISTANCE - v.z);
  vec2 screen = uCenter + vec2(v.x, -v.y) * persp * uUnit;
  if (kind > 7.5 && kind < 8.5) {
    float x = fract(aPos.x + t * (accent < 0.5 ? 0.004 : -0.003));
    float ridge = accent < 0.5
      ? 0.17 + 0.08 * sin(x * 5.0 - t * 0.08)
      : 0.74 + 0.09 * sin(x * 4.5 + 0.5 + t * 0.06);
    float spread = 0.05 + 0.035 * sin(x * PI + 0.4);
    float wave = sin(x * 12.0 + aPos.y * 2.0 - t * 0.22) * 0.016;
    screen = vec2(x, ridge + aPos.y * spread + wave) * uRes;
    screen += vec2(sin(seed * 30.0), cos(seed * 41.0)) * uPixel * 0.35;
    alpha *= smoothstep(0.0, 0.04, x) * (1.0 - smoothstep(0.96, 1.0, x));
  }
  gl_Position = vec4(screen.x / uRes.x * 2.0 - 1.0, 1.0 - screen.y / uRes.y * 2.0, 0.0, 1.0);
  if (lit > 0.0) {
    // Hologram rim light: edges glow, the far side fades.
    vec3 n = rotX(rotY(normal, uYaw), uPitch);
    float rim = 1.0 - abs(n.z);
    float shade = (0.4 + 0.9 * rim * rim) * (n.z < 0.0 ? 0.5 : 1.0);
    alpha *= mix(1.0, shade, lit);
  }
  alpha *= clamp(1.0 + (persp - 1.0) * 2.2, 0.35, 1.5);
  float pixels = kind > 7.5 && kind < 8.5 ? size * uPixel : size * persp * uUnit;
  float minimum = 1.4 * uPixel;
  if (pixels < minimum) {
    alpha *= pixels / minimum;
    pixels = minimum;
  }
  gl_PointSize = pixels;
  vColor = color;
  vAlpha = alpha;
}`;

  const POINT_FRAGMENT = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = ((1.0 - smoothstep(0.1, 0.6, d)) * 0.8 + (1.0 - d) * 0.25) * vAlpha;
  gl_FragColor = vec4(vColor * a, 1.0);
}`;

  const GLOW_VERTEX = `
attribute vec2 aCorner;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uRadius;
varying vec2 vUv;
void main() {
  vUv = aCorner;
  vec2 screen = uCenter + aCorner * uRadius;
  gl_Position = vec4(screen.x / uRes.x * 2.0 - 1.0, 1.0 - screen.y / uRes.y * 2.0, 0.0, 1.0);
}`;

  const GLOW_FRAGMENT = `
precision mediump float;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float d = dot(vUv, vUv);
  gl_FragColor = vec4(uColor * exp(-d * 4.0) * max(0.0, 1.0 - d), 1.0);
}`;

  /* ---------- WebGL ---------- */

  let gl = null;
  let points = null;
  let glow = null;
  let pointBuffer = null;
  let quadBuffer = null;
  let pointCount = 0;
  let quality = 0;

  function link(vertex, fragment, attributes) {
    const program = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    attributes.forEach((name, index) =>
      gl.bindAttribLocation(program, index, name),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program));
    const uniforms = {};
    const total = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < total; i++) {
      const { name } = gl.getActiveUniform(program, i);
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }

  function setup() {
    try {
      gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });
      if (!gl) return false;
      points = link(POINT_VERTEX, POINT_FRAGMENT, [
        "aPos",
        "aAux",
        "aTarget",
        "aMeta",
      ]);
      glow = link(GLOW_VERTEX, GLOW_FRAGMENT, ["aCorner"]);
      pointBuffer = gl.createBuffer();
      quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      quality = 0;
      return true;
    } catch (error) {
      console.warn("AIchemy 3D furnace is unavailable:", error);
      gl = null;
      return false;
    }
  }

  /* ---------- Frame state ---------- */

  let W = 1;
  let H = 1;
  let dpr = 1;
  let unit = 100;
  let portrait = false;
  let paused = furnace.paused;
  let visible = !document.hidden;
  let raf = 0;
  let last = 0;
  let lastPaint = 0;
  let clock = furnace.state.time * 1000;
  let intro = 1;
  let morph = 0;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

  function morphTarget() {
    if (reducedMotion.matches) return 0;
    return Math.max(0, Math.min(1, window.scrollY / (window.innerHeight * 0.9)));
  }

  function camera(time) {
    const e = morph * morph * (3 - 2 * morph);
    return {
      e,
      yaw: Math.sin(time * 0.16) * 0.45 + pointer.x,
      pitch: 0.32 - e * 0.2 + pointer.y,
      cx: W * (0.5 + (portrait ? 0.05 : 0.16) * (1 - e)),
      cy: H * (0.59 - e * 0.12),
      focus: [0, -0.03 * (1 - e), 0],
    };
  }

  // Mirrors the vertex shader, for the glows and the callouts.
  function project(x, y, z, view) {
    x -= view.focus[0];
    y -= view.focus[1];
    z -= view.focus[2];
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    const rx = cy * x + sy * z;
    const rz = cy * z - sy * x;
    const cp = Math.cos(view.pitch);
    const sp = Math.sin(view.pitch);
    const persp = DISTANCE / Math.max(0.6, DISTANCE - (sp * y + cp * rz));
    return [
      view.cx + rx * persp * unit,
      view.cy - (cp * y - sp * rz) * persp * unit,
      persp,
    ];
  }

  function resize() {
    if (mode !== "3d" || !gl) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    W = Math.round(width * dpr);
    H = Math.round(height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    portrait = height > width * 1.05;
    // The phone-only CSS scale gives the furnace breathing room; desktop projection stays intact.
    const furnaceScale =
      parseFloat(getComputedStyle(root).getPropertyValue("--furnace-scale")) || 1;
    unit =
      Math.min(H * 0.172, W * (portrait ? 0.4 : 0.3)) *
      (portrait ? 1.02 : 1.12) * furnaceScale;
    const next = width * height < 600000 ? 0.6 : 1;
    if (next !== quality) {
      quality = next;
      const data = build(quality);
      pointCount = data.length / STRIDE;
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }
    draw();
  }

  function draw() {
    const time = clock / 1000;
    const view = camera(time);
    const shown = intro * intro * (3 - 2 * intro);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.024, 0.043, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Soft light behind the dots: fire, chamber, pill and the floor array.
    gl.useProgram(glow.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
    gl.uniform2f(glow.uniforms.uRes, W, H);
    // Broad atmospheric light fills the room without flattening the bright furnace.
    const atmosphere = (0.3 + shown * 0.7) * (1 - view.e * 0.8);
    [
      [0.13, 0.27, 0.55, 0.45, [0.12, 0.42, 0.32]],
      [0.78, 0.65, 0.48, 0.55, [0.4, 0.25, 0.1]],
    ].forEach(([x, y, rx, ry, color]) => {
      gl.uniform2f(glow.uniforms.uCenter, W * x, H * y);
      gl.uniform2f(glow.uniforms.uRadius, W * rx, H * ry);
      gl.uniform3f(
        glow.uniforms.uColor,
        color[0] * 0.18 * atmosphere,
        color[1] * 0.18 * atmosphere,
        color[2] * 0.18 * atmosphere,
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
    const flicker =
      0.85 + Math.sin(time * 7.3) * 0.08 + Math.sin(time * 13.1) * 0.05;
    const pulse = 0.8 + Math.sin(time * 1.8) * 0.2;
    const pillY = PILL_HEIGHT + Math.sin(time * 0.9) * 0.05;
    const furnaceLight = (1 - view.e) * shown;
    [
      [0, -1.05, 0, 1.7, 0.55, [1, 0.42, 0.14], 0.3 * flicker * furnaceLight],
      [0, -0.55, 0, 0.95, 1, [1, 0.5, 0.18], 0.2 * flicker * furnaceLight],
      [0.6, -1.22, 1.3, 0.8, 0.3, [1, 0.3, 0.06], 0.16 * flicker * furnaceLight],
      [PILL_X, pillY, 0, 1.5, 1, [1, 0.72, 0.36], 0.26 * pulse * furnaceLight],
      [PILL_X, pillY, 0, 0.45, 1, [1, 0.94, 0.8], 0.6 * pulse * furnaceLight],
      [0, FLOOR, 0, 2.6, 0.3, [0.3, 0.75, 0.7], 0.1 * furnaceLight],
      [0, 0, 0, 3.2, 0.8, [0.55, 0.42, 0.9], 0.14 * view.e],
    ].forEach(([x, y, z, radius, squash, color, strength]) => {
      if (strength <= 0) return;
      const [sx, sy, persp] = project(x, y, z, view);
      const size = radius * persp * unit;
      gl.uniform2f(glow.uniforms.uCenter, sx, sy);
      gl.uniform2f(glow.uniforms.uRadius, size, size * squash);
      gl.uniform3f(
        glow.uniforms.uColor,
        color[0] * strength,
        color[1] * strength,
        color[2] * strength,
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });

    gl.useProgram(points.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
    [
      [0, 3, 0],
      [1, 3, 3],
      [2, 3, 6],
      [3, 4, 9],
    ].forEach(([index, size, offset]) => {
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
    });
    const u = points.uniforms;
    gl.uniform2f(u.uRes, W, H);
    gl.uniform2f(u.uCenter, view.cx, view.cy);
    gl.uniform3f(u.uFocus, view.focus[0], view.focus[1], view.focus[2]);
    gl.uniform1f(u.uUnit, unit);
    gl.uniform1f(u.uYaw, view.yaw);
    gl.uniform1f(u.uPitch, view.pitch);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uMorph, morph);
    gl.uniform1f(u.uIntro, intro);
    gl.uniform1f(u.uPortrait, portrait ? 1 : 0);
    gl.uniform1f(u.uPixel, dpr);
    gl.drawArrays(gl.POINTS, 0, pointCount);

    placeTags(view, time, shown);
    // The instrument windows in app.js follow whichever hero is drawing.
    window.dispatchEvent(
      new CustomEvent("aichemy-frame", {
        detail: { time, progress: (time / 28) % 1 },
      }),
    );
  }

  // HTML callouts pinned to the furnace: 料, 火 and 丹.
  function placeTags(view, time, shown) {
    const opacity = Math.max(0, shown * 2 - 1) * Math.max(0, 1 - view.e * 3);
    tagLayer.style.opacity = opacity.toFixed(3);
    if (!opacity) return;
    tags.forEach((tag) => {
      const name = tag.dataset.anchor;
      const [x, y, z] = ANCHORS[name];
      const bob = name === "pill" ? Math.sin(time * 0.9) * 0.05 : 0;
      const [sx, sy] = project(x, y + bob, z, view);
      tag.style.transform = `translate(${(sx / dpr).toFixed(1)}px, ${(sy / dpr).toFixed(1)}px)`;
    });
  }

  function frame(now) {
    raf = 0;
    const delta = last ? Math.min(now - last, 100) : 0;
    last = now;
    clock += delta;
    intro = Math.min(1, intro + delta / 2600);
    const ease = Math.min(1, delta / 220);
    morph += (morphTarget() - morph) * ease;
    pointer.x += (pointer.targetX - pointer.x) * ease * 0.5;
    pointer.y += (pointer.targetY - pointer.y) * ease * 0.5;
    // Behind the content sections the furnace is a dim backdrop; 30fps is plenty there.
    if (window.scrollY < window.innerHeight || now - lastPaint >= 1000 / 30) {
      draw();
      lastPaint = now;
    }
    schedule();
  }
  function schedule() {
    if (!raf && gl && mode === "3d" && visible && !paused)
      raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }

  function start() {
    // Both heroes share one simulation clock, so the instruments never jump.
    clock = furnace.state.time * 1000;
    furnace.setSuspended(true);
    intro = paused ? 1 : 0;
    morph = morphTarget();
    resize();
    schedule();
  }

  function unavailable() {
    mode = "pixel";
    root.classList.remove("furnace-3d");
    document.querySelector(".mode-switch").hidden = true;
  }

  function setMode(next) {
    if (!MODES.includes(next) || next === mode) return;
    if (next === "3d" && !gl && !setup()) return unavailable();
    mode = next;
    root.classList.toggle("furnace-3d", mode === "3d");
    if (mode === "3d") start();
    else {
      stop();
      furnace.setSuspended(false, clock / 1000);
    }
    try {
      localStorage.setItem("aichemy-scene", mode);
    } catch {
      /* Private browsing may refuse storage; the switch still applies to this visit. */
    }
    document.getElementById("scene-status").textContent =
      mode === "3d" ? "已切换为 3D 点阵工业高炉" : "已切换为像素丹炉";
    window.dispatchEvent(new CustomEvent("aichemy-scene", { detail: { mode } }));
  }

  window.AIchemyScene = {
    get mode() {
      return mode;
    },
    setMode,
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType !== "mouse" || reducedMotion.matches) return;
      pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 0.5;
      pointer.targetY = (event.clientY / window.innerHeight - 0.5) * 0.16;
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    pointer.targetX = 0;
    pointer.targetY = 0;
  });
  window.addEventListener(
    "scroll",
    () => {
      // While paused the loop is stopped, but scrolling still refines the furnace.
      if (!paused || mode !== "3d" || !gl) return;
      morph = morphTarget();
      draw();
    },
    { passive: true },
  );
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) schedule();
    else stop();
  });
  // furnace.js owns the pause state: the button, the space key and reduced motion.
  window.addEventListener("aichemy-state", (event) => {
    paused = event.detail.paused;
    if (paused) {
      stop();
      intro = 1;
      if (mode === "3d" && gl) draw();
    } else schedule();
  });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    stop();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (mode === "3d" && setup()) {
      resize();
      schedule();
    }
  });

  if (mode === "3d") {
    if (setup()) start();
    else unavailable();
  }
})();
