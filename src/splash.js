(function () {
  "use strict";

  var splash = document.getElementById("splash");
  if (!splash) return;

  var visit = window.__SPLASH_STATE__;

  function requestApplication() {
    if (!visit || visit.appRequested) return;
    visit.appRequested = true;
    if (visit.startApp) visit.startApp();
  }

  var scene = splash.querySelector(".sc-scene");
  var moon = splash.querySelector(".sc-moon");
  var moonImage = moon.querySelector("img");
  var skyImage = splash.querySelector(".sc-sky");
  var seaImage = splash.querySelector(".sc-sea-base");
  var waveImages = Array.prototype.slice.call(splash.querySelectorAll(".sc-wave img"));
  var waves = [splash.querySelector(".sc-wave-left"), splash.querySelector(".sc-wave-right")];
  var waveCanvases = Array.prototype.slice.call(splash.querySelectorAll(".sc-wave-water"));
  var waveContexts = [];
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
  waveCanvases.forEach(function (surface) {
    var paint = null;
    try { if (!reduced && testMode !== "canvasOff") paint = surface.getContext("2d", { alpha: true }); } catch (_) {}
    waveContexts.push(paint);
  });
  var startTime = performance.now();
  var hiddenAt = document.hidden ? startTime : 0;
  var hiddenTotal = 0;
  var heldAt = 0;
  var heldTotal = 0;

  var frameId = 0;
  var exitStarted = null;
  var exitOpacity = 1;
  var forceExit = false;
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
  function ease(value) { value = clamp(value); return value * value * value * (value * (value * 6 - 15) + 10); }
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
    scene.style.setProperty("--wave-width", width * (width <= 680 ? 1 : .90) + "px");
    scene.style.setProperty("--wave-height", height * (width <= 680 ? .62 : .88) + "px");
    scene.style.setProperty("--wave-base", height * (width <= 680 ? 1 : 1.04) + "px");
    waveCanvases.forEach(function (surface) {
      surface.width = Math.min(960, Math.round(width * (width <= 680 ? 1 : .9)));
      surface.height = Math.min(640, Math.round(height * (width <= 680 ? .62 : .88)));
    });

    if (context) {
      var dpr = Math.min(1.5, window.devicePixelRatio || 1);
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

  function drawSea(time, rise, elapsed) {
    if (!context || !seaReady) return;
    context.clearRect(0, 0, width, seaHeight);
    // Keep the same cover crop as the fallback image; the horizon never moves.
    var cover = Math.max(width / seaImage.naturalWidth, seaHeight / seaImage.naturalHeight);
    var sourceWidth = width / cover;
    var sourceX = (seaImage.naturalWidth - sourceWidth) / 2;
    var swell = ease((elapsed - 5600) / 1800);
    var seconds = time / 1000;
    var strips = Math.ceil(seaHeight / 3);
    for (var band = 0; band < strips; band++) {
      var y = band * seaHeight / strips;
      var depth = y / seaHeight;
      // Phase advances toward the viewer; perspective compresses distant waves.
      var phase = 18 * Math.sqrt(depth + .035) - seconds * 1.65;
      var amplitude = depth * depth * (2 + 7 * swell);
      var offset = Math.sin(phase) * amplitude + Math.sin(phase * 1.73 + seconds * .32) * amplitude * .22;
      var sampleY = Math.max(0, Math.min(seaHeight - 4, y + offset));
      var drift = Math.sin(phase * .72 + .8) * depth * (1 + swell * 2);
      context.drawImage(seaImage, sourceX, sampleY / cover, sourceWidth, Math.min(4 / cover, seaImage.naturalHeight - sampleY / cover), -4 + drift, y, width + 8, seaHeight / strips + 1);
      // Soft light on the rising face, shadow on the trailing face; no hard crest outline.
      var face = Math.cos(phase) * depth * (.025 + .055 * swell);
      context.fillStyle = face > 0 ? "rgba(174,218,237," + face + ")" : "rgba(0,8,22," + (-face * 1.3) + ")";
      context.fillRect(0, y, width, seaHeight / strips + 1);
    }
    context.fillStyle = "rgba(1,9,20," + mix(.32, .08, rise) + ")";
    context.fillRect(0, 0, width, seaHeight);
    var strength = mix(.08, .38, rise);
    for (var i = 0; i < glints.length; i++) {
      var glint = glints[i];
      var depth = glint.depth;
      var phase = 18 * Math.sqrt(depth + .035) - seconds * 1.65;
      var spread = width * (.017 + .16 * depth);
      var x = width / 2 + glint.side * spread + Math.sin(phase * .72 + .8) * depth * (1 + swell * 2);
      var y = seaHeight * depth - Math.sin(phase) * depth * depth * (2 + 7 * swell);
      var alpha = glint.light * strength * (.5 + .5 * Math.cos(phase + glint.phase));
      context.strokeStyle = "rgba(220,240,243," + alpha + ")";
      context.lineWidth = .55 + depth * 1.15;
      context.beginPath();
      context.moveTo(x - glint.length * (2 + depth * 7), y);
      context.quadraticCurveTo(x, y - depth * 1.6, x + glint.length * (2 + depth * 7), y + depth);
      context.stroke();
    }
  }

  function drawWaves(elapsed) {
    if (reduced || elapsed < 5550 || elapsed > 8900) return;
    var seconds = elapsed / 1000;
    for (var i = 0; i < waveCanvases.length; i++) {
      var paint = waveContexts[i], surface = waveCanvases[i], texture = waveImages[i];
      if (!paint || !texture || !texture.naturalWidth) continue;
      try {
        var cw = surface.width, ch = surface.height;
        paint.globalCompositeOperation = "source-over";
        paint.clearRect(0, 0, cw, ch);
        var lift = ease((elapsed - 5750) / 1550);
        function waterY(depth) {
          // The lip falls first; the lower face continues pouring after it.
          var drain = ease((elapsed - 7350 - depth * 240) / 1500);
          var heightEnvelope = .12 + .88 * lift * (1 - drain);
          var curl = Math.sin(depth * 13 - seconds * 2.8) * Math.sin(Math.PI * depth) * .018 * lift * (1 - drain);
          return ch * (1 - (1 - depth) * heightEnvelope + curl);
        }
        // Deform the water inside the canvas, instead of scaling the whole image.
        // Rows follow different trajectories while both feet stay in the sea.
        for (var y = 0; y < ch; y += 3) {
          var depth = y / ch;
          var body = Math.sin(Math.PI * depth);
          var drift = (Math.sin(depth * 14 - seconds * 3.2) * (.003 + .013 * body) + .003 * body * Math.sin(depth * 39 - seconds * 5.1)) * cw * lift;
          var flow = Math.sin(depth * 19 - seconds * 3.4) * .007 * body;
          var sourceY = Math.max(0, Math.min(texture.naturalHeight - 1, (depth + flow) * texture.naturalHeight));
          var sourceHeight = Math.min(texture.naturalHeight - sourceY, 4 * texture.naturalHeight / ch);
          var destY = waterY(depth);
          var stripHeight = Math.max(.5, waterY(Math.min(1, (y + 3) / ch)) - destY + .7);
          paint.drawImage(texture, 0, sourceY, texture.naturalWidth, sourceHeight, drift - 4, destY, cw + 8, stripHeight);
        }
        // Moonlight follows the inward-facing curl; alpha clipping leaves the sky untouched.
        paint.globalCompositeOperation = "source-atop";
        for (var light = 0; light < 4; light++) {
          var d = .12 + light * .20;
          var lx = cw * (.52 - .22 * Math.sin(Math.PI * d) + .22 * d);
          var ly = waterY(d);
          var radius = cw * .14;
          var reflection = paint.createRadialGradient(lx, ly, 0, lx, ly, radius);
          reflection.addColorStop(0, "rgba(201,228,251," + (.085 + .025 * Math.sin(seconds * 2.2 - light)) + ")");
          reflection.addColorStop(1, "rgba(144,195,235,0)");
          paint.fillStyle = reflection;
          paint.fillRect(lx - radius, ly - radius, radius * 2, radius * 2);
        }
        for (var spark = 0; spark < 22; spark++) {
          var d = .10 + spark / 24 * .76;
          var phase = seconds * 3.4 - d * 19;
          var sx = cw * (.52 - .22 * Math.sin(Math.PI * d) + .22 * d + .035 * Math.sin(spark * 2.4));
          var sy = waterY(d + Math.sin(phase) * .004);
          paint.strokeStyle = "rgba(222,243,255," + (.04 + .10 * Math.pow(.5 + .5 * Math.cos(phase), 3)) + ")";
          paint.lineWidth = 1 + d;
          paint.beginPath();
          paint.moveTo(sx - cw * .012, sy);
          paint.quadraticCurveTo(sx, sy - 1.5, sx + cw * .012, sy + 1);
          paint.stroke();
        }
        paint.globalCompositeOperation = "source-over";
        surface.style.visibility = "visible";
        texture.style.visibility = "hidden";
      } catch (_) {
        waveContexts[i] = null;
        surface.style.visibility = "hidden";
        texture.style.visibility = "";
      }
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

    var opening = ease((t - 7500) / 1500);
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
    drawWaves(t);
    // Both crests start together on the central water surface. Their feet stay
    // anchored while the water separates, rises, then falls back into the sea.
    for (var w = 0; w < waves.length; w++) {
      var localTime = t;
      var lift = ease((localTime - 5750) / 1550);
      var split = ease((localTime - 6000) / 1500);
      var settle = ease((localTime - 7350) / 1500);
      var direction = w === 0 ? -1 : 1;
      var inset = width <= 680 ? 30 : 31;
      // The new rounded lip reaches farther inward; open it without shrinking the swell.
      var xWave = direction * (-inset + 20 * split + 4 * settle);
      var initialWidth = inset / 50;
      var scaleX = initialWidth + (1 - initialWidth) * split + .06 * settle;
      var scaleY = waveCanvases[w] && waveContexts[w] && waveCanvases[w].style.visibility === "visible" ? 1 : .12 + .88 * lift * (1 - settle);
      var lean = direction * (-3 * lift + 9 * settle);
      waves[w].style.opacity = reduced ? 0 : ease((localTime - 5600) / 650) * (1 - ease((localTime - 8400) / 500));
      waves[w].style.transform = "translate3d(" + xWave.toFixed(4) + "%,0%,0) skewX(" + lean.toFixed(4) + "deg) scale(" + scaleX.toFixed(5) + "," + scaleY.toFixed(5) + ")";
    }
    splash.style.opacity = 1 - opening;
    try { if (!reduced) drawSea(frozen ? t : time - startTime - hiddenTotal, rise, t); } catch (_) { context = null; canvas.style.visibility = "hidden"; }

  }

  function cleanup() {
    if (removed) return;
    removed = true;
    cancelAnimationFrame(frameId);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("keydown", onKeydown);
    document.removeEventListener("visibilitychange", onVisibility);
    skipButton.removeEventListener("click", skip);
    splash.removeEventListener("click", skip);
    trackedImages.forEach(function (image) { image.onload = null; image.onerror = null; });
    document.documentElement.classList.remove("splash-lock");
    document.documentElement.style.removeProperty("--splash-scrollbar-width");
    splash.remove();
    var notice = document.getElementById("startup-message");
    if (notice && window.__APP_MOUNTED__ !== true) notice.hidden = false;
    if (visit && visit.showApp) visit.showApp();
  }

  function quickExit(force) {
    if (leaving || removed) return;
    requestApplication();
    leaving = true;
    forceExit = Boolean(force);
    exitOpacity = Number(splash.style.opacity || 1);
    cancelAnimationFrame(frameId);
    exitFrame(performance.now());
  }

  function exitFrame(time) {
    if (removed || document.hidden) return;
    var foreground = time - startTime - hiddenTotal;
    if (exitStarted === null && (forceExit || window.__APP_MOUNTED__ === true || (visit && visit.appFailed) || foreground >= 12000)) {
      exitStarted = foreground;
      splash.style.pointerEvents = "none";
    }
    if (exitStarted !== null) {
      var progress = (foreground - exitStarted) / (reduced ? 240 : 380);
      splash.style.opacity = exitOpacity * (1 - ease(progress));
      if (progress >= 1) { cleanup(); return; }
    }
    frameId = requestAnimationFrame(exitFrame);
  }

  function skip() { quickExit(); }
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
      if (leaving) frameId = requestAnimationFrame(exitFrame);
      else if (!frozen) frameId = requestAnimationFrame(frame);
    }
  }

  function frame(time) {
    if (removed || leaving || document.hidden) return;
    var foreground = time - startTime - hiddenTotal;
    var activeTime = playbackStart === null ? foreground : foreground - playbackStart;
    if (foreground >= 12000) { quickExit(true); return; }
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
      if (foreground >= 350) { quickExit(); return; }
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
    if (elapsed >= 9000) { cleanup(); return; }
    frameId = requestAnimationFrame(frame);
  }

  try {
    if (testMode === "moonFail") moonImage.src = "./images/splash/missing-moon.webp";
    if (reduced) splash.classList.add("sc-reduced");
    splash.dataset.playback = "preparing";
    resize();
    preload();
    skipButton.addEventListener("click", skip);
    splash.addEventListener("click", skip);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (frozen) {
      splash.classList.add("sc-ready");
      requestApplication();
      render(frozenAt, performance.now());

    } else {
      frameId = requestAnimationFrame(frame);
    }
  } catch (_) {
    quickExit();
  }
})();

