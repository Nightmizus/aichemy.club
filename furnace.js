/* Hand-drawn, code-native pixel art. All moving parts use a shared simulation clock. */
(() => {
  "use strict";
  const canvas = document.getElementById("furnace");
  const heading = document.querySelector(".hero-title-space");
  const blastMode =
    canvas.dataset.reactor === "blast" &&
    new URLSearchParams(window.location.search).get("furnace") !== "cauldron";
  const ctx = canvas.getContext("2d", { alpha: false });
  const scene = document.createElement("canvas");
  scene.width = 720;
  scene.height = 440;
  const s = scene.getContext("2d");
  const backdrop = document.createElement("canvas");
  const b = backdrop.getContext("2d", { alpha: false });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const palette = {
    outline: "#111b16",
    dark: "#1d2c22",
    shade: "#2a3e2c",
    green: "#3e5337",
    light: "#667753",
    edge: "#82916a",
    copper: "#8f643f",
    gold: "#bf8b51",
    orange: "#ea8848",
    flame: "#ffb25a",
    pale: "#f4d395",
    mint: "#a5c6a0",
  };
  let W = 0,
    H = 0,
    mobile = false;
  let visible = !document.hidden,
    inView = true,
    suspended = false;
  let paused = reducedMotion.matches,
    clock = 6200,
    lastTime = 0,
    raf = 0;
  let lastPaint = -Infinity,
    charge = 0.5,
    progress = 0.2;
  let layout = null;
  let furnaceScale = 1;
  let coreLift = 24;
  let sceneOriginX = 360,
    sceneOriginY = 210;
  const indicatorLights = [];
  const feedPaths = [];

  // A fixed seed makes textures stable while the simulation animates.
  function hash(n) {
    const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  }
  function rect(x, y, w, h, color, context = s) {
    context.fillStyle = color;
    context.fillRect(
      Math.round(x),
      Math.round(y),
      Math.round(w),
      Math.round(h),
    );
  }
  function polygon(points, color, context = s) {
    context.fillStyle = color;
    context.beginPath();
    points.forEach(([x, y], index) =>
      index
        ? context.lineTo(Math.round(x), Math.round(y))
        : context.moveTo(Math.round(x), Math.round(y)),
    );
    context.closePath();
    context.fill();
  }
  function line(x0, y0, x1, y1, color, size = 1, context = s) {
    x0 = Math.round(x0);
    x1 = Math.round(x1);
    y0 = Math.round(y0);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0),
      sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0),
      sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      rect(x0, y0, size, size, color, context);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * error;
      if (e2 >= dy) {
        error += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        error += dx;
        y0 += sy;
      }
    }
  }
  function ellipse(x, y, rx, ry, color, thickness = 1) {
    for (let i = 0; i < 120; i++) {
      const angle = (i * Math.PI) / 60;
      rect(
        x + Math.cos(angle) * rx,
        y + Math.sin(angle) * ry,
        thickness,
        thickness,
        color,
      );
    }
  }
  function bolt(x, y) {
    rect(x, y, 3, 3, "#17271d");
    rect(x, y, 2, 1, "#84906c");
  }
  function pixelText(text, x, y, color, size = 5) {
    s.fillStyle = color;
    s.font = `${size}px monospace`;
    s.textAlign = "center";
    s.fillText(text, x, y);
  }

  function compose() {
    const scale = Math.min((W * (mobile ? 1.0 : 0.91)) / 330, (H * 0.84) / 320);
    const cx = W / 2;
    const portraitPhone = mobile && W * 2 <= 700;
    const cy = H * (portraitPhone ? 0.4 : mobile ? 0.49 : 0.48);
    return { cx, cy, scale, floor: cy + scale * 111 };
  }

  function drawCabinet(x, floor, width, height) {
    const { scale } = layout;
    const top = floor - height;
    rect(
      x - 3 * scale,
      top + 9 * scale,
      width + 6 * scale,
      height,
      "#101b14",
      b,
    );
    rect(x, top, width, height, "#33432c", b);
    rect(
      x + 3 * scale,
      top + 3 * scale,
      width - 6 * scale,
      height - 7 * scale,
      "#1c2d20",
      b,
    );
    rect(
      x + 3 * scale,
      top + 3 * scale,
      2 * scale,
      height - 7 * scale,
      "#5b6842",
      b,
    );
    rect(
      x - 3 * scale,
      top - 3 * scale,
      width + 6 * scale,
      5 * scale,
      "#57603c",
      b,
    );
    for (let slot = 0; slot < 5; slot++) {
      const y = top + (12 + slot * 26) * scale;
      rect(x + 8 * scale, y, width - 16 * scale, 21 * scale, "#12231a", b);
      rect(x + 9 * scale, y + scale, width - 18 * scale, scale, "#44563a", b);
      for (let vent = 0; vent < 4; vent++) {
        rect(
          x + 13 * scale,
          y + (5 + vent * 3) * scale,
          width * 0.42,
          scale,
          "#3b5035",
          b,
        );
      }
      const lx = x + width - 17 * scale;
      indicatorLights.push({
        x: lx,
        y: y + 6 * scale,
        scale,
        phase: slot * 1.7,
        warm: slot === 2,
      });
      rect(lx - scale, y + 5 * scale, 5 * scale, 5 * scale, "#253b29", b);
    }
    rect(
      x + 8 * scale,
      floor - 10 * scale,
      width - 16 * scale,
      4 * scale,
      "#0f2017",
      b,
    );
    rect(x - 3 * scale, floor, width + 6 * scale, 6 * scale, "#405335", b);
    rect(x + 7 * scale, floor + 6 * scale, 9 * scale, 3 * scale, "#152319", b);
    rect(
      x + width - 16 * scale,
      floor + 6 * scale,
      9 * scale,
      3 * scale,
      "#152319",
      b,
    );
  }

  function drawCoolingTower(x, floor, width, height) {
    const { scale } = layout;
    const top = floor - height;
    rect(
      x + 9 * scale,
      top - 8 * scale,
      width - 18 * scale,
      8 * scale,
      "#3c4c32",
      b,
    );
    rect(x + 4 * scale, top, width - 8 * scale, height, "#273c2a", b);
    rect(x, top + 13 * scale, width, height - 24 * scale, "#334b31", b);
    rect(
      x + 3 * scale,
      top + 15 * scale,
      3 * scale,
      height - 29 * scale,
      "#65704a",
      b,
    );
    rect(
      x + width - 7 * scale,
      top + 15 * scale,
      4 * scale,
      height - 29 * scale,
      "#172b1e",
      b,
    );
    rect(
      x + 12 * scale,
      top + 19 * scale,
      width - 24 * scale,
      height - 38 * scale,
      "#142b20",
      b,
    );
    rect(
      x + 17 * scale,
      top + 23 * scale,
      width - 34 * scale,
      height - 47 * scale,
      "#344f34",
      b,
    );
    rect(
      x + 20 * scale,
      top + 25 * scale,
      3 * scale,
      height - 51 * scale,
      "#6d865052",
      b,
    );
    for (const offset of [8, height / scale - 16]) {
      rect(
        x - 4 * scale,
        top + offset * scale,
        width + 8 * scale,
        8 * scale,
        "#6b6941",
        b,
      );
      rect(
        x - 4 * scale,
        top + offset * scale,
        width + 8 * scale,
        2 * scale,
        "#8c8150",
        b,
      );
      rect(
        x + width - 3 * scale,
        top + offset * scale,
        7 * scale,
        8 * scale,
        "#424d30",
        b,
      );
    }
    for (let i = 0; i < 4; i++) {
      const y = top + (32 + i * 22) * scale;
      rect(x + 14 * scale, y, width - 28 * scale, 2 * scale, "#5a744447", b);
    }
    rect(x + 2 * scale, floor, width - 4 * scale, 6 * scale, "#59603d", b);
    rect(
      x - 4 * scale,
      floor + 6 * scale,
      width + 8 * scale,
      4 * scale,
      "#263b27",
      b,
    );
  }

  function drawBackdrop() {
    const { cx, cy, scale, floor } = layout;
    indicatorLights.length = 0;
    feedPaths.length = 0;
    b.fillStyle = "#111a14";
    b.fillRect(0, 0, W, H);
    const ambient = b.createRadialGradient(
      cx,
      cy - 25 * scale,
      0,
      cx,
      cy,
      Math.max(W * 0.67, H * 0.86),
    );
    ambient.addColorStop(0, "#293b26");
    ambient.addColorStop(0.45, "#1e2b20");
    ambient.addColorStop(1, "#101912");
    b.fillStyle = ambient;
    b.fillRect(0, 0, W, H);

    // Broad structural panels fill the room without floating interface elements.
    const panelStep = Math.max(62 * scale, W / 9);
    for (let x = cx % panelStep; x < W; x += panelStep) {
      rect(x, 0, 1, floor, "#39482d42", b);
      rect(x + 3, H * 0.3, panelStep - 7, 1, "#3b4b3040", b);
      rect(x + 3, H * 0.53, panelStep - 7, 1, "#3b4b3030", b);
      for (const y of [H * 0.3 + 4, H * 0.53 + 4])
        rect(x + 5, y, 1, 1, "#7180544a", b);
    }
    // A recessed chamber gives the main furnace a quiet architectural frame.
    const half = 143 * scale,
      top = Math.max(18, cy - 158 * scale);
    polygon(
      [
        [cx - half + 16 * scale, top],
        [cx + half - 16 * scale, top],
        [cx + half, top + 16 * scale],
        [cx + half, floor],
        [cx - half, floor],
        [cx - half, top + 16 * scale],
      ],
      "#34472f66",
      b,
    );
    polygon(
      [
        [cx - half + 19 * scale, top + 4 * scale],
        [cx + half - 19 * scale, top + 4 * scale],
        [cx + half - 4 * scale, top + 19 * scale],
        [cx + half - 4 * scale, floor],
        [cx - half + 4 * scale, floor],
        [cx - half + 4 * scale, top + 19 * scale],
      ],
      "#17291fa6",
      b,
    );
    rect(
      cx - half + 8 * scale,
      top + 24 * scale,
      scale,
      floor - top - 24 * scale,
      "#64734833",
      b,
    );
    rect(
      cx + half - 9 * scale,
      top + 24 * scale,
      scale,
      floor - top - 24 * scale,
      "#64734833",
      b,
    );

    // The ceiling conduit extends across both halves of the viewport.
    const pipeY = H * 0.13;
    for (const side of [-1, 1]) {
      const outer = side < 0 ? 0 : cx + 89 * scale;
      const width = cx - 89 * scale;
      rect(outer, pipeY, width, 5 * scale, "#435237", b);
      rect(outer, pipeY + scale, width, scale, "#73805a77", b);
      rect(outer, pipeY + 5 * scale, width, 3 * scale, "#0e1c13", b);
      for (let n = 1; n <= 3; n++) {
        const x = side < 0 ? (width * n) / 4 : outer + (width * n) / 4;
        rect(x, pipeY - 2 * scale, 3 * scale, 11 * scale, "#4d5938", b);
      }
      // Outer support pillars establish the room edges.
      const pillar = side < 0 ? W * 0.035 : W * 0.965;
      rect(pillar, 0, 6 * scale, floor, "#263726", b);
      rect(pillar, 0, scale, floor, "#55644466", b);
      rect(pillar + 6 * scale, 0, 3 * scale, floor, "#101e15", b);
    }

    // Wide, subdued floor tiles share one vanishing point at the furnace.
    rect(0, floor, W, H - floor, "#15221a", b);
    rect(0, floor, W, 2, "#34472e", b);
    for (let n = -12; n <= 12; n++)
      line(
        cx + n * 31 * scale,
        floor,
        cx + n * 86 * scale,
        H,
        "#31452d66",
        1,
        b,
      );
    for (const f of [0.1, 0.27, 0.5, 0.81])
      line(
        0,
        floor + (H - floor) * f,
        W,
        floor + (H - floor) * f,
        "#3b4b2e55",
        1,
        b,
      );

    const distance = Math.max(224 * scale, W * 0.335);
    const leftCenter = cx - distance,
      rightCenter = cx + distance;
    const cabinetWidth = 65 * scale;
    drawCabinet(
      leftCenter - cabinetWidth / 2,
      floor - 2 * scale,
      cabinetWidth,
      153 * scale,
    );
    drawCoolingTower(
      rightCenter - 27 * scale,
      floor - 2 * scale,
      54 * scale,
      142 * scale,
    );

    // Upright pipes are physically connected to the ceiling and the machines.
    for (const [x, height] of [
      [leftCenter, 153],
      [rightCenter, 150],
    ]) {
      rect(
        x - 2 * scale,
        pipeY + 7 * scale,
        5 * scale,
        floor - height * scale - pipeY - 7 * scale,
        "#263c29",
        b,
      );
      rect(
        x - 2 * scale,
        pipeY + 7 * scale,
        scale,
        floor - height * scale - pipeY - 7 * scale,
        "#69764c88",
        b,
      );
      rect(
        x - 11 * scale,
        pipeY + 12 * scale,
        23 * scale,
        5 * scale,
        "#283c29",
        b,
      );
      rect(
        x - 9 * scale,
        pipeY + 16 * scale,
        19 * scale,
        2 * scale,
        "#c1ab6c",
        b,
      );
      const light = b.createLinearGradient(0, pipeY + 18 * scale, 0, floor);
      light.addColorStop(0, "#b9aa5120");
      light.addColorStop(1, "#b9aa5100");
      polygon(
        [
          [x - 9 * scale, pipeY + 18 * scale],
          [x + 10 * scale, pipeY + 18 * scale],
          [x + 42 * scale, floor],
          [x - 42 * scale, floor],
        ],
        light,
        b,
      );
    }

    // Data conduits span the entire floor and enter the furnace pedestal.
    for (const side of [-1, 1]) {
      const start = side < 0 ? -5 : W + 5;
      const path = [
        [start, floor + 43 * scale],
        [cx + side * 199 * scale, floor + 43 * scale],
        [cx + side * 153 * scale, floor + 12 * scale],
      ];
      feedPaths.push(path);
      for (let i = 1; i < path.length; i++) {
        line(...path[i - 1], ...path[i], "#0c1a12", 5, b);
        line(
          path[i - 1][0],
          path[i - 1][1] - 1,
          path[i][0],
          path[i][1] - 1,
          "#58673d",
          1,
          b,
        );
        line(...path[i - 1], ...path[i], "#33492c", 2, b);
      }
    }
    for (let i = 0; i < (W * H) / 160; i++)
      rect(
        hash(i * 3) * W,
        hash(i * 3 + 1) * H,
        1,
        1,
        hash(i * 3 + 2) > 0.5 ? "#a0ad6e06" : "#00000012",
        b,
      );
  }

  function pointOnPath(path, fraction) {
    const lengths = path
      .slice(1)
      .map((point, i) =>
        Math.hypot(point[0] - path[i][0], point[1] - path[i][1]),
      );
    let distance = fraction * lengths.reduce((sum, length) => sum + length, 0);
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i] || i === lengths.length - 1) {
        const f = lengths[i] ? Math.min(1, distance / lengths[i]) : 0;
        return [
          path[i][0] + (path[i + 1][0] - path[i][0]) * f,
          path[i][1] + (path[i + 1][1] - path[i][1]) * f,
        ];
      }
      distance -= lengths[i];
    }
  }

  function environment(t) {
    const { cx, cy, scale, floor } = layout;
    indicatorLights.forEach(({ x, y, scale, phase, warm }) => {
      const pulse = 0.55 + 0.45 * Math.sin(t * 0.9 + phase);
      ctx.globalAlpha = 0.5 + pulse * 0.5;
      rect(x, y, 2 * scale, 2 * scale, warm ? "#c29b58" : "#9cb57b", ctx);
    });
    ctx.globalAlpha = 1;
    for (const path of feedPaths) {
      for (let i = 0; i < 3; i++) {
        const f = (t * 0.09 + i / 3) % 1;
        const [x, y] = pointOnPath(path, f);
        const [tx, ty] = pointOnPath(path, Math.max(0, f - 0.017));
        line(tx, ty, x, y, "#c5ac67", Math.max(1, Math.round(scale)), ctx);
      }
    }
    // Slow coolant bubbles are contained within the right-hand reservoir.
    const right = cx + Math.max(224 * scale, W * 0.335);
    for (let i = 0; i < 7; i++) {
      const f = (t * 0.07 + hash(i + 48)) % 1;
      ctx.globalAlpha = Math.sin(f * Math.PI) * 0.4;
      rect(
        right + (hash(i + 97) - 0.5) * 19 * scale,
        floor - (28 + f * 85) * scale,
        scale,
        2 * scale,
        "#b6cd8b",
        ctx,
      );
    }
    ctx.globalAlpha = 1;
    // Sparse dust belongs to the whole room, with no blank text half.
    for (let i = 0; i < 26; i++) {
      const x = hash(i + 200) * W + Math.sin(t * 0.16 + i) * 4;
      const y = (hash(i + 340) * H - t * (0.5 + hash(i) * 0.9) + H * 100) % H;
      const opacity = (0.5 + 0.5 * Math.sin(t * 0.4 + i)) * 0.35;
      ctx.globalAlpha = opacity;
      rect(x, y, 1, 1, i % 5 ? "#99ac70" : "#d3b37c", ctx);
    }
    ctx.globalAlpha = 1;
  }

  function pedestal(t) {
    // Cables are behind the platform and the cauldron.
    for (const side of [-1, 1]) {
      const x = side * 122;
      line(side * 92, 54, x, 80, "#111c16", 5);
      line(x, 80, x, 119, "#111c16", 5);
      line(x, 119, side * 162, 141, "#111c16", 5);
      line(side * 92, 54, x, 80, "#677052", 1);
      line(x, 80, x, 119, "#566648", 1);
      line(x, 119, side * 162, 141, "#46563b", 1);
    }
    polygon(
      [
        [-161, 121],
        [-105, 91],
        [96, 91],
        [158, 121],
        [158, 140],
        [98, 164],
        [-102, 164],
        [-161, 140],
      ],
      "#101911",
    );
    polygon(
      [
        [-155, 120],
        [-100, 94],
        [93, 94],
        [153, 120],
        [98, 146],
        [-100, 146],
      ],
      "#354632",
    );
    polygon(
      [
        [-155, 120],
        [-100, 146],
        [98, 146],
        [153, 120],
        [153, 134],
        [98, 159],
        [-100, 159],
        [-155, 134],
      ],
      "#263626",
    );
    polygon(
      [
        [-145, 119],
        [-97, 99],
        [89, 99],
        [141, 119],
        [92, 139],
        [-94, 139],
      ],
      "#1c2c20",
    );
    line(-143, 119, -94, 140, "#67754c");
    line(-94, 140, 92, 140, "#718352");
    line(92, 140, 143, 119, "#586b46");
    line(-155, 126, -100, 151, "#43573b");
    line(-100, 151, 98, 151, "#43573b");
    line(98, 151, 153, 126, "#43573b");
    for (let i = 0; i < 5; i++) {
      rect(-76 + i * 32, 152, 15, 2, "#162319");
      rect(-76 + i * 32, 152, 5, 1, "#7c8050");
    }
    ellipse(0, 112, 100, 21, "#8b915f");
    ellipse(0, 112, 95, 19, "#3d5537");
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9 + 0.2;
      const x = Math.cos(a) * 113,
        y = 112 + Math.sin(a) * 24;
      rect(x, y, 7, 2, i % 2 ? "#768b56" : "#bc9a58");
    }
    // The front telemetry port.
    rect(-23, 143, 46, 13, "#15251b");
    rect(-21, 145, 42, 8, "#2e4430");
    for (let i = 0; i < 11; i++)
      rect(-18 + i * 3.4, 147, 2, 3, i / 11 < progress ? "#a2b978" : "#456443");
    pixelText("A I C H E M Y", 0, 134, "#91a071", 5);
    // Small vapor outlets on either side.
    for (const side of [-1, 1]) {
      rect(side * 137 - 8, 109, 16, 12, "#19271b");
      rect(side * 137 - 7, 108, 14, 3, "#5f6c44");
      for (let k = 0; k < 3; k++)
        rect(side * 137 - 5 + k * 4, 112, 2, 5, "#64764e");
    }
  }

  function handles(t) {
    for (const side of [-1, 1]) {
      s.save();
      s.scale(side, 1);
      // Stepped bronze handles, with inset green insulation.
      polygon(
        [
          [80, -32],
          [111, -32],
          [111, -25],
          [125, -25],
          [125, 24],
          [116, 24],
          [116, 36],
          [92, 36],
          [92, 22],
          [107, 22],
          [107, -14],
          [80, -14],
        ],
        "#111d16",
      );
      polygon(
        [
          [82, -29],
          [109, -29],
          [109, -22],
          [121, -22],
          [121, 21],
          [112, 21],
          [112, 31],
          [94, 31],
          [94, 25],
          [110, 25],
          [110, -18],
          [82, -18],
        ],
        "#7f633f",
      );
      rect(84, -29, 25, 3, "#b19259");
      rect(110, -22, 10, 3, "#b99b64");
      rect(116, -17, 5, 34, "#a6814c");
      rect(119, -16, 2, 33, "#5d4d31");
      rect(113, -9, 10, 5, "#314731");
      rect(113, 5, 10, 5, "#314731");
      rect(112, -8, 10, 1, "#7b9162");
      rect(112, 6, 10, 1, "#7b9162");
      rect(78, -27, 9, 16, "#556645");
      bolt(81, -24);
      bolt(81, -17);
      s.restore();
    }
  }

  function feet() {
    for (const side of [-1, 1]) {
      s.save();
      s.scale(side, 1);
      polygon(
        [
          [45, 80],
          [68, 80],
          [69, 101],
          [79, 114],
          [79, 121],
          [50, 121],
          [50, 112],
          [40, 94],
        ],
        "#14241a",
      );
      polygon(
        [
          [48, 83],
          [63, 83],
          [65, 103],
          [73, 114],
          [73, 117],
          [55, 117],
          [55, 110],
          [46, 94],
        ],
        "#4b6040",
      );
      rect(50, 88, 9, 5, "#8a8454");
      line(58, 101, 64, 112, "#809065", 2);
      rect(53, 116, 24, 4, "#697751");
      rect(55, 120, 21, 2, "#263b29");
      s.restore();
    }
    rect(-13, 93, 26, 17, "#1a2d1e");
    rect(-9, 97, 18, 11, "#53663f");
    rect(-14, 108, 28, 6, "#758257");
  }

  function body(t) {
    const p = palette;
    polygon(
      [
        [-87, -30],
        [87, -30],
        [87, -8],
        [95, 4],
        [95, 48],
        [87, 48],
        [87, 69],
        [71, 69],
        [71, 83],
        [49, 83],
        [49, 94],
        [-49, 94],
        [-49, 83],
        [-71, 83],
        [-71, 69],
        [-87, 69],
        [-87, 48],
        [-95, 48],
        [-95, 4],
        [-87, -8],
      ],
      p.outline,
    );
    polygon(
      [
        [-81, -21],
        [81, -21],
        [81, -4],
        [89, 8],
        [89, 43],
        [81, 43],
        [81, 64],
        [65, 64],
        [65, 78],
        [43, 78],
        [43, 88],
        [-43, 88],
        [-43, 78],
        [-65, 78],
        [-65, 64],
        [-81, 64],
        [-81, 43],
        [-89, 43],
        [-89, 8],
        [-81, -4],
      ],
      "#43563a",
    );
    polygon(
      [
        [-78, -17],
        [-52, -17],
        [-52, 71],
        [-43, 71],
        [-43, 84],
        [-61, 76],
        [-75, 61],
        [-84, 39],
        [-84, 6],
        [-78, -2],
      ],
      "#5c6d46",
    );
    polygon(
      [
        [46, -17],
        [78, -17],
        [78, -2],
        [85, 10],
        [85, 41],
        [77, 41],
        [77, 61],
        [61, 61],
        [61, 75],
        [43, 84],
        [43, 63],
        [53, 48],
        [53, 4],
      ],
      "#2c412d",
    );
    rect(-48, -18, 93, 84, "#3b5035");
    rect(-75, -15, 4, 44, "#7c8252");
    rect(-80, 9, 3, 22, "#8a8a56");
    rect(-75, 43, 4, 15, "#758153");
    rect(-69, 59, 5, 10, "#718051");
    line(-59, 74, -41, 82, "#899267", 2);
    line(-39, 86, 35, 86, "#66794d", 2);
    // Cast metal texture and visible seams.
    for (let i = 0; i < 135; i++) {
      const x = Math.floor(hash(i + 80) * 153) - 77,
        y = Math.floor(hash(i + 320) * 78) - 10;
      if (
        Math.abs(x) + Math.max(0, y - 45) * 0.8 < 84 &&
        (Math.abs(x) > 39 || y > 56)
      )
        rect(x, y, hash(i) > 0.7 ? 2 : 1, 1, i % 2 ? "#83916733" : "#142d2155");
    }
    line(-53, -8, -53, 58, "#273d2b");
    line(-51, -8, -51, 58, "#6d7c50");
    line(54, -8, 54, 58, "#192e21");
    line(56, -8, 56, 58, "#4f6741");
    rect(-66, -4, 8, 36, "#293f2a");
    rect(-64, -2, 4, 31, "#142b20");
    for (let i = 0; i < 7; i++)
      rect(-63, 1 + i * 4, 2, 2, i < 4 + charge * 3 ? "#adbe7c" : "#536842");
    // Right hand pressure instrument.
    rect(62, -1, 16, 21, "#172c1f");
    rect(64, 1, 12, 17, "#928653");
    rect(66, 3, 8, 13, "#263b29");
    rect(68, 5, 4, 9, "#657b4f");
    rect(69, 6 + Math.round(Math.sin(t * 2) * 2 + 2), 3, 2, "#ead699");
    rect(63, 27, 12, 3, "#758153");
    rect(63, 33, 9, 2, "#253c28");
    rect(63, 38, 9, 2, "#253c28");
    // Main combustion chamber, cut from heavy stepped metal.
    polygon(
      [
        [-30, -7],
        [30, -7],
        [30, -1],
        [40, -1],
        [40, 9],
        [46, 9],
        [46, 41],
        [39, 41],
        [39, 50],
        [29, 50],
        [29, 56],
        [-29, 56],
        [-29, 50],
        [-39, 50],
        [-39, 41],
        [-46, 41],
        [-46, 9],
        [-40, 9],
        [-40, -1],
        [-30, -1],
      ],
      "#142a1e",
    );
    polygon(
      [
        [-27, -2],
        [27, -2],
        [27, 4],
        [35, 4],
        [35, 13],
        [40, 13],
        [40, 37],
        [34, 37],
        [34, 45],
        [25, 45],
        [25, 50],
        [-25, 50],
        [-25, 45],
        [-34, 45],
        [-34, 37],
        [-40, 37],
        [-40, 13],
        [-35, 13],
        [-35, 4],
        [-27, 4],
      ],
      "#ad874e",
    );
    polygon(
      [
        [-25, 2],
        [25, 2],
        [25, 8],
        [32, 8],
        [32, 16],
        [35, 16],
        [35, 34],
        [29, 34],
        [29, 41],
        [23, 41],
        [23, 45],
        [-23, 45],
        [-23, 41],
        [-29, 41],
        [-29, 34],
        [-35, 34],
        [-35, 16],
        [-32, 16],
        [-32, 8],
        [-25, 8],
      ],
      "#4e3b23",
    );
    rect(-23, 6, 46, 36, "#301f16");
    rect(-30, 13, 60, 21, "#301f16");
    // Pixel flames emerge from the base of the opening.
    const frame = Math.floor(t * 8);
    for (let i = 0; i < 14; i++) {
      const x = -27 + i * 4;
      const height = 9 + hash(i * 13 + frame) * 18 + charge * 4;
      rect(x, 38 - height, 4, height, "#99421f");
      rect(x + 1, 40 - height * 0.72, 3, height * 0.72, "#de7231");
      rect(x + 1, 41 - height * 0.42, 2, height * 0.42, "#ffc271");
    }
    // A luminous neural lattice sits inside the furnace window.
    const nodes = [
      [-19, 17],
      [-19, 29],
      [0, 10],
      [0, 23],
      [0, 36],
      [19, 17],
      [19, 29],
    ];
    for (let i = 0; i < 2; i++)
      for (let j = 2; j < 5; j++) line(...nodes[i], ...nodes[j], "#c9934e");
    for (let i = 2; i < 5; i++)
      for (let j = 5; j < 7; j++) line(...nodes[i], ...nodes[j], "#bb8947");
    nodes.forEach(([x, y], i) => {
      rect(x - 2, y - 2, 5, 5, "#7b4c29");
      rect(
        x - 1,
        y - 1,
        3,
        3,
        Math.sin(t * 2 + i) > 0.3 ? "#fff0ba" : "#edb56b",
      );
    });
    bolt(-33, 1);
    bolt(31, 1);
    bolt(-41, 25);
    bolt(39, 25);
    bolt(-25, 48);
    bolt(23, 48);
    rect(-25, 63, 50, 12, "#263d2a");
    rect(-23, 64, 46, 9, "#6c7450");
    rect(-21, 65, 42, 7, "#283b28");
    pixelText("NEURAL CORE", 0, 70, "#b6b886", 5);
    bolt(-40, 68);
    bolt(37, 68);
  }

  function rim(t) {
    // The open top is a broad pixel ellipse with a visible glowing interior.
    polygon(
      [
        [-79, -45],
        [79, -45],
        [79, -39],
        [92, -39],
        [92, -31],
        [101, -31],
        [101, -18],
        [91, -18],
        [91, -11],
        [76, -11],
        [76, -7],
        [-76, -7],
        [-76, -11],
        [-91, -11],
        [-91, -18],
        [-101, -18],
        [-101, -31],
        [-92, -31],
        [-92, -39],
        [-79, -39],
      ],
      "#142019",
    );
    polygon(
      [
        [-74, -43],
        [74, -43],
        [74, -38],
        [89, -38],
        [89, -31],
        [96, -31],
        [96, -20],
        [84, -20],
        [84, -14],
        [73, -14],
        [73, -11],
        [-73, -11],
        [-73, -14],
        [-84, -14],
        [-84, -20],
        [-96, -20],
        [-96, -31],
        [-89, -31],
        [-89, -38],
        [-74, -38],
      ],
      "#7e7950",
    );
    rect(-73, -40, 146, 5, "#b5a166");
    rect(-88, -34, 15, 6, "#ac965c");
    rect(74, -34, 14, 6, "#92814e");
    polygon(
      [
        [-68, -36],
        [67, -36],
        [67, -32],
        [82, -32],
        [82, -27],
        [88, -27],
        [88, -23],
        [76, -23],
        [76, -19],
        [-76, -19],
        [-76, -23],
        [-88, -23],
        [-88, -27],
        [-82, -27],
        [-82, -32],
        [-68, -32],
      ],
      "#352d1b",
    );
    rect(-65, -33, 130, 11, "#884c27");
    rect(-55, -31, 110, 10, "#bd7137");
    rect(-42, -29, 84, 8, "#e59a50");
    rect(-73, -22, 146, 4, "#b4a06a");
    rect(-78, -18, 156, 4, "#6b6d44");
    rect(-69, -13, 138, 2, "#929061");
    for (let i = 0; i < 13; i++) rect(-69 + i * 11, -12, 2, 5, "#203326");
    for (let i = 0; i < 10; i++) {
      const x = -57 + i * 12,
        height = 2 + hash(i + Math.floor(t * 6)) * 8 * (0.4 + charge);
      rect(x, -26 - height, 3, height, "#ffd38a");
    }
  }

  function blastFurnace(t) {
    // A tapered industrial stack, on the original laboratory platform.
    // Hot-blast pipes and structural legs sit behind the steel shell.
    for (const side of [-1, 1]) {
      s.save();
      s.scale(side, 1);
      polygon(
        [
          [55, 61],
          [78, 61],
          [87, 117],
          [62, 117],
        ],
        "#111d17",
      );
      polygon(
        [
          [60, 69],
          [72, 69],
          [79, 113],
          [66, 113],
        ],
        "#48583d",
      );
      line(62, 70, 69, 110, "#829069", 2);
      rect(61, 112, 27, 6, "#26392b");
      rect(59, 117, 31, 4, "#72805a");
      bolt(64, 114);
      bolt(80, 114);
      polygon(
        [
          [34, -71],
          [86, -71],
          [103, -54],
          [103, 56],
          [78, 80],
          [68, 67],
          [87, 49],
          [87, -48],
          [78, -56],
          [34, -56],
        ],
        "#121e18",
      );
      polygon(
        [
          [39, -67],
          [83, -67],
          [98, -52],
          [98, 53],
          [78, 73],
          [73, 67],
          [91, 50],
          [91, -50],
          [80, -60],
          [39, -60],
        ],
        "#536447",
      );
      line(41, -66, 81, -66, "#91a079");
      line(81, -66, 95, -52, "#91a079");
      line(94, -51, 94, 50, "#82916a", 2);
      for (const y of [-40, -4, 33]) {
        rect(85, y, 19, 8, "#19271d");
        rect(87, y + 1, 15, 5, "#9c8253");
        rect(87, y + 1, 15, 1, "#c4ad79");
        bolt(87, y + 3);
        bolt(99, y + 3);
      }
      s.restore();
    }

    // Stepped shoulders widen into the bosh, then narrow to the hearth.
    const shell = [
      [-37, -86],
      [37, -86],
      [37, -66],
      [44, -66],
      [44, -46],
      [51, -46],
      [51, -24],
      [59, -24],
      [59, -2],
      [68, -2],
      [68, 24],
      [78, 24],
      [78, 67],
      [70, 67],
      [70, 86],
      [60, 86],
      [60, 109],
      [-60, 109],
      [-60, 86],
      [-70, 86],
      [-70, 67],
      [-78, 67],
      [-78, 24],
      [-68, 24],
      [-68, -2],
      [-59, -2],
      [-59, -24],
      [-51, -24],
      [-51, -46],
      [-44, -46],
      [-44, -66],
      [-37, -66],
    ];
    polygon(shell, "#101c16");
    s.save();
    s.beginPath();
    shell.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    s.clip();
    rect(-73, -82, 146, 188, "#344b35");
    rect(-68, -82, 33, 188, "#526445");
    rect(-35, -82, 11, 188, "#64714e");
    rect(-24, -82, 57, 188, "#455a3e");
    rect(36, -82, 37, 188, "#233a2c");
    rect(57, -82, 13, 188, "#1b3025");
    for (let i = 0; i < 165; i++) {
      const x = Math.floor(hash(i + 742) * 146) - 73;
      const y = Math.floor(hash(i + 285) * 185) - 81;
      rect(x, y, 1 + hash(i + 36) * 3, 1, i % 3 ? "#94a57415" : "#14271c44");
    }
    for (const x of [-53, -24, 34, 60]) {
      rect(x, -82, 1, 188, "#132a1e99");
      rect(x + 1, -82, 1, 188, "#95a17744");
      for (let y = -74; y < 103; y += 15) bolt(x - 2, y);
    }
    s.restore();

    // Copper cooling bands follow the furnace's changing diameter.
    for (const [y, radius] of [
      [-65, 45],
      [-43, 52],
      [-20, 60],
      [5, 69],
      [30, 79],
      [76, 71],
      [99, 62],
    ]) {
      rect(-radius, y, radius * 2, 8, "#16251b");
      rect(-radius + 2, y + 1, radius * 2 - 4, 5, "#7b784d");
      rect(-radius + 3, y + 1, radius * 2 - 6, 1, "#b2a477");
      rect(-radius + 4, y + 3, radius - 5, 2, "#99905f");
      rect(radius - 21, y + 2, 18, 4, "#535b37");
      for (let x = -radius + 9; x < radius - 4; x += 18) bolt(x, y + 3);
    }

    // Open charging hopper; amber data fragments drop into the stack.
    polygon(
      [
        [-58, -103],
        [58, -103],
        [58, -89],
        [38, -69],
        [-38, -69],
        [-58, -89],
      ],
      "#111d16",
    );
    polygon(
      [
        [-54, -100],
        [54, -100],
        [54, -89],
        [35, -73],
        [-35, -73],
        [-54, -89],
      ],
      "#7c7950",
    );
    polygon(
      [
        [-48, -88],
        [48, -88],
        [33, -75],
        [-33, -75],
      ],
      "#4d5639",
    );
    polygon(
      [
        [-48, -88],
        [-12, -88],
        [-10, -75],
        [-33, -75],
      ],
      "#8a8656",
    );
    line(-48, -87, -33, -75, "#c1af79", 2);
    line(48, -87, 33, -75, "#253629", 2);
    rect(-53, -98, 106, 8, "#322b1c");
    rect(-44, -96, 88, 5, "#8d512b");
    rect(-34, -95, 68, 3, "#edaa55");
    rect(-52, -90, 104, 3, "#c4ac76");
    rect(-37, -75, 74, 4, "#24392a");
    for (const x of [-45, -23, 21, 43]) bolt(x, -85);
    for (let i = 0; i < 7; i++) {
      const f = (t * 0.7 + hash(i + 800)) % 1;
      rect(
        -26 + i * 8,
        -119 + f * 27,
        2,
        3,
        f > 0.35 ? "#efc276" : "#ad915066",
      );
    }
    // Upper inspection vents retain visible heat above the main firebox.
    for (let i = 0; i < 5; i++) {
      rect(-19 + i * 8, -54, 5, 10, "#18271d");
      rect(-18 + i * 8, -52, 2, 6, i % 2 ? "#c1803f" : "#f0ba69");
    }

    // A deep vertical firebox, with a neural network glowing in the flame.
    polygon(
      [
        [-30, -11],
        [30, -11],
        [36, -5],
        [36, 71],
        [30, 78],
        [-30, 78],
        [-36, 71],
        [-36, -5],
      ],
      "#122017",
    );
    polygon(
      [
        [-28, -8],
        [28, -8],
        [33, -3],
        [33, 68],
        [27, 74],
        [-27, 74],
        [-33, 68],
        [-33, -3],
      ],
      "#a08854",
    );
    rect(-26, -4, 52, 74, "#443019");
    rect(-24, -2, 48, 70, "#65351c");
    rect(-23, 3, 46, 64, "#9a4622");
    rect(-19, 15, 38, 51, "#be5e26");
    const frame = Math.floor(t * 8);
    for (let i = 0; i < 12; i++) {
      const x = -24 + i * 4;
      const height = 28 + hash(i * 17 + frame) * 33 + charge * 7;
      rect(x, 67 - height, 4, height, "#db742e");
      rect(x + 1, 67 - height * 0.76, 3, height * 0.76, "#f5a547");
      rect(x + 1, 67 - height * 0.4, 2, height * 0.4, "#ffdc8b");
    }
    const nodes = [
      [-16, 12],
      [16, 12],
      [-16, 32],
      [0, 22],
      [16, 32],
      [-16, 52],
      [0, 43],
      [16, 52],
    ];
    for (const [a, b] of [
      [0, 3],
      [1, 3],
      [0, 2],
      [1, 4],
      [2, 3],
      [3, 4],
      [2, 6],
      [4, 6],
      [2, 5],
      [4, 7],
      [5, 6],
      [6, 7],
    ]) {
      line(...nodes[a], ...nodes[b], "#ffe6a699");
    }
    nodes.forEach(([x, y], i) => {
      rect(x - 2, y - 2, 5, 5, "#ae662e");
      rect(x - 1, y - 1, 3, 3, Math.sin(t * 2 + i) > 0 ? "#fff2c4" : "#eebb6c");
    });
    rect(-30, -4, 2, 70, "#d4b279");
    rect(28, -4, 2, 70, "#625334");
    for (const x of [-33, 30]) for (const y of [-3, 23, 50, 68]) bolt(x, y);
    rect(-22, 83, 44, 10, "#19291e");
    rect(-20, 84, 40, 1, "#8d9260");
    pixelText("NEURAL FOUNDRY", 0, 90, "#bac497", 4);

    // Maintenance ladder, gauges, blast valves and the glowing tapping channel.
    for (const x of [-65, -53]) {
      rect(x, -5, 3, 100, "#17291e");
      rect(x, -5, 1, 100, "#a2a079");
    }
    for (let y = -2; y < 96; y += 9) {
      rect(-64, y, 13, 2, "#79835a");
      rect(-64, y, 13, 1, "#b2ac7e");
    }
    rect(45, -1, 19, 21, "#17271b");
    rect(47, 1, 15, 17, "#829065");
    rect(49, 3, 11, 13, "#223c2a");
    for (let i = 0; i < 4; i++)
      rect(51, 5 + i * 3, 7, 1, i < charge * 4 ? "#dce3a2" : "#526c42");
    for (const [x, y] of [
      [91, 21],
      [-93, 20],
      [51, 55],
    ]) {
      ellipse(x, y, 8, 8, "#202b1b", 3);
      ellipse(x, y, 7, 7, "#b89b62", 2);
      const angle = t * 0.08;
      for (let i = 0; i < 4; i++) {
        const a = angle + (i * Math.PI) / 2;
        line(x, y, x + Math.cos(a) * 7, y + Math.sin(a) * 7, "#99895b");
      }
      rect(x - 1, y - 1, 3, 3, "#dbbc7c");
    }
    rect(-14, 98, 28, 11, "#19291c");
    rect(-10, 102, 20, 6, "#e49c46");
    polygon(
      [
        [-10, 106],
        [10, 106],
        [21, 128],
        [-21, 128],
      ],
      "#18291d",
    );
    polygon(
      [
        [-7, 107],
        [7, 107],
        [16, 124],
        [-16, 124],
      ],
      "#80552b",
    );
    polygon(
      [
        [-5, 107],
        [5, 107],
        [12, 122],
        [-12, 122],
      ],
      "#e99b43",
    );
    for (let i = 0; i < 7; i++) {
      const f = (t * 0.8 + i / 7) % 1;
      rect(-3 - f * 4, 108 + f * 13, 6 + f * 8, 1, "#ffdb8a");
    }
    rect(-24, 124, 48, 4, "#9a8855");
    for (let i = 0; i < 6; i++) rect(-23 + i * 8, 125, 4, 2, "#283b28");
  }

  function floatingCore(t) {
    const bob = Math.round(Math.sin(t * 1.5) * 3);
    const cy = -91 + bob - coreLift;
    // A low-opacity column of energy connects the model to the compute core.
    polygon(
      [
        [-29, cy + 18],
        [29, cy + 18],
        [55, -25],
        [-55, -25],
      ],
      "#efa54b07",
    );
    for (let i = 0; i < 11; i++) {
      const x = -44 + i * 8;
      rect(x, -55 + Math.sin(i) * 4, 1, 26, "#dfb76616");
    }
    // Atom-like orbital traces on either side of the suspended network.
    const tilt = 0.25;
    for (let i = 0; i < 130; i++) {
      const a = (i * Math.PI * 2) / 130;
      const x = Math.cos(a) * 59;
      const y = Math.sin(a) * 15 + x * tilt;
      rect(x, cy + y, 1, 1, i % 4 === 0 ? "#ac9e62" : "#5f75473b");
      if (i % 2 === 0)
        rect(x * 0.88, cy + Math.sin(a) * 25 - x * 0.34, 1, 1, "#7e955450");
    }
    for (let k = 0; k < 3; k++) {
      const a = t * (0.65 + charge * 0.8) + (k * Math.PI * 2) / 3;
      const x = Math.cos(a) * 59,
        y = Math.sin(a) * 15 + x * tilt;
      rect(x - 2, cy + y - 2, 5, 5, "#c0b27717");
      rect(x - 1, cy + y - 1, 3, 3, "#d6cc8b");
    }
    // Rotate the model in three dimensions while keeping every edge pixel-snapped.
    const angle = t * 0.19 + Math.PI / 4;
    const tiltAngle = -0.32;
    function project(x, y, z) {
      const px = x * Math.cos(angle) + z * Math.sin(angle);
      const pz = -x * Math.sin(angle) + z * Math.cos(angle);
      return [
        px,
        cy + y * Math.cos(tiltAngle) - pz * Math.sin(tiltAngle),
        y * Math.sin(tiltAngle) + pz * Math.cos(tiltAngle),
      ];
    }
    const vertices = Array.from({ length: 8 }, (_, i) =>
      project(i & 1 ? 22 : -22, i & 2 ? 22 : -22, i & 4 ? 22 : -22),
    );
    const faces = [
      [0, 1, 3, 2],
      [4, 5, 7, 6],
      [0, 4, 6, 2],
      [1, 5, 7, 3],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
    ];
    faces.sort(
      (a, b) =>
        a.reduce((sum, i) => sum + vertices[i][2], 0) -
        b.reduce((sum, i) => sum + vertices[i][2], 0),
    );
    faces.forEach((face) =>
      polygon(
        face.map((i) => vertices[i].slice(0, 2)),
        "#af803c09",
      ),
    );
    for (let i = 0; i < 8; i++) {
      for (const bit of [1, 2, 4]) {
        const j = i ^ bit;
        if (j <= i) continue;
        const a = vertices[i],
          b = vertices[j];
        const front = (a[2] + b[2]) / 2 > 0;
        line(a[0], a[1], b[0], b[1], front ? "#edbc6d" : "#9b814550");
      }
    }
    // Internal weights form a small lattice, visible through the holographic shell.
    for (const x of [-11, 0, 11]) {
      const a = project(x, -22, 22),
        b = project(x, 22, 22);
      line(a[0], a[1], b[0], b[1], "#c4985266");
    }
    vertices.forEach(([x, y, depth]) => {
      rect(x - 1, y - 1, 3, 3, depth > 0 ? "#ffdc99" : "#b29a5e");
    });
    rect(-3, cy - 5, 7, 10, "#eba759");
    rect(-1, cy - 7, 3, 14, "#ffdb8d");
    rect(-5, cy - 2, 11, 4, "#ffdb8d");
    rect(-1, cy - 2, 3, 3, "#fff2c2");
    // Interrupted hologram rings, stepped to match the pixel illustration.
    const ringY = Math.max(
      -142 + bob - coreLift,
      (4 - layout.cy) / layout.scale + 10,
    );
    ellipse(0, ringY, 43, 10, "#677749");
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + t * 0.13;
      rect(
        Math.cos(a) * 43 - 2,
        ringY + Math.sin(a) * 10,
        5,
        1,
        i % 3 ? "#9b9f63" : "#deb378",
      );
    }
    rect(-1, ringY - 6, 2, 12, "#687e4555");
    rect(-6, ringY - 1, 12, 2, "#687e4555");
  }

  function wallInstruments(t) {
    // Restore the original wall terminal and its exposed conduit.
    s.save();
    s.translate(-139, -101);
    line(20, 28, 20, 40, "#405336", 2);
    line(20, 40, -14, 40, "#405336", 2);
    line(-14, 40, -14, 177, "#405336", 2);
    line(-15, 40, -15, 177, "#71805555");
    rect(-2, -2, 44, 31, "#132219");
    rect(0, 0, 40, 27, "#506344");
    rect(2, 2, 36, 23, "#10241b");
    rect(2, 2, 36, 1, "#80946a");
    for (let row = 0; row < 5; row++) {
      rect(5, 6 + row * 3, 3, 1, row === 0 ? "#c09d61" : "#8aab75");
      rect(
        10,
        6 + row * 3,
        9 + hash(row + Math.floor(t * 0.4)) * 18,
        1,
        "#617f54",
      );
    }
    rect(6, 23, 2, 1, "#d7bd7e");
    rect(31, 23, 4, 1, "#789569");
    s.restore();

    // The training readout is a pixel device inside the room, like the other hardware.
    s.save();
    s.translate(112, -101);
    line(20, 36, 20, 62, "#405336", 2);
    line(20, 62, 39, 62, "#405336", 2);
    line(39, 62, 39, 180, "#405336", 2);
    rect(-2, -2, 48, 39, "#132219");
    rect(0, 0, 44, 35, "#4d6040");
    rect(2, 2, 40, 30, "#12261c");
    rect(2, 2, 40, 1, "#7b8c5f");
    pixelText(
      `EPOCH ${String(Math.floor(progress * 24)).padStart(2, "0")}`,
      22,
      10,
      "#a6bc83",
      5,
    );
    line(6, 15, 6, 27, "#425a38");
    line(6, 27, 38, 27, "#425a38");
    const steps = Math.max(1, Math.floor(progress * 30));
    for (let i = 1; i <= steps; i++) {
      const y0 = 16 + (1 - Math.exp(-(i - 1) * 0.13)) * 9;
      const y1 = 16 + (1 - Math.exp(-i * 0.13)) * 9;
      line(6 + i - 1, y0, 6 + i, y1, "#d0ad69");
    }
    rect(37, 7, 2, 2, Math.sin(t * 1.3) > 0 ? "#b9ce8d" : "#67884e");
    s.restore();
  }

  function terminals(t) {
    // Original freestanding training terminal, beside the left furnace handle.
    s.save();
    s.translate(-130, 38);
    polygon(
      [
        [-30, -12],
        [14, -12],
        [20, -4],
        [20, 28],
        [-30, 28],
      ],
      "#101d16",
    );
    rect(-27, -9, 42, 32, "#536343");
    rect(-24, -6, 36, 24, "#10281f");
    rect(-23, -5, 34, 1, "#82946a");
    const count = Math.min(18, Math.floor(t * 2) % 24);
    for (let i = 0; i < 4; i++) {
      rect(-20, -1 + i * 4, 2, 1, "#c19958");
      rect(
        -15,
        -1 + i * 4,
        8 + hash(i + Math.floor(t * 0.5)) * 15,
        1,
        "#6f966b",
      );
    }
    rect(-20, 15, Math.min(count + 4, 25), 1, "#a2c28c");
    rect(-28, 24, 46, 6, "#3f5138");
    rect(-24, 25, 34, 2, "#7c8753");
    for (let i = 0; i < 8; i++) rect(-22 + i * 4, 25, 2, 1, "#283d2c");
    rect(-12, 30, 12, 17, "#3e5237");
    rect(-18, 47, 24, 5, "#6a7347");
    s.restore();

    // Original small data canister, distinct from the room's large cooling tower.
    s.save();
    s.translate(135, 75);
    rect(-9, -18, 18, 39, "#14221a");
    rect(-11, -13, 22, 28, "#2f4630");
    rect(-8, -11, 16, 23, "#1c3327");
    rect(-6, -8, 12, 17, "#667d4b");
    for (let i = 0; i < 4; i++) {
      rect(-5, -6 + i * 4, 10, 2, i < 2 + Math.sin(t) ? "#b9c68a" : "#7f985f");
    }
    rect(-8, -17, 16, 4, "#8b8855");
    rect(-8, 16, 16, 4, "#7a7b4d");
    rect(-9, 21, 18, 4, "#253c28");
    rect(-2, -26, 4, 8, "#8a8450");
    s.restore();
  }

  function particles(t) {
    // Training data travels inward along three circuit paths.
    for (let i = 0; i < 24; i++) {
      const f = (t * 0.13 + hash(i + 91)) % 1;
      const side = i % 2 ? 1 : -1;
      const x = side * (162 - f * 126),
        y = 18 + Math.sin(f * Math.PI) * -40 + (i % 3) * 10;
      if (f < 0.86) {
        rect(x, y, 2, 2, i % 4 ? "#9bae70" : "#eab36a");
        rect(x - side * 4, y, 2, 1, "#677b4344");
      }
    }
    for (let i = 0; i < 39; i++) {
      const f =
        (t * (0.09 + hash(i) * 0.1) * (1 + charge * 0.8) + hash(i + 31)) % 1;
      const x = (hash(i + 63) - 0.5) * 110 + Math.sin(f * 6 + i) * 8;
      const y = -30 - f * 125;
      s.globalAlpha = Math.sin(f * Math.PI) * (0.35 + hash(i + 81) * 0.6);
      rect(
        x,
        y,
        i % 5 === 0 ? 2 : 1,
        i % 5 === 0 ? 3 : 1,
        i % 3 === 0 ? "#f6da99" : "#b9a262",
      );
    }
    s.globalAlpha = 1;
    // Floor sparks near the warm vents.
    for (let i = 0; i < 8; i++) {
      const f = (t * 0.17 + hash(i + 91)) % 1;
      rect(
        (i % 2 ? 1 : -1) * (130 + hash(i) * 15),
        110 - f * 25,
        1,
        2,
        "#78946350",
      );
    }
  }

  function vapor(t) {
    // Stepped wisps drift off the warm rim, always behind the hologram.
    for (let i = 0; i < 9; i++) {
      const f = (t * 0.07 + hash(i + 610)) % 1;
      const side = i % 2 ? 1 : -1;
      const x = side * (40 + f * 16) + Math.sin(t * 0.5 + i) * 4;
      const y = -31 - f * 79;
      const width = 5 + f * 10;
      s.globalAlpha = Math.sin(f * Math.PI) * 0.055;
      rect(x - width / 2, y, width, 4 + f * 5, "#d5bb7d");
      rect(x - width / 2 + 2, y - 3, width - 4, 4, "#d5bb7d");
    }
    s.globalAlpha = 1;
  }

  // Larger environmental props share the furnace's native pixel grid and clock.
  function monitor(x, y, width, height, mode, t) {
    rect(x - 2, y - 2, width + 4, height + 4, "#101d16");
    rect(x, y, width, height, "#607052");
    rect(x + 2, y + 2, width - 4, height - 6, "#20392a");
    rect(x + 4, y + 4, width - 8, height - 10, "#10251c");
    rect(x + 2, y + 1, width - 4, 1, "#9aa477");
    const left = x + 6,
      top = y + 6,
      w = width - 12,
      h = height - 15;
    if (mode === 0) {
      for (let i = 1; i < w; i++) {
        const wave = (u) =>
          top +
          h * 0.52 +
          Math.sin(u * 0.33 + t * 1.8) * h * 0.23 +
          Math.sin(u * 0.7 - t) * h * 0.12;
        line(left + i - 1, wave(i - 1), left + i, wave(i), "#a8c58c");
      }
      rect(left, top + h - 1, w, 1, "#47643d");
    } else if (mode === 1) {
      for (let row = 0; row < Math.floor(h / 4); row++) {
        rect(left, top + row * 4, 2, 1, "#c39b60");
        rect(
          left + 5,
          top + row * 4,
          4 + hash(row + Math.floor(t * 0.7)) * (w - 10),
          1,
          "#89ae78",
        );
      }
    } else {
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 6; col++) {
          const v = 0.5 + 0.5 * Math.sin(t + row * 1.2 + col * 0.6);
          rect(
            left + col * (w / 6),
            top + row * (h / 4),
            Math.max(1, w / 6 - 2),
            Math.max(1, h / 4 - 2),
            v > 0.68 ? "#b4c17e" : v > 0.3 ? "#688d5d" : "#345139",
          );
        }
    }
    rect(x + width - 7, y + height - 3, 2, 1, "#c3c891");
    rect(x + width / 2 - 2, y + height, 5, 6, "#4f6245");
    rect(x + width / 2 - 9, y + height + 6, 19, 2, "#7b8357");
  }

  function fan(x, y, radius, t) {
    rect(
      x - radius - 3,
      y - radius - 3,
      radius * 2 + 7,
      radius * 2 + 7,
      "#15231a",
    );
    ellipse(x, y, radius + 1, radius + 1, "#75805a");
    ellipse(x, y, radius - 1, radius - 1, "#3a5038");
    for (let blade = 0; blade < 5; blade++) {
      const angle = t * 1.1 + (blade * Math.PI * 2) / 5;
      const point = (r, a) => [x + Math.cos(a) * r, y + Math.sin(a) * r];
      polygon(
        [
          point(3, angle),
          point(radius - 2, angle + 0.2),
          point(radius - 1, angle + 0.67),
          point(4, angle + 0.95),
        ],
        "#526b49",
      );
      line(
        ...point(4, angle + 0.2),
        ...point(radius - 3, angle + 0.35),
        "#7d8c60",
      );
    }
    rect(x - 2, y - 2, 5, 5, "#a19963");
    rect(x - 1, y - 1, 2, 2, "#46583a");
    for (const side of [-1, 1]) {
      bolt(x + side * (radius + 1) - 1, y - radius - 2);
      bolt(x + side * (radius + 1) - 1, y + radius);
    }
  }

  function ceilingDetails(t) {
    const distance = Math.max(224, (W * 0.335) / layout.scale);
    const halfWidth = W / layout.scale / 2 + 12;
    const y = mobile ? -235 : -168;
    // Double copper feed pipes, junctions, hanging cable loops, and a center gantry.
    for (let row = 0; row < 2; row++) {
      rect(
        -halfWidth,
        y + row * 10,
        halfWidth * 2,
        4,
        row ? "#4f5140" : "#756344",
      );
      rect(
        -halfWidth,
        y + row * 10,
        halfWidth * 2,
        1,
        row ? "#8c8959" : "#ab8954",
      );
      for (let x = -halfWidth + 20; x < halfWidth; x += 64)
        rect(x, y - 2 + row * 10, 4, 8, "#485741");
    }
    for (const side of [-1, 1]) {
      const x = side * (mobile ? 108 : distance);
      rect(x - 35, y + 24, 70, 34, "#3c5038");
      rect(x - 33, y + 26, 66, 30, "#17271d");
      fan(x - 16, y + 41, 11, t);
      fan(x + 16, y + 41, 11, -t * 0.8);
      rect(x - 32, y + 26, 64, 1, "#6b8055");
      for (let i = 0; i < 2; i++) {
        const cableX = x - 28 + i * 54;
        line(cableX, y + 12, cableX, y + 22, "#75825a");
        rect(cableX - 2, y + 18, 5, 5, "#5d6843");
      }
      const hanger = side * (mobile ? 78 : 117);
      line(hanger, y + 12, hanger, y + 23, "#536345", 2);
      rect(hanger - 19, y + 23, 38, 5, "#48563c");
      rect(hanger - 16, y + 28, 32, 2, "#b9c394");
      rect(hanger - 14, y + 30, 28, 2, "#81926833");
    }
    // Small patch panels and fiber runs fill the upper wall between devices.
    const left = mobile ? -152 : -distance - 44;
    const panelY = mobile ? -165 : -96;
    rect(left - 2, panelY - 2, 39, 35, "#17271c");
    rect(left, panelY, 35, 31, "#566344");
    rect(left + 3, panelY + 3, 29, 25, "#243e2b");
    for (let i = 0; i < 4; i++) {
      rect(left + 7 + i * 6, panelY + 7, 3, 8, "#a38a53");
      line(
        left + 8 + i * 6,
        panelY + 15,
        left + 8 + i * 6,
        panelY + 39 + i * 3,
        "#627d51",
      );
      line(
        left + 8 + i * 6,
        panelY + 39 + i * 3,
        left + 40,
        panelY + 39 + i * 3,
        "#627d51",
      );
    }
  }

  function dataShelves(t) {
    const distance = Math.max(224, (W * 0.335) / layout.scale);
    const x = mobile ? 104 : distance + 2;
    const y = mobile ? -136 : -72;
    s.save();
    s.translate(x, y);
    rect(-41, -29, 82, 32, "#192b1f");
    rect(-44, 0, 88, 5, "#687448");
    rect(-44, 0, 88, 1, "#9c9c65");
    rect(-37, 5, 4, 10, "#3d5236");
    rect(33, 5, 4, 10, "#3d5236");
    // Removable memory cartridges, with solder traces and brass edge contacts.
    for (let i = 0; i < 6; i++) {
      const px = -35 + i * 12;
      const height = 17 + (i % 3) * 3;
      rect(px, -height, 9, height, i % 2 ? "#506647" : "#384f36");
      rect(px + 1, -height + 2, 7, 1, "#96a070");
      rect(px + 2, -height + 5, 5, 6, "#182d22");
      line(px + 4, -height + 11, px + 4, -4, "#a4a264");
      for (let contact = 0; contact < 3; contact++)
        rect(px + 1 + contact * 3, -3, 1, 3, "#c3a263");
    }
    rect(-18, 6, 36, 7, "#263b28");
    pixelText("DATA BANK", 0, 11, "#8f9d70", 5);
    s.restore();
  }

  function mechanicalArm(t) {
    // A slow articulated feeder reaches toward the model without covering the core.
    const base = [mobile ? 157 : 194, -15];
    const shoulder = [mobile ? 165 : 194, -57];
    const elbow = [mobile ? 132 : 169, -127 + Math.sin(t * 0.32) * 3];
    const wrist = [83 + Math.sin(t * 0.32) * 3, -116];
    const tip = [69 + Math.sin(t * 0.32) * 3, -96 + Math.sin(t * 0.4) * 2];
    const joints = [base, shoulder, elbow, wrist, tip];
    rect(base[0] - 15, base[1] - 4, 30, 13, "#263e2b");
    rect(base[0] - 12, base[1] - 5, 24, 3, "#7b8153");
    for (let i = 1; i < joints.length; i++) {
      const a = joints[i - 1],
        b = joints[i];
      line(a[0] - 4, a[1] - 4, b[0] - 4, b[1] - 4, "#112118", 10);
      line(
        a[0] - 2,
        a[1] - 2,
        b[0] - 2,
        b[1] - 2,
        i % 2 ? "#62724c" : "#77754b",
        6,
      );
      line(a[0] - 2, a[1] - 2, b[0] - 2, b[1] - 2, "#adb17a", 1);
      if (i < 4) {
        rect(b[0] - 5, b[1] - 5, 11, 11, "#253c2b");
        rect(b[0] - 3, b[1] - 3, 7, 7, "#9f905a");
        rect(b[0] - 1, b[1] - 1, 3, 3, "#435c3d");
      }
    }
    const spread = 4 + Math.round(Math.sin(t * 0.6) + 1);
    line(tip[0], tip[1], tip[0] - 9, tip[1] - spread, "#9cab75", 2);
    line(tip[0], tip[1], tip[0] - 9, tip[1] + spread, "#9cab75", 2);
    rect(tip[0] - 10, tip[1] - spread, 2, 3, "#d1bc81");
    rect(tip[0] - 10, tip[1] + spread - 1, 2, 3, "#d1bc81");
    rect(
      shoulder[0] - 2,
      shoulder[1] + 8,
      4,
      2,
      Math.sin(t * 0.7) > 0 ? "#d5bb77" : "#85985a",
    );
  }

  function workstation(t, x, y) {
    s.save();
    s.translate(x, y);
    // A layered desk top; the monitors and keyboard remain separate silhouettes.
    polygon(
      [
        [-70, -13],
        [62, -13],
        [72, 0],
        [-79, 0],
      ],
      "#71805a",
    );
    polygon(
      [
        [-79, 0],
        [72, 0],
        [72, 7],
        [-79, 7],
      ],
      "#3d5439",
    );
    rect(-76, 1, 145, 2, "#939463");
    rect(-68, 7, 7, 55, "#3b5239");
    rect(56, 7, 7, 55, "#3b5239");
    rect(-67, 7, 2, 55, "#7c8758");
    rect(57, 7, 2, 55, "#67784b");
    rect(-68, 48, 129, 4, "#40593d");
    rect(-74, 62, 21, 4, "#263c2a");
    rect(50, 62, 21, 4, "#263c2a");
    monitor(-64, -63, 54, 36, 0, t);
    monitor(-5, -53, 40, 28, 1, t);
    polygon(
      [
        [-48, -17],
        [-7, -17],
        [-3, -9],
        [-52, -9],
      ],
      "#273d2b",
    );
    for (let row = 0; row < 3; row++)
      for (let key = 0; key < 11; key++)
        rect(
          -46 + key * 3.5,
          -16 + row * 2,
          2,
          1,
          row === 2 ? "#879570" : "#b0b48a",
        );
    rect(4, -15, 10, 6, "#788461");
    rect(6, -16, 6, 2, "#9da780");
    // A notebook and mug make the workstation visibly lived in.
    polygon(
      [
        [38, -16],
        [62, -16],
        [66, -10],
        [40, -10],
      ],
      "#9f9b73",
    );
    line(50, -16, 53, -10, "#4c6545");
    rect(39, -31, 9, 13, "#a3794b");
    rect(39, -31, 9, 2, "#d1b784");
    rect(48, -28, 3, 7, "#947b4d");
    rect(48, -26, 1, 3, "#263c28");
    for (let i = 0; i < 3; i++) {
      const f = (t * 0.2 + i / 3) % 1;
      s.globalAlpha = (1 - f) * 0.3;
      rect(42 + Math.sin(t + i) * 2, -33 - f * 10, 2, 3, "#bdc596");
    }
    s.globalAlpha = 1;
    // Computer tower under the desk, with a spinning case fan and drive lights.
    rect(-45, 14, 35, 42, "#182d20");
    rect(-43, 15, 31, 38, "#53664a");
    rect(-40, 18, 25, 5, "#203929");
    rect(-39, 19, 15, 1, "#7c945f");
    fan(-28, 37, 10, t * 1.4);
    rect(-16, 20, 2, 2, "#c6ae65");
    for (let row = 0; row < 3; row++) {
      rect(11, 20 + row * 10, 24, 8, ["#526747", "#8a744a", "#425e44"][row]);
      rect(13, 21 + row * 10, 19, 2, "#a0a273");
      rect(16, 25 + row * 10, 9, 1, "#293f2b");
    }
    // Power lead and a low stool at the front of the bench.
    line(-14, 53, -7, 70, "#101f16", 2);
    line(-7, 70, 42, 70, "#101f16", 2);
    rect(-9, 59, 29, 5, "#6f7250");
    rect(-6, 64, 3, 18, "#415940");
    rect(14, 64, 3, 18, "#415940");
    rect(-10, 81, 12, 3, "#213929");
    rect(10, 81, 12, 3, "#213929");
    s.restore();
  }

  function dataBottle(x, y, height, tone, t, phase) {
    rect(x - 4, y - height - 6, 8, 5, "#9b8c5c");
    rect(x - 3, y - height - 1, 6, 4, "#a1b497");
    polygon(
      [
        [x - 3, y - height + 2],
        [x + 3, y - height + 2],
        [x + 8, y - height + 7],
        [x + 8, y - 2],
        [x + 5, y + 1],
        [x - 5, y + 1],
        [x - 8, y - 2],
        [x - 8, y - height + 7],
      ],
      "#698e76",
    );
    rect(x - 6, y - height + 9, 12, height - 9, "#163a2e");
    rect(x - 5, y - height + 12, 10, height - 12, tone);
    rect(x - 6, y - height + 8, 2, height - 8, "#b4d4aa88");
    rect(x - 4, y - 10, 8, 5, "#a0ad78");
    rect(x - 2, y - 9, 4, 2, "#405f43");
    for (let i = 0; i < 3; i++) {
      const f = (t * 0.13 + phase + i / 3) % 1;
      rect(
        x - 3 + hash(i + phase) * 5,
        y - 13 - f * (height - 27),
        1,
        2,
        "#d4e3ad",
      );
    }
    rect(x - 6, y, 12, 2, "#9aae80");
  }

  function sampleBench(t, x, y) {
    s.save();
    s.translate(x, y);
    rect(-64, -60, 4, 124, "#405b3e");
    rect(59, -60, 4, 124, "#405b3e");
    rect(-62, -60, 1, 124, "#80906a");
    rect(60, -60, 1, 124, "#6d8058");
    rect(-70, -61, 139, 5, "#687c53");
    rect(-70, -61, 139, 1, "#adad75");
    rect(-70, -13, 139, 6, "#69764e");
    rect(-70, -13, 139, 2, "#a1a171");
    // Spare boards and training notebooks occupy the top shelf.
    for (let i = 0; i < 4; i++) {
      const bx = -53 + i * 10;
      rect(bx, -84, 7, 23, ["#677f59", "#947d52", "#537958", "#9b9064"][i]);
      rect(bx + 1, -81, 5, 2, "#b6bd8e");
      rect(bx + 2, -67, 3, 1, "#273f2d");
    }
    rect(3, -81, 44, 18, "#354f36");
    rect(5, -79, 40, 14, "#617a51");
    rect(10, -76, 10, 7, "#1d3527");
    rect(30, -76, 10, 7, "#1d3527");
    for (let i = 0; i < 6; i++) rect(8 + i * 6, -66, 2, 4, "#c0a76c");
    dataBottle(-44, -15, 38, "#598d72", t, 0.1);
    dataBottle(-11, -15, 29, "#b69a55", t, 0.45);
    dataBottle(24, -15, 36, "#738f65", t, 0.7);
    rect(43, -35, 13, 20, "#263e2b");
    rect(45, -33, 9, 10, "#a3b47e");
    for (let i = 0; i < 3; i++) rect(46, -31 + i * 3, 7, 1, "#435f40");
    // Labeled data crates fill the lower shelf, rather than a featureless wall.
    rect(-58, 1, 49, 40, "#334d34");
    rect(-55, 4, 43, 34, "#60744e");
    rect(-58, 1, 49, 4, "#96a06b");
    rect(-52, 16, 37, 3, "#314b32");
    rect(-46, 24, 24, 8, "#243f2e");
    pixelText("DATA", -34, 30, "#a6b58a", 5);
    rect(2, 7, 50, 34, "#605a3e");
    rect(5, 10, 44, 28, "#8a7b4f");
    rect(4, 19, 46, 4, "#465c3e");
    rect(18, 13, 17, 5, "#c1ae76");
    rect(-70, 42, 139, 5, "#68764e");
    rect(-68, 47, 135, 3, "#263e2b");
    rect(-66, 62, 12, 6, "#172b1e");
    rect(53, 62, 12, 6, "#172b1e");
    s.restore();
  }

  function foregroundDetails(t) {
    const distance = Math.max(224, (W * 0.335) / layout.scale);
    workstation(t, mobile ? -103 : -distance, mobile ? 244 : 137);
    sampleBench(t, mobile ? 110 : distance + 2, mobile ? 245 : 147);
    // Loose memory cassettes and a coiled lead on the front floor.
    s.save();
    s.translate(mobile ? 0 : -170, mobile ? 309 : 208);
    polygon(
      [
        [-17, -4],
        [5, -4],
        [10, 0],
        [-12, 0],
      ],
      "#9a8555",
    );
    rect(-12, 0, 22, 8, "#4c6542");
    rect(-10, 2, 18, 2, "#bac08a");
    rect(15, 5, 16, 7, "#6d714b");
    rect(17, 7, 12, 2, "#b2a56b");
    ellipse(8, 18, 29, 7, "#132a1b", 2);
    ellipse(8, 18, 22, 5, "#475f3c");
    s.restore();
  }

  function render() {
    if (!layout) return;
    const { cx, cy, scale } = layout;
    const t = clock / 1000;
    charge = 0.38 + (Math.sin(t * 0.38) * 0.5 + 0.5) * 0.48;
    progress = (t / 28) % 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(backdrop, 0, 0);
    environment(t);
    const lighting = ctx.createRadialGradient(
      cx,
      cy - 18 * scale,
      2,
      cx,
      cy - 18 * scale,
      161 * scale,
    );
    lighting.addColorStop(0, `rgba(225,141,52,${0.13 + charge * 0.055})`);
    lighting.addColorStop(0.5, "rgba(196,131,50,.055)");
    lighting.addColorStop(1, "rgba(196,131,50,0)");
    ctx.fillStyle = lighting;
    ctx.fillRect(cx - 170 * scale, cy - 184 * scale, 340 * scale, 350 * scale);
    // Grounded, gently breathing warmth below the furnace.
    ctx.save();
    ctx.translate(cx, cy + 119 * scale);
    ctx.scale(1, 0.22);
    const floorLight = ctx.createRadialGradient(0, 0, 0, 0, 0, 165 * scale);
    floorLight.addColorStop(0, "#da934025");
    floorLight.addColorStop(1, "#da934000");
    ctx.fillStyle = floorLight;
    ctx.fillRect(-165 * scale, -165 * scale, 330 * scale, 330 * scale);
    ctx.restore();

    s.clearRect(0, 0, scene.width, scene.height);
    s.save();
    s.translate(sceneOriginX, sceneOriginY);
    ceilingDetails(t);
    dataShelves(t);
    mechanicalArm(t);
    wallInstruments(t);
    pedestal(t);
    if (blastMode) {
      // Resize only the furnace, keeping its feet on the existing laboratory platform.
      if (furnaceScale !== 1) {
        s.save();
        s.translate(0, 121 * (1 - furnaceScale));
        s.scale(furnaceScale, furnaceScale);
      }
      blastFurnace(t);
      s.save();
      s.translate(0, -45);
      vapor(t);
      s.restore();
      if (furnaceScale !== 1) s.restore();
    } else {
      handles(t);
      feet();
      body(t);
      rim(t);
      vapor(t);
    }
    floatingCore(t);
    terminals(t);
    particles(t);
    foregroundDetails(t);
    s.restore();
    ctx.drawImage(
      scene,
      Math.round(cx - sceneOriginX * scale),
      Math.round(cy - sceneOriginY * scale),
      Math.round(scene.width * scale),
      Math.round(scene.height * scale),
    );
    window.dispatchEvent(
      new CustomEvent("aichemy-frame", { detail: { time: t, progress } }),
    );
  }

  function frame(timestamp) {
    raf = 0;
    const delta = lastTime ? Math.min(timestamp - lastTime, 100) : 0;
    lastTime = timestamp;
    if (!paused) clock += delta;
    if (timestamp - lastPaint >= 1000 / 30) {
      render();
      lastPaint = timestamp;
    }
    if (visible && inView && !paused && !suspended)
      raf = requestAnimationFrame(frame);
  }
  function schedule() {
    if (!raf && visible && inView && !paused && !suspended) {
      lastTime = 0;
      lastPaint = -Infinity;
      raf = requestAnimationFrame(frame);
    }
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    W = Math.max(1, Math.ceil(bounds.width / 2));
    H = Math.max(1, Math.ceil(bounds.height / 2));
    mobile = bounds.width < bounds.height;
    canvas.width = W;
    canvas.height = H;
    backdrop.width = W;
    backdrop.height = H;
    furnaceScale =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--furnace-scale")) || 1;
    layout = compose();
    // Keep the original scene scale. Phone composition moves upward as a whole.
    // Scroll navigation reads this home position without changing canvas layout.
    if (heading) {
      const pixelScale = bounds.height / H;
      // Allow the larger display title to overlap the furnace instead of shrinking
      // or shifting the illustration to make room for it.
      const titleHeight =
        bounds.height < 550 && !mobile
          ? 40
          : bounds.width <= 360
            ? 50
            : bounds.width <= 700
              ? 54
              : bounds.width >= 1600 && bounds.height >= 950
                ? 88
                : 72;
      const gap = bounds.height < 550 ? 6 : 10;
      const rimY = (layout.cy - 42 * layout.scale) * pixelScale;
      heading.style.setProperty(
        "--title-home-top",
        `${Math.round(rimY - titleHeight - gap)}px`,
      );
      const desiredLift = Math.max(
        24,
        (titleHeight + gap + 8) / (layout.scale * pixelScale) - 15,
      );
      const visibleLift = Math.max(0, (layout.cy - 4) / layout.scale - 128);
      coreLift = Math.min(desiredLift + (blastMode ? 14 : 0), visibleLift);
    }
    scene.width = Math.max(720, Math.ceil(W / layout.scale) + 80);
    scene.height = Math.max(440, Math.ceil(H / layout.scale) + 80);
    sceneOriginX = Math.floor(scene.width / 2);
    sceneOriginY = Math.round(layout.cy / layout.scale) + 40;
    drawBackdrop();
    if (!suspended) render();
    schedule();
  }
  function setPaused(value, announce = true) {
    paused = value;
    document.querySelector(".scene").classList.toggle("is-paused", paused);
    const button = document.getElementById("animation-toggle");
    button.setAttribute("aria-pressed", String(paused));
    button.setAttribute("aria-label", paused ? "播放丹炉动画" : "暂停丹炉动画");
    if (announce)
      document.getElementById("animation-status").textContent = paused
        ? "丹炉动画已暂停"
        : "丹炉动画继续播放";
    if (paused && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else schedule();
    window.dispatchEvent(
      new CustomEvent("aichemy-state", { detail: { paused } }),
    );
  }
  window.AIchemyFurnace = {
    get variant() {
      return blastMode ? "blast" : "cauldron";
    },
    togglePause() {
      setPaused(!paused);
      return paused;
    },
    get paused() {
      return paused;
    },
    get state() {
      return { time: clock / 1000, progress: (clock / 28000) % 1 };
    },
    // Another hero renderer can take over without changing the user's pause state.
    // On return, the shared clock keeps the instruments continuous.
    setSuspended(value, time) {
      suspended = value;
      if (typeof time === "number") clock = time * 1000;
      if (suspended) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else {
        render();
        schedule();
      }
    },
  };
  new ResizeObserver(resize).observe(canvas);
  if (heading) new ResizeObserver(resize).observe(heading);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else schedule();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (!visible && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else schedule();
  });
  reducedMotion.addEventListener("change", (event) => setPaused(event.matches));
  resize();
  setPaused(paused, false);
})();
