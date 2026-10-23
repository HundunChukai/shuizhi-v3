(function () {
  "use strict";

  var splash = document.getElementById("splash");
  if (!splash) return;

  var visit = window.__SPLASH_STATE__;
  if (visit && visit.seen) { splash.remove(); return; }

  function requestApplication() {
    if (!visit || visit.appRequested) return;
    visit.appRequested = true;
    if (visit.startApp) visit.startApp();
  }

  function rememberVisit() {
    if (!visit || visit.debug) return;
    visit.dismissed = true;
    if (window.__APP_MOUNTED__ === true) {
      try { localStorage.setItem(visit.key, "1"); } catch (_) {}
    }
  }

  var scene = splash.querySelector(".sc-scene");
  var moon = splash.querySelector(".sc-moon");
  var moonImage = moon.querySelector("img");
  var skyImage = splash.querySelector(".sc-sky");
  var seaImage = splash.querySelector(".sc-sea-base");
  var waveImages = Array.prototype.slice.call(splash.querySelectorAll(".sc-wave img"));
  var waveLeft = splash.querySelector(".sc-wave-left");
  var waveRight = splash.querySelector(".sc-wave-right");
  var canvas = splash.querySelector(".sc-water");
  var network = splash.querySelector(".sc-network");
  var metrics = Array.prototype.slice.call(splash.querySelectorAll(".sc-node"));
  var footer = Array.prototype.slice.call(splash.querySelectorAll(".sc-footer span"));
  var copy = splash.querySelector(".sc-copy");
  var loader = splash.querySelector(".sc-loader");
  var skipButton = splash.querySelector(".sc-skip");
  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) {}

  var development = splash.dataset.mode === "development";
  var search = new URLSearchParams(location.search);
  var testMode = development ? search.get("splashTest") : null;
  if (testMode === "reduced") {
    reduced = true;
    splash.classList.add("sc-reduced");
  }
  var frozenAt = development && search.has("splashAt") ? Number(search.get("splashAt")) : NaN;
  var frozenPhase = development ? Number(search.get("splashPhase")) : 0;
  var phaseTimes = { 1: 500, 2: 2000, 3: 4200, 4: 6000, 5: 7500 };
  if (!Number.isFinite(frozenAt) && phaseTimes[frozenPhase]) frozenAt = phaseTimes[frozenPhase];
  var frozen = Number.isFinite(frozenAt) && frozenAt >= 0 && frozenAt <= 9000;

  var context = null;
  try { if (testMode !== "canvasOff") context = canvas.getContext("2d", { alpha: true }); } catch (_) {}
  var startTime = performance.now();
  var hiddenAt = document.hidden ? startTime : 0;
  var hiddenTotal = 0;
  var heldAt = 0;
  var heldTotal = 0;

  var frameId = 0;
  var exitTimer = 0;
  var width = 0;
  var height = 0;
  var horizon = 0;
  var seaHeight = 0;
  var moonSize = 0;
  var ringSize = 0;
  var seaReady = false;
  var assetsReady = false;
  var sceneReady = false;
  var warmupFrames = 0;
  var warmupStart = 0;
  var warmupLast = 0;
  var applicationWarmup = 0;
  var playbackStart = null;
  var removed = false;
  var leaving = false;
  var trackedImages = [];
  var glints = [];
  var trails = [];
  var lastStage = 0;


  var scrollbarProbe = document.createElement("div");
  scrollbarProbe.style.cssText = "position:absolute;left:-9999px;top:0;width:100px;height:100px;overflow:scroll";
  document.body.appendChild(scrollbarProbe);
  document.documentElement.style.setProperty("--splash-scrollbar-width", (scrollbarProbe.offsetWidth - scrollbarProbe.clientWidth) + "px");
  scrollbarProbe.remove();
  document.documentElement.classList.add("splash-lock");

  function clamp(value) { return Math.max(0, Math.min(1, value)); }
  function ease(value) { value = clamp(value); return value * value * (3 - 2 * value); }
  function mix(a, b, value) { return a + (b - a) * value; }
  function round(value) { return Math.round(value * 100) / 100; }
  function seeded(index) {
    var value = Math.sin(index * 78.233 + 21.819) * 43758.5453;
    return value - Math.floor(value);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    splash.style.width = width + "px";
    splash.style.height = height + "px";
    var shortLandscape = height < 540 && width > height;
    horizon = height * (shortLandscape ? .64 : width <= 680 ? .62 : .58);
    seaHeight = Math.max(1, height - horizon);
    moonSize = shortLandscape ? Math.min(115, height * .24) : width <= 680 ? Math.min(132, width * .26) : Math.min(188, width * .15);
    ringSize = shortLandscape ? Math.min(height * .53, 300, width * .7) : width <= 680 ? Math.min(width * .72, 390, height * .57) : Math.min(width * .44, 520, height * .65);
    scene.style.setProperty("--horizon", horizon + "px");
    scene.style.setProperty("--moon-size", moonSize + "px");

    if (context) {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(seaHeight * dpr));
      canvas.style.top = horizon + "px";
      canvas.style.height = seaHeight + "px";
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    glints = [];
    var count = width < 680 ? 58 : 105;
    for (var i = 0; i < count; i++) {
      glints.push({
        depth: seeded(i + 4),
        side: seeded(i + 701) * 2 - 1,
        length: .5 + seeded(i + 1101) * 2.5,
        phase: seeded(i + 1901) * Math.PI * 2,
        light: .13 + seeded(i + 2301) * .5
      });
    }
    buildNetwork();
    if (frozen) render(frozenAt, performance.now());
  }

  function buildNetwork() {
    var rows = width < 680 ? 5 : 7;
    var cols = width < 680 ? 6 : 7;
    var points = [];
    var lines = [];
    var svgNS = "http://www.w3.org/2000/svg";
    for (var row = 0; row < rows; row++) {
      var lat = (row / (rows - 1) - .5) * 2.3;
      points[row] = [];
      for (var col = 0; col < cols; col++) {
        var lon = (col / (cols - 1) - .5) * 2.24;
        var jitter = seeded(row * cols + col + 410);
        points[row][col] = [round(50 + 43 * Math.sin(lon) * Math.cos(lat) + (jitter - .5) * 2.5), round(50 + 43 * Math.sin(lat) + (seeded(row * cols + col + 920) - .5) * 2.5)];
      }
    }
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var point = points[y][x];
        if (x + 1 < cols) lines.push("M" + point.join(" ") + "L" + points[y][x + 1].join(" "));
        if (y + 1 < rows) lines.push("M" + point.join(" ") + "L" + points[y + 1][x].join(" "));
        if (x + 1 < cols && y + 1 < rows && (x + y) % 2 === 0) lines.push("M" + point.join(" ") + "L" + points[y + 1][x + 1].join(" "));
      }
    }
    network.replaceChildren();
    var path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", lines.join(""));
    network.appendChild(path);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", points[r][c][0]);
        dot.setAttribute("cy", points[r][c][1]);
        dot.setAttribute("r", (r * cols + c) % 9 === 0 ? ".8" : ".37");
        network.appendChild(dot);
      }
    }
    if (!trails.length) {
      var trailSvg = document.createElementNS(svgNS, "svg");
      trailSvg.classList.add("sc-trails");
      trailSvg.setAttribute("aria-hidden", "true");
      trailSvg.setAttribute("width", "100%");
      trailSvg.setAttribute("height", "100%");
      trailSvg.style.cssText = "position:absolute;inset:0;overflow:visible;fill:none;stroke:#89dfff;stroke-width:1.1;filter:drop-shadow(0 0 3px #52bbff)";
      splash.querySelector(".sc-metrics").prepend(trailSvg);
      for (var n = 0; n < metrics.length; n++) {
        var trail = document.createElementNS(svgNS, "path");
        trail.style.strokeDasharray = "450";
        trailSvg.appendChild(trail);
        trails.push(trail);
      }
    }
  }

  function trackImage(image, source) {
    return new Promise(function (resolve) {
      trackedImages.push(image);
      var done = false;
      function settle() {
        if (done) return;
        done = true;
        image.onload = null;
        image.onerror = null;
        if (!image.naturalWidth) image.style.visibility = "hidden";
        if (image === seaImage) seaReady = image.naturalWidth > 0;
        if (image === moonImage && !image.naturalWidth) moon.classList.add("moon-failed");
        resolve();
      }
      image.onload = function () {
        if (image.decode) image.decode().then(settle, settle);
        else settle();
      };
      image.onerror = settle;
      if (source) image.src = source;
      if (image.complete) {
        if (image.naturalWidth && image.decode) image.decode().then(settle, settle);
        else settle();
      }
    });
  }

  function preload() {
    var entry = (location.hash || "").indexOf("#/main") === 0 ? "./images/system-main-ocean-v1.webp" : "./hero-reef-v2.webp";
    var entryImage = new Image();
    var critical = [skyImage, moonImage, seaImage].map(function (image) { return trackImage(image); });
    Promise.all(critical).then(function () { sceneReady = true; });
    var promises = critical.concat(waveImages.map(function (image) { return trackImage(image); }));
    promises.push(trackImage(entryImage, entry));
    Promise.all(promises).then(function () {
      assetsReady = true;
      if (frozen && !removed) render(frozenAt, performance.now());
    });
  }

  function drawSea(time, rise) {
    if (!context || !seaReady) return;
    context.clearRect(0, 0, width, seaHeight);
    var bands = width < 680 ? 9 : 14;
    for (var band = 0; band < bands; band++) {
      var from = band / bands;
      var to = (band + 1) / bands;
      var drift = Math.sin(time * .0002 + band * .83) * (1.1 + from * 3.3);
      context.drawImage(seaImage, 0, seaImage.naturalHeight * from, seaImage.naturalWidth, seaImage.naturalHeight * (to - from) + 2, -6 + drift, seaHeight * from, width + 12, seaHeight * (to - from) + 1.5);
    }
    context.fillStyle = "rgba(1,9,20," + round(mix(.41, .13, rise)) + ")";
    context.fillRect(0, 0, width, seaHeight);
    var strength = mix(.1, .66, rise);
    for (var i = 0; i < glints.length; i++) {
      var glint = glints[i];
      var depth = glint.depth;
      var spread = width * (.017 + .16 * depth);
      var x = width / 2 + glint.side * spread + Math.sin(time * .00082 + glint.phase) * (1.3 + depth * 3);
      var y = seaHeight * depth;
      var alpha = glint.light * strength * (.57 + .43 * Math.sin(time * .00135 + glint.phase));
      context.strokeStyle = "rgba(220,240,243," + round(alpha) + ")";
      context.lineWidth = .55 + depth * 1.15;
      context.beginPath();
      context.moveTo(x - glint.length * (2 + depth * 7), y);
      context.quadraticCurveTo(x, y - depth * 1.6, x + glint.length * (2 + depth * 7), y + depth);
      context.stroke();
    }
  }

  function isReady(time) {
    return assetsReady && window.__APP_MOUNTED__ === true && testMode !== "timeout" && (testMode !== "slow" || time - startTime - hiddenTotal >= 8000);
  }

  function render(t, time) {
    var stage = t < 1000 ? 1 : t < 3000 ? 2 : t < 4800 ? 3 : t < 6800 ? 4 : 5;
    if (stage !== lastStage) {
      lastStage = stage;
      splash.dataset.stage = String(stage);
    }
    var rise = ease((t - 1000) / 2000);
    var converge = ease((t - 4800) / 1150);
    var clearData = ease((t - 6800) / 600);
    var wallForm = ease((t - 6800) / 600);
    var opening = ease((t - 8100) / 900);
    var baseY = horizon + moonSize * .58 - moonSize * 1.12 * rise;
    var globeY = baseY - moonSize * .18 * converge;
    var fifthY = horizon - moonSize * 1.16;
    var moonY = mix(globeY, fifthY, clearData);
    var scale = mix(1 + .45 * converge, 1.02, clearData);
    scene.style.setProperty("--moon-y", round(moonY) + "px");
    scene.style.setProperty("--moon-scale", scale.toFixed(4));
    scene.style.setProperty("--moon-brightness", round(1.17 - .35 * converge * (1 - clearData)));
    scene.style.setProperty("--moon-glow", round(mix(.13, .48, rise) * (1 - .18 * converge)));
    scene.style.setProperty("--network", round(ease((t - 5100) / 1050) * (1 - clearData)));
    scene.style.setProperty("--data-tint", round(ease((t - 5000) / 1050) * .84 * (1 - clearData)));
    scene.style.setProperty("--orbit-opacity", round((.37 * ease((t - 3000) / 450) + .52 * ease((t - 4900) / 800)) * (1 - clearData)));
    scene.style.setProperty("--orbit-size", round(mix(ringSize * .82, moonSize * 1.9, converge)) + "px");
    scene.style.setProperty("--road-opacity", round(wallForm * .67 * (1 - opening * .4)));

    var copyOpacity = 1 - ease((t - 2200) / 600);
    copy.style.opacity = round(copyOpacity);
    loader.style.opacity = round(1 - opening);
    var statusText = visit && visit.appFailed ? "页面加载失败，请刷新重试" : isReady(time) ? "页面已就绪，即将进入" : "正在准备页面…";
    if (loader.textContent !== statusText) loader.textContent = statusText;
    var fadeBoundaries = [1000, 3000, 4800, 6800];
    for (var f = 0; f < footer.length; f++) {
      var inValue = f === 0 ? 1 : ease((t - fadeBoundaries[f - 1] + 120) / 240);
      var outValue = f === footer.length - 1 ? 1 : 1 - ease((t - fadeBoundaries[f] + 120) / 240);
      footer[f].style.opacity = round(inValue * outValue * (1 - opening));
    }

    var ringY = moonY;
    for (var i = 0; i < metrics.length; i++) {
      var element = metrics[i];
      var rx = Number(element.style.getPropertyValue("--x"));
      var ry = Number(element.style.getPropertyValue("--y"));
      var intro = ease((t - 3000 - i * 140) / 500);
      var gather = ease((t - 4800 - i * 105) / 1030);
      var fromX = rx * ringSize;
      var fromY = ringY + ry * ringSize;
      var toX = rx * moonSize * .47;
      var toY = globeY + ry * moonSize * .47;
      var bend = Math.sin(Math.PI * gather);
      var x = mix(fromX * intro, toX, gather) + Math.sign(rx) * moonSize * .12 * bend;
      var y = mix(ringY + (fromY - ringY) * intro, toY, gather) - moonSize * .1 * bend;
      var nodeScale = mix(.68 + .32 * intro, .12, gather);
      element.style.transform = "translate(-50%,-50%) translate3d(" + round(x) + "px," + round(y) + "px,0) scale(" + round(nodeScale) + ")";
      element.style.opacity = round(intro * (1 - ease((gather - .68) / .32)) * (1 - clearData));
      element.firstElementChild.style.opacity = round(1 - ease((gather - .08) / .48));
      trails[i].setAttribute("d", "M" + round(width / 2 + fromX) + " " + round(fromY) + " Q" + round(width / 2 + fromX * .75) + " " + round(Math.min(fromY, toY) - moonSize * .16) + " " + round(width / 2 + toX) + " " + round(toY));
      trails[i].style.opacity = round(Math.sin(Math.PI * gather) * .62);
      trails[i].style.strokeDashoffset = round(450 * (1 - gather));
    }
    waveLeft.style.opacity = round(wallForm * (1 - opening * .2));
    waveRight.style.opacity = round(wallForm * (1 - opening * .2));
    var waveRetreat = 120 * ease((opening - .2) / .8);
    waveLeft.style.transform = "translate3d(" + round(-12 * (1 - wallForm) - waveRetreat) + "%," + round(30 * (1 - wallForm)) + "%,0)";
    waveRight.style.transform = "translate3d(" + round(12 * (1 - wallForm) + waveRetreat) + "%," + round(30 * (1 - wallForm)) + "%,0)";
    splash.style.opacity = round(1 - opening);
    try { if (!reduced) drawSea(time - startTime - hiddenTotal, rise); } catch (_) { context = null; }
  }

  function cleanup() {
    if (removed) return;
    removed = true;
    cancelAnimationFrame(frameId);
    clearTimeout(exitTimer);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeydown);
    document.removeEventListener("visibilitychange", onVisibility);
    skipButton.removeEventListener("click", skip);
    trackedImages.forEach(function (image) { image.onload = null; image.onerror = null; });
    document.documentElement.classList.remove("splash-lock");
    document.documentElement.style.removeProperty("--splash-scrollbar-width");
    splash.remove();
    if (visit && visit.showApp) visit.showApp();
  }

  function quickExit(remember) {
    if (leaving || removed) return;
    requestApplication();
    if (remember) rememberVisit();
    leaving = true;
    cancelAnimationFrame(frameId);
    function finish() {
      if (window.__APP_MOUNTED__ !== true) {
        if (visit && visit.appFailed) return;
        exitTimer = window.setTimeout(finish, 50);
        return;
      }
      splash.classList.add("splash-leave");
      splash.style.opacity = "0";
      exitTimer = window.setTimeout(cleanup, reduced ? 240 : 380);
    }
    finish();
  }

  function skip() { quickExit(true); }
  function onKeydown(event) { if (event.key === "Escape" || event.key === "Esc") skip(); }
  function onResize() {
    resize();
    if (!frozen && !removed && !leaving) {
      cancelAnimationFrame(frameId);
      frame(performance.now());
    }
  }
  function onVisibility() {
    if (document.hidden) {
      hiddenAt = performance.now();
      cancelAnimationFrame(frameId);
    } else if (hiddenAt) {
      var hiddenDuration = performance.now() - hiddenAt;
      hiddenTotal += hiddenDuration;
      if (heldAt) heldAt += hiddenDuration;
      hiddenAt = 0;
      if (!frozen && !leaving) frameId = requestAnimationFrame(frame);
    }
  }

  function frame(time) {
    if (removed || leaving || document.hidden) return;
    var foreground = time - startTime - hiddenTotal;
    var activeTime = playbackStart === null ? foreground : foreground - playbackStart;
    if (activeTime >= 12000 && !(visit && visit.appFailed)) { quickExit(false); return; }
    if (!reduced && playbackStart === null) {
      if (sceneReady) {
        if (!warmupStart) {
          render(0, time);
          splash.classList.add("sc-ready");
          warmupStart = time;
        }
        requestApplication();
        if (isReady(time)) {
          if (!applicationWarmup) applicationWarmup = time;
          warmupFrames = warmupLast && time - warmupLast <= 40 ? warmupFrames + 1 : 0;
          warmupLast = time;
          if ((time - applicationWarmup >= 100 && warmupFrames >= 4) || time - applicationWarmup >= 1000) {
            playbackStart = foreground;
            splash.dataset.playback = "running";
          }
        }
      }
      frameId = requestAnimationFrame(frame);
      return;
    }
    var elapsed = reduced ? foreground : activeTime - heldTotal;
    if (elapsed >= 6500 || reduced) requestApplication();
    var ready = isReady(time);
    if (reduced) {
      render(0, time);
      if (foreground >= 350) { quickExit(true); return; }
      frameId = requestAnimationFrame(frame);
      return;
    }
    if (elapsed >= 6500 && !ready) {
      if (!heldAt) heldAt = time;
      elapsed = 6500;
    } else if (heldAt) {
      heldTotal += time - heldAt;
      heldAt = 0;
      elapsed = activeTime - heldTotal;
    }
    render(Math.max(0, elapsed), time);
    if (elapsed >= 9000) { rememberVisit(); cleanup(); return; }
    frameId = requestAnimationFrame(frame);
  }

  try {
    if (testMode === "moonFail") moonImage.src = "./images/splash/missing-moon.webp";
    if (reduced) splash.classList.add("sc-reduced");
    splash.dataset.playback = "preparing";
    resize();
    preload();
    skipButton.addEventListener("click", skip);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (frozen) {
      splash.classList.add("sc-ready");
      render(frozenAt, performance.now());

    } else {
      frameId = requestAnimationFrame(frame);
    }
  } catch (_) {
    quickExit();
  }
})();

