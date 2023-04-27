/* ==========================================================================
   Bourdons des Pyrénées : graphiques et animations (SVG/canvas, sans dépendance)
   Données : window.SITE_DATA (docs/data.js, généré par scripts/build_site_data.py)
   Utilitaires : window.Frame (frame.js)

   Règle des animations : le rendu par défaut est l'état final. Une animation ne
   part de son état initial que lorsqu'elle va réellement se jouer (graphique en
   approche ou visible) ; « mouvement réduit » → états finaux, sans mouvement.
   ========================================================================== */
(function () {
  'use strict';

  const D = window.SITE_DATA;
  const F = window.Frame;
  const { fmt, svg, html } = F;
  const $ = (sel) => document.querySelector(sel);

  const PERIOD_LABELS = ['1889', '2005-06'];
  const PERIOD_KEYS = ['p1889', 'p2005'];
  const NNBSP = ' ';
  const MOTION = !F.reducedMotion && typeof Element.prototype.animate === 'function';
  // Fenêtre géante (capture d'écran pleine page) : tout reste à l'état final
  const STILL = () => window.innerHeight > 2000;

  /* ---------- Formats ---------- */
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const meters = (x) => `${fmt.num(x, 0)}${NNBSP}m`;
  const signedMeters = (x) => `${fmt.signed(x, 0)}${NNBSP}m`;
  const celsius = (x, d = 1) => `${fmt.num(x, d)}${NNBSP}°C`;
  const signedCelsius = (x, d = 1) => `${fmt.signed(x, d)}${NNBSP}°C`;
  const pct = (x) => `${fmt.num(x * 100, 0)}${NNBSP}%`;
  const color = (token, el) => F.cssVar(`--${token}`, el);
  const pText = (p) => (p < 0.001 ? 'p < 0,001' : `p = ${fmt.num(p, 3)}`);
  const epithet = (name) => name.replace(/^Bombus /, '').replace(' complex', '');

  /* ---------- SVG ---------- */
  function mount(container, width, height, label) {
    container.replaceChildren();
    const attrs = { width, height, viewBox: `0 0 ${width} ${height}` };
    if (label) Object.assign(attrs, { role: 'img', 'aria-label': label });
    return svg('svg', attrs, container);
  }

  function roundedBar(x, y, w, h, r, side) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    if (side === 'right') {
      return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
    }
    if (side === 'left') {
      return `M${x + w},${y}H${x + rr}Q${x},${y} ${x},${y + rr}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w}Z`;
    }
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  }

  function axisX(root, scale, ticks, y, format) {
    const g = svg('g', { class: 'axis' }, root);
    ticks.forEach((t) => svg('text', { x: scale(t), y, 'text-anchor': 'middle', text: format(t) }, g));
  }

  function axisY(root, scale, ticks, x, format, grid) {
    const g = svg('g', { class: 'axis' }, root);
    const gridG = grid ? svg('g', { class: 'grid' }, root) : null;
    ticks.forEach((t) => {
      if (gridG) svg('line', { x1: grid[0], x2: grid[1], y1: scale(t), y2: scale(t) }, gridG);
      svg('text', { x, y: scale(t) + 4, 'text-anchor': 'end', text: format(t) }, g);
    });
  }

  /* ---------- Animation ---------- */
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  /** Interpole de 0 à 1 (immédiatement à 1 si pas d'animation). Renvoie une fonction d'arrêt. */
  function tween(duration, onFrame, { delay = 0, easing = easeOut } = {}) {
    if (!MOTION || duration <= 0) {
      onFrame(1);
      return () => {};
    }
    let raf = 0;
    let stopped = false;
    const start = performance.now() + delay;
    onFrame(easing(0));
    const frame = (now) => {
      if (stopped) return;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      onFrame(easing(t));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }

  /** Joue une animation d'entrée une seule fois : remise à zéro quand le graphique
   *  commence à entrer dans l'écran, lecture quand il est visible au tiers. */
  function whenSeen(el, { reset, play, finish }) {
    if (!MOTION || !('IntersectionObserver' in window)) return;
    let state = 'idle';
    let fallback = 0;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (!e.isIntersecting || state === 'done') return;
      if (STILL()) {
        window.clearTimeout(fallback);
        state = 'done';
        io.disconnect();
        finish();
        return;
      }
      if (e.intersectionRatio >= 0.35) {
        window.clearTimeout(fallback);
        state = 'done';
        io.disconnect();
        play();
      } else if (state === 'idle') {
        // Le graphique commence à entrer : on le remet à son état initial, hors du regard
        state = 'reset';
        reset();
        fallback = window.setTimeout(() => {
          if (state === 'reset') {
            state = 'idle';
            finish();
          }
        }, 4000);
      }
    }, { threshold: [0, 0.35] });
    io.observe(el);
  }

  /** Animation Web Animations API avec état initial appliqué pendant le délai. */
  function animate(el, keyframes, options) {
    if (!MOTION || !el) return null;
    return el.animate(keyframes, { fill: 'backwards', easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)', ...options });
  }

  /* ---------- Couleurs : interpolation OKLab ---------- */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  }
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  function rgbToOklab([r, g, b]) {
    const [lr, lg, lb] = [toLin(r), toLin(g), toLin(b)];
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }
  function oklabToHex([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGam(c))) * 255).toString(16).padStart(2, '0')).join('')}`;
  }
  function ramp(tokens, scope) {
    const stops = tokens.map((t) => rgbToOklab(hexToRgb(color(t, scope))));
    return (u) => {
      const v = Math.min(1, Math.max(0, u)) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(v));
      const t = v - i;
      return oklabToHex(stops[i].map((c, k) => c + (stops[i + 1][k] - c) * t));
    };
  }
  const TEMP_TOKENS = ['t-cold', 't-cool', 't-mid', 't-warm', 't-hot'];

  /* ---------- Nombres du texte lus dans les données ---------- */
  function fillNumbers() {
    const set = (key, value) => document.querySelectorAll(`[data-k="${key}"]`).forEach((n) => {
      n.textContent = value;
    });
    set('slope', `${fmt.num(D.climate.trend.slope_decade, 2)}${NNBSP}°C par décennie`);
    set('aug-warming', celsius(D.august.warming, 1));
  }

  /* ======================================================================
     Relief commun : crêtes schématiques, sommets réels
     ====================================================================== */
  const PEAKS = [
    { name: 'Taillon', x: 0.2, elev: 3144 },
    { name: 'Marboré', x: 0.47, elev: 3248 },
    { name: 'Vignemale', x: 0.79, elev: 3298 },
  ];
  const FAR_RIDGE = [
    [0, 2380], [0.05, 2610], [0.1, 2540], [0.15, 2900], [0.2, 3144], [0.24, 2930], [0.28, 2760],
    [0.33, 2940], [0.37, 2810], [0.42, 3020], [0.47, 3248], [0.51, 3090], [0.55, 3160], [0.6, 2880],
    [0.65, 2720], [0.69, 2950], [0.74, 3080], [0.79, 3298], [0.84, 3150], [0.89, 2860], [0.95, 2640],
    [1, 2520],
  ];
  const MID_RIDGE = [
    [0, 1880], [0.07, 2180], [0.13, 2050], [0.2, 2420], [0.27, 2260], [0.34, 2520], [0.42, 2330],
    [0.5, 2610], [0.57, 2400], [0.63, 2270], [0.7, 2560], [0.77, 2380], [0.84, 2470], [0.92, 2210],
    [1, 2080],
  ];
  const NEAR_RIDGE = [
    [0, 1180], [0.08, 1320], [0.15, 1260], [0.24, 1480], [0.32, 1390], [0.41, 1560], [0.5, 1470],
    [0.58, 1640], [0.66, 1520], [0.74, 1700], [0.82, 1590], [0.9, 1760], [1, 1690],
  ];

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function ridgePoints(control, jitter, seed, steps = 7) {
    const rand = seeded(seed);
    const pts = [];
    for (let i = 0; i < control.length - 1; i++) {
      const [x0, e0] = control[i];
      const [x1, e1] = control[i + 1];
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const noise = k === 0 ? 0 : (rand() - 0.5) * 2 * jitter * Math.sin(Math.PI * t);
        pts.push([x0 + (x1 - x0) * t, k === 0 ? e0 : Math.min(Math.max(e0, e1) - 15, e0 + (e1 - e0) * t + noise)]);
      }
    }
    pts.push(control[control.length - 1]);
    return pts;
  }

  /** Dessine le relief dans `root` ; renvoie les calques et le contour de la montagne. */
  function drawRelief(root, { W, H, y, uid, fadeBottom = 0.82, peaks = 'full', x0 = 0, x1 = W }) {
    const sx = (u) => x0 + u * (x1 - x0);
    const defs = svg('defs', {}, root);
    const fade = (id, x2, y2, stops) => {
      const grad = svg('linearGradient', { id: `${id}-g`, x1: 0, y1: 0, x2, y2 }, defs);
      stops.forEach(([offset, opacity]) => svg('stop', { offset, 'stop-color': '#fff', 'stop-opacity': opacity }, grad));
      const mask = svg('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
      svg('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${id}-g)` }, mask);
    };
    fade(`${uid}-fx`, 1, 0, [[0, 0], [0.05, 1], [0.95, 1], [1, 0]]);
    fade(`${uid}-fy`, 0, 1, [[0, 1], [fadeBottom, 1], [1, 0]]);
    const relief = svg('g', { mask: `url(#${uid}-fy)` }, svg('g', { mask: `url(#${uid}-fx)` }, root));
    const toPath = (pts) => `M${x0},${H}` + pts.map(([u, e]) => `L${sx(u).toFixed(1)},${y(e).toFixed(1)}`).join('') + `L${x1},${H}Z`;
    const far = ridgePoints(FAR_RIDGE, 70, 7);
    const snowRand = seeded(5);
    const snow = [];
    for (let u = 0; u <= 1.0001; u += 0.025) snow.push(`${sx(u).toFixed(1)},${y(2900 + (snowRand() - 0.5) * 120).toFixed(1)}`);
    svg('polygon', { points: `${x0},0 ${snow.join(' ')} ${x1},0` }, svg('clipPath', { id: `${uid}-snow` }, defs));
    const mountain = svg('clipPath', { id: `${uid}-mtn` }, defs);
    svg('path', { d: toPath(far) }, mountain);

    const layers = [svg('g', {}, relief), svg('g', {}, relief), svg('g', {}, relief)];
    svg('path', { d: toPath(far), class: 'ridge--far' }, layers[0]);
    svg('path', { d: toPath(far), class: 'ridge--snow', 'clip-path': `url(#${uid}-snow)` }, layers[0]);
    svg('polyline', { points: far.map(([u, e]) => `${sx(u).toFixed(1)},${y(e).toFixed(1)}`).join(' '), class: 'ridge-line' }, layers[0]);
    svg('path', { d: toPath(ridgePoints(MID_RIDGE, 60, 11)), class: 'ridge--mid' }, layers[1]);
    svg('path', { d: toPath(ridgePoints(NEAR_RIDGE, 45, 23)), class: 'ridge--near' }, layers[2]);

    const labels = svg('g', {}, root);
    PEAKS.forEach((p) => {
      const px = sx(p.x);
      const py = y(p.elev);
      svg('line', { x1: px, x2: px, y1: py - 5, y2: py - 12, class: 'guide' }, labels);
      if (peaks === 'full') {
        svg('text', { x: px, y: py - 33, 'text-anchor': 'middle', class: 'map-name', text: p.name }, labels);
      }
      svg('text', { x: px, y: py - 17, 'text-anchor': 'middle', class: 'map-height', text: fmt.num(p.elev, 0) }, labels);
    });
    return { layers, labels, clipId: `${uid}-mtn`, sx };
  }

  /* ======================================================================
     Ouverture : panorama, les 12 espèces montent
     ====================================================================== */
  function hero() {
    const el = $('#hero-plot');
    const canvas = $('.opener__contours');
    const species = [...D.species].sort((a, b) => a.mean[0] - b.mean[0]);
    const base = mean(species.map((s) => s.mean[0]));
    const isoShift = Math.round(D.climate.isotherm_shift / 10) * 10;
    const beesShift = D.species_test.mean;
    let played = false;

    F.onResize(el, (W) => {
      const parts = draw(W);
      if (!played) {
        played = true;
        intro(parts);
      }
    });

    function draw(W) {
      const narrow = W < 700;
      const content = Math.min(W, 1180);
      const cL = (W - content) / 2 + 16;
      const cR = W - cL;
      const labelRow = narrow ? 0 : 50;
      const plotH = narrow ? 340 : Math.round(Math.max(380, Math.min(450, W * 0.28)));
      const H = plotH + labelRow;
      const root = mount(el, W, H);
      const y = F.scaleLinear([880, 3420], [plotH - 8, 34]);
      const relief = drawRelief(root, { W, H: plotH, y, uid: 'hero', peaks: narrow ? 'heights' : 'full' });

      // Altitudes de référence
      const grid = svg('g', { class: 'grid' }, root);
      const panelW = narrow ? 104 : 196;
      const plotL = cL + (narrow ? 40 : 54);
      const panelL = cR - panelW;
      [1000, 1500, 2000, 2500, 3000].forEach((e) => {
        svg('line', { x1: plotL - 6, x2: cR, y1: y(e), y2: y(e) }, grid);
        svg('text', { x: cL, y: y(e) + 4, class: 'elev-label', text: `${fmt.num(e, 0)} m` }, root);
      });

      // Colonnes d'espèces
      const band = F.scaleBand(species.map((s) => s.name), [plotL, panelL - 16], { paddingInner: 0.3, paddingOuter: 0.3 });
      const cols = species.map((s) => {
        const cx = band(s.name) + band.bandwidth / 2;
        const y0 = y(s.mean[0]);
        const y1 = y(s.mean[1]);
        const g = svg('g', { class: 'mark' }, root);
        const len = Math.max(1, Math.abs(y1 - y0));
        const stem = svg('line', { x1: cx, x2: cx, y1: y0, y2: y1, class: 'stem s-p2005', 'stroke-dasharray': `${len} ${len}` }, g);
        const d0 = svg('circle', { cx, cy: y0, r: 5, class: 'f-p1889 ring', style: 'transform-box: fill-box; transform-origin: center' }, g);
        const d1 = svg('circle', { cx, cy: y1, r: 6.5, class: 'f-p2005 ring' }, g);
        const label = svg('g', {}, root);
        if (narrow) {
          if (['Bombus wurflenii', 'Bombus gerstaeckeri', 'Bombus soroeensis'].includes(s.name)) {
            const right = s.name !== 'Bombus gerstaeckeri';
            const ly = s.shift < 0 ? y1 + 16 : y1 - 4;
            svg('text', { x: cx + (right ? 10 : -10), y: ly, 'text-anchor': right ? 'start' : 'end', class: 'specimen-label', text: epithet(s.name) }, label);
          }
        } else {
          svg('text', { x: cx, y: plotH + 20, 'text-anchor': 'middle', class: 'specimen-label', text: epithet(s.name) }, label);
          svg('text', { x: cx, y: plotH + 38, 'text-anchor': 'middle', class: 'specimen-value', text: signedMeters(s.shift) }, label);
        }
        const hit = svg('rect', { x: cx - band.step / 2, y: 30, width: band.step, height: H - 30, class: 'hit' }, g);
        F.hover(hit, () => ({
          title: s.name,
          rows: [
            { value: meters(s.mean[0]), label: '1889', color: color('p1889'), kind: 'dot' },
            { value: meters(s.mean[1]), label: '2005-06', color: color('p2005'), kind: 'dot' },
            { value: `${signedMeters(s.shift)} (± ${fmt.num(s.shift_sd, 0)})`, label: 'à effort égal' },
          ],
          note: `${s.n[0]} bourdons en 1889, ${s.n[1]} en 2005-06`,
        }), { label: `${s.name} : ${meters(s.mean[0])} en 1889, ${meters(s.mean[1])} en 2005-06` });
        return { stem, d0, d1, label, len, dy: y0 - y1 };
      });

      // Comparaison : températures et bourdons
      const xa = panelL + (narrow ? 30 : 48);
      const xb = xa + (narrow ? 42 : 58);
      const yBase = y(base);
      const yIso = y(base + isoShift);
      const yBees = y(base + beesShift);
      const arrows = svg('g', {}, root);
      svg('line', { x1: xa - 16, x2: xb + 14, y1: yBase, y2: yBase, class: 'guide' }, arrows);
      svg('text', { x: xa - 16, y: yBase + 17, class: 'callout-sub', text: '1889' }, arrows);
      const lenIso = yBase - yIso - 8;
      const climate = svg('line', { x1: xa, x2: xa, y1: yBase, y2: yIso + 8, class: 'arrow arrow--climate', 'stroke-dasharray': `${lenIso} ${lenIso}` }, arrows);
      const head = svg('path', { d: `M${xa - 5},${yIso + 9}L${xa},${yIso}L${xa + 5},${yIso + 9}Z`, class: 'arrowhead' }, arrows);
      const lenBees = Math.max(1, yBase - yBees - 3);
      const bees = svg('line', { x1: xb, x2: xb, y1: yBase - 3, y2: yBees, class: 'arrow arrow--bees', 'stroke-dasharray': `${lenBees} ${lenBees}` }, arrows);
      const notes = svg('g', {}, arrows);
      if (narrow) {
        svg('text', { x: xa, y: yIso - 24, 'text-anchor': 'middle', class: 'callout', text: `+${fmt.num(isoShift, 0)} m` }, notes);
        svg('text', { x: xa, y: yIso - 9, 'text-anchor': 'middle', class: 'callout-sub', text: 'climat' }, notes);
        svg('text', { x: xb, y: yBees - 24, 'text-anchor': 'middle', class: 'callout', text: `+${fmt.num(beesShift, 0)} m` }, notes);
        svg('text', { x: xb, y: yBees - 9, 'text-anchor': 'middle', class: 'callout-sub', text: 'bourdons' }, notes);
      } else {
        svg('text', { x: xa - 8, y: yIso - 30, class: 'callout', text: `+${fmt.num(isoShift, 0)} m` }, notes);
        svg('text', { x: xa - 8, y: yIso - 13, class: 'callout-sub', text: 'températures' }, notes);
        svg('text', { x: xb + 12, y: yBees - 1, class: 'callout', text: `+${fmt.num(beesShift, 0)} m` }, notes);
        svg('text', { x: xb + 12, y: yBees + 15, class: 'callout-sub', text: 'bourdons' }, notes);
      }
      return { relief, cols, climate, head, bees, notes, lenIso, lenBees };
    }

    // Séquence d'ouverture (une fois) : le relief se lève, les espèces apparaissent puis montent
    function intro({ relief, cols, climate, head, bees, notes, lenIso, lenBees }) {
      if (!MOTION) return;
      animate(canvas, [{ opacity: 0 }, { opacity: 1 }], { duration: 1400 });
      relief.layers.forEach((layer, i) => animate(layer, [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 80 + i * 140 }));
      animate(relief.labels, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 700 });
      cols.forEach((c, i) => {
        animate(c.d0, [{ opacity: 0, transform: 'scale(0.2)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 600 + i * 45 });
        animate(c.stem, [{ strokeDashoffset: c.len }, { strokeDashoffset: 0 }], { duration: 1000, delay: 1150 + i * 55 });
        animate(c.d1, [{ opacity: 0, transform: `translateY(${c.dy}px)` }, { opacity: 1, transform: `translateY(${c.dy}px)`, offset: 0.05 }, { opacity: 1, transform: 'none' }], { duration: 1000, delay: 1150 + i * 55 });
        animate(c.label, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1500 + i * 55 });
      });
      animate(climate, [{ strokeDashoffset: lenIso, opacity: 0 }, { strokeDashoffset: lenIso * 0.95, opacity: 1, offset: 0.05 }, { strokeDashoffset: 0, opacity: 1 }], { duration: 900, delay: 1700 });
      animate(head, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 2550 });
      animate(bees, [{ strokeDashoffset: lenBees, opacity: 0 }, { strokeDashoffset: lenBees * 0.95, opacity: 1, offset: 0.05 }, { strokeDashoffset: 0, opacity: 1 }], { duration: 600, delay: 2150 });
      animate(notes, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 2300 });
    }
  }

  /* Courbes de niveau génératives derrière l'ouverture (équidistance + courbes maîtresses) */
  function contours() {
    const canvas = $('.opener__contours');
    const host = canvas.parentElement;
    const hills = [
      [0.12, 0.3, 0.22, 1.0], [0.38, 0.75, 0.18, 0.8], [0.62, 0.2, 0.25, 1.2], [0.86, 0.62, 0.2, 0.9],
      [0.25, 1.05, 0.3, 0.6], [0.72, 1.1, 0.16, 0.7], [0.5, 0.45, 0.12, -0.5], [0.95, 0.05, 0.14, 0.6],
    ];
    const height = (u, v) => {
      let h = 0.12 * Math.sin(u * 7.1 + v * 3.3) + 0.08 * Math.cos(u * 3.7 - v * 6.2);
      for (const [cx, cy, s, a] of hills) h += a * Math.exp(-((u - cx) ** 2 + (v - cy) ** 2) / (2 * s * s));
      return h;
    };
    const SEG = {
      1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
      8: [[2, 3]], 9: [[2, 0]], 10: [[0, 1], [2, 3]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
    };
    function draw() {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const step = 7;
      const nx = Math.ceil(w / step) + 1;
      const ny = Math.ceil(h / step) + 1;
      const field = new Float32Array(nx * ny);
      const scale = Math.max(w, h);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) field[j * nx + i] = height((i * step) / scale, (j * step) / scale);
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of field) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const levels = 26;
      const thin = color('contour');
      const strong = color('contour-strong');
      for (let k = 1; k < levels; k++) {
        const level = lo + ((hi - lo) * k) / levels;
        ctx.beginPath();
        for (let j = 0; j < ny - 1; j++) {
          for (let i = 0; i < nx - 1; i++) {
            const a = field[j * nx + i];
            const b = field[j * nx + i + 1];
            const c = field[(j + 1) * nx + i + 1];
            const d = field[(j + 1) * nx + i];
            const code = (a > level) | ((b > level) << 1) | ((c > level) << 2) | ((d > level) << 3);
            const segs = SEG[code];
            if (!segs) continue;
            const x = i * step;
            const yy = j * step;
            const edge = (e) => {
              if (e === 0) return [x + step * ((level - a) / (b - a)), yy];
              if (e === 1) return [x + step, yy + step * ((level - b) / (c - b))];
              if (e === 2) return [x + step * ((level - d) / (c - d)), yy + step];
              return [x, yy + step * ((level - a) / (d - a))];
            };
            for (const [e1, e2] of segs) {
              const p1 = edge(e1);
              const p2 = edge(e2);
              ctx.moveTo(p1[0], p1[1]);
              ctx.lineTo(p2[0], p2[1]);
            }
          }
        }
        const master = k % 5 === 0;
        ctx.strokeStyle = master ? strong : thin;
        ctx.lineWidth = master ? 1.2 : 0.8;
        ctx.stroke();
      }
    }
    F.onResize(host, draw);
    F.onTheme(draw);
  }

  /* ======================================================================
     Récit déroulant : la même montagne passe par cinq états
     ====================================================================== */
  const STATES = [
    { iso: 0, climb: 0, climate: 0, bees: 0, plants: 0, forest: 0, forestOn: 0, bands: 1 },
    { iso: 1, climb: 0, climate: 1, bees: 0, plants: 0, forest: 0, forestOn: 0, bands: 1 },
    { iso: 1, climb: 1, climate: 1, bees: 1, plants: 0, forest: 0, forestOn: 0, bands: 1 },
    { iso: 1, climb: 1, climate: 1, bees: 1, plants: 1, forest: 0, forestOn: 0, bands: 1 },
    { iso: 1, climb: 1, climate: 1, bees: 1, plants: 1, forest: 1, forestOn: 1, bands: 0.35 },
  ];

  function stage() {
    const el = $('#stage-plot');
    const section = $('#montee');
    const steps = [...document.querySelectorAll('.step')];
    const species = [...D.species].sort((a, b) => a.mean[0] - b.mean[0]);
    const base = mean(species.map((s) => s.mean[0]));
    const [early, late] = D.climate.profiles;
    const isoShift = D.climate.isotherm_shift;
    const zones = D.land_use.map((z) => ({ ...z, lo: { z1: 1000, z2: 1400, z3: 1800 }[z.id], hi: { z1: 1400, z2: 1800, z3: 2200 }[z.id] }));
    let state = { ...STATES[STATES.length - 1] };
    let apply = () => {};
    let stop = () => {};
    let current = -1;

    F.onResize(el, (W) => {
      apply = draw(W);
      apply(state);
    });
    F.onTheme(() => {
      apply = draw(el.clientWidth);
      apply(state);
    });

    function draw(W) {
      const narrow = W < 560;
      const H = Math.round(Math.max(360, Math.min(window.innerHeight * (narrow ? 0.5 : 0.72), W * 0.9)));
      const root = mount(el, W, H);
      const y = F.scaleLinear([850, 3420], [H - 6, 30]);
      const relief = drawRelief(root, { W, H, y, uid: 'stage', fadeBottom: 0.92, peaks: narrow ? 'heights' : 'full' });
      const temp = ramp(TEMP_TOKENS);
      const tAt = (e) => early.a + early.b * e;
      const eAt = (t) => (t - early.a) / early.b;
      const shiftPx = y(eAt(0)) - y((0 - late.a) / late.b);

      // Bandes de température (1901-1910), découpées par la montagne, décalées en bloc
      const faded = svg('g', { mask: 'url(#stage-fy)' }, svg('g', { mask: 'url(#stage-fx)' }, root));
      const clip = svg('g', { 'clip-path': `url(#${relief.clipId})` }, faded);
      const bands = svg('g', {}, clip);
      const bandsInner = svg('g', {}, bands);
      for (let t = -12; t <= 13; t++) {
        // Bande entre l'isotherme t-1 (plus haut, plus froid) et l'isotherme t
        const top = y(eAt(t - 1));
        const bottom = y(eAt(t));
        const u = (t + 4) / 13;
        svg('rect', { x: 0, y: top, width: W, height: bottom - top + 0.5, fill: temp(u) }, bandsInner);
      }
      // Isothermes étiquetées à gauche (zone libre de points), elles montent avec les bandes
      const isoLabels = svg('g', {}, root);
      [-2, 0, 2, 4, 6].forEach((t) => {
        const yy = y(eAt(t));
        svg('line', { x1: 0, x2: narrow ? 46 : 92, y1: yy, y2: yy, class: 'guide' }, isoLabels);
        svg('text', { x: 2, y: yy - 4, class: 'band-label halo', text: t === 0 ? '0 °C' : `${fmt.signed(t, 0)} °C` }, isoLabels);
      });

      // Forêt par zone (1910 → 2010)
      const forest = svg('g', {}, clip);
      const forestLabels = svg('g', {}, root);
      const zoneRects = zones.map((z) => {
        const r = svg('rect', { x: 0, y: y(z.hi), width: W, height: y(z.lo) - y(z.hi), class: 'f-forest' }, forest);
        const f0 = z.shares['Forêt'][0];
        const f1 = z.shares['Forêt'][z.shares['Forêt'].length - 1];
        const gl = svg('g', {}, forestLabels);
        const ly = (y(z.lo) + y(z.hi)) / 2;
        if (!narrow) svg('text', { x: 10, y: ly - 3, class: 'zone-label halo', text: `${fmt.num(z.lo, 0)}-${fmt.num(z.hi, 0)} m` }, gl);
        const v = svg('text', { x: narrow ? 6 : 10, y: narrow ? ly + 4 : ly + 14, class: 'callout-sub halo', text: '' }, gl);
        return { r, f0, f1, gl, v };
      });

      // Espèces
      const panelW = narrow ? 120 : 178;
      const plotL = narrow ? 18 : 120;
      const band = F.scaleBand(species.map((s) => s.name), [plotL, W - panelW - 10], { paddingInner: 0.3, paddingOuter: 0.2 });
      const marks = svg('g', {}, root);
      const cols = species.map((s) => {
        const cx = band(s.name) + band.bandwidth / 2;
        const y0 = y(s.mean[0]);
        const y1 = y(s.mean[1]);
        const stem = svg('line', { x1: cx, x2: cx, y1: y0, y2: y0, class: 'stem s-p2005' }, marks);
        svg('circle', { cx, cy: y0, r: 5, class: 'f-p1889 ring ring--strong' }, marks);
        const d1 = svg('circle', { cx, cy: y0, r: 6.5, class: 'f-p2005 ring ring--strong' }, marks);
        return { stem, d1, y0, y1 };
      });

      // Flèches : températures, fleurs, bourdons
      const xs = narrow ? [W - 98, W - 60, W - 22] : [W - panelW + 30, W - panelW + 82, W - panelW + 134];
      const yBase = y(base);
      const arrows = svg('g', {}, root);
      const baseMark = svg('g', {}, arrows);
      svg('line', { x1: xs[0] - 14, x2: xs[2] + 12, y1: yBase, y2: yBase, class: 'guide' }, baseMark);
      svg('text', { x: xs[0] - 14, y: yBase + 16, class: 'callout-sub halo', text: 'moyenne 1889' }, baseMark);
      const mk = (x, meters, cls, label, sub) => {
        const g = svg('g', {}, arrows);
        const line = svg('line', { x1: x, x2: x, y1: yBase, y2: yBase, class: `arrow ${cls}` }, g);
        const head = cls === 'arrow--climate' ? svg('path', { d: '', class: 'arrowhead' }, g) : null;
        const t1 = svg('text', { x, y: 0, 'text-anchor': 'middle', class: 'callout', text: label }, g);
        const t2 = svg('text', { x, y: 0, 'text-anchor': 'middle', class: 'callout-sub', text: sub }, g);
        return { g, line, head, t1, t2, x, meters };
      };
      const aClimate = mk(xs[0], isoShift, 'arrow--climate', `+${fmt.num(Math.round(isoShift / 10) * 10, 0)}`, narrow ? 'climat' : 'climat');
      const aPlants = mk(xs[1], D.plants.test.mean, 'arrow--plants', `+${fmt.num(D.plants.test.mean, 0)}`, 'fleurs');
      const aBees = mk(xs[2], D.species_test.mean, 'arrow--bees', `+${fmt.num(D.species_test.mean, 0)}`, 'bourdons');

      return function render(s) {
        bands.setAttribute('transform', `translate(0 ${(-shiftPx * s.iso).toFixed(2)})`);
        bands.setAttribute('opacity', (0.5 * s.bands).toFixed(3));
        isoLabels.setAttribute('transform', `translate(0 ${(-shiftPx * s.iso).toFixed(2)})`);
        isoLabels.setAttribute('opacity', Math.min(1, Math.max(0, (s.bands - 0.35) / 0.65)).toFixed(3));
        zoneRects.forEach((z) => {
          const share = z.f0 + (z.f1 - z.f0) * s.forest;
          z.r.setAttribute('opacity', (s.forestOn * share * 0.9).toFixed(3));
          z.gl.setAttribute('opacity', s.forestOn.toFixed(3));
          z.v.textContent = `forêt ${pct(z.f0)} → ${pct(share)}`;
        });
        cols.forEach((c) => {
          const yy = c.y0 + (c.y1 - c.y0) * s.climb;
          c.stem.setAttribute('y2', yy.toFixed(2));
          c.d1.setAttribute('cy', yy.toFixed(2));
          c.d1.setAttribute('opacity', s.climb > 0.02 ? 1 : 0);
        });
        baseMark.setAttribute('opacity', Math.min(1, s.climate * 2).toFixed(3));
        [[aClimate, s.climate], [aPlants, s.plants], [aBees, s.bees]].forEach(([a, k]) => {
          const tip = yBase - (y(base) - y(base + a.meters)) * k;
          a.line.setAttribute('y2', tip.toFixed(2));
          a.g.setAttribute('opacity', k > 0.01 ? 1 : 0);
          if (a.head) a.head.setAttribute('d', `M${a.x - 5},${tip + 8}L${a.x},${tip - 1}L${a.x + 5},${tip + 8}Z`);
          a.t1.setAttribute('y', (tip - 26).toFixed(1));
          a.t2.setAttribute('y', (tip - 11).toFixed(1));
          a.t1.setAttribute('opacity', k > 0.6 ? 1 : 0);
          a.t2.setAttribute('opacity', k > 0.6 ? 1 : 0);
        });
      };
    }

    function go(k) {
      if (k === current) return;
      current = k;
      steps.forEach((s, i) => s.classList.toggle('is-active', i === k));
      const from = { ...state };
      const target = STATES[k];
      stop();
      stop = tween(1000, (t) => {
        Object.keys(target).forEach((key) => {
          state[key] = from[key] + (target[key] - from[key]) * t;
        });
        apply(state);
      }, { easing: easeInOut });
    }

    if (!('IntersectionObserver' in window)) return;
    // Approche : on repart de 1889 (le rendu par défaut reste l'état final)
    const near = new IntersectionObserver((entries) => {
      if (STILL()) return;
      if (entries.some((e) => e.isIntersecting) && current === -1) {
        section.classList.add('is-live');
        state = { ...STATES[0] };
        apply(state);
        near.disconnect();
      }
    }, { rootMargin: '0px' });
    near.observe(section);
    const io = new IntersectionObserver((entries) => {
      if (STILL()) return;
      entries.forEach((e) => {
        if (e.isIntersecting) go(Number(e.target.dataset.step));
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach((s) => io.observe(s));
  }

  /* ======================================================================
     Bande sombre : rayures qui se peignent + courbe annuelle qui se trace
     ====================================================================== */
  function warming() {
    const band = $('#climat');
    const stripesEl = $('#stripes-plot');
    const chartEl = $('#climate-plot');
    const c = D.climate;
    const anomalies = c.t.map((t) => t - c.baseline);
    const maxAbs = Math.max(...anomalies.map(Math.abs));
    let paint = () => {};
    let drawLines = () => {};

    F.dataTable($('#fig-climate'), {
      caption: 'Température annuelle moyenne par année',
      columns: [
        { key: 'year', label: 'Année' },
        { key: 't', label: 'Température (°C)', num: true, format: (v) => fmt.num(v, 2) },
        { key: 'a', label: 'Écart à 1901-1930 (°C)', num: true, format: (v) => fmt.signed(v, 2) },
      ],
      rows: c.years.map((year, i) => ({ year, t: c.t[i], a: anomalies[i] })),
    });

    F.onResize(stripesEl, (W) => {
      const narrow = W < 640;
      const H = narrow ? 128 : 196;
      const root = mount(stripesEl, W, H + 34);
      const x = F.scaleLinear([1900.5, 2009.5], [0, W]);
      const scale = ramp(TEMP_TOKENS, band);
      const clipRect = svg('rect', { x: 0, y: 0, width: W, height: H + 40 }, svg('clipPath', { id: 'stripes-clip' }, svg('defs', {}, root)));
      const g = svg('g', { 'clip-path': 'url(#stripes-clip)' }, root);
      c.years.forEach((year, i) => {
        const r = svg('rect', {
          x: x(year - 0.5), y: 0, width: Math.max(1, x(year + 0.5) - x(year - 0.5) + 0.5), height: H,
          fill: scale(0.5 + anomalies[i] / (2 * maxAbs)),
        }, g);
        F.hover(r, () => ({
          title: String(year),
          rows: [
            { value: celsius(c.t[i], 2), label: 'moyenne annuelle' },
            { value: signedCelsius(anomalies[i], 2), label: 'écart à 1901-1930', color: scale(0.5 + anomalies[i] / (2 * maxAbs)), kind: 'box' },
          ],
        }), { focusable: false });
      });
      const ticks = narrow ? [1901, 1950, 2009] : [1901, 1920, 1940, 1960, 1980, 2009];
      ticks.forEach((t, i) => svg('text', {
        x: Math.min(W - 4, Math.max(4, x(t))), y: H + 22, 'text-anchor': i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle',
        class: 'chart-label', fill: color('ink-2', band), text: String(t),
      }, root));
      paint = (p) => clipRect.setAttribute('width', (W * p).toFixed(1));
    });

    F.onResize(chartEl, (W) => {
      const narrow = W < 640;
      const plotH = narrow ? 240 : 300;
      const pad = { top: 24, right: narrow ? 14 : 30, bottom: 30, left: 40 };
      const H = pad.top + plotH + pad.bottom;
      const root = mount(chartEl, W, H, 'Température annuelle moyenne 1901-2009, tendance et projection 2050');
      const x = F.scaleLinear([1900.5, 2052], [pad.left, W - pad.right]);
      const y = F.scaleLinear([2, 7.5], [pad.top + plotH, pad.top]);
      axisY(root, y, [2, 3, 4, 5, 6, 7], pad.left - 8, (v) => `${fmt.num(v, 0)}°`, [pad.left, W - pad.right]);
      axisX(root, x, narrow ? [1920, 1960, 2000, 2050] : [1910, 1930, 1950, 1970, 1990, 2010, 2030, 2050], H - 6, String);
      const t = c.trend;
      const fit = (yr) => t.intercept + t.slope_year * yr;
      const pts = c.years.map((yr, i) => `${x(yr).toFixed(1)},${y(c.t[i]).toFixed(1)}`).join(' ');
      const series = svg('polyline', { points: pts, class: 'line line--ink' }, root);
      const trend = svg('line', { x1: x(1901), x2: x(2009), y1: y(fit(1901)), y2: y(fit(2009)), class: 'line line--trend' }, root);
      const proj = svg('g', {}, root);
      svg('line', { x1: x(2009), x2: x(2050), y1: y(fit(2009)), y2: y(fit(2050)), class: 'line line--trend guide--dash' }, proj);
      const pr = c.projection;
      svg('line', { x1: x(2050), x2: x(2050), y1: y(pr.low), y2: y(pr.high), class: 'line line--trend' }, proj);
      [pr.low, pr.high].forEach((v) => svg('line', { x1: x(2050) - 5, x2: x(2050) + 5, y1: y(v), y2: y(v), class: 'line line--trend' }, proj));
      svg('circle', { cx: x(2050), cy: y(pr.value), r: 5, fill: color('accent', band), class: 'ring' }, proj);
      // Annotations directes
      const notes = svg('g', {}, root);
      svg('text', { x: x(2050) + 4, y: y(pr.high) - 22, 'text-anchor': 'end', class: 'callout', text: `${celsius(pr.value, 1)} en 2050` }, notes);
      svg('text', { x: x(2050) + 4, y: y(pr.high) - 8, 'text-anchor': 'end', class: 'callout-sub', text: `prédiction ${fmt.num(pr.low, 1)} à ${fmt.num(pr.high, 1)} °C` }, notes);
      if (!narrow) {
        svg('text', { x: x(1955), y: y(5.05), 'text-anchor': 'middle', class: 'callout-sub', text: 'palier de 1930 à 1980' }, notes);
        svg('text', { x: x(1986), y: y(6.1), 'text-anchor': 'end', class: 'callout-sub', text: 'accélération' }, notes);
      }
      svg('text', { x: x(1928), y: y(2.55), class: 'callout', text: `${fmt.signed(t.slope_decade, 2)} °C par décennie` }, notes);
      svg('text', { x: x(1928), y: y(2.55) + 16, class: 'callout-sub', text: `tendance 1901-2009, IC 95 % ${fmt.num(t.ci[0], 2)} à ${fmt.num(t.ci[1], 2)}` }, notes);

      // Réticule
      const cross = svg('line', { y1: pad.top, y2: pad.top + plotH, class: 'crosshair', visibility: 'hidden' }, root);
      const dot = svg('circle', { r: 4.5, class: 'hover-dot', visibility: 'hidden' }, root);
      const overlay = svg('rect', { x: pad.left, y: pad.top, width: x(2009.5) - pad.left, height: plotH, class: 'overlay', tabindex: 0, 'aria-label': 'Parcourir les années avec les flèches' }, root);
      let idx = c.years.length - 1;
      const show = (i, evt) => {
        idx = i;
        const yr = c.years[i];
        [['x1', x(yr)], ['x2', x(yr)]].forEach(([k, v]) => cross.setAttribute(k, v));
        dot.setAttribute('cx', x(yr));
        dot.setAttribute('cy', y(c.t[i]));
        cross.setAttribute('visibility', 'visible');
        dot.setAttribute('visibility', 'visible');
        F.tip.show(evt || overlay, { title: String(yr), rows: [{ value: celsius(c.t[i], 2), label: 'moyenne annuelle' }, { value: signedCelsius(anomalies[i], 2), label: 'écart à 1901-1930' }] });
      };
      const hide = () => {
        cross.setAttribute('visibility', 'hidden');
        dot.setAttribute('visibility', 'hidden');
        F.tip.hide();
      };
      overlay.addEventListener('pointermove', (evt) => {
        const rect = root.getBoundingClientRect();
        const yr = Math.round(x.invert(evt.clientX - rect.left));
        show(Math.min(c.years.length - 1, Math.max(0, yr - c.years[0])), evt);
      });
      overlay.addEventListener('pointerleave', hide);
      overlay.addEventListener('blur', hide);
      overlay.addEventListener('focus', () => show(idx));
      overlay.addEventListener('keydown', (evt) => {
        const last = c.years.length - 1;
        const moves = { ArrowLeft: idx - 1, ArrowRight: idx + 1, Home: 0, End: last };
        if (!(evt.key in moves)) return;
        evt.preventDefault();
        show(Math.min(last, Math.max(0, moves[evt.key])));
      });

      const lenSeries = series.getTotalLength ? series.getTotalLength() : 2000;
      const lenTrend = Math.hypot(x(2009) - x(1901), y(fit(2009)) - y(fit(1901)));
      series.setAttribute('stroke-dasharray', `${lenSeries} ${lenSeries}`);
      trend.setAttribute('stroke-dasharray', `${lenTrend} ${lenTrend}`);
      drawLines = (p) => {
        const a = Math.min(1, p / 0.7);
        const b = Math.max(0, (p - 0.55) / 0.45);
        series.setAttribute('stroke-dashoffset', (lenSeries * (1 - a)).toFixed(1));
        trend.setAttribute('stroke-dashoffset', (lenTrend * (1 - b)).toFixed(1));
        proj.setAttribute('opacity', b.toFixed(3));
        notes.setAttribute('opacity', b.toFixed(3));
      };
      drawLines(1);
    });

    whenSeen(stripesEl, {
      reset: () => paint(0),
      play: () => tween(1800, paint, { easing: (t) => t }),
      finish: () => paint(1),
    });
    whenSeen(chartEl, {
      reset: () => drawLines(0),
      play: () => tween(2200, drawLines, { easing: easeInOut }),
      finish: () => drawLines(1),
    });
  }

  /* ======================================================================
     Les espèces : haltères qui se réordonnent + fiche d'espèce
     ====================================================================== */
  function explorer() {
    const el = $('#dumbbell-plot');
    const note = $('#dumbbell-note');
    const select = $('#species-select');
    let mode = 'resampled';
    let selected = 'Bombus wurflenii';
    let layout = null;
    let positions = new Map();
    let stop = () => {};
    const values = (s, m = mode) => (m === 'resampled'
      ? { a: s.mean[0], b: s.mean[1], shift: s.shift }
      : { a: s.raw[0], b: s.raw[1], shift: s.raw[1] - s.raw[0] });

    F.dataTable($('#fig-dumbbell'), {
      caption: 'Altitude moyenne par espèce',
      columns: [
        { key: 'name', label: 'Espèce' },
        { key: 'n1', label: 'n 1889', num: true },
        { key: 'n2', label: 'n 2005-06', num: true },
        { key: 'm1', label: 'Moyenne 1889 (m)', num: true, format: (v) => fmt.num(v, 0) },
        { key: 'm2', label: 'Moyenne 2005-06 (m)', num: true, format: (v) => fmt.num(v, 0) },
        { key: 'shift', label: 'Écart à effort égal (m)', num: true, format: (v) => fmt.signed(v, 0) },
        { key: 'raw', label: 'Écart brut (m)', num: true, format: (v) => fmt.signed(v, 0) },
      ],
      rows: [...D.species].sort((a, b) => b.shift - a.shift).map((s) => ({
        name: s.name, n1: s.n[0], n2: s.n[1], m1: s.mean[0], m2: s.mean[1], shift: s.shift, raw: s.raw[1] - s.raw[0],
      })),
    });

    [...D.species].sort((a, b) => a.name.localeCompare(b.name)).forEach((s) => html('option', { value: s.name, text: s.name, selected: s.name === selected }, select));
    select.addEventListener('change', () => choose(select.value));
    document.querySelectorAll('#shift-mode button').forEach((btn) => btn.addEventListener('click', () => {
      if (btn.dataset.mode === mode) return;
      document.querySelectorAll('#shift-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      morph(btn.dataset.mode);
    }));

    const card = specimen();
    F.onResize(el, (W) => {
      layout = draw(W);
      positions = target(mode);
      place(positions);
    });
    choose(selected);
    whenSeen(el, {
      reset: () => place(target(mode), { climb: 0 }),
      play: () => tween(1100, (p) => place(target(mode), { climb: p }), { easing: easeInOut }),
      finish: () => place(target(mode)),
    });

    function choose(name) {
      selected = name;
      select.value = name;
      card(name);
      el.querySelectorAll('.row-hit').forEach((r) => r.classList.toggle('is-selected', r.dataset.name === name));
    }

    function target(m) {
      const order = [...D.species].sort((a, b) => values(b, m).shift - values(a, m).shift);
      const map = new Map();
      order.forEach((s, i) => {
        const v = values(s, m);
        map.set(s.name, { row: i, a: v.a, b: v.b, shift: v.shift });
      });
      return map;
    }

    function morph(next) {
      const from = new Map([...positions].map(([k, v]) => [k, { ...v }]));
      const to = target(next);
      mode = next;
      stop();
      stop = tween(900, (t) => {
        const mix = new Map();
        to.forEach((v, k) => {
          const f = from.get(k);
          mix.set(k, { row: f.row + (v.row - f.row) * t, a: f.a + (v.a - f.a) * t, b: f.b + (v.b - f.b) * t, shift: v.shift });
        });
        place(mix);
      }, { easing: easeInOut });
      positions = to;
      updateNote();
    }

    function draw(W) {
      const narrow = W < 560;
      const rowH = 34;
      const pad = { top: 10, right: narrow ? 62 : 80, bottom: 30, left: narrow ? 104 : 140 };
      const H = pad.top + D.species.length * rowH + pad.bottom;
      const root = mount(el, W, H, 'Altitude moyenne par espèce en 1889 et en 2005-06');
      root.classList.add('on-bg');
      const x = F.scaleLinear([1000, 2200], [pad.left, W - pad.right]);
      const grid = svg('g', { class: 'grid' }, root);
      const ticks = narrow ? [1000, 1400, 1800, 2200] : [1000, 1200, 1400, 1600, 1800, 2000, 2200];
      ticks.forEach((t) => svg('line', { x1: x(t), x2: x(t), y1: pad.top, y2: H - pad.bottom }, grid));
      axisX(root, x, ticks, H - 8, (v) => `${fmt.num(v, 0)}${narrow ? '' : ' m'}`);
      const rows = new Map();
      D.species.forEach((s) => {
        const g = svg('g', {}, root);
        const hit = svg('rect', { x: 0, y: -rowH / 2, width: W, height: rowH, rx: 3, class: 'row-hit', 'data-name': s.name }, g);
        svg('text', { x: pad.left - 14, y: 5, 'text-anchor': 'end', class: 'specimen-label', text: epithet(s.name) }, g);
        const stem = svg('line', { y1: 0, y2: 0, class: 'stem stem--neutral nohit' }, g);
        const d1 = svg('circle', { cy: 0, r: 5.5, class: 'f-p1889 ring nohit' }, g);
        const d2 = svg('circle', { cy: 0, r: 6.5, class: 'f-p2005 ring nohit' }, g);
        const val = svg('text', { x: W - pad.right + 12, y: 5, class: 'specimen-value' }, g);
        F.hover(hit, () => {
          const v = values(s);
          return {
            title: s.name,
            rows: [
              { value: meters(v.a), label: `1889 · ${s.n[0]} bourdons`, color: color('p1889'), kind: 'dot' },
              { value: meters(v.b), label: `2005-06 · ${s.n[1]} bourdons`, color: color('p2005'), kind: 'dot' },
              { value: signedMeters(v.shift), label: mode === 'resampled' ? 'à effort égal' : 'moyennes brutes' },
            ],
          };
        }, { label: `${s.name}, ${signedMeters(s.shift)}` });
        hit.addEventListener('click', () => choose(s.name));
        hit.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            choose(s.name);
          }
        });
        hit.classList.toggle('is-selected', s.name === selected);
        rows.set(s.name, { g, stem, d1, d2, val });
      });
      return { x, rows, rowH, pad };
    }

    function place(map, { climb = 1 } = {}) {
      if (!layout) return;
      const { x, rows, rowH, pad } = layout;
      map.forEach((v, name) => {
        const r = rows.get(name);
        const b = v.a + (v.b - v.a) * climb;
        r.g.setAttribute('transform', `translate(0 ${(pad.top + v.row * rowH + rowH / 2).toFixed(2)})`);
        r.stem.setAttribute('x1', x(v.a).toFixed(1));
        r.stem.setAttribute('x2', x(b).toFixed(1));
        r.d1.setAttribute('cx', x(v.a).toFixed(1));
        r.d2.setAttribute('cx', x(b).toFixed(1));
        r.val.textContent = signedMeters(v.shift);
      });
      updateNote();
    }

    function updateNote() {
      const t = D.species_test;
      note.textContent = mode === 'resampled'
        ? `Moyenne des 12 espèces ${signedMeters(t.mean)} (IC 95 % ${fmt.num(t.ci_low, 0)} à ${fmt.num(t.ci_high, 0)} m, ${pText(t.p_value)}). Tirages par tranche de 200 m, 1 000 fois. Source : Marshall et al. (2020) · Graphique : Youssef Mir`
        : `Moyennes brutes : ${signedMeters(mean(D.species.map((s) => s.raw[1] - s.raw[0])))} en moyenne, un chiffre gonflé par l'effort de 2005-06, plus fort en altitude. Source : Marshall et al. (2020) · Graphique : Youssef Mir`;
    }
  }

  function specimen() {
    const nameEl = $('#species-name');
    const textEl = $('#species-text');
    const plot = $('#species-plot');
    const R = D.records;
    let current = null;
    F.onResize(plot, () => current && strip(current));

    function strip(s) {
      const W = plot.clientWidth;
      if (!W) return;
      const idx = D.species.findIndex((sp) => sp.name === s.name);
      const pts = [];
      R.species.forEach((sp, i) => {
        if (sp === idx) pts.push({ p: R.period[i], e: R.elevation[i], t: R.t[i], plant: R.plants[R.plant[i]] });
      });
      const H = 150;
      const pad = { top: 12, right: 10, bottom: 26, left: 58 };
      const root = mount(plot, W, H, `Observations de ${s.name} selon l'altitude`);
      const x = F.scaleLinear([950, 2250], [pad.left, W - pad.right]);
      const rowY = [pad.top + 28, pad.top + 80];
      const grid = svg('g', { class: 'grid' }, root);
      [1000, 1500, 2000].forEach((t) => svg('line', { x1: x(t), x2: x(t), y1: pad.top, y2: H - pad.bottom }, grid));
      axisX(root, x, [1000, 1500, 2000], H - 6, (v) => `${fmt.num(v, 0)} m`);
      PERIOD_LABELS.forEach((label, p) => svg('text', { x: pad.left - 10, y: rowY[p] + 4, 'text-anchor': 'end', class: 'chart-label', text: label }, root));
      const rand = seeded(idx + 3);
      const placed = pts.map((d) => ({ ...d, cx: x(d.e), cy: rowY[d.p] + (rand() - 0.5) * 30 }));
      const dots = placed.map((d) => svg('circle', { cx: d.cx, cy: d.cy, r: 3.6, class: d.p ? 'f-p2005' : 'f-p1889', 'fill-opacity': 0.62 }, root));
      PERIOD_LABELS.forEach((_, p) => svg('line', { x1: x(s.raw[p]), x2: x(s.raw[p]), y1: rowY[p] - 21, y2: rowY[p] + 21, class: `stem ${p ? 's-p2005' : 's-p1889'}`, 'stroke-width': 3 }, root));
      // Les points tombent à leur place quand on change d'espèce
      dots.forEach((d, i) => animate(d, [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: Math.min(500, i * 4) }));
      const overlay = svg('rect', { x: pad.left, y: pad.top, width: W - pad.left - pad.right, height: H - pad.top - pad.bottom, class: 'overlay' }, root);
      overlay.addEventListener('pointermove', (evt) => {
        const rect = root.getBoundingClientRect();
        const mx = evt.clientX - rect.left;
        const my = evt.clientY - rect.top;
        let best = null;
        let bestD = 14 * 14;
        placed.forEach((d) => {
          const dd = (d.cx - mx) ** 2 + (d.cy - my) ** 2;
          if (dd < bestD) {
            bestD = dd;
            best = d;
          }
        });
        if (!best) return F.tip.hide();
        return F.tip.show(evt, {
          title: `${epithet(s.name)} · ${PERIOD_LABELS[best.p]}`,
          rows: [
            { value: meters(best.e), label: 'altitude du relevé', color: color(PERIOD_KEYS[best.p]), kind: 'dot' },
            { value: celsius(best.t, 1), label: 'en août, sur place' },
          ],
          note: `sur ${best.plant}`,
        });
      });
      overlay.addEventListener('pointerleave', () => F.tip.hide());
    }

    return function render(name) {
      const s = D.species.find((sp) => sp.name === name);
      current = s;
      nameEl.textContent = s.name;
      const sig = s.p_holm < 0.05;
      textEl.textContent = `Observé ${s.n[0]} fois en 1889 et ${s.n[1]} fois en 2005-2006, entre ${meters(s.range[1][0])} et ${meters(s.range[1][1])} aujourd'hui. À effort égal, son altitude moyenne passe de ${meters(s.mean[0])} à ${meters(s.mean[1])} (${signedMeters(s.shift)}). En août, il butine à ${celsius(s.t_mean[0], 1)} en 1889 et à ${celsius(s.t_mean[1], 1)} en 2005-2006, ${sig ? `une hausse nette (${pText(s.p_holm)})` : 'un écart non significatif'}.`;
      strip(s);
    };
  }

  /* ======================================================================
     La chaleur : chaque espèce part de « restée sur place » et rejoint sa position
     ====================================================================== */
  function niche() {
    const el = $('#niche-plot');
    const a = D.august;
    let place = () => {};
    F.dataTable($('#fig-niche'), {
      caption: 'Déplacement et écart de température par espèce',
      columns: [
        { key: 'name', label: 'Espèce' },
        { key: 'shift', label: 'Déplacement à effort égal (m)', num: true, format: (v) => fmt.signed(v, 0) },
        { key: 'dT', label: 'Écart en août (°C)', num: true, format: (v) => fmt.signed(v, 2) },
        { key: 'p', label: 'p (Holm)', num: true, format: (v) => (v < 0.001 ? '< 0,001' : fmt.num(v, 3)) },
      ],
      rows: [...D.species].sort((p, q) => q.dT - p.dT).map((s) => ({ name: s.name, shift: s.shift, dT: s.dT, p: s.p_holm })),
    });
    const offsets = {
      'Bombus terrestris complex': [-10, -9, 'end'],
      'Bombus humilis': [-10, 18, 'end'],
      'Bombus pascuorum': [4, 21, 'start'],
      'Bombus lapidarius': [-10, 18, 'end'],
      'Bombus mesomelas': [10, -9, 'start'],
      'Bombus ruderarius': [10, -9, 'start'],
    };

    F.onResize(el, (W) => {
      const narrow = W < 640;
      const H = narrow ? 360 : 460;
      const pad = { top: 18, right: narrow ? 16 : 34, bottom: 46, left: 50 };
      const root = mount(el, W, H, "Déplacement en altitude et écart de température d'août par espèce");
      const x = F.scaleLinear([-300, 450], [pad.left, W - pad.right]);
      const y = F.scaleLinear([-0.3, 3.3], [H - pad.bottom, pad.top]);
      axisY(root, y, [0, 1, 2, 3], pad.left - 8, (v) => `${fmt.signed(v, 0)}°`, [pad.left, W - pad.right]);
      axisX(root, x, narrow ? [-200, 0, 200, 400] : [-300, -200, -100, 0, 100, 200, 300, 400], H - 24, (v) => `${fmt.signed(v, 0)} m`);
      svg('text', { x: (pad.left + W - pad.right) / 2, y: H - 4, 'text-anchor': 'middle', class: 'chart-label', text: "déplacement de l'altitude moyenne, 1889 → 2005-06" }, root);
      svg('line', { x1: x(0), x2: x(0), y1: pad.top, y2: H - pad.bottom, class: 'zero-line' }, root);
      svg('line', { x1: pad.left, x2: W - pad.right, y1: y(0), y2: y(0), class: 'zero-line' }, root);
      const expected = (m) => a.warming + (a.lapse_per_100m * m) / 100;
      const mStart = Math.max(-300, ((3.25 - a.warming) / a.lapse_per_100m) * 100);
      svg('line', { x1: x(mStart), x2: x(450), y1: y(expected(mStart)), y2: y(expected(450)), class: 'guide', 'stroke-width': 1.5 }, root);
      svg('text', { x: x(-140) + 10, y: y(expected(-140)) - 8, class: 'callout-sub', text: "si seule l'altitude change" }, root);
      // Repère « restée sur place » et clé directe
      svg('circle', { cx: x(0), cy: y(a.warming), r: 4, class: 'f-p2005', opacity: 0.35 }, root);
      svg('text', { x: x(0) + 8, y: y(a.warming) - 8, class: 'callout-sub', text: `restée sur place : ${fmt.signed(a.warming, 1)} °C` }, root);
      const key = svg('g', { transform: `translate(${W - pad.right - (narrow ? 170 : 236)} ${pad.top + 10})` }, root);
      svg('circle', { cx: 6, cy: 0, r: 6, class: 'f-p2005 ring' }, key);
      svg('text', { x: 18, y: 4, class: 'callout-sub', text: narrow ? 'écart significatif' : 'écart significatif (Holm, 5 %)' }, key);
      svg('circle', { cx: 6, cy: 22, r: 5.5, class: 'hollow s-p2005' }, key);
      svg('text', { x: 18, y: 26, class: 'callout-sub', text: 'non significatif' }, key);

      const pts = D.species.map((s) => {
        const sig = s.p_holm < 0.05;
        const g = svg('g', { class: 'mark' }, root);
        const dot = svg('circle', { r: 6.5, class: sig ? 'f-p2005 ring' : 'hollow s-p2005' }, g);
        const hit = svg('circle', { r: 14, class: 'hit' }, g);
        F.hover(hit, () => ({
          title: s.name,
          rows: [
            { value: signedMeters(s.shift), label: 'déplacement à effort égal' },
            { value: signedCelsius(s.dT, 2), label: "écart de température d'août", color: color('p2005'), kind: 'dot' },
            { value: sig ? pText(s.p_holm) : 'non significatif', label: 'Kruskal-Wallis, Holm' },
          ],
        }), { label: `${s.name} : ${signedMeters(s.shift)}, ${signedCelsius(s.dT, 1)}` });
        const quiet = narrow && !['Bombus soroeensis', 'Bombus gerstaeckeri', 'Bombus wurflenii', 'Bombus sichelii'].includes(s.name);
        let label = null;
        if (!quiet) {
          const [dx, dy, anchor] = offsets[s.name] || [10, -9, 'start'];
          label = svg('text', { 'text-anchor': anchor, class: 'specimen-label', text: epithet(s.name) }, root);
          label.dataset.dx = dx;
          label.dataset.dy = dy;
        }
        return { s, dot, hit, label };
      });
      place = (p) => {
        pts.forEach(({ s, dot, hit, label }, i) => {
          const q = Math.min(1, Math.max(0, p * 1.25 - i * 0.02));
          const m = s.shift * q;
          const t = a.warming + (s.dT - a.warming) * q;
          const cx = x(m);
          const cy = y(t);
          [dot, hit].forEach((n) => {
            n.setAttribute('cx', cx.toFixed(1));
            n.setAttribute('cy', cy.toFixed(1));
          });
          if (label) {
            label.setAttribute('x', (cx + Number(label.dataset.dx)).toFixed(1));
            label.setAttribute('y', (cy + Number(label.dataset.dy)).toFixed(1));
            label.setAttribute('opacity', q > 0.9 ? 1 : 0);
          }
        });
      };
      place(1);
    });
    whenSeen(el, {
      reset: () => place(0),
      play: () => tween(1500, place, { easing: easeInOut }),
      finish: () => place(1),
    });
  }

  /* ======================================================================
     Diversité : les courbes de raréfaction se tracent
     ====================================================================== */
  function rarefaction() {
    const el = $('#rarefaction-plot');
    const comm = D.community;
    const curves = PERIOD_LABELS.map((p) => comm.rarefaction[p]);
    const eq = comm.equal;
    let drawCurves = () => {};
    F.dataTable($('#fig-rarefaction'), {
      caption: "Richesse attendue selon le nombre d'individus",
      columns: [
        { key: 'n', label: 'Individus', num: true },
        { key: 'a', label: 'Espèces attendues 1889', num: true, format: (v) => (v == null ? '–' : fmt.num(v, 2)) },
        { key: 'b', label: 'Espèces attendues 2005-06', num: true, format: (v) => (v == null ? '–' : fmt.num(v, 2)) },
      ],
      rows: [1, 5, 10, 20, 50, 100, 200, 286, 400, 568].map((n) => {
        const at = (cv) => {
          const j = cv.n.findIndex((v) => v >= n);
          if (j < 0) return null;
          if (cv.n[j] === n || j === 0) return cv.e[j];
          return cv.e[j - 1] + ((cv.e[j] - cv.e[j - 1]) * (n - cv.n[j - 1])) / (cv.n[j] - cv.n[j - 1]);
        };
        return { n, a: at(curves[0]), b: at(curves[1]) };
      }),
    });
    F.onResize(el, (W) => {
      const H = 320;
      const pad = { top: 14, right: 18, bottom: 42, left: 36 };
      const root = mount(el, W, H, 'Courbes de raréfaction 1889 et 2005-06');
      const x = F.scaleLinear([0, 580], [pad.left, W - pad.right]);
      const y = F.scaleLinear([0, 13], [H - pad.bottom, pad.top]);
      axisY(root, y, [0, 4, 8, 12], pad.left - 8, String, [pad.left, W - pad.right]);
      axisX(root, x, W < 420 ? [0, 200, 400] : [0, 100, 200, 300, 400, 500], H - 24, String);
      svg('text', { x: (pad.left + W - pad.right) / 2, y: H - 4, 'text-anchor': 'middle', class: 'chart-label', text: 'individus tirés au hasard' }, root);
      const nEq = eq['1889'].n;
      svg('line', { x1: x(nEq), x2: x(nEq), y1: pad.top, y2: H - pad.bottom, class: 'guide' }, root);
      const bands = curves.map((cv, p) => svg('polygon', {
        points: cv.n.map((n, i) => `${x(n).toFixed(1)},${y(cv.hi[i]).toFixed(1)}`)
          .concat([...cv.n].reverse().map((n, k) => `${x(n).toFixed(1)},${y(cv.lo[cv.n.length - 1 - k]).toFixed(1)}`)).join(' '),
        class: `ci-band f-${PERIOD_KEYS[p]}`,
      }, root));
      const lines = curves.map((cv, p) => svg('polyline', { points: cv.n.map((n, i) => `${x(n).toFixed(1)},${y(cv.e[i]).toFixed(1)}`).join(' '), class: `line s-${PERIOD_KEYS[p]}` }, root));
      const ends = curves.map((cv, p) => svg('circle', { cx: x(cv.n[cv.n.length - 1]), cy: y(cv.e[cv.e.length - 1]), r: 5, class: `f-${PERIOD_KEYS[p]} ring` }, root));
      const notes = svg('g', {}, root);
      svg('text', { x: x(568) - 4, y: y(12) - 12, 'text-anchor': 'end', class: 'callout-sub', text: '2005-06 : 568 bourdons' }, notes);
      svg('text', { x: x(286) - 6, y: y(12) - 12, 'text-anchor': 'end', class: 'callout-sub', text: '1889 : 286' }, notes);
      svg('text', { x: x(nEq) + 8, y: y(4), class: 'callout', text: `${fmt.num(eq['2005-06'].expected, 1)} espèces contre ${eq['1889'].observed}` }, notes);
      svg('text', { x: x(nEq) + 8, y: y(4) + 16, class: 'callout-sub', text: `à effectif égal (${nEq} individus)` }, notes);
      const lens = lines.map((l) => (l.getTotalLength ? l.getTotalLength() : 1000));
      lines.forEach((l, i) => l.setAttribute('stroke-dasharray', `${lens[i]} ${lens[i]}`));
      drawCurves = (p) => {
        lines.forEach((l, i) => l.setAttribute('stroke-dashoffset', (lens[i] * (1 - p)).toFixed(1)));
        bands.forEach((b) => b.setAttribute('opacity', p.toFixed(3)));
        [...ends, notes].forEach((n) => n.setAttribute('opacity', p > 0.95 ? 1 : 0));
      };
      drawCurves(1);
      const cross = svg('line', { y1: pad.top, y2: H - pad.bottom, class: 'crosshair', visibility: 'hidden' }, root);
      const overlay = svg('rect', { x: pad.left, y: pad.top, width: W - pad.left - pad.right, height: H - pad.top - pad.bottom, class: 'overlay' }, root);
      overlay.addEventListener('pointermove', (evt) => {
        const rect = root.getBoundingClientRect();
        const n = Math.max(1, Math.round(x.invert(evt.clientX - rect.left)));
        cross.setAttribute('x1', x(n));
        cross.setAttribute('x2', x(n));
        cross.setAttribute('visibility', 'visible');
        const rows = curves.map((cv, p) => {
          const j = cv.n.findIndex((v) => v >= n);
          return j < 0 ? null : { value: `${fmt.num(cv.e[j], 1)} espèces`, label: PERIOD_LABELS[p], color: color(PERIOD_KEYS[p]) };
        }).filter(Boolean);
        F.tip.show(evt, { title: `${n} individus`, rows });
      });
      overlay.addEventListener('pointerleave', () => {
        cross.setAttribute('visibility', 'hidden');
        F.tip.hide();
      });
    });
    whenSeen(el, {
      reset: () => drawCurves(0),
      play: () => tween(1600, drawCurves, { easing: easeInOut }),
      finish: () => drawCurves(1),
    });
  }

  /* ======================================================================
     Détails (repliés) : occupation du sol, effort, plantes
     ====================================================================== */
  const LAND = [
    { key: 'Forêt', cls: 'f-forest' },
    { key: 'Prairie', cls: 'f-grass' },
    { key: 'Autre', cls: 'f-rock', label: 'roche, neige' },
  ];

  function details() {
    const box = $('#more');
    let ready = false;
    box.addEventListener('toggle', () => {
      if (box.open && !ready) {
        ready = true;
        landUse();
        effort();
        plants();
      }
    });
  }

  function landUse() {
    const host = $('#landuse-plot');
    $('#landuse-note').textContent = `Part des cellules de 1 km² (reconstitution HILDA). Test du χ² entre 1910 et 2010 : ${D.land_use.map((z) => `${z.label.split(' ·')[0].toLowerCase()} ${pText(z.p)}`).join(', ')}. Graphique : Youssef Mir`;
    D.land_use.forEach((zone) => {
      const panel = html('div', {}, host);
      html('p', { class: 'landuse__title', text: zone.label.replace(' · ', ', ') }, panel);
      const plot = html('div', { class: 'fig__plot' }, panel);
      F.onResize(plot, (W) => {
        const H = 230;
        const pad = { top: 10, right: 40, bottom: 26, left: 40 };
        const root = mount(plot, W, H, `Occupation du sol, ${zone.label}`);
        const x = F.scaleBand(zone.decades, [pad.left, W - pad.right], { paddingInner: 0.18, paddingOuter: 0.05 });
        const bw = Math.min(24, x.bandwidth);
        const y = F.scaleLinear([0, 1], [H - pad.bottom, pad.top]);
        zone.decades.forEach((decade, i) => {
          const cx = x(decade) + x.bandwidth / 2;
          let acc = 0;
          const g = svg('g', { class: 'mark' }, root);
          const nonZero = LAND.filter((l) => zone.shares[l.key][i] > 0);
          LAND.forEach((l) => {
            const share = zone.shares[l.key][i];
            if (share <= 0) return;
            const y0 = y(acc);
            const y1 = y(acc + share);
            acc += share;
            const top = l === nonZero[nonZero.length - 1];
            svg('path', { d: roundedBar(cx - bw / 2, y1 + (top ? 0 : 2), bw, Math.max(0, y0 - y1 - (top ? 0 : 2)), top ? 4 : 0, 'top'), class: l.cls }, g);
          });
          const hit = svg('rect', { x: x(decade), y: pad.top, width: x.bandwidth, height: H - pad.top - pad.bottom, class: 'hit' }, g);
          F.hover(hit, () => ({
            title: `${zone.label.split(' ·')[0]}, ${decade}`,
            rows: LAND.map((l) => ({ value: pct(zone.shares[l.key][i]), label: l.label || l.key.toLowerCase(), color: color(l.cls.slice(2)), kind: 'box' })),
          }), { label: `${decade} : ${LAND.map((l) => `${l.key} ${pct(zone.shares[l.key][i])}`).join(', ')}` });
        });
        [[0, 'start'], [zone.decades.length - 1, 'end']].forEach(([i, side]) => {
          let acc = 0;
          const cx = x(zone.decades[i]) + x.bandwidth / 2;
          LAND.forEach((l) => {
            const share = zone.shares[l.key][i];
            const mid = acc + share / 2;
            acc += share;
            if (share < 0.06) return;
            svg('text', {
              x: side === 'start' ? cx - bw / 2 - 5 : cx + bw / 2 + 5, y: y(mid) + 4, 'text-anchor': side === 'start' ? 'end' : 'start',
              class: 'chart-label', text: pct(share),
            }, root);
          });
        });
        axisX(root, (d) => x(d) + x.bandwidth / 2, [1910, 1960, 2010], H - 6, String);
      });
    });
    F.legend($('#fig-landuse'), LAND.map((l) => ({ label: l.label ? `autre (${l.label})` : l.key.toLowerCase(), color: color(l.cls.slice(2)) })));
  }

  function effort() {
    const el = $('#effort-plot');
    const bands = [...D.community.effort].reverse();
    F.onResize(el, (W) => {
      const rowH = 44;
      const pad = { top: 26, right: 44, bottom: 8, left: 104 };
      const H = pad.top + bands.length * rowH + pad.bottom;
      const root = mount(el, W, H, 'Nombre de bourdons observés par tranche de 200 m');
      const x = F.scaleLinear([0, 240], [pad.left, W - pad.right]);
      svg('text', { x: pad.left, y: 14, class: 'chart-label', text: '1889 en bleu, 2005-06 en ambre' }, root);
      bands.forEach((b, i) => {
        const top = pad.top + i * rowH;
        svg('text', { x: pad.left - 10, y: top + rowH / 2 + 4, 'text-anchor': 'end', class: 'chart-label', text: `${b.band} m` }, root);
        [0, 1].forEach((p) => {
          const v = b.individuals[p];
          const by = top + 8 + p * 15;
          const g = svg('g', { class: 'mark' }, root);
          svg('path', { d: roundedBar(pad.left, by, Math.max(2, x(v) - pad.left), 13, 4, 'right'), class: p ? 'f-p2005' : 'f-p1889' }, g);
          svg('text', { x: x(v) + 6, y: by + 10.5, class: 'chart-label', text: String(v) }, root);
          const hit = svg('rect', { x: pad.left, y: by - 1, width: W - pad.left - pad.right, height: 15, class: 'hit' }, g);
          F.hover(hit, () => ({ title: `${b.band} m · ${PERIOD_LABELS[p]}`, rows: [{ value: `${v} bourdons`, color: color(PERIOD_KEYS[p]), kind: 'box' }, { value: `${b.species[p]} espèces` }] }), { label: `${b.band} m, ${PERIOD_LABELS[p]} : ${v} bourdons` });
        });
      });
      svg('line', { x1: pad.left, x2: pad.left, y1: pad.top, y2: H - pad.bottom, class: 'baseline' }, root);
    });
  }

  function plants() {
    const top = D.plants.top;
    const seg = $('#plant-select');
    const profileEl = $('#profile-plot');
    const visitorsEl = $('#visitors-plot');
    let current = top[1];
    top.forEach((plant) => {
      const btn = html('button', { type: 'button', 'aria-pressed': String(plant === current), text: plant.name }, seg);
      btn.style.fontStyle = 'italic';
      btn.addEventListener('click', () => {
        current = plant;
        seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        render();
      });
    });
    F.onResize(profileEl, () => drawProfile());
    F.onResize(visitorsEl, () => drawVisitors());

    function render() {
      drawProfile();
      drawVisitors();
    }

    function mirrored(el, rows, { label, valueFormat, rowLabel, max, rowH = 34, italic = false, title }) {
      const W = el.clientWidth;
      if (!W) return;
      const narrow = W < 460;
      const pad = { top: 26, right: 12, bottom: 10, left: narrow ? 104 : 128 };
      const H = pad.top + rows.length * rowH + pad.bottom;
      const root = mount(el, W, H, title);
      const mid = pad.left + (W - pad.left - pad.right) / 2;
      const half = (W - pad.left - pad.right) / 2 - 34;
      const s = (v) => (v / max) * half;
      svg('text', { x: mid - 8, y: 14, 'text-anchor': 'end', class: 'chart-label', text: '← 1889' }, root);
      svg('text', { x: mid + 8, y: 14, class: 'chart-label', text: '2005-06 →' }, root);
      rows.forEach((r, i) => {
        const cy = pad.top + i * rowH + rowH / 2;
        svg('text', { x: pad.left - 10, y: cy + 4, 'text-anchor': 'end', class: italic ? 'specimen-label' : 'chart-label', text: rowLabel(r) }, root);
        [0, 1].forEach((p) => {
          const v = r.values[p];
          const w = s(v);
          const g = svg('g', { class: 'mark' }, root);
          if (v > 0) {
            const bar = svg('path', { d: roundedBar(p ? mid + 1 : mid - 1 - w, cy - 9, Math.max(w, 2), 18, 4, p ? 'right' : 'left'), class: p ? 'f-p2005' : 'f-p1889', style: `transform-box: fill-box; transform-origin: ${p ? 'left' : 'right'} center` }, g);
            animate(bar, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 600, delay: i * 40 });
          }
          svg('text', { x: p ? mid + w + 6 : mid - w - 6, y: cy + 4, 'text-anchor': p ? 'start' : 'end', class: 'chart-label', text: v > 0 ? valueFormat(v) : '' }, root);
          const hit = svg('rect', { x: p ? mid : pad.left, y: cy - rowH / 2, width: p ? W - pad.right - mid : mid - pad.left, height: rowH, class: 'hit' }, g);
          F.hover(hit, () => ({ title: `${rowLabel(r)} · ${PERIOD_LABELS[p]}`, rows: [{ value: valueFormat(v), label, color: color(PERIOD_KEYS[p]), kind: 'box' }] }), { label: `${rowLabel(r)}, ${PERIOD_LABELS[p]} : ${valueFormat(v)}` });
        });
      });
      svg('line', { x1: mid, x2: mid, y1: pad.top - 4, y2: H - pad.bottom, class: 'baseline' }, root);
    }

    function drawProfile() {
      const totals = [0, 1].map((p) => current.visits[p].reduce((a, b) => a + b, 0));
      const rows = current.bands.map((b, i) => ({ band: b, values: [0, 1].map((p) => current.visits[p][i] / totals[p]) })).reverse();
      $('#profile-title').textContent = `Où l'on butine ${current.name}, et qui la visite`;
      mirrored(profileEl, rows, {
        label: 'des visites de la période', valueFormat: (v) => pct(v), rowLabel: (r) => `${fmt.num(r.band, 0)}-${fmt.num(r.band + 200, 0)} m`,
        max: 1, title: `Profil de visite de ${current.name} selon l'altitude`,
      });
    }

    function drawVisitors() {
      const rows = [...current.visitors].sort((a, b) => b.n[0] + b.n[1] - (a.n[0] + a.n[1])).map((v) => ({ species: v.species, values: v.n }));
      const max = Math.max(...rows.flatMap((r) => r.values));
      $('#visitors-sub').textContent = `À gauche, part des visites par tranche d'altitude ; à droite, visites par espèce de bourdon (indice de Jaccard entre les deux listes : ${fmt.num(current.jaccard, 2)}). Graphique : Youssef Mir`;
      mirrored(visitorsEl, rows, { label: 'visites', valueFormat: (v) => String(v), rowLabel: (r) => r.species.replace(/^B\. /, ''), max, rowH: 28, italic: true, title: `Espèces de bourdons visitant ${current.name}` });
    }

    render();
  }

  /* ---------- Navigation : section active ---------- */
  function scrollSpy() {
    const links = [...document.querySelectorAll('.sitenav a')];
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const sections = [...document.querySelectorAll('main section[id]')];
    const visible = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => visible.set(e.target.id, e.isIntersecting));
      const active = sections.filter((s) => visible.get(s.id) && byId.has(s.id)).pop();
      links.forEach((link) => {
        if (active && link === byId.get(active.id)) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
  }

  fillNumbers();
  contours();
  hero();
  stage();
  warming();
  explorer();
  niche();
  rarefaction();
  details();
  scrollSpy();
})();
