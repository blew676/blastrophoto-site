/* The little the site does in the browser: step through the featured pictures, filter and sort
   the gallery, and let the arrow keys move between pictures. Without it every page still works. */
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

  // Gallery: filter and sort in place; the address keeps the choice, so it can be shared.
  var grid = document.querySelector("[data-grid]");
  var filters = document.querySelector("[data-filters]");
  if (grid && filters) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll(".card"));
    var count = document.querySelector("[data-count]");
    var empty = document.querySelector("[data-empty]");
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
      filters.querySelectorAll("[data-sort]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(state.sort === b.dataset.sort));
      });
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
      if (b.dataset.sort) state.sort = b.dataset.sort;
      apply(true);
    });
    var clear = document.querySelector("[data-clear]");
    if (clear) {
      clear.addEventListener("click", function () {
        state.type = "all";
        state.telescope = "all";
        apply(true);
      });
    }
    apply(false);
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
})();
