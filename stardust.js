/* 点阵星核 · 3D dot-matrix hero, the alternative look beside furnace.js.
   Every point is generated in code: no assets, no libraries. */
(() => {
  "use strict";
  const root = document.documentElement;
  const stage = document.getElementById("lab-backdrop");
  const furnace = window.AIchemyFurnace;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // app.js draws the pixel floor still into this same canvas with transparency,
  // so the context keeps the default alpha channel.
  const ctx = stage.getContext("2d");
  const MODES = ["pixel", "stardust"];
  // The inline head script applies the saved choice before first paint.
  let mode = root.classList.contains("stardust-mode") ? "stardust" : "pixel";

  // A fixed seed keeps the lattice identical on every load.
  function hash(n) {
    const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  }
  function blend(a, b, k) {
    return [
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k,
    ];
  }

  // Groups: 0 dust, 1 shell lattice, 2 orbit streams, 3 core halo.
  // Cool tones at rest; scrolling heats the field toward furnace gold.
  const coolTones = [
    [150, 190, 214],
    [110, 214, 248],
    [138, 244, 208],
    [255, 246, 226],
  ];
  const warmTones = [
    [206, 164, 122],
    [255, 186, 104],
    [255, 214, 150],
    [255, 250, 236],
  ];
  let heat = 0;
  const inkCache = new Map();
  // Brightness is quantized to 24 tiers so a frame builds at most 96 colors.
  function ink(group, tier) {
    const key = group * 32 + tier;
    let colour = inkCache.get(key);
    if (!colour) {
      const k = tier / 23;
      const base = blend(coolTones[group], warmTones[group], heat);
      const lit = blend(base, [255, 255, 255], k * k * 0.35);
      colour = `rgba(${lit[0] | 0},${lit[1] | 0},${lit[2] | 0},${(0.12 + k * 0.88).toFixed(3)})`;
      inkCache.set(key, colour);
    }
    return colour;
  }
  function lineInk(alpha) {
    const tone = blend(coolTones[1], warmTones[1], heat);
    return `rgba(${tone[0] | 0},${tone[1] | 0},${tone[2] | 0},${alpha.toFixed(3)})`;
  }

  /* Icosahedron frame. The lattice shell shares its radius. */
  const SHELL = 1.28;
  const PHI = (1 + Math.sqrt(5)) / 2;
  const icoVertices = [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ].map(([x, y, z]) => {
    const length = Math.hypot(x, y, z);
    return [(x / length) * SHELL, (y / length) * SHELL, (z / length) * SHELL];
  });
  const icoEdges = [];
  for (let i = 0; i < icoVertices.length; i++) {
    for (let j = i + 1; j < icoVertices.length; j++) {
      const gap = Math.hypot(
        icoVertices[i][0] - icoVertices[j][0],
        icoVertices[i][1] - icoVertices[j][1],
        icoVertices[i][2] - icoVertices[j][2],
      );
      if (gap < 2.6) icoEdges.push([i, j]);
    }
  }

  const dust = [];
  const lattice = [];
  const gridLinks = [];
  const streams = [];
  const halo = [];
  const groups = [dust, lattice, streams, halo];

  function buildField(quality) {
    groups.forEach((list) => (list.length = 0));
    gridLinks.length = 0;
    const count = (base) => Math.round(base * quality);

    for (let i = 0; i < count(150); i++) {
      dust.push({
        radius: Math.cbrt(hash(i * 3.13 + 0.4)) * 4.4,
        theta: Math.acos(1 - 2 * hash(i * 1.77 + 9.1)),
        phi: hash(i * 2.31 + 5.7) * Math.PI * 2,
        spin: 0.04 + hash(i * 5.9 + 1.3) * 0.1,
        wobble: 0.1 + hash(i * 4.9 + 2.1) * 0.2,
        alpha: 0.16 + hash(i * 7.3 + 2.9) * 0.28,
        phase: hash(i * 9.7 + 3.3) * Math.PI * 2,
        big: hash(i * 6.7 + 4.4) > 0.92,
      });
    }

    // Fibonacci sphere: evenly spread nodes, each linked to its three nearest neighbours.
    const shellCount = count(360);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < shellCount; i++) {
      lattice.push({
        radius: SHELL * (0.98 + hash(i * 6.1 + 2.2) * 0.04),
        theta: Math.acos(1 - (2 * (i + 0.5)) / shellCount),
        phi: (i * golden) % (Math.PI * 2),
        spin: 0.3 + hash(i * 4.4 + 1.9) * 0.5,
        wobble: 0.006 + hash(i * 3.7 + 8.4) * 0.016,
        alpha: 0.26 + hash(i * 2.9 + 1.8) * 0.44,
        phase: hash(i * 11.3 + 0.2) * Math.PI * 2,
        big: hash(i * 9.3 + 6.6) > 0.86,
      });
    }
    const unitPoints = lattice.map(({ theta, phi }) => [
      Math.sin(theta) * Math.cos(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.sin(phi),
    ]);
    const linked = new Set();
    unitPoints.forEach((a, i) => {
      unitPoints
        .map((b, j) => [(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2, j])
        .sort((p, q) => p[0] - q[0])
        .slice(1, 4)
        .forEach(([, j]) => {
          const key = i < j ? i * 4096 + j : j * 4096 + i;
          if (linked.has(key)) return;
          linked.add(key);
          gridLinks.push([i, j]);
        });
    });

    // Five tilted orbits whose points also breathe in and out along the radius.
    for (let i = 0; i < count(240); i++) {
      const ring = i % 5;
      streams.push({
        radius: 1.5 + ring * 0.34 + hash(i * 7.7 + 5.5) * 0.2,
        tilt: 0.1 + ring * 0.3,
        roll: ring * 1.15 + hash(i * 3.3 + 2.4) * 0.3,
        phi: hash(i * 5.1 + 9.9) * Math.PI * 2,
        spin: (ring % 2 ? 1 : -1) * (0.14 + hash(i * 8.8 + 1.1) * 0.16),
        swell: 0.1 + hash(i * 2.6 + 5.2) * 0.26,
        alpha: 0.46 + hash(i * 4.7 + 3.6) * 0.5,
        phase: hash(i * 13.1 + 2.6) * Math.PI * 2,
        big: hash(i * 10.7 + 7.3) > 0.84,
      });
    }

    for (let i = 0; i < count(420); i++) {
      halo.push({
        radius: 0.05 + Math.pow(hash(i * 9.1 + 3.5), 2.6) * 0.52,
        theta: Math.acos(1 - 2 * hash(i * 21.3 + 1.4)),
        phi: hash(i * 17.9 + 6.8) * Math.PI * 2,
        spin: 0.1 + hash(i * 5.5 + 8.2) * 0.5,
        wobble: 0.05 + hash(i * 3.1 + 7.7) * 0.12,
        alpha: 0.26 + hash(i * 2.3 + 4.9) * 0.46,
        phase: hash(i * 15.7 + 5.1) * Math.PI * 2,
        big: hash(i * 12.5 + 3.1) > 0.78,
      });
    }
  }

  let W = 1,
    H = 1,
    cx = 0,
    cy = 0,
    unit = 40,
    quality = 0;
  let paused = furnace ? furnace.paused : reducedMotion.matches;
  let visible = !document.hidden;
  let raf = 0,
    lastTime = 0,
    lastPaint = -Infinity,
    clock = furnace ? furnace.state.time * 1000 : 0;
  let yaw = 0.42,
    pitch = -0.22,
    pointerX = 0,
    pointerY = 0,
    turn = 0,
    scrollEase = 0;

  // Projection results for the current group, reused by the grid pass.
  const px = new Float32Array(1024);
  const py = new Float32Array(1024);
  const pLevel = new Float32Array(1024);
  const screen = [0, 0, 0, 0];
  let cosYaw = 1,
    sinYaw = 0,
    cosPitch = 1,
    sinPitch = 0;

  function project(x, y, z) {
    const rx = x * cosYaw + z * sinYaw;
    const rz = -x * sinYaw + z * cosYaw;
    const ry = y * cosPitch - rz * sinPitch;
    const depth = y * sinPitch + rz * cosPitch;
    const distance = depth + 3.9;
    // Points that swing in front of the camera are culled rather than flung across the screen.
    const perspective = distance > 0.8 ? 2.55 / distance : 0;
    screen[0] = cx + rx * perspective * unit;
    screen[1] = cy + ry * perspective * unit;
    screen[2] = perspective;
    screen[3] = depth;
  }

  function resize() {
    if (mode !== "stardust") return;
    const bounds = stage.getBoundingClientRect();
    // The field is grainy by design; capping the density saves most of the fill cost.
    const density = Math.min(window.devicePixelRatio || 1, 1.25);
    W = Math.max(320, Math.round(bounds.width * density));
    H = Math.max(240, Math.round(bounds.height * density));
    stage.width = W;
    stage.height = H;
    const portrait = bounds.height > bounds.width * 1.08;
    unit = portrait ? Math.min(W * 0.4, H * 0.3) : Math.min(W * 0.26, H * 0.36);
    cx = W / 2;
    cy = H * (portrait ? 0.48 : 0.5);
    const pixels = W * H;
    const nextQuality = pixels > 2400000 ? 0.7 : pixels > 1300000 ? 0.85 : 1;
    if (nextQuality !== quality) {
      quality = nextQuality;
      buildField(quality);
    }
    render(clock / 1000);
  }

  function drawBackdropStars(t) {
    // Distant stars stay fixed to the screen, so the field reads as moving through space.
    const total = Math.round(110 * quality);
    for (let i = 0; i < total; i++) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 2.1);
      ctx.fillStyle = `rgba(146,190,210,${(0.06 + hash(i * 2.7 + 0.8) * 0.16 * twinkle).toFixed(3)})`;
      ctx.fillRect((hash(i * 4.9 + 1.2) * W) | 0, (hash(i * 7.1 + 3.7) * H) | 0, 1, 1);
    }
  }

  function drawCore(t) {
    const pulse = 0.72 + Math.sin(t * 0.9) * 0.14 + Math.sin(t * 2.4) * 0.05;
    const radius = unit * (0.34 + pulse * 0.24) * (1 - scrollEase * 0.2);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    glow.addColorStop(0, `rgba(255,253,244,${(0.85 * pulse).toFixed(3)})`);
    glow.addColorStop(0.16, `rgba(255,238,200,${(0.5 * pulse).toFixed(3)})`);
    glow.addColorStop(0.4, `rgba(255,208,140,${(0.22 * pulse).toFixed(3)})`);
    glow.addColorStop(0.7, `rgba(104,206,240,${(0.09 * pulse).toFixed(3)})`);
    glow.addColorStop(1, "rgba(36,116,158,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    // A thin ring echoes the shell and breathes with the core.
    ctx.strokeStyle = `rgba(180,238,255,${(0.18 * pulse).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, unit * 0.01);
    ctx.beginPath();
    ctx.arc(cx, cy, unit * (0.2 + pulse * 0.04), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGrid() {
    // Links are batched into five brightness buckets: five strokes instead of hundreds.
    ctx.lineWidth = 1;
    for (let bucket = 0; bucket < 5; bucket++) {
      ctx.beginPath();
      let used = false;
      for (let i = 0; i < gridLinks.length; i++) {
        const [a, b] = gridLinks[i];
        if (!pLevel[a] || !pLevel[b]) continue;
        const level = (pLevel[a] + pLevel[b]) * 0.5;
        if (level < 0.14 || Math.min(4, (level * 5) | 0) !== bucket) continue;
        ctx.moveTo(px[a], py[a]);
        ctx.lineTo(px[b], py[b]);
        used = true;
      }
      if (used) {
        ctx.strokeStyle = lineInk(0.035 + bucket * 0.04);
        ctx.stroke();
      }
    }
  }

  function drawSkeleton(t) {
    // The icosahedron shows only on its near side and tightens as the page scrolls.
    const scale = (1 - scrollEase * 0.3) * (1 + Math.sin(t * 0.42) * 0.02);
    const flare = 0.62 + Math.sin(t * 1.1) * 0.28;
    ctx.lineWidth = Math.max(1, unit * 0.012);
    for (const [i, j] of icoEdges) {
      const a = icoVertices[i];
      const b = icoVertices[j];
      project(a[0] * scale, a[1] * scale, a[2] * scale);
      const ax = screen[0],
        ay = screen[1],
        ad = screen[3];
      project(b[0] * scale, b[1] * scale, b[2] * scale);
      const alpha =
        Math.min(0.22, Math.max(0, ((ad + screen[3]) * 0.5 + 0.2) * 0.3)) *
        (0.7 + flare * 0.5);
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = lineInk(alpha);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(screen[0], screen[1]);
      ctx.stroke();
    }
  }

  function drawFields(t) {
    const sweep = ((t * 0.26) % 2.6) - 1.3; // a scan plane passing front to back
    const shellTurn = t * 0.05; // the shell turns rigidly so its links never tear
    // Scrolling pulls the shell in and throws the orbits outward.
    const spread = [1 + scrollEase * 0.3, 1 - scrollEase * 0.2, 1 + scrollEase * 0.5, 1];
    for (let g = 0; g < groups.length; g++) {
      const list = groups[g];
      for (let i = 0; i < list.length; i++) {
        const point = list[i];
        const spin = point.phase + t * point.spin;
        if (g === 2) {
          const radius = point.radius * (1 + Math.sin(spin * 0.5) * point.swell) * spread[g];
          const wx = Math.cos(point.phi + spin) * radius;
          const arc = Math.sin(point.phi + spin) * radius;
          const wy = arc * Math.cos(point.tilt);
          const cr = Math.cos(point.roll);
          const sr = Math.sin(point.roll);
          project(wx * cr - wy * sr, wx * sr + wy * cr, arc * Math.sin(point.tilt));
        } else {
          let theta = point.theta;
          let phi;
          let radius = point.radius * spread[g];
          if (g === 1) {
            // Lattice nodes only breathe along the radius, keeping their neighbours.
            phi = point.phi + shellTurn;
            radius *= 1 + Math.sin(spin) * point.wobble;
          } else {
            theta += Math.sin(spin) * point.wobble;
            phi = point.phi + t * point.spin * 0.18;
          }
          const sinTheta = Math.sin(theta);
          project(
            sinTheta * Math.cos(phi) * radius,
            Math.cos(theta) * radius,
            sinTheta * Math.sin(phi) * radius,
          );
        }
        px[i] = screen[0];
        py[i] = screen[1];
        if (!screen[2]) {
          pLevel[i] = 0;
          continue;
        }
        const near = 1 - Math.min(1, Math.abs(screen[3] - sweep) * 1.5);
        pLevel[i] = Math.min(
          1,
          point.alpha * (0.5 + screen[2] * 0.66) + near * near * 0.46,
        );
      }
      // The projection buffers are reused per group, so links draw while nodes are current.
      if (g === 1) drawGrid();
      for (let i = 0; i < list.length; i++) {
        const level = pLevel[i];
        if (level < 0.1) continue;
        const x = px[i];
        const y = py[i];
        if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
        ctx.fillStyle = ink(g, Math.min(23, (level * 23) | 0));
        const size = list[i].big || level > 0.86 ? 2 : 1;
        ctx.fillRect(x | 0, y | 0, size, size);
      }
    }
  }

  function render(t) {
    if (mode !== "stardust" || !quality) return;
    // Heat rises with scroll depth: cyan lattice at rest, furnace gold further down.
    heat = Math.min(1, Math.max(0, 0.06 + scrollEase * 0.8 + Math.sin(t * 0.11) * 0.06));
    inkCache.clear();
    cosYaw = Math.cos(yaw);
    sinYaw = Math.sin(yaw);
    cosPitch = Math.cos(pitch);
    sinPitch = Math.sin(pitch);
    ctx.fillStyle = "#05090d";
    ctx.fillRect(0, 0, W, H);
    drawBackdropStars(t);
    drawCore(t);
    drawFields(t);
    drawSkeleton(t);
    // The instrument windows in app.js follow whichever hero is drawing.
    window.dispatchEvent(
      new CustomEvent("aichemy-frame", {
        detail: { time: t, progress: (t / 28) % 1 },
      }),
    );
  }

  function frame(timestamp) {
    raf = 0;
    const delta = lastTime ? Math.min(timestamp - lastTime, 100) : 0;
    lastTime = timestamp;
    clock += delta;
    turn += delta * 0.00016;
    const depth = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
    scrollEase += (depth - scrollEase) * Math.min(1, delta * 0.006);
    // The pointer nudges the camera, then the view settles back into its slow orbit.
    pointerX *= 0.975;
    pointerY *= 0.975;
    const ease = Math.min(1, delta * 0.003);
    yaw += (0.42 + turn + scrollEase * 1.05 + pointerX * 0.5 - yaw) * ease;
    pitch += (-0.22 - scrollEase * 0.34 + pointerY * 0.34 - pitch) * ease;
    // Behind the content sections the field is a dim backdrop; half the frame rate suffices.
    const interval = depth >= 1 ? 1000 / 15 : 1000 / 30;
    if (timestamp - lastPaint >= interval) {
      render(clock / 1000);
      lastPaint = timestamp;
    }
    schedule();
  }
  function schedule() {
    if (!raf && visible && !paused && mode === "stardust") {
      if (!lastTime) lastPaint = -Infinity;
      raf = requestAnimationFrame(frame);
    }
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTime = 0;
  }

  function setMode(next, remember = true) {
    if (!MODES.includes(next) || next === mode) return;
    mode = next;
    root.classList.toggle("stardust-mode", mode === "stardust");
    if (mode === "stardust") {
      // Both heroes share one simulation clock, so the instruments never jump.
      if (furnace) {
        clock = furnace.state.time * 1000;
        furnace.setSuspended(true);
      }
      resize();
      schedule();
    } else {
      stop();
      if (furnace) furnace.setSuspended(false, clock / 1000);
    }
    if (remember) {
      try {
        localStorage.setItem("aichemy-scene", mode);
      } catch {
        /* Private browsing may refuse storage; the switch still applies to this visit. */
      }
    }
    document.getElementById("scene-status").textContent =
      mode === "stardust" ? "已切换为 3D 点阵星核动画" : "已切换为像素丹炉动画";
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
      if (mode !== "stardust" || reducedMotion.matches) return;
      pointerX = (event.clientX / window.innerWidth - 0.5) * 0.5;
      pointerY = (event.clientY / window.innerHeight - 0.5) * 0.4;
    },
    { passive: true },
  );
  new ResizeObserver(resize).observe(stage);
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) schedule();
    else stop();
  });
  // furnace.js owns the pause state: the button, the space key and reduced motion.
  window.addEventListener("aichemy-state", (event) => {
    paused = event.detail.paused;
    if (paused) stop();
    else schedule();
  });

  if (mode === "stardust") {
    if (furnace) furnace.setSuspended(true);
    resize();
    schedule();
  }
})();
