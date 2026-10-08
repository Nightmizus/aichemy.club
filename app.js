(() => {
  "use strict";
  const scene = document.querySelector(".scene");
  const pauseButton = document.getElementById("animation-toggle");
  const sceneOptions = [...document.querySelectorAll(".mode-option")];
  const navigation = [...document.querySelectorAll(".nav-window")];
  let hideTimer,
    lastMetricsTime = -Infinity,
    lastBatch = -1;

  function showControl() {
    scene.classList.add("controls-visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(
      () => scene.classList.remove("controls-visible"),
      1800,
    );
  }
  pauseButton.addEventListener("click", () => {
    window.AIchemyFurnace.togglePause();
    showControl();
  });
  function updateSceneOptions() {
    sceneOptions.forEach((option) =>
      option.setAttribute(
        "aria-pressed",
        String(option.dataset.scene === window.AIchemyScene.mode),
      ),
    );
  }
  sceneOptions.forEach((option) =>
    option.addEventListener("click", () => {
      window.AIchemyScene.setMode(option.dataset.scene);
      showControl();
    }),
  );
  window.addEventListener("aichemy-scene", updateSceneOptions);
  updateSceneOptions();
  scene.addEventListener("pointermove", showControl, { passive: true });
  scene.addEventListener("pointerdown", showControl, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (
      event.code !== "Space" ||
      scene.getBoundingClientRect().bottom < window.innerHeight * 0.5 ||
      event.target.closest(
        'button, a, input, textarea, select, [contenteditable="true"]',
      ) ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    event.preventDefault();
    window.AIchemyFurnace.togglePause();
    showControl();
  });

  const chart = document.getElementById("hud-loss-chart");
  const chartContext = chart.getContext("2d");
  const lossValue = document.getElementById("hud-loss");
  const epochValue = document.getElementById("hud-epoch");
  const gpuValue = document.getElementById("hud-gpu");
  const memoryValue = document.getElementById("hud-memory");
  const progressFill = document.getElementById("hud-progress-fill");
  const progressLabel = document.getElementById("hud-progress-label");
  const memoryFill = document.getElementById("hud-memory-fill");
  const log = document.getElementById("hud-data-log");
  const stages = [...document.querySelectorAll(".pipeline>span")];
  const gpuMeter = document.getElementById("hud-gpu-meter");
  const gpuSegments = Array.from({ length: 18 }, () =>
    document.createElement("i"),
  );
  gpuMeter.append(...gpuSegments);

  const trainLoss = (progress) => 2.448 * Math.exp(-progress * 5.2) + 0.032;
  const validationLoss = (progress) =>
    trainLoss(progress) * 1.12 + 0.045 + Math.sin(progress * 25) * 0.025;
  function drawLoss(progress) {
    const ctx = chartContext,
      width = chart.width,
      height = chart.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#88a97a18";
    for (let x = 6; x < width; x += 68) ctx.fillRect(x, 2, 1, height - 8);
    for (let y = 10; y < height; y += 23) ctx.fillRect(6, y, width - 12, 1);
    function path(fn, color, end, alpha) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const steps = Math.max(2, Math.ceil(end * 90));
      for (let i = 0; i <= steps; i++) {
        const p = (end * i) / steps;
        const x = Math.round(7 + p * (width - 16));
        const y = Math.round(height - 8 - (fn(p) / 3) * (height - 14));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Faint complete paths give context for the animated simulation traces.
    path(trainLoss, "#d4b271", 1, 0.16);
    path(validationLoss, "#95c09b", 1, 0.12);
    path(validationLoss, "#95c09b", progress, 0.85);
    path(trainLoss, "#ebbd7a", progress, 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f9d799";
    ctx.fillRect(
      Math.round(7 + progress * (width - 16)) - 2,
      Math.round(height - 8 - (trainLoss(progress) / 3) * (height - 14)) - 2,
      5,
      5,
    );
  }
  function updatePanels({ time, progress }) {
    // Only navigation cards float; the four instrument screens stay mounted.
    navigation.forEach((link, index) => {
      link.style.setProperty(
        "--float-y",
        (Math.sin(time * 0.62 + index * 1.7) * 3).toFixed(2) + "px",
      );
    });
    if (time >= lastMetricsTime && time - lastMetricsTime < 0.18) return;
    lastMetricsTime = time;
    epochValue.textContent = String(
      Math.min(24, Math.floor(progress * 24) + 1),
    ).padStart(2, "0");
    lossValue.textContent = trainLoss(progress).toFixed(3);
    progressFill.style.width = `${progress * 100}%`;
    progressLabel.textContent = `${(progress * 100).toFixed(1)}%`;
    const gpu = Math.round(
      89 + Math.sin(time * 0.7) * 5 + Math.sin(time * 1.8) * 2,
    );
    const memory = 6.65 + Math.sin(time * 0.4) * 0.25;
    gpuValue.firstChild.nodeValue = String(gpu);
    memoryValue.textContent = memory.toFixed(1);
    memoryFill.style.width = `${(memory / 8) * 100}%`;
    gpuSegments.forEach((segment, i) =>
      segment.classList.toggle(
        "is-lit",
        i < Math.round((gpu / 100) * gpuSegments.length),
      ),
    );
    drawLoss(progress);
    const batch = Math.floor(time * 1.2);
    if (batch !== lastBatch) {
      lastBatch = batch;
      const messages = [
        `batch_${String(batch % 1000).padStart(3, "0")} → loaded`,
        "forward pass ... ok",
        "gradients → synced",
      ];
      log.replaceChildren(
        ...messages.map((message, i) => {
          const line = document.createElement("p");
          const number = document.createElement("span");
          number.textContent = String(728 + batch * 3 + i).padStart(4, "0");
          line.append(number, message);
          return line;
        }),
      );
      stages.forEach((stage, i) =>
        stage.classList.toggle("is-active", i === batch % 3),
      );
    }
  }
  function updatePauseState() {
    document.getElementById("hud-train-state").textContent = window
      .AIchemyFurnace.paused
      ? "模拟已暂停"
      : "参数更新中";
  }
  window.addEventListener("aichemy-frame", (event) =>
    updatePanels(event.detail),
  );
  window.addEventListener("aichemy-state", updatePauseState);
  updatePanels(window.AIchemyFurnace.state);
  updatePauseState();

  // The same title travels from the laboratory into the navigation bar.
  const title = document.querySelector(".hero-title-space");
  const titleText = title.querySelector("h1");
  const siteNav = document.querySelector(".site-nav");
  const brandSlot = document.querySelector(".site-brand-slot");
  const siteLinks = [...document.querySelectorAll(".site-links a")];
  const sections = [...document.querySelectorAll(".detail-section")];
  const furnace = document.getElementById("furnace");
  const room = document.getElementById("lab-backdrop");
  const roomContext = room.getContext("2d");
  const motionPreference = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
  let scrollFrame = 0;
  let floorNeedsCapture = true;
  const clamp = (value) => Math.max(0, Math.min(1, value));

  function captureFloor() {
    if (!furnace.width || !furnace.height) return;
    room.width = furnace.width;
    room.height = furnace.height;
    roomContext.clearRect(0, 0, room.width, room.height);
    roomContext.drawImage(furnace, 0, 0);
    // Retain the worktables, lower pipes and platform, with a soft upper edge.
    // This is a still from the existing scene, without a second animation loop.
    roomContext.globalCompositeOperation = "destination-in";
    const fade = roomContext.createLinearGradient(
      0,
      room.height * 0.6,
      0,
      room.height * 0.88,
    );
    fade.addColorStop(0, "transparent");
    fade.addColorStop(0.4, "#0005");
    fade.addColorStop(1, "#000");
    roomContext.fillStyle = fade;
    roomContext.fillRect(0, 0, room.width, room.height);
    roomContext.globalCompositeOperation = "source-over";
    floorNeedsCapture = false;
  }

  function updateScrollLayout() {
    scrollFrame = 0;
    const y = Math.max(0, window.scrollY);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const homeTop =
      parseFloat(title.style.getPropertyValue("--title-home-top")) ||
      height * 0.27;
    // Follow the page at full size until the title reaches the viewport's top.
    // Only the remaining scroll distance drives the move into the left slot.
    const dockDistance = Math.min(220, Math.max(120, height * 0.24));
    const pastEdge = Math.max(0, y - homeTop);
    const progress = motionPreference.matches
      ? y >= homeTop
        ? 1
        : 0
      : clamp(pastEdge / dockDistance);
    const eased = progress * progress * (3 - 2 * progress);
    const reveal = motionPreference.matches ? progress : clamp(progress * 2);
    // Let the title clear the links before revealing their text on narrow screens.
    const linksReveal = motionPreference.matches
      ? progress
      : clamp((progress - 0.6) / 0.35);
    const slot = brandSlot.getBoundingClientRect();
    const fontSize = parseFloat(getComputedStyle(titleText).fontSize);
    const targetFontSize = width <= 360 ? 18 : width <= 700 ? 20 : 32;
    const targetScale = targetFontSize / fontSize;
    const targetTop =
      (siteNav.offsetHeight - titleText.offsetHeight * targetScale) / 2;
    const targetX = slot.left + slot.width / 2;
    const pageTop = Math.max(0, homeTop - y);

    title.style.setProperty(
      "--title-x",
      `${width / 2 + (targetX - width / 2) * eased}px`,
    );
    title.style.setProperty(
      "--title-y",
      `${pageTop + (targetTop - pageTop) * eased}px`,
    );
    title.style.setProperty(
      "--title-scale",
      String(1 + (targetScale - 1) * eased),
    );
    title.style.setProperty("--title-backdrop", String(1 - eased));
    title.style.setProperty(
      "--subtitle-opacity",
      String(1 - clamp(progress * 2.5)),
    );
    title.style.pointerEvents = progress >= 1 ? "auto" : "none";
    document.documentElement.style.setProperty("--nav-reveal", String(reveal));
    document.documentElement.style.setProperty(
      "--nav-links-reveal",
      String(linksReveal),
    );
    document.documentElement.style.setProperty(
      "--room-opacity",
      String(clamp((y - height * 0.55) / (height * 0.45)) * 0.7),
    );
    siteNav.inert = linksReveal < 0.8;
    siteNav.setAttribute("aria-hidden", String(linksReveal < 0.8));
    document.body.classList.toggle("has-site-nav", reveal > 0.5);

    let activeId = "";
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= height * 0.45)
        activeId = section.id;
    });
    const maxScroll = document.documentElement.scrollHeight - height;
    if (y >= maxScroll - 2) {
      // Short final sections may share the same clamped scroll destination.
      // Honor the requested anchor there, even if scrolling cannot move further.
      const requested = sections.find(
        (section) => `#${section.id}` === location.hash,
      );
      const requestedTop = requested
        ? requested.getBoundingClientRect().top +
          y -
          parseFloat(getComputedStyle(requested).scrollMarginTop)
        : -1;
      activeId =
        requestedTop >= maxScroll - 2 ? requested.id : sections.at(-1).id;
    }
    siteLinks.forEach((link) => {
      if (link.hash === `#${activeId}`)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    if (floorNeedsCapture) captureFloor();
  }

  function scheduleScrollLayout() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollLayout);
  }
  window.addEventListener("scroll", scheduleScrollLayout, { passive: true });
  window.addEventListener("hashchange", scheduleScrollLayout);
  window.addEventListener("resize", () => {
    floorNeedsCapture = true;
    scheduleScrollLayout();
  });
  window.addEventListener("aichemy-frame", () => {
    if (floorNeedsCapture) scheduleScrollLayout();
  });
  window.addEventListener("aichemy-scene", () => {
    // Returning to the pixel hero needs a fresh floor still in the shared canvas.
    floorNeedsCapture = true;
    scheduleScrollLayout();
  });
  motionPreference.addEventListener("change", scheduleScrollLayout);
  // Observe only layout changes; scroll transforms do not resize this element.
  new ResizeObserver(() => {
    floorNeedsCapture = true;
    scheduleScrollLayout();
  }).observe(furnace);
  document.fonts.ready.then(scheduleScrollLayout);
  scheduleScrollLayout();
})();
