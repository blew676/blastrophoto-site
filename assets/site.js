/* The little the site does in the browser: step through the featured pictures, filter and sort
   the gallery, full screen and the arrow keys on a picture's page, and dialogs and forms on a
   site's own pages. Without it every page still works. */
(function () {
  "use strict";
  document.documentElement.classList.remove("no-js");

  // Home: the featured pictures, one at a time.
  var hero = document.querySelector("[data-carousel]");
  if (hero) {
    var slides = Array.prototype.slice.call(hero.querySelectorAll("[data-slide]"));
    var at = 0;
    hero.addEventListener("click", function (e) {
      var button = e.target.closest("[data-prev], [data-next]");
      if (!button || slides.length < 2) return;
      var forward = button.hasAttribute("data-next");
      at = (at + (forward ? 1 : -1) + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.hidden = i !== at; });
      var again = slides[at].querySelector(forward ? "[data-next]" : "[data-prev]");
      if (again) again.focus({ preventScroll: true });
    });
  }

  // Gallery: filter and sort in place; the address keeps the choice, so it can be shared. The
  // filters sit in a dropdown so the pictures start right under the heading; the ones in use
  // show as tags beside it, each one tap from being dropped.
  var grid = document.querySelector("[data-grid]");
  var filters = document.querySelector("[data-filters]");
  if (grid && filters) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".card"));
    var count = document.querySelector("[data-count]");
    var empty = document.querySelector("[data-empty]");
    var drop = filters.querySelector("[data-dropdown]");
    var sorter = filters.querySelector("select[data-sort]");
    var active = filters.querySelector("[data-active]");
    var activeN = filters.querySelector("[data-active-n]");
    var done = filters.querySelector("[data-done]");
    var label = function (key, value) {
      var chip = filters.querySelector('[data-filter="' + key + '"][data-value="' + value + '"]');
      return chip ? chip.firstChild.textContent.trim() : value;
    };
    var params = new URLSearchParams(window.location.search);
    var state = {
      type: params.get("type") || "all",
      telescope: params.get("telescope") || "all",
      sort: params.get("sort") || "newest"
    };
    var fits = function (card, type, telescope) {
      return (type === "all" || card.dataset.type === type) &&
        (telescope === "all" || (" " + card.dataset.telescopes + " ").indexOf(" " + telescope + " ") >= 0);
    };
    var apply = function (remember) {
      var shown = cards.filter(function (c) { return fits(c, state.type, state.telescope); });
      cards.forEach(function (c) { c.hidden = shown.indexOf(c) < 0; });
      var order = cards.slice();
      if (state.sort === "hours") {
        order.sort(function (a, b) { return Number(b.dataset.hours) - Number(a.dataset.hours); });
      } else if (state.sort === "az") {
        order.sort(function (a, b) { return a.dataset.title.localeCompare(b.dataset.title); });
      } else {
        order.sort(function (a, b) { return Number(a.dataset.order) - Number(b.dataset.order); });
      }
      order.forEach(function (c) { grid.appendChild(c); });
      var hours = shown.reduce(function (t, c) { return t + Number(c.dataset.hours); }, 0);
      count.textContent = shown.length + (shown.length === 1 ? " picture · " : " pictures · ") +
        Math.round(hours).toLocaleString("en-US") + " hours of integration";
      empty.hidden = shown.length > 0;
      filters.querySelectorAll("[data-filter]").forEach(function (b) {
        var key = b.dataset.filter;
        var value = b.dataset.value;
        b.setAttribute("aria-pressed", String(state[key] === value));
        var n = b.querySelector(".chip-n");
        if (n) {
          var type = key === "type" ? value : state.type;
          var telescope = key === "telescope" ? value : state.telescope;
          n.textContent = cards.filter(function (c) { return fits(c, type, telescope); }).length;
        }
      });
      sorter.value = state.sort;
      var on = ["type", "telescope"].filter(function (k) { return state[k] !== "all"; });
      activeN.hidden = !on.length;
      activeN.textContent = on.length;
      active.textContent = "";
      on.forEach(function (k) {
        var pill = document.createElement("button");
        pill.type = "button";
        pill.className = "pill";
        pill.setAttribute("data-remove", k);
        pill.setAttribute("aria-label", "Show all, not only " + label(k, state[k]));
        pill.textContent = label(k, state[k]) + " ×";
        active.appendChild(pill);
      });
      done.textContent = "Show " + shown.length + (shown.length === 1 ? " picture" : " pictures");
      if (remember) {
        var q = new URLSearchParams();
        if (state.type !== "all") q.set("type", state.type);
        if (state.telescope !== "all") q.set("telescope", state.telescope);
        if (state.sort !== "newest") q.set("sort", state.sort);
        var s = q.toString();
        window.history.replaceState(null, "", window.location.pathname + (s ? "?" + s : ""));
      }
    };
    filters.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.filter) state[b.dataset.filter] = b.dataset.value;
      else if (b.dataset.remove) state[b.dataset.remove] = "all";
      else if (b.hasAttribute("data-done")) {
        drop.open = false;
        // on a phone the button sits below a tall panel: back up to the tags and the first results
        if (filters.getBoundingClientRect().top < 0) filters.scrollIntoView({ block: "start" });
        return;
      } else return;
      apply(true);
    });
    sorter.addEventListener("change", function () {
      state.sort = sorter.value;
      apply(true);
    });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-clear]")) {
        state.type = "all";
        state.telescope = "all";
        apply(true);
      }
      if (drop.open && !drop.contains(e.target)) drop.open = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drop.open) {
        drop.open = false;
        drop.querySelector("summary").focus();
      }
    });
    apply(false);
  }

  // A picture's page: full screen from the button, a click or tap on the picture, or the F key.
  // The browser's own full screen where there is one; an iPhone has none for pictures, so there
  // the picture fills the window instead. The sharper 4096 px copy loads only when the screen
  // has more pixels than the page's copy.
  var viewer = document.querySelector("[data-viewer]");
  if (viewer) {
    var pic = viewer.querySelector(".viewer-img");
    var fsButton = viewer.querySelector("[data-fullscreen]");
    var request = viewer.requestFullscreen || viewer.webkitRequestFullscreen;
    var fsElement = function () {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    };
    var isOn = function () {
      return fsElement() === viewer || viewer.classList.contains("is-full");
    };
    var sharpen = function () {
      var full = pic.getAttribute("data-full");
      var need = Math.max(window.screen.width, window.screen.height) * (window.devicePixelRatio || 1);
      if (!full || pic.getAttribute("src") === full || need <= pic.naturalWidth * 1.1) return;
      var hi = new Image();
      hi.onload = function () { pic.src = full; };
      hi.src = full;
    };
    var sync = function () {
      var on = isOn();
      viewer.classList.toggle("fs-on", on);
      document.body.classList.toggle("no-scroll", viewer.classList.contains("is-full"));
      fsButton.setAttribute("aria-pressed", String(on));
      fsButton.setAttribute("aria-label", on ? "Leave full screen" : "View full screen");
    };
    var fillWindow = function () {
      viewer.classList.add("is-full");
      sync();
    };
    var enter = function () {
      sharpen();
      if (!request || document.fullscreenEnabled === false) return fillWindow();
      try {
        var started = request.call(viewer);
        if (started && started.catch) started.catch(fillWindow);
      } catch (e) {
        return fillWindow();
      }
      // Some embedded browsers neither grant nor refuse: fill the window if nothing happened.
      window.setTimeout(function () {
        if (!fsElement() && !viewer.classList.contains("is-full")) fillWindow();
      }, 750);
    };
    var leave = function () {
      if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      viewer.classList.remove("is-full");
      sync();
    };
    var toggle = function () {
      if (isOn()) leave();
      else enter();
    };
    fsButton.addEventListener("click", toggle);
    pic.addEventListener("click", toggle);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    document.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape" && viewer.classList.contains("is-full")) leave();
      if (e.key === "f" || e.key === "F") toggle();
    });
  }

  // A picture's page: the arrow keys step to the previous and next pictures.
  var prev = document.querySelector("[data-key-prev]");
  var next = document.querySelector("[data-key-next]");
  if (prev && next) {
    document.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowLeft") window.location.href = prev.href;
      if (e.key === "ArrowRight") window.location.href = next.href;
    });
  }

  // Dialogs: a button with data-open="<id>" opens that dialog; data-close, Escape or a click
  // beside it closes it. A click that starts inside (selecting text in a field) never does.
  var pressedOutside = false;
  document.addEventListener("mousedown", function (e) {
    pressedOutside = e.target.tagName === "DIALOG";
  });
  document.addEventListener("click", function (e) {
    var opener = e.target.closest("[data-open]");
    if (opener) {
      var dialog = document.getElementById(opener.getAttribute("data-open"));
      if (dialog && dialog.showModal && !dialog.open) {
        e.preventDefault();
        dialog.showModal();
      }
      return;
    }
    var closer = e.target.closest("[data-close]");
    if (closer && closer.closest("dialog")) {
      closer.closest("dialog").close();
    } else if (e.target.tagName === "DIALOG" && e.target.open && pressedOutside) {
      e.target.close();
    }
  });

  // Forms that send to a form service (data-send) do it in place and say how it went; the
  // browser's own posting stays as the fallback where fetch is missing.
  document.querySelectorAll("form[data-send]").forEach(function (form) {
    var status = form.querySelector("[data-status]");
    var done = form.parentNode.querySelector("[data-done]");
    var button = form.querySelector("[type=submit]");
    var holder = form.closest("dialog");
    if (holder && done) {
      holder.addEventListener("close", function () {
        if (!done.hidden) {
          done.hidden = true;
          form.hidden = false;
        }
      });
    }
    form.addEventListener("submit", function (e) {
      if (!window.fetch) return;
      e.preventDefault();
      var data = {};
      new FormData(form).forEach(function (value, key) { data[key] = value; });
      button.disabled = true;
      status.classList.remove("is-error");
      status.textContent = "Sending…";
      fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (answer) {
            if (!r.ok || answer.success === false) throw new Error(answer.message || r.status);
          });
        })
        .then(function () {
          form.reset();
          status.textContent = "";
          if (done) {
            form.hidden = true;
            done.hidden = false;
            var next = done.querySelector("[data-close]");
            if (next) next.focus();
          } else {
            status.textContent = "Sent. Thank you.";
          }
        })
        .catch(function () {
          status.classList.add("is-error");
          status.textContent = "That didn't go through. Please try again in a minute.";
        })
        .then(function () { button.disabled = false; });
    });
  });
})();
