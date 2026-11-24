(function (root) {
  'use strict';
  function reducedMotion() {
    return typeof root.matchMedia === 'function' && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  /* paint(wrap, {fraction, accent, number, value})
     - fraction: 0..1 ring fill. accent: CSS color for the arc.
     - number/value: optional count-up of the center number. The final frame
       always writes the exact target value (no rounding drift).
     With prefers-reduced-motion, ring and number are set to final values
     immediately (the CSS transition is also disabled by media query). */
  function paint(wrap, opts) {
    if (!wrap || !opts) return;
    var frac = Math.max(0, Math.min(1, Number(opts.fraction) || 0));
    if (opts.accent) wrap.style.setProperty('--rv-accent', opts.accent);
    var arc = wrap.querySelector('.rv-arc');
    if (arc) {
      var r = Number(arc.getAttribute('r')) || 52;
      var c = 2 * Math.PI * r;
      arc.style.strokeDasharray = c.toFixed(2);
      var target = (c * (1 - frac)).toFixed(2);
      if (reducedMotion()) {
        arc.style.strokeDashoffset = target;
      } else {
        arc.style.strokeDashoffset = c.toFixed(2);
        void arc.getBoundingClientRect();
        root.requestAnimationFrame(function () {
          root.requestAnimationFrame(function () { arc.style.strokeDashoffset = target; });
        });
      }
    }
    var num = opts.number, val = opts.value;
    if (num && typeof val === 'number' && isFinite(val)) {
      if (num._rvRaf) root.cancelAnimationFrame(num._rvRaf);
      if (reducedMotion()) { num.textContent = String(val); return; }
      var start = null, dur = 900;
      var step = function (ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        num.textContent = String(Math.round(val * eased));
        if (p < 1) { num._rvRaf = root.requestAnimationFrame(step); }
        else { num.textContent = String(val); num._rvRaf = null; }
      };
      num._rvRaf = root.requestAnimationFrame(step);
    }
  }
  root.ResultViz = { paint: paint };
})(typeof window === 'undefined' ? globalThis : window);
