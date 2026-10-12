// ASCII plasma behind the site header.
//
// Decorative only. It is drawn on a canvas under the header text, kept faint
// (.header-banner in style.css holds the opacity dial), dimmed further where
// the text sits. Moving the pointer over it leaves a bright wake that cools
// off again. It stops while the header is off screen and holds one still frame
// for visitors who prefer reduced motion.

(() => {
  const header = document.querySelector('.header');
  if (!header) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.className = 'header-banner';
  canvas.setAttribute('aria-hidden', 'true');
  header.prepend(canvas);

  const RAMP = ' .:-=+*#%@';
  const CELL_W = 8;
  const CELL_H = 14;
  const FONT = "11px 'Noto Sans Mono', ui-monospace, Menlo, Consolas, monospace";
  const FRAME_MS = 30;        // ~30 fps is plenty for stepped glyphs
  const DRIFT = 0.0006;       // plasma phase, radians per millisecond
  const STILL_T = 2.4;        // the frame shown when motion is off
  const AMBIENT = 0.65;       // resting brightness; the wake uses the rest
  const BRUSH = 30;           // radius of the pointer's mark, px
  const COOL_MS = 1200;       // time for the wake to cool to about a third
  const CREST = 3.2;          // plasma value the wake pulls toward

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const dark = matchMedia('(prefers-color-scheme: dark)');

  let width = 0, height = 0, cols = 0, rows = 0, top = 0;
  let envelope = new Float32Array(0);
  let lift = new Float32Array(0);
  let primary = '', secondary = '';

  // One value per cell, 0 to 1: pressed in where the pointer passes, then
  // left to cool.
  let wake = new Float32Array(0);
  let lastX = 0, lastY = 0, lastMove = -Infinity;

  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function readColours() {
    const css = getComputedStyle(header);
    primary = css.getPropertyValue('--accent').trim();
    secondary = css.getPropertyValue('--accent-2').trim();
  }

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    cols = Math.ceil(width / CELL_W);
    rows = Math.ceil(height / CELL_H);
    // Whole rows sit on the header rule; the cut-off row is at the page top.
    top = height - rows * CELL_H;
    wake = new Float32Array(cols * rows);

    // Per column: fade out toward the left and right edges, and dim the middle
    // where the header text sits. `lift` is how far a full wake brightens the
    // column: all the way at the sides, most of the way over the text.
    envelope = new Float32Array(cols);
    lift = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * CELL_W;
      const edge = smoothstep(0, 70, Math.min(x, width - x));
      const side = smoothstep(190, 300, Math.abs(x - width / 2));
      const rest = (0.25 + 0.75 * side) * AMBIENT;
      envelope[c] = edge * rest;
      lift[c] = edge * (0.7 + 0.3 * side - rest);
    }
  }

  // Press the pointer into the wake at one point.
  function dab(x, y) {
    const reach = BRUSH * 2.5;
    const c0 = Math.max(0, Math.floor((x - reach) / CELL_W));
    const c1 = Math.min(cols - 1, Math.floor((x + reach) / CELL_W));
    const r0 = Math.max(0, Math.floor((y - top - reach) / CELL_H));
    const r1 = Math.min(rows - 1, Math.floor((y - top + reach) / CELL_H));
    for (let r = r0; r <= r1; r++) {
      const dy = top + (r + 0.5) * CELL_H - y;
      for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5) * CELL_W - x;
        const press = Math.exp(-(dx * dx + dy * dy) / (2 * BRUSH * BRUSH));
        const i = r * cols + c;
        if (press > wake[i]) wake[i] = press;
      }
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, width, height);

    for (let r = 0; r < rows; r++) {
      const y = top + (r + 0.5) * CELL_H;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * CELL_W;

        let v = Math.sin(x * 0.021 + t)
              + Math.sin(y * 0.034 - t * 0.8)
              + Math.sin((x + y) * 0.015 + t * 0.6)
              + Math.sin(Math.hypot(x - width * 0.5, y - height * 1.6) * 0.027 - t * 1.1);

        // Where the pointer has been, pull the plasma up toward a crest.
        const w = wake[r * cols + c];
        v += (CREST - v) * w;

        // Crests take the accent and troughs the second accent, each densest
        // at its peak. The offset leans the balance toward the accent.
        const n = v / 4 + 0.1;
        const level = Math.min(1, Math.abs(n) * 1.35);
        const glyph = RAMP[Math.round(level * (RAMP.length - 1))];
        if (glyph === ' ') continue;

        ctx.fillStyle = n > 0 ? primary : secondary;
        ctx.globalAlpha = (0.25 + 0.75 * level) * (envelope[c] + lift[c] * w);
        ctx.fillText(glyph, x, y);
      }
    }
  }

  let frame = 0, last = 0;

  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = now - last;
    if (dt < FRAME_MS) return;
    last = now;

    const cool = Math.exp(-Math.min(dt, 100) / COOL_MS);
    for (let i = 0; i < wake.length; i++) wake[i] *= cool;

    draw(now * DRIFT);
  }

  function start() {
    if (!frame && !still.matches) frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  // Redraw the still frame when nothing is animating to pick up the change.
  function refresh() {
    if (!frame) draw(STILL_T);
  }

  addEventListener('pointermove', (e) => {
    if (!frame) return;
    const box = canvas.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    // Dab along the path from the last position so a fast pointer leaves no
    // gaps, unless it has been away long enough that this is a new stroke.
    const fresh = e.timeStamp - lastMove > 100;
    const steps = fresh ? 1 : Math.max(1, Math.min(64, Math.ceil(Math.hypot(x - lastX, y - lastY) / (BRUSH / 2))));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      dab(lastX + (x - lastX) * k, lastY + (y - lastY) * k);
    }
    lastX = x;
    lastY = y;
    lastMove = e.timeStamp;
  }, { passive: true });

  new ResizeObserver(() => { resize(); refresh(); }).observe(header);
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) start(); else stop();
  }).observe(header);

  dark.addEventListener('change', () => { readColours(); refresh(); });
  still.addEventListener('change', () => {
    if (still.matches) { stop(); wake.fill(0); refresh(); } else start();
  });

  readColours();
  resize();
  refresh();
})();
