/* The AstroTracker page's sky (2026-10-26, his ask: "a moving sea of stars with a reticle finding
   and locking onto targets", after the app's Telescope lock loading screen). The page's black holds a
   field of stars drifting slowly; now and then a reticle appears beside a bright star, scans, slews
   to it, locks on and tracks it while the sky holds still, then lets it go and finds another.
   It lies behind everything on the page (z-index -1 in .at's stacking context) and only ever locks
   onto a star where the page shows nothing of its own: no words, picture or panel (looked up with
   elementFromPoint), so it never draws across text. It runs at about 30 frames a second and stops
   while the tab is hidden; a visitor who asks for less motion sees the stars standing still, without
   the reticle. data-phase on the canvas says what the reticle is doing (for checking the page). */
(function () {
  "use strict";
  var canvas = document.querySelector("[data-sky]");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var A = [224, 102, 92]; // the reticle's coral, as the app's loader draws it in the Classic look
  var rgba = function (c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; };
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var ease = function (v) { v = clamp(v); return 1 - Math.pow(1 - v, 3); };
  var smooth = function (v) { v = clamp(v); return v * v * (3 - 2 * v); };

  var W = 0, H = 0, dpr = 1, top = 68, stars = [];
  var offX = 0, offY = 0, t = 0, last = 0;

  function makeStars() {
    var n = Math.max(120, Math.min(460, Math.round((W * H) / 4200)));
    stars = [];
    for (var i = 0; i < n; i++) {
      var b = Math.pow(Math.random(), 3);
      var r = Math.random();
      var c = r < 0.12 ? [255, 210, 170] : r < 0.3 ? [180, 200, 255] : [235, 240, 255];
      stars.push({ x: Math.random() * W, y: Math.random() * H, b: b, a: 0.12 + b * 0.8,
        r: 0.4 + b * 1.5, tw: Math.random() * 6.3, c: c });
    }
  }

  function size() {
    var w = window.innerWidth, h = window.innerHeight;
    var renew = !stars.length || Math.abs(w * h - W * H) > 0.3 * W * H;
    W = w;
    H = h;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var bar = document.querySelector(".top");
    top = bar ? bar.getBoundingClientRect().height : 68;
    if (renew) makeStars();
  }

  // where a star is on the screen: drifting, wrapped round, and moved a little as the page scrolls
  function pos(s) {
    var x = (s.x - offX) % W, y = (s.y - offY - window.scrollY * 0.06) % H;
    return [x < 0 ? x + W : x, y < 0 ? y + H : y];
  }

  function drawStars() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], p = pos(s);
      ctx.fillStyle = rgba(s.c, s.a * (still ? 1 : 0.8 + 0.2 * Math.sin(t * 1.6 + s.tw)));
      ctx.beginPath();
      ctx.arc(p[0], p[1], s.r, 0, 7);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- where the page leaves the sky open
  var seen = new Map();
  function open(el) {
    if (!el) return false;
    if (seen.has(el)) return seen.get(el);
    var ok = !(el.closest && el.closest(".top, dialog, a, button"));
    if (ok && /^(img|video|canvas|svg|path|rect|circle|button|a|input|textarea|select|li|p|h1|h2|h3|dt|dd|span|strong|em|b|i|code|label|figcaption|small|table|td|th)$/i.test(el.tagName)) ok = false;
    for (var k = 0; ok && k < el.childNodes.length; k++) {
      var n = el.childNodes[k];
      if (n.nodeType === 3 && n.textContent.trim()) ok = false;
    }
    // a panel anywhere above it hides the sky there
    for (var e = el; ok && e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.backgroundImage !== "none") ok = false;
      var m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
      if (m) {
        var parts = m[1].split(",");
        if ((parts.length > 3 ? parseFloat(parts[3]) : 1) > 0.04) ok = false;
      }
    }
    seen.set(el, ok);
    return ok;
  }
  function clearAt(x, y) {
    if (x < 24 || x > W - 24 || y < top + 20 || y > H - 20) return false;
    return open(document.elementFromPoint(x, y));
  }
  // a disc of the sky with nothing of the page's in it
  function free(x, y, r) {
    if (!clearAt(x, y)) return false;
    for (var k = 0; k < 8; k++) {
      var a = (k * Math.PI) / 4;
      if (!clearAt(x + r * Math.cos(a), y + r * Math.sin(a))) return false;
    }
    return true;
  }
  function freeRow(x0, x1, y) {
    for (var k = 0; k <= 4; k++) if (!clearAt(x0 + ((x1 - x0) * k) / 4, y)) return false;
    return true;
  }

  // ---------------------------------------------------------------- the reticle
  var R = { phase: "rest", at: 0, wait: 1.5 + Math.random() * 2, star: null, sx: 0, sy: 0,
            fx: 0, fy: 0, x: 0, y: 0, side: 1, lastX: -1e4, lastY: -1e4, checked: 0 };
  function phase(name) {
    R.phase = name;
    R.at = t;
    canvas.setAttribute("data-phase", name);
    if (name === "track") canvas.setAttribute("data-at", Math.round(R.x) + "," + Math.round(R.y));
  }

  function pick() {
    seen = new Map(); // the page may have scrolled or changed since the last look
    var list = [];
    for (var i = 0; i < stars.length; i++) if (stars[i].b > 0.3) list.push(stars[i]);
    for (var j = list.length - 1; j > 0; j--) {
      var q = Math.floor(Math.random() * (j + 1)), tmp = list[j];
      list[j] = list[q];
      list[q] = tmp;
    }
    for (var n = 0, tries = 0; n < list.length && tries < 16; n++) {
      var s = list[n], p = pos(s);
      if (p[0] < 80 || p[0] > W - 80 || p[1] < top + 80 || p[1] > H - 80) continue;
      if (Math.hypot(p[0] - R.lastX, p[1] - R.lastY) < 220) continue;
      tries++;
      if (!free(p[0], p[1], 46)) continue;
      // where it first appears, scanning: beside the star, in open sky too
      var start = null, a0 = Math.random() * 6.3;
      for (var k = 0; k < 8 && !start; k++) {
        var a = a0 + (k * Math.PI) / 4, x = p[0] + 84 * Math.cos(a), y = p[1] + 84 * Math.sin(a);
        if (free(x, y, 30)) start = [x, y];
      }
      R.side = freeRow(p[0] + 34, p[0] + 150, p[1] + 2) ? 1 : freeRow(p[0] - 150, p[0] - 34, p[1] + 2) ? -1 : 0;
      R.star = s;
      R.sx = start ? start[0] : p[0];
      R.sy = start ? start[1] : p[1];
      return true;
    }
    return false;
  }

  function drawReticle(vis, tracking, since) {
    var x = R.x, y = R.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(A, (tracking ? 0.85 : 0.55) * vis);
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-28, 0); ctx.lineTo(-7, 0); ctx.moveTo(7, 0); ctx.lineTo(28, 0);
    ctx.moveTo(0, -28); ctx.lineTo(0, -7); ctx.moveTo(0, 7); ctx.lineTo(0, 28);
    ctx.stroke();
    if (!tracking) {
      // the search: a short arc going round the ring
      ctx.strokeStyle = rgba(A, 0.5 * vis);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 21, t * 3, t * 3 + 0.9);
      ctx.stroke();
    } else {
      if (since < 0.7) {
        // the lock: a ring going out
        ctx.strokeStyle = rgba(A, 0.8 * (1 - since / 0.7) * vis);
        ctx.beginPath();
        ctx.arc(0, 0, 16 + since * 26, 0, 7);
        ctx.stroke();
      }
      var rot = since * 1.3;
      ctx.strokeStyle = rgba(A, 0.7 * vis);
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -rot * 8;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      for (var k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, 25, rot + k * 2.094, rot + k * 2.094 + 0.35);
        ctx.stroke();
      }
      var pr = 2.6 + 1.1 * (0.5 + 0.5 * Math.sin(since * 5));
      var gl = ctx.createRadialGradient(0, 0, 0, 0, 0, pr * 4);
      gl.addColorStop(0, "rgba(255,255,255," + 0.9 * vis + ")");
      gl.addColorStop(0.3, rgba(A, 0.35 * vis));
      gl.addColorStop(1, rgba(A, 0));
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(0, 0, pr * 4, 0, 7);
      ctx.fill();
    }
    ctx.restore();
    if (!R.side) return;
    ctx.font = "500 10.5px 'DM Mono', ui-monospace, Consolas, monospace";
    ctx.textAlign = R.side > 0 ? "left" : "right";
    var lx = x + R.side * 36;
    if (tracking) {
      ctx.fillStyle = rgba(A, 0.9 * vis);
      ctx.fillText("● TRACKING", lx, y - 2);
      ctx.fillStyle = "rgba(190,200,215," + 0.7 * vis + ")";
      ctx.fillText("RMS " + (0.38 + 0.08 * Math.sin(since * 3.1) + 0.03 * Math.sin(since * 7.3)).toFixed(2) + "″", lx, y + 12);
    } else {
      ctx.fillStyle = "rgba(190,200,215," + 0.6 * vis + ")";
      ctx.fillText(R.phase === "slew" ? "SLEWING…" : "SCANNING…", lx, y + 4);
    }
  }

  var SCAN = 1.9, SLEW = 0.8, TRACK = 5.5, LEAVE = 0.8;
  function step(dt) {
    var since = t - R.at;
    // the sky holds still while the reticle tracks, and drifts on after
    var drift = R.phase === "track" ? 1 - ease(since / 0.6) : R.phase === "leave" ? ease(since / 1.2) : 1;
    offX += dt * 5 * drift;
    offY += dt * 1.8 * drift;
    drawStars();
    if (R.phase === "rest") {
      if (since > R.wait) {
        if (pick()) phase("scan");
        else R.wait = since + 1.5; // nowhere open just now: look again shortly
      }
      return;
    }
    var p = pos(R.star);
    if (R.phase === "scan") {
      // a small loop beside the star, then on to it
      R.x = R.sx + 13 * Math.sin(t * 2.1) * Math.cos(t * 0.9);
      R.y = R.sy + 9 * Math.sin(t * 1.7);
      drawReticle(smooth(since / 0.5), false, 0);
      if (since > SCAN) {
        R.fx = R.x;
        R.fy = R.y;
        phase("slew");
      }
    } else if (R.phase === "slew") {
      var k = smooth(since / SLEW);
      R.x = R.fx + (p[0] - R.fx) * k;
      R.y = R.fy + (p[1] - R.fy) * k;
      drawReticle(1, false, 0);
      if (since > SLEW) {
        R.checked = t;
        phase("track");
      }
    } else if (R.phase === "track") {
      R.x = p[0];
      R.y = p[1];
      drawReticle(1, true, since);
      // the page scrolled words under it: let go
      if (t - R.checked > 0.5) {
        R.checked = t;
        seen = new Map();
        if (!free(R.x, R.y, 30)) since = TRACK + 1;
      }
      if (since > TRACK) phase("leave");
    } else if (R.phase === "leave") {
      R.x = p[0];
      R.y = p[1];
      drawReticle(1 - smooth(since / LEAVE), true, TRACK + since);
      if (since > LEAVE) {
        R.lastX = R.x;
        R.lastY = R.y;
        R.wait = 2 + Math.random() * 2.5;
        phase("rest");
      }
    }
  }

  function frame(now) {
    window.requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    var dt = (now - last) / 1000;
    if (dt < 1 / 32) return; // about 30 frames a second: the sky moves slowly, and a phone's battery lasts
    last = now;
    t += Math.min(dt, 0.1);
    step(Math.min(dt, 0.1));
  }

  size();
  window.addEventListener("resize", function () { size(); if (still) drawStars(); });
  if (still) {
    drawStars();
    canvas.setAttribute("data-phase", "still");
    return;
  }
  phase("rest");
  window.requestAnimationFrame(function (now) { last = now; frame(now); });
})();
