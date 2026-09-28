// The home page as the night sky ([home] sky; atgallery/sky/__init__.py says where everything
// comes from). Every picture sits at its place and true size among the stars, and the sky crawls
// slowly westward while it waits for the visitor (0.7.1: nothing is chosen until they choose; 0.7.2:
// the page carries no picture that could show first). Drag to look around, pinch or
// ctrl + wheel to zoom (the wheel alone scrolls the page), point at a picture for its name, click
// to fly to it: the flight pulls back to show the sky on the way and dives in until the sharp
// picture fills the screen and its record reads out (the slideshow's own styles, site.css
// .is-showing). The arrows step through the featured pictures; the play button tours them.
// Without this script the home page shows its first featured picture, as it always did.
(function () {
  "use strict";
  var hero = document.querySelector("[data-sky]");
  var holder = document.getElementById("sky-data");
  var script = document.currentScript;
  if (!hero || !holder || !script || !window.fetch || !window.requestAnimationFrame) return;
  var data;
  try { data = JSON.parse(holder.textContent); } catch (e) { return; }
  var rel = hero.getAttribute("data-rel") || "";
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var D2R = Math.PI / 180, HOLD = 8500;
  var W = 0, H = 0, DPR = 1, MONO = "monospace";

  // ------------------------------------------------------------------ small things
  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var vec = function (ra, dec) {
    var a = ra * D2R, d = dec * D2R;
    return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  };
  var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  var norm = function (a) { var l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  var slerp = function (a, b, t) {
    var w = Math.acos(clamp(dot(a, b), -1, 1));
    if (w < 1e-6) return a.slice();
    var s = Math.sin(w), k1 = Math.sin((1 - t) * w) / s, k2 = Math.sin(t * w) / s;
    return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
  };
  var seed = 7;
  var rand = function () {
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  var gauss = function () { return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(6.2832 * rand()); };

  // the Milky Way, as soft light along the galactic plane (galactic to equatorial, J2000)
  var A = [[-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
           [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
           [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669]];  // prettier-ignore
  var galactic = function (l, b) {
    var lr = l * D2R, br = b * D2R;
    var g = [Math.cos(br) * Math.cos(lr), Math.cos(br) * Math.sin(lr), Math.sin(br)];
    return [A[0][0] * g[0] + A[1][0] * g[1] + A[2][0] * g[2],
            A[0][1] * g[0] + A[1][1] * g[1] + A[2][1] * g[2],
            A[0][2] * g[0] + A[1][2] * g[1] + A[2][2] * g[2]];  // prettier-ignore
  };
  var milky = [], dust = [];
  for (var i = 0; i < 3400; i++) {
    var l = rand() * 360, c = Math.cos(l * D2R);
    var width = 3.2 + 5 * Math.pow(Math.max(c, 0), 2), b = gauss() * width;
    var light = (0.3 + 0.7 * Math.pow(0.5 + 0.5 * c, 1.6)) * Math.exp(-Math.pow(b / (width * 1.7), 2));
    if (l > 5 && l < 85) light *= 1 - 0.7 * Math.exp(-Math.pow((b - 1) / 2.4, 2)); // the Great Rift
    if (l < 25 || l > 335) light *= 1.35;
    milky.push({ v: galactic(l, b), b: light, r: (1.6 + rand() * 3.2) * (1 + 0.5 * Math.max(c, 0)) * D2R });
  }
  for (i = 0; i < 5200; i++) {
    var near = rand() < 0.55;
    dust.push({
      v: near ? galactic(rand() * 360, gauss() * 12) : vec(rand() * 360, Math.asin(rand() * 2 - 1) / D2R),
      m: 5.2 + rand() * 2
    });
  }

  // ------------------------------------------------------------------ the view
  // where it looks (a unit vector) and how close (px per radian at the centre); stereographic,
  // north up and east to the left, as the sky is seen
  var view = { c: [1, 0, 0], s: 1000 };
  var basis = { e: [0, 1, 0], n: [0, 0, 1] };
  var setBasis = function () {
    var cv = view.c, ra = Math.atan2(cv[1], cv[0]), dec = Math.asin(clamp(cv[2], -1, 1));
    basis.e = [-Math.sin(ra), Math.cos(ra), 0];
    basis.n = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  };
  var project = function (v, out) {
    var z = dot(v, view.c);
    if (z < -0.35) return false;
    var k = 2 / (1 + z);
    out.x = W / 2 - dot(v, basis.e) * k * view.s;
    out.y = H / 2 - dot(v, basis.n) * k * view.s;
    out.k = k;
    return true;
  };
  var fov = function () { return W / view.s / D2R; };

  var sprite = function (r, g, bl) {
    var cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    var x = cv.getContext("2d");
    var grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(" + r + "," + g + "," + bl + ",1)");
    grd.addColorStop(0.35, "rgba(" + r + "," + g + "," + bl + ",0.42)");
    grd.addColorStop(1, "rgba(" + r + "," + g + "," + bl + ",0)");
    x.fillStyle = grd;
    x.fillRect(0, 0, 64, 64);
    return cv;
  };
  var MILKY = sprite(214, 208, 196);
  var glows = {};
  var glowOf = function (hex) {
    hex = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex : "#c9d4ff";
    if (!glows[hex]) glows[hex] = sprite(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
    return glows[hex];
  };

  // ------------------------------------------------------------------ the page's parts
  var canvas = el("canvas", "sky-canvas");
  canvas.setAttribute("aria-hidden", "true");
  var ctx = canvas.getContext("2d");
  var mw = document.createElement("canvas");
  var mwx = mw.getContext("2d");
  var stage = el("div", "sky-stage");
  var tip = el("div", "sky-tip");
  tip.hidden = true;
  var back = el("button", "btn sky-back", "← Back to the sky");
  back.type = "button";
  var pics = data.pictures.map(function (p) {
    return { p: p, v: vec(p.ra, p.dec), w: (p.size || 1) * D2R, aspect: p.h / p.w, img: null, big: null, rect: null };
  });
  var labels = {};
  var tour = data.featured.map(function (f) {
    labels[f.id] = f.label;
    return pics.filter(function (q) { return q.p.id === f.id; })[0];
  }).filter(Boolean);
  if (!tour.length) return;
  var stars = [], lines = [], names = [];

  var note = el("div", "sky-note");
  note.appendChild(el("h2", "display", data.heading));
  var controls = el("div", "show-controls");
  controls.innerHTML =
    '<span class="show-count" data-count></span>' +
    '<button class="icon-btn" type="button" data-prev aria-label="Previous picture"><svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M11 3L5 9l6 6"/></svg></button>' +
    '<button class="icon-btn" type="button" data-pause aria-label="Pause the tour"><svg class="i-pause" width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1"/><rect x="8.5" y="1" width="3.5" height="12" rx="1"/></svg><svg class="i-play" width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z"/></svg></button>' +
    '<button class="icon-btn" type="button" data-next aria-label="Next picture"><svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 3l6 6-6 6"/></svg></button>';
  var count = controls.querySelector("[data-count]");

  // a picture opened full screen: the home page's slide, built from the data
  var slideFor = function (p, index, n) {
    var s = el("article", "slide sky-slide");
    s.setAttribute("aria-label", p.title);
    var img = el("img", "slide-img");
    img.src = rel + "img/" + p.img;
    if (p.fw > p.w) {
      img.srcset = rel + "img/" + p.img + " " + p.w + "w, " + rel + "img/" + p.full + " " + p.fw + "w";
      img.sizes = "100vw";
    }
    img.width = p.w;
    img.height = p.h;
    img.alt = p.alt || p.title;
    s.appendChild(img);
    var band = el("div", "band"), title = el("div", "band-title");
    title.appendChild(el("p", "label", n ? (labels[p.id] || "Featured") + " · " + pad(index + 1) + " / " + pad(n) : (p.place || "In the sky")));
    title.appendChild(el("p", "line", p.line));
    title.appendChild(el("span", "show-rule"));
    title.appendChild(el("h2", "display hero-title", p.title));
    band.appendChild(title);
    var side = el("div", "band-side"), figs = el("dl", "figs");
    [["Integration", p.total], ["Telescope", p.scope], ["Camera", p.camera], ["Nights", String(p.nights)]].forEach(function (f) {
      var d = el("div");
      d.appendChild(el("dt", "", f[0]));
      var dd = el("dd", "", f[1]);
      dd.setAttribute("data-final", f[1]);
      d.appendChild(dd);
      figs.appendChild(d);
    });
    side.appendChild(figs);
    var actions = el("div", "actions"), a = el("a", "btn", "View the picture");
    a.href = rel + p.slug + "/";
    actions.appendChild(a);
    side.appendChild(actions);
    band.appendChild(side);
    s.appendChild(band);
    var edge = el("div", "edge");
    edge.setAttribute("aria-hidden", "true");
    p.segs.forEach(function (sg) {
      var sp = el("span", "f-" + sg[0]);
      sp.style.flexGrow = sg[1];
      edge.appendChild(sp);
    });
    s.appendChild(edge);
    var parts = [title.querySelector(".label"), title.querySelector(".line"), title.querySelector(".hero-title")];
    figs.querySelectorAll("div").forEach(function (f) { parts.push(f); });
    parts.push(actions);
    parts.forEach(function (e, j) { e.classList.add("show-part"); e.style.setProperty("--i", String(j)); });
    return s;
  };
  // the record reads out: the rule draws, the parts come in, integration and nights count up
  var readout = function (s) {
    s.classList.add("is-caption");
    if (still) return;
    s.querySelectorAll(".figs dd").forEach(function (dd) {
      var text = dd.getAttribute("data-final");
      var hm = /^(\d+)h (\d+)m$/.exec(text);
      if (!hm && !/^\d+$/.test(text)) return;
      var target = hm ? Number(hm[1]) * 60 + Number(hm[2]) : Number(text);
      var t0 = performance.now();
      var step = function (now) {
        var k = Math.min(1, Math.max(0, (now - t0 - 700) / 1500));
        if (k >= 1 || !s.classList.contains("is-caption")) { dd.textContent = text; return; }
        var v = Math.round(target * (1 - Math.pow(1 - k, 3)));
        dd.textContent = hm ? Math.floor(v / 60) + "h " + pad(v % 60) + "m" : String(v);
        requestAnimationFrame(step);
      };
      step(t0);
    });
  };

  // ------------------------------------------------------------------ the tour
  // paused, and no featured picture chosen (at -1), until the visitor chooses
  var timer = 0, paused = true, mode = "sky", at = -1;
  var flight = null, open = null, coming = null, going = null;
  var hover = null, dragging = false, moved = 0, last = null;
  var touched = 0; // when the visitor last did something: a sky left alone is drawn less often
  var landing = function (q) { return (q.p.w * Math.max(W / q.p.w, H / q.p.h)) / q.w; };
  var fly = function (toC, toS, dur, done) {
    var fromC = view.c.slice(), fromS = view.s;
    var d = Math.acos(clamp(dot(fromC, toC), -1, 1));
    var lnA = Math.log(fromS), lnB = Math.log(toS);
    var bump = Math.max(0, (lnA + lnB) / 2 - Math.log(W / Math.min(110 * D2R, d * 1.8 + 16 * D2R)));
    flight = {
      t0: performance.now(), dur: still ? 1 : dur, done: done,
      step: function (k) {
        var e = ease(k);
        view.c = norm(slerp(fromC, toC, e));
        view.s = Math.exp(lnA + (lnB - lnA) * e - bump * Math.sin(Math.PI * k));
      }
    };
    wake();
  };
  var drop = function (o) { if (o && o.slide.parentNode) o.slide.parentNode.removeChild(o.slide); };
  var letGo = function () {
    drop(going);
    drop(coming);
    coming = null;
    going = open;
    open = null;
    hero.classList.remove("is-open");
    if (going) {
      going.slide.classList.remove("is-caption");
      going.slide.classList.add("sky-flying");
    }
  };
  var visit = function (q, index, n) {
    clearTimeout(timer);
    letGo();
    count.textContent = n ? pad(index + 1) + " / " + pad(n) : "";
    if (!q.big) { q.big = new Image(); q.big.onload = wake; q.big.src = rel + "img/" + q.p.thumb; }
    var s = slideFor(q.p, index, n);
    s.classList.add("sky-flying", "is-current");
    var img = s.querySelector(".slide-img");
    img.style.opacity = "0";
    stage.appendChild(s);
    var o = { q: q, slide: s, img: img };
    coming = o;
    note.classList.add("is-away");
    mode = "flying";
    tip.hidden = true;
    var d = Math.acos(clamp(dot(view.c, q.v), -1, 1)) / D2R;
    fly(q.v, landing(q), 3400 + Math.min(2400, d * 50), function () {
      drop(going);
      going = null;
      coming = null;
      open = o;
      mode = "open";
      hero.classList.add("is-open");
      s.classList.remove("sky-flying");
      img.removeAttribute("style");
      setTimeout(function () { if (open === o) readout(s); }, 450);
      if (!paused && index >= 0) timer = setTimeout(function () { go(at + 1); }, HOLD);
    });
  };
  var go = function (i) {
    at = (i + tour.length) % tour.length;
    visit(tour[at], at, tour.length);
  };
  // the next or the previous featured picture; from the sky before any, the first or the last
  var step = function (d) { go(at < 0 ? (d > 0 ? 0 : tour.length - 1) : at + d); };
  var pause = function (on) {
    paused = on;
    hero.classList.toggle("is-paused", on);
    hero.classList.toggle("is-still", on);
    controls.querySelector("[data-pause]").setAttribute("aria-label", on ? "Play the tour" : "Pause the tour");
    clearTimeout(timer);
    if (!on) timer = setTimeout(function () { step(1); }, mode === "open" ? 2500 : 300);
  };
  var toSky = function () {
    pause(true);
    count.textContent = "";
    letGo();
    mode = "flying";
    fly(view.c.slice(), Math.max(W, H) / (62 * D2R), 1900, function () {
      drop(going);
      going = null;
      mode = "sky";
      touched = performance.now();
      note.classList.remove("is-away");
    });
  };

  // ------------------------------------------------------------------ drawing
  var P = { x: 0, y: 0, k: 1 }, Q = { x: 0, y: 0, k: 1 };
  var draw = function (now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#020204";
    ctx.fillRect(0, 0, W, H);
    var f = fov(), j;

    // the Milky Way, drawn small and laid over the sky enlarged: it is soft light anyway
    var mwW = Math.max(1, Math.round(W / 4)), mwH = Math.max(1, Math.round(H / 4));
    if (mw.width !== mwW || mw.height !== mwH) { mw.width = mwW; mw.height = mwH; }
    mwx.setTransform(1, 0, 0, 1, 0, 0);
    mwx.globalCompositeOperation = "source-over";
    mwx.clearRect(0, 0, mwW, mwH);
    mwx.globalCompositeOperation = "lighter";
    var mwFade = clamp((f - 3) / 30, 0.04, 1);
    for (j = 0; j < milky.length; j++) {
      var m = milky[j];
      if (!project(m.v, P)) continue;
      var r = Math.max(1.5, m.r * view.s * P.k * 0.5) / 4, x = P.x / 4, y = P.y / 4;
      if (x < -r || x > mwW + r || y < -r || y > mwH + r) continue;
      mwx.globalAlpha = Math.min(1, m.b * 0.11 * mwFade);
      mwx.drawImage(MILKY, x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 0.9;
    ctx.drawImage(mw, 0, 0, W, H);

    // faint stars, the figures, the bright stars, the constellations' names
    var starScale = clamp(Math.log(60 / f) * 0.25 + 1, 0.8, 1.9);
    ctx.fillStyle = "#cfd6e6";
    for (j = 0; j < dust.length; j++) {
      if (!project(dust[j].v, P) || P.x < 0 || P.x > W || P.y < 0 || P.y > H) continue;
      ctx.globalAlpha = clamp((7.4 - dust[j].m) * 0.22, 0.08, 0.5);
      ctx.fillRect(P.x, P.y, 1, 1);
    }
    if (f > 7 && lines.length) {
      ctx.globalAlpha = clamp((f - 7) / 20, 0, 1) * 0.24;
      ctx.strokeStyle = "#9fb4d8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (j = 0; j < lines.length; j++) {
        if (project(lines[j][0], P) && project(lines[j][1], Q)) {
          ctx.moveTo(P.x, P.y);
          ctx.lineTo(Q.x, Q.y);
        }
      }
      ctx.stroke();
    }
    for (j = 0; j < stars.length; j++) {
      var st = stars[j];
      if (!project(st.v, P) || P.x < -4 || P.x > W + 4 || P.y < -4 || P.y > H + 4) continue;
      var rad = clamp((5.6 - st.m) * 0.42, 0.45, 3.2) * starScale;
      var tw = still ? 1 : 0.88 + 0.12 * Math.sin(now / 700 + j * 1.7);
      ctx.globalAlpha = clamp(0.35 + (5 - st.m) * 0.17, 0.3, 1) * tw;
      ctx.fillStyle = st.m < 1.5 ? "#fff6ea" : "#e8eefc";
      ctx.beginPath();
      ctx.arc(P.x, P.y, rad, 0, 6.2832);
      ctx.fill();
      if (st.m < 2.2) {
        ctx.globalAlpha = 0.2 * tw;
        ctx.drawImage(glowOf("#dfe7ff"), P.x - rad * 6, P.y - rad * 6, rad * 12, rad * 12);
      }
    }
    if (f > 22 && f < 170) {
      ctx.globalAlpha = clamp((f - 22) / 18, 0, 1) * 0.45;
      ctx.fillStyle = "#b7c2d6";
      ctx.font = "500 11px " + MONO;
      ctx.textAlign = "center";
      for (j = 0; j < names.length; j++) {
        if (project(names[j].v, P)) ctx.fillText(names[j].label, P.x, P.y);
      }
    }

    // the pictures, each where it is in the sky and as large as it looks there; the one being
    // flown to goes on top, and the others around it give way as it fills the screen
    var target = coming ? coming.q : open ? open.q : null, others = 1;
    if (target && project(target.v, P)) others = 1 - 0.9 * clamp((target.w * view.s * P.k / W - 0.12) / 0.3, 0, 1);
    for (j = 0; j <= pics.length; j++) {
      var q = j < pics.length ? pics[j] : target;
      if (!q || (j < pics.length && q === target)) continue;
      q.rect = null;
      if (!project(q.v, P)) continue;
      var w = q.w * view.s * P.k, h = w * q.aspect;
      if (P.x + w < -40 || P.x - w > W + 40 || P.y + h < -40 || P.y - h > H + 40) continue;
      var fade = q === target ? 1 : others;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (w < 6 ? 0.95 : 0.55 * clamp(1 - (w - 60) / 320, 0, 1)) * fade;
      var g = Math.max(16, w * 1.9);
      if (ctx.globalAlpha > 0.01) ctx.drawImage(glowOf(q.p.tint), P.x - g / 2, P.y - g / 2, g, g);
      ctx.globalCompositeOperation = "source-over";
      if (w < 5) {
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#fff";
        ctx.fillRect(P.x - 1.5, P.y - 1.5, 3, 3);
      } else {
        if (!q.img) { q.img = new Image(); q.img.onload = wake; q.img.src = rel + "img/" + q.p.tile; }
        var pic = (w > 260 && q.big && q.big.complete && q.big.naturalWidth) ? q.big : q.img;
        ctx.globalAlpha = (q === hover ? 1 : 0.94) * fade;
        if (pic.complete && pic.naturalWidth) ctx.drawImage(pic, P.x - w / 2, P.y - h / 2, w, h);
        ctx.globalAlpha = (q === hover ? 0.9 : 0.32) * fade;
        ctx.strokeStyle = "#f5f3ef";
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(P.x - w / 2) + 0.5, Math.round(P.y - h / 2) + 0.5, Math.round(w), Math.round(h));
      }
      q.rect = { x: P.x - w / 2, y: P.y - h / 2, w: w, h: h };
    }

    // the Moon beside the picture being flown to, for scale
    if (target && target.rect) {
      var al = clamp((15 - f) / 5, 0, 1) * clamp((f - 3.2) / 2.2, 0, 1);
      if (al > 0.01) {
        var t = target.rect, mr = 0.26 * D2R * view.s, gap = Math.max(mr * 2.2, 0.45 * D2R * view.s);
        var mx = t.x + t.w + gap + mr < W - 20 ? t.x + t.w + gap : t.x - gap, my = t.y + t.h - mr;
        ctx.globalAlpha = al * 0.8;
        ctx.strokeStyle = "#f5f3ef";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#f5f3ef";
        ctx.font = "500 11px " + MONO;
        ctx.textAlign = "center";
        ctx.fillText("THE MOON, FOR SCALE", mx, my + mr + 18);
      }
    }
    ctx.globalAlpha = 1;
  };
  // a picture on its way in or out follows its place in the sky, and fades as it gets small
  var follow = function (o) {
    if (!o || !o.slide.classList.contains("sky-flying")) return;
    var r = o.q.rect, cover = Math.max(W / o.q.p.w, H / o.q.p.h) * o.q.p.w, st = o.img.style;
    if (!r) { st.opacity = "0"; return; }
    st.left = r.x + "px";
    st.top = r.y + "px";
    st.width = r.w + "px";
    st.height = r.h + "px";
    st.opacity = String(clamp((r.w / cover - 0.3) / 0.5, 0, 1));
  };

  // drawn only while it can be seen: not scrolled past, not in a hidden tab
  var seen = true, running = false, lastNow = 0, drawn = 0;
  var tick = function (now) {
    if (!seen || document.hidden) { running = false; return; }
    var calm = mode === "sky" && !flight && !dragging;
    // a sky left alone for a minute keeps crawling but is drawn at most 20 times a second (it
    // moves a fraction of a pixel in between): kinder to the battery of a page left open
    if (calm && !still && now - touched > 60000 && now - drawn < 50) { requestAnimationFrame(tick); return; }
    drawn = now;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight; DPR = dpr;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    if (flight) {
      var k = clamp((now - flight.t0) / flight.dur, 0, 1);
      flight.step(k);
      if (k >= 1) { var done = flight.done; flight = null; if (done) done(); }
    } else if (mode === "sky" && !dragging && !still) {
      // the sky crawls westward about the pole, 0.4° a second whatever the screen's frame rate
      var cv = view.c, turn = 0.007 * clamp((now - lastNow) / 1000, 0, 0.1);
      view.c = norm([cv[0] - cv[1] * turn, cv[1] + cv[0] * turn, cv[2]]);
    }
    lastNow = now;
    setBasis();
    draw(now);
    follow(coming);
    follow(going);
    // an open picture covers the sky, and a visitor who asks for less motion gets a still sky:
    // nothing to draw until something moves again
    if (mode === "open" && !flight) { running = false; return; }
    if (calm && still && now - touched > 0) { running = false; return; }
    requestAnimationFrame(tick);
  };
  var wake = function () {
    if (!running && seen && !document.hidden) { running = true; requestAnimationFrame(tick); }
  };
  var stir = function () { touched = performance.now(); wake(); };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("resize", wake);
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (e) { seen = e[0].isIntersecting; wake(); }).observe(hero);
  }

  // ------------------------------------------------------------------ looking around
  var hit = function (x, y) {
    for (var j = pics.length - 1; j >= 0; j--) {
      var r = pics[j].rect;
      if (!r) continue;
      var m = r.w < 12 ? 7 : 0;
      if (x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m) return pics[j];
    }
    return null;
  };
  canvas.addEventListener("pointerdown", function (e) {
    if (mode !== "sky") return;
    stir();
    dragging = true;
    moved = 0;
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", function (e) {
    if (dragging && last) {
      var dx = e.clientX - last.x, dy = e.clientY - last.y, cv = view.c, s = view.s;
      moved += Math.abs(dx) + Math.abs(dy);
      last = { x: e.clientX, y: e.clientY };
      view.c = norm([cv[0] + (basis.e[0] * dx + basis.n[0] * dy) / s,
                     cv[1] + (basis.e[1] * dx + basis.n[1] * dy) / s,
                     cv[2] + (basis.e[2] * dx + basis.n[2] * dy) / s]);  // prettier-ignore
      stir();
      return;
    }
    if (mode !== "sky") { tip.hidden = true; return; }
    stir();
    hover = hit(e.offsetX, e.offsetY);
    canvas.classList.toggle("is-hover", !!hover);
    tip.hidden = !hover;
    if (hover) {
      tip.textContent = "";
      tip.appendChild(el("b", "", hover.p.title));
      tip.appendChild(document.createTextNode(hover.p.place || ""));
      tip.style.left = e.offsetX + "px";
      tip.style.top = e.offsetY + "px";
    }
  });
  canvas.addEventListener("pointerup", function (e) {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("is-dragging");
    if (moved >= 6) return;
    var q = hit(e.offsetX, e.offsetY);
    if (!q) return;
    pause(true);
    var j = tour.indexOf(q);
    if (j >= 0) at = j;
    visit(q, j, j >= 0 ? tour.length : 0);
  });
  canvas.addEventListener("pointercancel", function () { dragging = false; canvas.classList.remove("is-dragging"); });
  canvas.addEventListener("pointerleave", function () { if (!dragging) { hover = null; tip.hidden = true; wake(); } });
  canvas.addEventListener("wheel", function (e) {
    if (mode !== "sky" || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    view.s = clamp(view.s * Math.exp(-e.deltaY * 0.01), Math.max(W, H) / (150 * D2R), W / (0.6 * D2R));
    stir();
  }, { passive: false });
  controls.addEventListener("click", function (e) {
    if (e.target.closest("[data-prev]")) step(-1);
    else if (e.target.closest("[data-next]")) step(1);
    else if (e.target.closest("[data-pause]")) pause(!paused);
  });
  back.addEventListener("click", toSky);
  hero.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Escape" && mode === "open") toSky();
  });

  // ------------------------------------------------------------------ start
  var src = new URL(script.src);
  fetch(new URL("sky.json" + src.search, src).href).then(function (r) { return r.json(); }).then(function (sky) {
    stars = sky.stars.map(function (s) { return { v: vec(s[0], s[1]), m: s[2] }; });
    lines = sky.lines.map(function (ln) { return [vec(ln[0], ln[1]), vec(ln[2], ln[3])]; });
    names = sky.names.map(function (n) {
      return { v: vec(n[1], n[2]), label: n[0].toUpperCase().split("").join(String.fromCharCode(8202)) };
    });
  }).catch(function () {}).then(function () {
    MONO = getComputedStyle(document.body).getPropertyValue("--mono") || "monospace";
    hero.classList.add("is-sky", "is-showing");
    hero.style.setProperty("--show", HOLD + "ms");
    hero.insertBefore(canvas, hero.firstChild);
    hero.appendChild(stage);
    hero.appendChild(note);
    hero.appendChild(tip);
    hero.appendChild(back);
    hero.appendChild(controls);
    pause(true); // the sky waits: nothing is chosen until the visitor chooses
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    view.c = norm(slerp(tour[0].v, [0, 0, 1], 0.1));
    view.s = Math.max(W, H) / (105 * D2R);
    stir();
  });
})();
