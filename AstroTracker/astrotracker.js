/* The AstroTracker page: the video's pause button and its chapters. The video plays by itself,
   muted and looping; a visitor whose system asks for less motion sees its still until they
   press play. A chapter jumps to its part, and fills as that part plays. The video rests while
   it is scrolled out of sight. Without this script the video shows its own controls. */
(function () {
  "use strict";
  var video = document.querySelector("[data-tour]");
  if (!video) return;
  var toggle = document.querySelector("[data-video-toggle]");
  var chapters = Array.prototype.slice.call(document.querySelectorAll("[data-chapter]"));
  var starts = chapters.map(function (c) { return Number(c.getAttribute("data-chapter")); });
  var end = Number(video.getAttribute("data-story-ends")) || 0; // then the closing card
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wanted = !still; // playing unless the visitor stopped it (or asked for less motion)

  video.removeAttribute("controls");
  var play = function () {
    var started = video.play();
    if (started && started.catch) started.catch(function () {});
  };
  var sync = function () {
    var paused = video.paused;
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.setAttribute("aria-label", paused ? "Play the video" : "Pause the video");
  };
  if (still) {
    video.pause();
    video.removeAttribute("autoplay");
  }
  toggle.addEventListener("click", function () {
    wanted = video.paused;
    if (wanted) play();
    else video.pause();
  });
  chapters.forEach(function (c, i) {
    c.addEventListener("click", function () {
      video.currentTime = starts[i];
      wanted = true;
      play();
    });
  });
  video.addEventListener("play", sync);
  video.addEventListener("pause", sync);
  video.addEventListener("timeupdate", function () {
    var t = video.currentTime;
    chapters.forEach(function (c, i) {
      var from = starts[i];
      var to = i + 1 < starts.length ? starts[i + 1] : end || video.duration || from + 1;
      var share = Math.max(0, Math.min(1, (t - from) / (to - from)));
      c.style.setProperty("--fill", (share * 100).toFixed(1) + "%");
      if (t >= from && t < to) c.setAttribute("aria-current", "true");
      else c.removeAttribute("aria-current");
    });
  });
  // out of sight, it rests; back in sight, it carries on (unless it was stopped)
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (seen) {
      // several changes can come at once (a quick scroll down and back): the last one counts
      if (!seen[seen.length - 1].isIntersecting) video.pause();
      else if (wanted) play();
    }).observe(video);
  }
  sync();
})();
