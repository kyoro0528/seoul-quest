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
  /* hoya(wrap, key, gap): mascot line on a result card. key is one of
     'pass2' | 'pass1' | 'none' (mock levels) or 'great' | 'good' | 'low'
     (practice rates) -- all outcomes the caller already computed. Lines are
     static text; gap only fills the pass1 encouragement. Also swaps the
     mascot pose (cheering on pass2/great) and unhides the block. */
  var HOYA_LINES = {
    pass2: 'やったね、2級の圏内！逃げなかったごほうびだね。',
    pass1: '1級の圏内だね。あとGAP点で2級、一緒にもうひとがんばり！',
    none: '大丈夫。ボクは神話で100日もたずに逃げた虎だけど、戻ってきたよ。少しずつ進もう。',
    great: 'すごい！この調子なら、逃げる理由がないね。',
    good: 'いい感じだね。間違えたところだけ、もう一回見てみよう。',
    low: '今日はここまででも大丈夫。ボクも最初は逃げたけど、戻ってくれば続けられるよ。'
  };
  function hoya(wrap, key, gap) {
    if (!wrap) return;
    var text = HOYA_LINES[key] || '';
    if (key === 'pass1') text = text.replace('GAP', String(Math.max(0, Number(gap) || 0)));
    var line = wrap.querySelector('.hoya-line');
    if (line) line.textContent = text;
    var img = wrap.querySelector('.hoya-img');
    if (img) {
      var file = (key === 'pass2' || key === 'great') ? 'mascot-hoya-cheer.svg' : 'mascot-hoya.svg';
      var src = img.getAttribute('src') || '';
      var next = src.replace(/mascot-hoya(-cheer)?\.svg/, file);
      if (next && next !== src) img.setAttribute('src', next);
    }
    wrap.hidden = !text;
  }
  root.ResultViz = { paint: paint, hoya: hoya };
})(typeof window === 'undefined' ? globalThis : window);
