/* ==========================================================================
   Bourdons des Pyrénées — graphiques interactifs (SVG/canvas, sans dépendance)
   Données : window.SITE_DATA (docs/data.js, généré par scripts/build_site_data.py)
   Utilitaires : window.Frame (frame.js)
   ========================================================================== */
(function () {
  'use strict';

  const D = window.SITE_DATA;
  const F = window.Frame;
  const { fmt, svg, html } = F;

  const PERIOD_LABELS = ['1889', '2005-06'];
  const PERIOD_KEYS = ['p1889', 'p2005'];
  const NNBSP = ' ';

  /* ---------- Petits utilitaires ---------- */

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const meters = (x) => `${fmt.num(x, 0)}${NNBSP}m`;
  const signedMeters = (x) => `${fmt.signed(x, 0)}${NNBSP}m`;
  const celsius = (x, d = 1) => `${fmt.num(x, d)}${NNBSP}°C`;
  const signedCelsius = (x, d = 1) => `${fmt.signed(x, d)}${NNBSP}°C`;
  const pct = (x) => `${fmt.num(x * 100, 0)}${NNBSP}%`;
  const color = (token) => F.cssVar(`--${token}`);
  const pText = (p) => (p < 0.001 ? 'p < 0,001' : `p = ${fmt.num(p, 3)}`);

  function mount(container, width, height, label) {
    container.replaceChildren();
    const attrs = { width, height, viewBox: `0 0 ${width} ${height}` };
    if (label) Object.assign(attrs, { role: 'img', 'aria-label': label });
    return svg('svg', attrs, container);
  }

  function roundedBar(x, y, w, h, r, side) {
    // Rectangle à extrémité de données arrondie (side : 'top' | 'right' | 'left'), base carrée
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    if (side === 'right') {
      return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
    }
    if (side === 'left') {
      return `M${x + w},${y}H${x + rr}Q${x},${y} ${x},${y + rr}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w}Z`;
    }
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  }

  function axisX(root, scale, ticks, y, format, { grid = null, cls = 'axis' } = {}) {
    const g = svg('g', { class: cls }, root);
    for (const t of ticks) {
      const x = scale(t);
      if (grid) svg('line', { x1: x, x2: x, y1: grid[0], y2: grid[1], class: 'gridline' }, svg('g', { class: 'grid' }, root));
      svg('text', { x, y, 'text-anchor': 'middle', text: format(t) }, g);
    }
    return g;
  }

  function axisY(root, scale, ticks, x, format, { grid = null, anchor = 'end' } = {}) {
    const g = svg('g', { class: 'axis' }, root);
    const gridG = grid ? svg('g', { class: 'grid' }, root) : null;
    for (const t of ticks) {
      const y = scale(t);
      if (gridG) svg('line', { x1: grid[0], x2: grid[1], y1: y, y2: y }, gridG);
      svg('text', { x, y: y + 4, 'text-anchor': anchor, text: format(t) }, g);
    }
    return g;
  }

  /* Interpolation de couleurs dans l'espace OKLab (rampe divergente des rayures) */
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
  function divergingScale(tokens) {
    const stops = tokens.map((t) => rgbToOklab(hexToRgb(color(t))));
    return (u) => {
      // u ∈ [0, 1] ; 0.5 = milieu neutre
      const v = Math.min(1, Math.max(0, u)) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(v));
      const t = v - i;
      return oklabToHex(stops[i].map((c, k) => c + (stops[i + 1][k] - c) * t));
    };
  }

  /* Nombres « vivants » du texte, lus dans les données pour rester cohérents */
  function fillNumbers() {
    const set = (key, value) => document.querySelectorAll(`[data-k="${key}"]`).forEach((n) => {
      n.textContent = value;
    });
    const unitKpi = (key, value, unit) => document.querySelectorAll(`[data-k="${key}"]`).forEach((n) => {
      n.replaceChildren(document.createTextNode(value));
      html('span', { class: 'kpi__unit', text: unit }, n);
    });
    const c = D.climate;
    set('warming', celsius(c.warming, 1));
    set('isotherm', `${fmt.num(Math.round(c.isotherm_shift / 10) * 10, 0)}${NNBSP}m`);
    set('bees', meters(D.species_test.mean));
    unitKpi('warming-kpi', fmt.signed(c.warming, 1), '°C');
    unitKpi('isotherm-kpi', fmt.signed(Math.round(c.isotherm_shift / 10) * 10, 0), 'm');
    unitKpi('bees-kpi', fmt.signed(D.species_test.mean, 0), 'm');
    unitKpi('plants-kpi', fmt.signed(D.plants.test.mean, 0), 'm');
    set('slope', `${fmt.signed(c.trend.slope_decade, 2)}${NNBSP}°C par décennie`);
    set('aug-warming', signedCelsius(D.august.warming, 1));
  }

  /* ======================================================================
     Panorama d'ouverture : profil de montagne + montée des 12 espèces
     ====================================================================== */

  // Crêtes schématiques : [position 0-1, altitude en m]. Sommets nommés = altitudes réelles.
  const PEAKS = [
    { name: 'Taillon', x: 0.17, elev: 3144 },
    { name: 'Marboré', x: 0.46, elev: 3248 },
    { name: 'Vignemale', x: 0.8, elev: 3298 },
  ];
  const FAR_RIDGE = [
    [0, 2380], [0.05, 2610], [0.1, 2540], [0.14, 2900], [0.17, 3144], [0.21, 2930], [0.26, 2760],
    [0.31, 2940], [0.35, 2810], [0.4, 3020], [0.46, 3248], [0.5, 3090], [0.54, 3160], [0.59, 2880],
    [0.64, 2720], [0.69, 2950], [0.74, 3080], [0.8, 3298], [0.85, 3150], [0.9, 2860], [0.95, 2640],
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
        pts.push([x0 + (x1 - x0) * t, Math.min(Math.max(e0, e1) - 15, e0 + (e1 - e0) * t + noise)]);
        if (k === 0) pts[pts.length - 1][1] = e0;
      }
    }
    pts.push(control[control.length - 1]);
    return pts;
  }

  function heroChart() {
    const el = document.getElementById('hero-plot');
    const species = [...D.species].sort((a, b) => a.mean[0] - b.mean[0]);
    const base = mean(species.map((s) => s.mean[0]));
    const beesShift = D.species_test.mean;
    const isoShift = D.climate.isotherm_shift;
    const labelledWide = new Set(['Bombus wurflenii', 'Bombus lapidarius', 'Bombus gerstaeckeri', 'Bombus soroeensis']);
    const labelledNarrow = new Set(['Bombus wurflenii', 'Bombus gerstaeckeri', 'Bombus soroeensis']);
    let animated = false;

    F.onResize(el, (width) => draw(width));

    function draw(W) {
      const narrow = W < 600;
      const H = Math.round(Math.max(380, Math.min(640, W * 0.86)));
      const pad = { top: 22, right: narrow ? 104 : 176, bottom: 14, left: narrow ? 46 : 58 };
      const labelled = narrow ? labelledNarrow : labelledWide;
      const root = mount(el, W, H, 'Altitude moyenne des 12 espèces en 1889 et 2005-06, et montée des isothermes');
      const y = F.scaleLinear([880, 3420], [H - pad.bottom, pad.top]);
      const sx = (u) => u * W;

      // Relief : crêtes lointaine (avec neige), intermédiaire et proche, fondues sur les bords
      const defs = svg('defs', {}, root);
      const fade = (id, x2, y2, stops) => {
        const grad = svg('linearGradient', { id: `${id}-g`, x1: 0, y1: 0, x2, y2 }, defs);
        stops.forEach(([offset, opacity]) => svg('stop', { offset, 'stop-color': '#fff', 'stop-opacity': opacity }, grad));
        const mask = svg('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
        svg('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${id}-g)` }, mask);
      };
      fade('fade-x', 1, 0, [[0, 0], [0.07, 1], [0.93, 1], [1, 0]]);
      fade('fade-y', 0, 1, [[0, 1], [0.82, 1], [1, 0]]);
      const relief = svg('g', { mask: 'url(#fade-y)' }, svg('g', { mask: 'url(#fade-x)' }, root));
      // Limite des neiges irrégulière autour de 2 900 m
      const snowRand = seeded(5);
      const snow = [];
      for (let u = 0; u <= 1.0001; u += 0.025) snow.push(`${sx(u).toFixed(1)},${y(2900 + (snowRand() - 0.5) * 120).toFixed(1)}`);
      const clip = svg('clipPath', { id: 'snowline' }, defs);
      svg('polygon', { points: `0,0 ${snow.join(' ')} ${W},0` }, clip);
      const toPath = (pts) => `M0,${H}` + pts.map(([u, e]) => `L${sx(u).toFixed(1)},${y(e).toFixed(1)}`).join('') + `L${W},${H}Z`;
      const far = ridgePoints(FAR_RIDGE, 70, 7);
      svg('path', { d: toPath(far), class: 'ridge--far' }, relief);
      svg('path', { d: toPath(far), class: 'ridge--snow', 'clip-path': 'url(#snowline)' }, relief);
      svg('polyline', { points: far.map(([u, e]) => `${sx(u).toFixed(1)},${y(e).toFixed(1)}`).join(' '), class: 'ridge-line' }, relief);
      svg('path', { d: toPath(ridgePoints(MID_RIDGE, 60, 11)), class: 'ridge--mid' }, relief);
      svg('path', { d: toPath(ridgePoints(NEAR_RIDGE, 45, 23)), class: 'ridge--near' }, relief);

      // Sommets nommés
      for (const p of PEAKS) {
        const px = sx(p.x);
        const py = y(p.elev);
        if (narrow && p.name === 'Taillon') continue;
        svg('line', { x1: px, x2: px, y1: py - 4, y2: py - 12, class: 'guide' }, root);
        svg('text', { x: px, y: py - 16, 'text-anchor': 'middle', class: 'peak-label', text: narrow ? `${fmt.num(p.elev, 0)} m` : `${p.name} ${fmt.num(p.elev, 0)} m` }, root);
      }

      // Grille d'altitude
      const grid = svg('g', { class: 'grid' }, root);
      for (const e of [1000, 1500, 2000, 2500, 3000]) {
        svg('line', { x1: pad.left, x2: W - pad.right + 8, y1: y(e), y2: y(e) }, grid);
        svg('text', { x: pad.left - 8, y: y(e) + 4, 'text-anchor': 'end', class: 'elev-label', text: `${fmt.num(e, 0)} m` }, root);
      }

      // Colonnes d'espèces (triées par altitude de 1889)
      const band = F.scaleBand(species.map((s) => s.name), [pad.left + 6, W - pad.right - 12], { paddingInner: 0.4, paddingOuter: 0.35 });
      const marks = svg('g', {}, root);
      const climbers = [];
      species.forEach((s) => {
        const cx = band(s.name) + band.bandwidth / 2;
        const y0 = y(s.mean[0]);
        const y1 = y(s.mean[1]);
        const g = svg('g', { class: 'mark' }, marks);
        const len = Math.abs(y1 - y0);
        const stem = svg('line', { x1: cx, x2: cx, y1: y0, y2: y1, class: 'stem s-p2005' }, g);
        svg('circle', { cx, cy: y0, r: 5, class: 'f-p1889 ring' }, g);
        const dot = svg('circle', { cx, cy: y1, r: 6.5, class: 'f-p2005 ring climb' }, g);
        climbers.push({ stem, dot, len, dy: y0 - y1 });

        if (labelled.has(s.name)) {
          const right = s.name !== 'Bombus gerstaeckeri';
          const lx = cx + (right ? 11 : -11);
          const anchor = right ? 'start' : 'end';
          const ly = s.shift < 0 ? y1 + 16 : y1 - 2;
          svg('text', { x: lx, y: ly, 'text-anchor': anchor, class: 'species-label', text: s.short }, root);
          svg('text', { x: lx, y: ly + 14, 'text-anchor': anchor, class: 'callout-sub', text: signedMeters(s.shift) }, root);
        }

        const hit = svg('rect', { x: cx - band.step / 2, y: pad.top, width: band.step, height: H - pad.top - pad.bottom, class: 'hit' }, g);
        F.hover(hit, () => ({
          title: s.name,
          rows: [
            { value: meters(s.mean[0]), label: '1889', color: color('p1889'), kind: 'dot' },
            { value: meters(s.mean[1]), label: '2005-06', color: color('p2005'), kind: 'dot' },
            { value: `${signedMeters(s.shift)} ± ${fmt.num(s.shift_sd, 0)}`, label: 'déplacement corrigé' },
          ],
          note: `${s.n[0]} + ${s.n[1]} individus observés`,
        }), { label: `${s.name} : ${meters(s.mean[0])} en 1889, ${meters(s.mean[1])} en 2005-06` });
      });

      // Comparaison climat / bourdons (panneau de droite)
      const xa = narrow ? W - 74 : W - pad.right + 40;
      const xb = narrow ? W - 28 : xa + 52;
      const yBase = y(base);
      svg('line', { x1: xa - 14, x2: xb + 12, y1: yBase, y2: yBase, class: 'guide' }, root);
      svg('text', { x: xa - 14, y: yBase + 16, class: 'callout-sub', text: narrow ? '1889' : 'moyenne 1889' }, root);
      const yIso = y(base + isoShift);
      const climate = svg('line', { x1: xa, x2: xa, y1: yBase, y2: yIso + 7, class: 'arrow-climate' }, root);
      const head = svg('path', { d: `M${xa - 5},${yIso + 8}L${xa},${yIso - 1}L${xa + 5},${yIso + 8}Z`, class: 'arrowhead-climate' }, root);
      const yBees = y(base + beesShift);
      const bees = svg('line', { x1: xb, x2: xb, y1: yBase - 3, y2: yBees + 3, class: 'arrow-bees' }, root);
      const isoText = `+${fmt.num(Math.round(isoShift / 10) * 10, 0)} m`;
      const beesText = `+${fmt.num(beesShift, 0)} m`;
      if (narrow) {
        // Étiquettes empilées au-dessus de chaque flèche pour tenir dans la largeur d'un téléphone
        svg('text', { x: xa, y: yIso - 26, 'text-anchor': 'middle', class: 'callout', text: isoText }, root);
        svg('text', { x: xa, y: yIso - 12, 'text-anchor': 'middle', class: 'callout-sub', text: 'climat' }, root);
        svg('text', { x: xb, y: yBees - 24, 'text-anchor': 'middle', class: 'callout', text: beesText }, root);
        svg('text', { x: xb, y: yBees - 10, 'text-anchor': 'middle', class: 'callout-sub', text: 'bourdons' }, root);
      } else {
        svg('text', { x: xa - 6, y: yIso - 30, class: 'callout', text: isoText }, root);
        svg('text', { x: xa - 6, y: yIso - 14, class: 'callout-sub', text: 'isothermes (climat)' }, root);
        svg('text', { x: xb + 10, y: yBees - 2, class: 'callout', text: beesText }, root);
        svg('text', { x: xb + 10, y: yBees + 13, class: 'callout-sub', text: 'bourdons' }, root);
      }

      // Animation d'ouverture (une fois) : les points 2005-06 partent de leur position de 1889
      if (!animated && !F.reducedMotion) {
        animated = true;
        climbers.forEach(({ stem, dot, len, dy }, i) => {
          stem.style.strokeDasharray = `${len} ${len}`;
          stem.style.strokeDashoffset = `${len}`;
          stem.style.transition = `stroke-dashoffset 1100ms cubic-bezier(0.22, 0.8, 0.24, 1) ${120 + i * 45}ms`;
          dot.style.transform = `translateY(${dy}px)`;
          dot.style.transitionDelay = `${120 + i * 45}ms`;
        });
        const lenIso = Math.abs(yBase - yIso);
        climate.style.strokeDasharray = `${lenIso} ${lenIso}`;
        climate.style.strokeDashoffset = `${lenIso}`;
        climate.style.transition = 'stroke-dashoffset 1200ms ease-out 300ms';
        head.style.opacity = '0.35';
        head.style.transition = 'opacity 400ms ease 1300ms';
        const lenBees = Math.abs(yBase - yBees);
        bees.style.strokeDasharray = `${lenBees} ${lenBees}`;
        bees.style.strokeDashoffset = `${lenBees}`;
        bees.style.transition = 'stroke-dashoffset 900ms ease-out 700ms';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          climbers.forEach(({ stem, dot }) => {
            stem.style.strokeDashoffset = '0';
            dot.style.transform = 'translateY(0)';
          });
          climate.style.strokeDashoffset = '0';
          bees.style.strokeDashoffset = '0';
          head.style.opacity = '1';
        }));
      }
    }
  }

  /* Courbes de niveau génératives derrière le panorama (texture « carte IGN ») */
  function contours() {
    const canvas = document.querySelector('.hero__contours');
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
      const lo = Math.min(...field);
      const hi = Math.max(...field);
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
     1. Climat : rayures + série annuelle + tendance + projection
     ====================================================================== */
  function climateChart() {
    const el = document.getElementById('climate-plot');
    const c = D.climate;
    const anomalies = c.t.map((t) => t - c.baseline);
    const maxAbs = Math.max(...anomalies.map(Math.abs));
    let current = null;
    const figure = document.getElementById('fig-climate');

    F.dataTable(figure, {
      caption: 'Température annuelle moyenne par année',
      columns: [
        { key: 'year', label: 'Année' },
        { key: 't', label: 'Température (°C)', num: true, format: (v) => fmt.num(v, 2) },
        { key: 'a', label: 'Écart à 1901-1930 (°C)', num: true, format: (v) => fmt.signed(v, 2) },
      ],
      rows: c.years.map((year, i) => ({ year, t: c.t[i], a: anomalies[i] })),
    });

    F.onResize(el, (W) => draw(W));
    F.onTheme(() => draw(el.clientWidth));

    function draw(W) {
      if (!W) return;
      const narrow = W < 640;
      const stripeH = narrow ? 44 : 64;
      const plotH = narrow ? 240 : 300;
      const pad = { top: 8, right: narrow ? 14 : 24, bottom: 30, left: 40 };
      const H = pad.top + stripeH + 18 + plotH + pad.bottom;
      const root = mount(el, W, H, 'Rayures et courbe de la température annuelle moyenne, 1901-2009, avec tendance et projection 2050');
      const x = F.scaleLinear([1900.5, 2052], [pad.left, W - pad.right]);
      const yTop = pad.top + stripeH + 18;
      const yDom = [2, 7.5];
      const y = F.scaleLinear(yDom, [yTop + plotH, yTop]);
      const ramp = divergingScale(['div-cold', 'div-cool', 'div-mid', 'div-warm', 'div-hot']);

      // Rayures
      const stripes = svg('g', {}, root);
      c.years.forEach((year, i) => {
        svg('rect', {
          x: x(year - 0.5), y: pad.top, width: Math.max(1, x(year + 0.5) - x(year - 0.5) + 0.4), height: stripeH,
          fill: ramp(0.5 + anomalies[i] / (2 * maxAbs)),
        }, stripes);
      });

      // Axes et grille
      axisY(root, y, [2, 3, 4, 5, 6, 7], pad.left - 8, (v) => `${fmt.num(v, 0)}°`, { grid: [pad.left, W - pad.right] });
      axisX(root, x, narrow ? [1920, 1960, 2000, 2050] : [1910, 1930, 1950, 1970, 1990, 2010, 2030, 2050], H - 8, (v) => String(v));
      svg('line', { x1: pad.left, x2: W - pad.right, y1: yTop + plotH, y2: yTop + plotH, class: 'baseline' }, root);

      // Tendance (pleine sur les données, pointillée en projection) + projection 2050
      const t = c.trend;
      const fit = (yr) => t.intercept + t.slope_year * yr;
      svg('line', { x1: x(1901), x2: x(2009), y1: y(fit(1901)), y2: y(fit(2009)), class: 'line line--trend' }, root);
      svg('line', { x1: x(2009), x2: x(2050), y1: y(fit(2009)), y2: y(fit(2050)), class: 'line line--trend guide--dash' }, root);
      const pr = c.projection;
      svg('line', { x1: x(2050), x2: x(2050), y1: y(pr.low), y2: y(pr.high), class: 'line line--trend' }, root);
      for (const v of [pr.low, pr.high]) svg('line', { x1: x(2050) - 5, x2: x(2050) + 5, y1: y(v), y2: y(v), class: 'line line--trend' }, root);
      svg('circle', { cx: x(2050), cy: y(pr.value), r: 5, fill: color('accent'), class: 'ring' }, root);
      svg('text', { x: x(2050) - 10, y: y(pr.high) - 18, 'text-anchor': 'end', class: 'chart-label chart-label--strong', text: `2050 : ${celsius(pr.value, 1)}` }, root);
      svg('text', { x: x(2050) - 10, y: y(pr.high) - 4, 'text-anchor': 'end', class: 'chart-label', text: `IP 95 % : ${fmt.num(pr.low, 1)}–${fmt.num(pr.high, 1)} °C` }, root);

      // Série annuelle
      const pts = c.years.map((yr, i) => `${x(yr).toFixed(1)},${y(c.t[i]).toFixed(1)}`).join(' ');
      svg('polyline', { points: pts, class: 'line line--ink' }, root);
      svg('text', narrow
        ? { x: x(1990), y: y(2.35), 'text-anchor': 'middle', class: 'chart-label chart-label--ink', text: `Tendance : ${fmt.signed(t.slope_decade, 2)} °C par décennie` }
        : {
          x: x(1903), y: y(7.1), class: 'chart-label chart-label--ink',
          text: `Tendance 1901-2009 : ${fmt.signed(t.slope_decade, 2)} °C par décennie (IC 95 % ${fmt.num(t.ci[0], 2)}–${fmt.num(t.ci[1], 2)})`,
        }, root);

      // Survol : réticule sur l'année la plus proche (souris, toucher, clavier)
      const cross = svg('line', { y1: pad.top, y2: yTop + plotH, class: 'crosshair', visibility: 'hidden' }, root);
      const dot = svg('circle', { r: 4.5, class: 'hover-dot', visibility: 'hidden' }, root);
      const overlay = svg('rect', {
        x: pad.left, y: pad.top, width: x(2009.5) - pad.left, height: yTop + plotH - pad.top, class: 'overlay', tabindex: 0,
        'aria-label': 'Explorer les années avec les flèches gauche et droite',
      }, root);
      const show = (i, evt) => {
        current = i;
        const yr = c.years[i];
        cross.setAttribute('x1', x(yr));
        cross.setAttribute('x2', x(yr));
        dot.setAttribute('cx', x(yr));
        dot.setAttribute('cy', y(c.t[i]));
        cross.setAttribute('visibility', 'visible');
        dot.setAttribute('visibility', 'visible');
        F.tip.show(evt || overlay, {
          title: String(yr),
          rows: [
            { value: celsius(c.t[i], 2), label: 'moyenne annuelle', color: color('ink-2') },
            { value: signedCelsius(anomalies[i], 2), label: 'écart à 1901-1930', color: ramp(0.5 + anomalies[i] / (2 * maxAbs)), kind: 'box' },
          ],
        });
      };
      const hide = () => {
        cross.setAttribute('visibility', 'hidden');
        dot.setAttribute('visibility', 'hidden');
        F.tip.hide();
      };
      overlay.addEventListener('pointermove', (evt) => {
        const rect = overlay.ownerSVGElement.getBoundingClientRect();
        const yr = Math.round(x.invert(evt.clientX - rect.left));
        show(Math.min(c.years.length - 1, Math.max(0, yr - c.years[0])), evt);
      });
      overlay.addEventListener('pointerleave', hide);
      overlay.addEventListener('blur', hide);
      overlay.addEventListener('focus', () => show(current ?? c.years.length - 1));
      overlay.addEventListener('keydown', (evt) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evt.key)) return;
        evt.preventDefault();
        const last = c.years.length - 1;
        let i = current ?? last;
        if (evt.key === 'ArrowLeft') i = Math.max(0, i - 1);
        if (evt.key === 'ArrowRight') i = Math.min(last, i + 1);
        if (evt.key === 'Home') i = 0;
        if (evt.key === 'End') i = last;
        show(i);
      });
    }
  }

  /* ======================================================================
     2. Occupation du sol : 3 petits multiples (barres empilées à 100 %)
     ====================================================================== */
  const LAND = [
    { key: 'Forêt', cls: 'f-forest', token: 'forest' },
    { key: 'Prairie', cls: 'f-grass', token: 'grass' },
    { key: 'Autre', cls: 'f-rock', token: 'rock', label: 'Autre (roche, neige)' },
  ];

  function landUseCharts() {
    const host = document.getElementById('landuse-plot');
    const figure = document.getElementById('fig-landuse');
    F.legend(document.getElementById('landuse-legend'), LAND.map((l) => ({ label: l.label || l.key, color: color(l.token) })));
    document.getElementById('landuse-note').textContent =
      `Test du χ² entre 1910 et 2010 : ${D.land_use.map((z) => `${z.label.split(' ·')[0].toLowerCase()} χ² = ${fmt.num(z.chi2, 1)}, ${pText(z.p)}`).join(' ; ')} (effectifs faibles en zone montagnarde).`;
    const panels = D.land_use.map((zone) => {
      const panel = html('div', { class: 'landuse__panel' }, host);
      html('p', { class: 'landuse__title', text: zone.label.replace(' · ', ' · ') }, panel);
      html('p', { class: 'landuse__stat', text: `${zone.n_cells} cellules de 1 km²` }, panel);
      const plot = html('div', { class: 'fig__plot' }, panel);
      return { zone, plot };
    });
    F.dataTable(figure, {
      caption: 'Part de chaque occupation du sol par zone et décennie',
      columns: [
        { key: 'zone', label: 'Zone' },
        { key: 'decade', label: 'Décennie' },
        ...LAND.map((l) => ({ key: l.key, label: `${l.key} (%)`, num: true, format: (v) => fmt.num(v * 100, 0) })),
      ],
      rows: D.land_use.flatMap((z) => z.decades.map((decade, i) => ({
        zone: z.label.split(' ·')[0], decade, ...Object.fromEntries(LAND.map((l) => [l.key, z.shares[l.key][i]])),
      }))),
    });

    for (const { zone, plot } of panels) {
      F.onResize(plot, (W) => drawPanel(zone, plot, W));
    }

    function drawPanel(zone, plot, W) {
      const H = 230;
      const pad = { top: 8, right: 40, bottom: 26, left: 40 };
      const root = mount(plot, W, H, `Occupation du sol, ${zone.label}`);
      const x = F.scaleBand(zone.decades, [pad.left, W - pad.right], { paddingInner: 0.18, paddingOuter: 0.05 });
      const bw = Math.min(24, x.bandwidth);
      const y = F.scaleLinear([0, 1], [H - pad.bottom, pad.top]);
      const gap = 2;
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
          const h = Math.max(0, y0 - y1 - (top ? 0 : gap));
          svg('path', { d: roundedBar(cx - bw / 2, y1 + (top ? 0 : gap), bw, h, top ? 4 : 0, 'top'), class: l.cls }, g);
        });
        const hit = svg('rect', { x: x(decade), y: pad.top, width: x.bandwidth, height: H - pad.top - pad.bottom, class: 'hit' }, g);
        F.hover(hit, () => ({
          title: `${zone.label.split(' ·')[0]} · ${decade}`,
          rows: LAND.map((l) => ({ value: pct(zone.shares[l.key][i]), label: l.key, color: color(l.token), kind: 'box' })),
        }), { label: `${decade} : ${LAND.map((l) => `${l.key} ${pct(zone.shares[l.key][i])}`).join(', ')}` });
      });
      // Étiquettes directes : 1910 à gauche, 2010 à droite
      const first = 0;
      const last = zone.decades.length - 1;
      for (const [i, side] of [[first, 'left'], [last, 'right']]) {
        let acc = 0;
        const cx = x(zone.decades[i]) + x.bandwidth / 2;
        LAND.forEach((l) => {
          const share = zone.shares[l.key][i];
          const mid = acc + share / 2;
          acc += share;
          if (share < 0.06) return;
          svg('text', {
            x: side === 'left' ? cx - bw / 2 - 5 : cx + bw / 2 + 5, y: y(mid) + 4,
            'text-anchor': side === 'left' ? 'end' : 'start', class: 'chart-label chart-label--ink', text: pct(share),
          }, root);
        });
      }
      axisX(root, (d) => x(d) + x.bandwidth / 2, [1910, 1960, 2010], H - 6, (v) => String(v));
    }
  }

  /* ======================================================================
     3. Altitudes : haltères par espèce + fiche espèce
     ====================================================================== */
  function altitudes() {
    const el = document.getElementById('dumbbell-plot');
    const note = document.getElementById('dumbbell-note');
    const select = document.getElementById('species-select');
    const figure = document.getElementById('fig-dumbbell');
    let mode = 'resampled';
    let selected = 'Bombus wurflenii';
    F.legend(document.getElementById('dumbbell-legend'), [
      { label: '1889', color: color('p1889'), kind: 'dot' },
      { label: '2005-06', color: color('p2005'), kind: 'dot' },
    ]);
    const values = (s) => (mode === 'resampled'
      ? { a: s.mean[0], b: s.mean[1], shift: s.shift }
      : { a: s.raw[0], b: s.raw[1], shift: s.raw[1] - s.raw[0] });

    F.dataTable(figure, {
      caption: 'Altitude moyenne par espèce',
      columns: [
        { key: 'name', label: 'Espèce' },
        { key: 'n1', label: 'n 1889', num: true },
        { key: 'n2', label: 'n 2005-06', num: true },
        { key: 'm1', label: 'Moyenne 1889 (m)', num: true, format: (v) => fmt.num(v, 0) },
        { key: 'm2', label: 'Moyenne 2005-06 (m)', num: true, format: (v) => fmt.num(v, 0) },
        { key: 'shift', label: 'Déplacement corrigé (m)', num: true, format: (v) => fmt.signed(v, 0) },
        { key: 'raw', label: 'Déplacement brut (m)', num: true, format: (v) => fmt.signed(v, 0) },
      ],
      rows: [...D.species].sort((a, b) => b.shift - a.shift).map((s) => ({
        name: s.name, n1: s.n[0], n2: s.n[1], m1: s.mean[0], m2: s.mean[1], shift: s.shift, raw: s.raw[1] - s.raw[0],
      })),
    });

    document.querySelectorAll('#shift-mode button').forEach((btn) => btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      document.querySelectorAll('#shift-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      draw(el.clientWidth);
    }));

    [...D.species].sort((a, b) => a.name.localeCompare(b.name)).forEach((s) => {
      html('option', { value: s.name, text: s.name, selected: s.name === selected }, select);
    });
    select.addEventListener('change', () => choose(select.value));

    F.onResize(el, (W) => draw(W));
    const card = speciesCard();
    choose(selected);

    function choose(name) {
      selected = name;
      select.value = name;
      card(name);
      el.querySelectorAll('.row-hit').forEach((r) => r.classList.toggle('is-selected', r.dataset.name === name));
    }

    function draw(W) {
      if (!W) return;
      const narrow = W < 560;
      const rows = [...D.species].sort((a, b) => values(b).shift - values(a).shift);
      const rowH = 32;
      const pad = { top: 8, right: narrow ? 58 : 76, bottom: 30, left: narrow ? 128 : 168 };
      const H = pad.top + rows.length * rowH + pad.bottom;
      const root = mount(el, W, H, 'Altitude moyenne par espèce en 1889 et en 2005-06');
      const x = F.scaleLinear([1000, 2200], [pad.left, W - pad.right]);
      const ticks = narrow ? [1000, 1400, 1800, 2200] : [1000, 1200, 1400, 1600, 1800, 2000, 2200];
      const grid = svg('g', { class: 'grid' }, root);
      ticks.forEach((t) => svg('line', { x1: x(t), x2: x(t), y1: pad.top, y2: H - pad.bottom }, grid));
      axisX(root, x, ticks, H - 8, (v) => `${fmt.num(v, 0)}${narrow ? '' : ' m'}`);

      rows.forEach((s, i) => {
        const v = values(s);
        const cy = pad.top + i * rowH + rowH / 2;
        const g = svg('g', {}, root);
        const hit = svg('rect', { x: 0, y: cy - rowH / 2, width: W, height: rowH, rx: 6, class: 'row-hit', 'data-name': s.name }, g);
        svg('text', { x: pad.left - 14, y: cy + 4, 'text-anchor': 'end', class: 'species-label', text: narrow ? s.short.replace(' complex', ' cplx') : s.short }, g);
        svg('line', { x1: x(v.a), x2: x(v.b), y1: cy, y2: cy, class: 'stem stem--neutral nohit' }, g);
        svg('circle', { cx: x(v.a), cy, r: 5.5, class: 'f-p1889 ring nohit' }, g);
        svg('circle', { cx: x(v.b), cy, r: 6.5, class: 'f-p2005 ring nohit' }, g);
        svg('text', { x: W - pad.right + 10, y: cy + 4, class: 'chart-label chart-label--strong', text: signedMeters(v.shift) }, g);
        F.hover(hit, () => ({
          title: s.name,
          rows: [
            { value: meters(v.a), label: `1889 · ${s.n[0]} ind.`, color: color('p1889'), kind: 'dot' },
            { value: meters(v.b), label: `2005-06 · ${s.n[1]} ind.`, color: color('p2005'), kind: 'dot' },
            { value: signedMeters(v.shift), label: mode === 'resampled' ? 'déplacement corrigé' : 'déplacement brut' },
          ],
          note: 'Cliquer pour afficher la fiche',
        }), { label: `${s.name}, ${signedMeters(v.shift)}` });
        hit.addEventListener('click', () => choose(s.name));
        hit.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            choose(s.name);
          }
        });
        hit.classList.toggle('is-selected', s.name === selected);
      });

      const t = D.species_test;
      note.textContent = mode === 'resampled'
        ? `Moyenne des 12 espèces : ${signedMeters(t.mean)} (IC 95 % : ${fmt.num(t.ci_low, 0)} à ${fmt.num(t.ci_high, 0)} m ; t = ${fmt.num(t.t, 2)}, ${pText(t.p_value)}). Rééchantillonnage par tranches de 200 m, 1 000 tirages.`
        : `Moyennes brutes : ${signedMeters(mean(D.species.map((s) => s.raw[1] - s.raw[0])))} en moyenne. Ce chiffre surestime la montée, car l'effort de 2005-06 s'est concentré plus haut.`;
    }
  }

  function speciesCard() {
    const nameEl = document.getElementById('species-name');
    const stats = document.getElementById('species-stats');
    const plot = document.getElementById('species-plot');
    const R = D.records;
    let current = null;
    F.onResize(plot, () => current && drawStrip(current));

    function stat(label, value, small) {
      const div = html('div', {}, stats);
      html('dt', { text: label }, div);
      const dd = html('dd', { text: value }, div);
      if (small) html('small', { text: ` ${small}` }, dd);
    }

    function drawStrip(s) {
      const W = plot.clientWidth;
      if (!W) return;
      const idx = D.species.findIndex((sp) => sp.name === s.name);
      const pts = [];
      R.species.forEach((sp, i) => {
        if (sp === idx) pts.push({ p: R.period[i], e: R.elevation[i], t: R.t[i], plant: R.plants[R.plant[i]] });
      });
      const H = 150;
      const pad = { top: 14, right: 12, bottom: 26, left: 62 };
      const root = mount(plot, W, H, `Observations de ${s.name} par altitude`);
      const x = F.scaleLinear([950, 2250], [pad.left, W - pad.right]);
      const rowY = [pad.top + 28, pad.top + 82];
      const grid = svg('g', { class: 'grid' }, root);
      [1000, 1500, 2000].forEach((t) => svg('line', { x1: x(t), x2: x(t), y1: pad.top, y2: H - pad.bottom }, grid));
      axisX(root, x, [1000, 1500, 2000], H - 6, (v) => `${fmt.num(v, 0)} m`);
      PERIOD_LABELS.forEach((label, p) => svg('text', { x: pad.left - 10, y: rowY[p] + 4, 'text-anchor': 'end', class: 'chart-label chart-label--ink', text: label }, root));
      const rand = seeded(idx + 3);
      const placed = pts.map((d) => ({ ...d, cx: x(d.e), cy: rowY[d.p] + (rand() - 0.5) * 30 }));
      placed.forEach((d) => svg('circle', { cx: d.cx, cy: d.cy, r: 3.6, class: `${d.p ? 'f-p2005' : 'f-p1889'}`, 'fill-opacity': 0.6 }, root));
      PERIOD_LABELS.forEach((_, p) => {
        const m = s.raw[p];
        svg('line', { x1: x(m), x2: x(m), y1: rowY[p] - 20, y2: rowY[p] + 20, class: `stem ${p ? 's-p2005' : 's-p1889'}`, 'stroke-width': 3 }, root);
      });
      // Survol par point le plus proche (zone de détection ≥ 24 px)
      const overlay = svg('rect', { x: pad.left, y: pad.top, width: W - pad.left - pad.right, height: H - pad.top - pad.bottom, class: 'overlay' }, root);
      overlay.addEventListener('pointermove', (evt) => {
        const rect = root.getBoundingClientRect();
        const mx = evt.clientX - rect.left;
        const my = evt.clientY - rect.top;
        let best = null;
        let bestD = 14 * 14;
        for (const d of placed) {
          const dd = (d.cx - mx) ** 2 + (d.cy - my) ** 2;
          if (dd < bestD) {
            bestD = dd;
            best = d;
          }
        }
        if (!best) return F.tip.hide();
        return F.tip.show(evt, {
          title: `${s.short} · ${PERIOD_LABELS[best.p]}`,
          rows: [
            { value: meters(best.e), label: 'altitude du relevé', color: color(PERIOD_KEYS[best.p]), kind: 'dot' },
            { value: celsius(best.t, 1), label: "août, au point d'observation" },
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
      stats.replaceChildren();
      stat('Individus', `${s.n[0]} → ${s.n[1]}`, '(1889 → 2005-06)');
      stat('Déplacement corrigé', signedMeters(s.shift), `± ${fmt.num(s.shift_sd, 0)} m`);
      stat('Altitude moyenne', `${fmt.num(s.mean[0], 0)} → ${fmt.num(s.mean[1], 0)} m`);
      stat('Étendue observée', `${fmt.num(s.range[1][0], 0)}–${fmt.num(s.range[1][1], 0)} m`, `(1889 : ${fmt.num(s.range[0][0], 0)}–${fmt.num(s.range[0][1], 0)})`);
      stat('Août au point d\'observation', signedCelsius(s.dT, 1), `(${fmt.num(s.t_mean[0], 1)} → ${fmt.num(s.t_mean[1], 1)} °C)`);
      stat('Kruskal-Wallis (Holm)', s.p_holm < 0.05 ? pText(s.p_holm) : 'non significatif', s.p_holm < 0.05 ? '' : `(${pText(s.p_holm)})`);
      drawStrip(s);
    };
  }

  /* ======================================================================
     4. Températures : déplacement vs réchauffement subi
     ====================================================================== */
  function nicheChart() {
    const el = document.getElementById('niche-plot');
    const figure = document.getElementById('fig-niche');
    const a = D.august;
    F.legend(document.getElementById('niche-legend'), [
      { label: 'plus chaud qu\'en 1889 (Holm, 5 %)', color: color('p2005'), kind: 'dot' },
      { label: 'différence non significative', color: 'transparent', kind: 'dot' },
    ]);
    const hollowKey = document.querySelectorAll('#niche-legend .legend__key')[1];
    if (hollowKey) hollowKey.style.boxShadow = `inset 0 0 0 2px ${color('p2005')}`;
    F.dataTable(figure, {
      caption: 'Déplacement et écart de température par espèce',
      columns: [
        { key: 'name', label: 'Espèce' },
        { key: 'shift', label: 'Déplacement corrigé (m)', num: true, format: (v) => fmt.signed(v, 0) },
        { key: 'dT', label: 'Écart août (°C)', num: true, format: (v) => fmt.signed(v, 2) },
        { key: 'H', label: 'H de Kruskal-Wallis', num: true, format: (v) => fmt.num(v, 1) },
        { key: 'p', label: 'p (Holm)', num: true, format: (v) => (v < 0.001 ? '< 0,001' : fmt.num(v, 3)) },
      ],
      rows: [...D.species].sort((x, y) => y.dT - x.dT).map((s) => ({ name: s.name, shift: s.shift, dT: s.dT, H: s.H, p: s.p_holm })),
    });
    const offsets = {
      'Bombus terrestris complex': [-9, -8, 'end'],
      'Bombus humilis': [-9, 16, 'end'],
      'Bombus pascuorum': [4, 19, 'start'],
      'Bombus lapidarius': [-9, 16, 'end'],
      'Bombus mesomelas': [9, -8, 'start'],
      'Bombus ruderarius': [9, -8, 'start'],
    };
    F.onResize(el, (W) => draw(W));

    function draw(W) {
      const narrow = W < 600;
      const H = narrow ? 340 : 420;
      const pad = { top: 16, right: narrow ? 16 : 30, bottom: 44, left: 48 };
      const root = mount(el, W, H, 'Déplacement en altitude et écart de température d\'août par espèce');
      const x = F.scaleLinear([-300, 450], [pad.left, W - pad.right]);
      const y = F.scaleLinear([-0.3, 3.3], [H - pad.bottom, pad.top]);
      axisY(root, y, [0, 1, 2, 3], pad.left - 8, (v) => `${fmt.signed(v, 0)}°`, { grid: [pad.left, W - pad.right] });
      axisX(root, x, narrow ? [-200, 0, 200, 400] : [-300, -200, -100, 0, 100, 200, 300, 400], H - 22, (v) => fmt.signed(v, 0));
      svg('text', { x: (pad.left + W - pad.right) / 2, y: H - 4, 'text-anchor': 'middle', class: 'chart-label', text: 'Déplacement de l\'altitude moyenne, 1889 → 2005-06 (m)' }, root);
      svg('line', { x1: x(0), x2: x(0), y1: pad.top, y2: H - pad.bottom, class: 'zero-line' }, root);
      svg('line', { x1: pad.left, x2: W - pad.right, y1: y(0), y2: y(0), class: 'zero-line' }, root);
      // Droite attendue si seule l'altitude change
      const expected = (m) => a.warming + (a.lapse_per_100m * m) / 100;
      // Droite limitée au cadre : du point où elle sort par le haut jusqu'au bord droit
      const mStart = Math.max(-300, ((y.domain[1] - 0.05 - a.warming) / a.lapse_per_100m) * 100);
      svg('line', { x1: x(mStart), x2: x(450), y1: y(expected(mStart)), y2: y(expected(450)), class: 'guide', 'stroke-width': 1.5 }, root);
      const lx = -150;
      svg('text', { x: x(lx) + 10, y: y(expected(lx)) - 8, class: 'chart-label', text: 'attendu si seule l\'altitude change' }, root);
      // Points
      D.species.forEach((s) => {
        const cx = x(s.shift);
        const cy = y(s.dT);
        const sig = s.p_holm < 0.05;
        const g = svg('g', { class: 'mark' }, root);
        svg('circle', { cx, cy, r: 6.5, class: sig ? 'f-p2005 ring' : 'hollow s-p2005' }, g);
        const hit = svg('circle', { cx, cy, r: 14, class: 'hit' }, g);
        F.hover(hit, () => ({
          title: s.name,
          rows: [
            { value: signedMeters(s.shift), label: 'déplacement corrigé' },
            { value: signedCelsius(s.dT, 2), label: 'écart de température d\'août', color: color('p2005'), kind: 'dot' },
            { value: s.p_holm < 0.05 ? pText(s.p_holm) : 'non significatif', label: 'Kruskal-Wallis, Holm' },
          ],
        }), { label: `${s.name} : ${signedMeters(s.shift)}, ${signedCelsius(s.dT, 1)}` });
        const quiet = narrow && !['Bombus soroeensis', 'Bombus gerstaeckeri', 'Bombus wurflenii', 'Bombus sichelii'].includes(s.name);
        if (quiet) return;
        const [dx, dy, anchor] = offsets[s.name] || [9, -8, 'start'];
        svg('text', { x: cx + dx, y: cy + dy, 'text-anchor': anchor, class: 'species-label', text: s.short }, root);
      });
    }
  }

  /* ======================================================================
     5. Diversité : effort par tranche + courbes de raréfaction
     ====================================================================== */
  function diversity() {
    const comm = D.community;
    F.legend(document.getElementById('diversity-legend'), [
      { label: '1889 (MacLeod, 286 individus)', color: color('p1889') },
      { label: '2005-06 (Biesmeijer, 568 individus)', color: color('p2005') },
    ]);
    // Effort
    const effortEl = document.getElementById('effort-plot');
    const bands = [...comm.effort].reverse();
    F.dataTable(document.getElementById('fig-effort'), {
      caption: 'Individus et espèces par tranche d\'altitude',
      columns: [
        { key: 'band', label: 'Tranche' },
        { key: 'i1', label: 'Individus 1889', num: true },
        { key: 'i2', label: 'Individus 2005-06', num: true },
        { key: 's1', label: 'Espèces 1889', num: true },
        { key: 's2', label: 'Espèces 2005-06', num: true },
      ],
      rows: comm.effort.map((b) => ({ band: `${b.band.replace('-', '–')} m`, i1: b.individuals[0], i2: b.individuals[1], s1: b.species[0], s2: b.species[1] })),
    });
    F.onResize(effortEl, (W) => {
      const rowH = 44;
      const pad = { top: 6, right: 40, bottom: 8, left: 92 };
      const H = pad.top + bands.length * rowH + pad.bottom;
      const root = mount(effortEl, W, H, 'Nombre de bourdons observés par tranche de 200 m');
      const x = F.scaleLinear([0, 240], [pad.left, W - pad.right]);
      bands.forEach((b, i) => {
        const top = pad.top + i * rowH;
        svg('text', { x: pad.left - 10, y: top + rowH / 2 + 4, 'text-anchor': 'end', class: 'chart-label chart-label--ink', text: `${b.band.replace('-', '–')} m` }, root);
        [0, 1].forEach((p) => {
          const v = b.individuals[p];
          const by = top + 8 + p * 15;
          const g = svg('g', { class: 'mark' }, root);
          svg('path', { d: roundedBar(pad.left, by, Math.max(2, x(v) - pad.left), 13, 4, 'right'), class: p ? 'f-p2005' : 'f-p1889' }, g);
          svg('text', { x: x(v) + 6, y: by + 10.5, class: 'chart-label', text: String(v) }, root);
          const hit = svg('rect', { x: pad.left, y: by - 1, width: W - pad.left - pad.right, height: 15, class: 'hit' }, g);
          F.hover(hit, () => ({
            title: `${b.band.replace('-', '–')} m · ${PERIOD_LABELS[p]}`,
            rows: [
              { value: `${v} individus`, color: color(PERIOD_KEYS[p]), kind: 'box' },
              { value: `${b.species[p]} espèces` },
            ],
          }), { label: `${b.band} m, ${PERIOD_LABELS[p]} : ${v} individus` });
        });
      });
      svg('line', { x1: pad.left, x2: pad.left, y1: pad.top, y2: H - pad.bottom, class: 'baseline' }, root);
    });

    // Raréfaction
    const rareEl = document.getElementById('rarefaction-plot');
    const curves = PERIOD_LABELS.map((p) => comm.rarefaction[p]);
    const eq = comm.equal;
    const nEq = eq['1889'].n;
    F.dataTable(document.getElementById('fig-rarefaction'), {
      caption: 'Richesse attendue selon le nombre d\'individus',
      columns: [
        { key: 'n', label: 'Individus', num: true },
        { key: 'a', label: 'Espèces attendues 1889', num: true, format: (v) => (v == null ? '–' : fmt.num(v, 2)) },
        { key: 'b', label: 'Espèces attendues 2005-06', num: true, format: (v) => (v == null ? '–' : fmt.num(v, 2)) },
      ],
      rows: [1, 5, 10, 20, 50, 100, 200, 286, 400, 568].map((n) => {
        const at = (cv) => {
          const i = cv.n.indexOf(n);
          if (i >= 0) return cv.e[i];
          const j = cv.n.findIndex((v) => v > n);
          return j > 0 ? cv.e[j - 1] + ((cv.e[j] - cv.e[j - 1]) * (n - cv.n[j - 1])) / (cv.n[j] - cv.n[j - 1]) : null;
        };
        return { n, a: at(curves[0]), b: at(curves[1]) };
      }),
    });
    F.onResize(rareEl, (W) => {
      const H = 300;
      const pad = { top: 12, right: 18, bottom: 40, left: 36 };
      const root = mount(rareEl, W, H, 'Courbes de raréfaction 1889 et 2005-06');
      const x = F.scaleLinear([0, 580], [pad.left, W - pad.right]);
      const y = F.scaleLinear([0, 13], [H - pad.bottom, pad.top]);
      axisY(root, y, [0, 4, 8, 12], pad.left - 8, (v) => String(v), { grid: [pad.left, W - pad.right] });
      axisX(root, x, W < 420 ? [0, 200, 400] : [0, 100, 200, 300, 400, 500], H - 22, (v) => String(v));
      svg('text', { x: (pad.left + W - pad.right) / 2, y: H - 4, 'text-anchor': 'middle', class: 'chart-label', text: 'individus tirés au hasard' }, root);
      svg('line', { x1: x(nEq), x2: x(nEq), y1: pad.top, y2: H - pad.bottom, class: 'guide' }, root);
      svg('text', { x: x(nEq) + 6, y: y(3.2), class: 'chart-label chart-label--ink', text: `à effectif égal (${nEq})` }, root);
      svg('text', { x: x(nEq) + 6, y: y(3.2) + 15, class: 'chart-label', text: `${fmt.num(eq['2005-06'].expected, 1)} contre ${eq['1889'].observed} espèces` }, root);
      curves.forEach((cv, p) => {
        const cls = PERIOD_KEYS[p];
        const band = cv.n.map((n, i) => `${x(n).toFixed(1)},${y(cv.hi[i]).toFixed(1)}`).concat(
          [...cv.n].reverse().map((n, k) => `${x(n).toFixed(1)},${y(cv.lo[cv.n.length - 1 - k]).toFixed(1)}`),
        );
        svg('polygon', { points: band.join(' '), class: `ci-band f-${cls}` }, root);
      });
      curves.forEach((cv, p) => {
        const cls = PERIOD_KEYS[p];
        svg('polyline', { points: cv.n.map((n, i) => `${x(n).toFixed(1)},${y(cv.e[i]).toFixed(1)}`).join(' '), class: `line s-${cls}` }, root);
        const last = cv.n.length - 1;
        svg('circle', { cx: x(cv.n[last]), cy: y(cv.e[last]), r: 5, class: `f-${cls} ring` }, root);
      });
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
  }

  /* ======================================================================
     6. Fleurs : profil de visite (pyramide) + visiteurs
     ====================================================================== */
  function plants() {
    const top = D.plants.top;
    const seg = document.getElementById('plant-select');
    const profileEl = document.getElementById('profile-plot');
    const visitorsEl = document.getElementById('visitors-plot');
    let current = top[1];
    F.legend(document.getElementById('plants-legend'), [
      { label: '1889', color: color('p1889') },
      { label: '2005-06', color: color('p2005') },
    ]);
    top.forEach((plant) => {
      const btn = html('button', { type: 'button', 'aria-pressed': String(plant === current), text: plant.name }, seg);
      btn.style.fontStyle = 'italic';
      btn.addEventListener('click', () => {
        current = plant;
        seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        render();
      });
    });
    const tables = html('div', {}, document.getElementById('fig-visitors'));
    F.onResize(profileEl, () => drawProfile());
    F.onResize(visitorsEl, () => drawVisitors());

    function render() {
      drawProfile();
      drawVisitors();
      tables.replaceChildren();
      F.dataTable(tables, {
        caption: `Visites de ${current.name}`,
        columns: [
          { key: 'k', label: 'Tranche ou espèce' },
          { key: 'a', label: 'Visites 1889', num: true },
          { key: 'b', label: 'Visites 2005-06', num: true },
        ],
        rows: [
          ...current.bands.map((b, i) => ({ k: `${b}–${b + 200} m`, a: current.visits[0][i], b: current.visits[1][i] })),
          ...current.visitors.map((v) => ({ k: v.species, a: v.n[0], b: v.n[1] })),
        ],
      });
    }

    function mirrored(el, rows, { label, valueFormat, rowLabel, max, rowH = 34, italic = false, title }) {
      const W = el.clientWidth;
      if (!W) return;
      const narrow = W < 460;
      const pad = { top: 26, right: 12, bottom: 10, left: narrow ? 104 : 132 };
      const H = pad.top + rows.length * rowH + pad.bottom;
      const root = mount(el, W, H, title);
      const mid = pad.left + (W - pad.left - pad.right) / 2;
      const half = (W - pad.left - pad.right) / 2 - 34;
      const s = (v) => (v / max) * half;
      svg('text', { x: mid - 8, y: 14, 'text-anchor': 'end', class: 'chart-label chart-label--ink', text: '← 1889' }, root);
      svg('text', { x: mid + 8, y: 14, class: 'chart-label chart-label--ink', text: '2005-06 →' }, root);
      rows.forEach((r, i) => {
        const cy = pad.top + i * rowH + rowH / 2;
        svg('text', { x: pad.left - 10, y: cy + 4, 'text-anchor': 'end', class: italic ? 'species-label' : 'chart-label chart-label--ink', text: rowLabel(r) }, root);
        [0, 1].forEach((p) => {
          const v = r.values[p];
          const w = s(v);
          const g = svg('g', { class: 'mark' }, root);
          if (v > 0) {
            const xx = p ? mid + 1 : mid - 1 - w;
            svg('path', { d: roundedBar(xx, cy - 9, Math.max(w, 2), 18, 4, p ? 'right' : 'left'), class: p ? 'f-p2005' : 'f-p1889' }, g);
          }
          svg('text', {
            x: p ? mid + w + 6 : mid - w - 6, y: cy + 4, 'text-anchor': p ? 'start' : 'end',
            class: 'chart-label', text: v > 0 ? valueFormat(v, p) : '',
          }, root);
          const hit = svg('rect', { x: p ? mid : pad.left, y: cy - rowH / 2, width: p ? W - pad.right - mid : mid - pad.left, height: rowH, class: 'hit' }, g);
          F.hover(hit, () => ({
            title: `${rowLabel(r)} · ${PERIOD_LABELS[p]}`,
            rows: [{ value: valueFormat(v, p), label, color: color(PERIOD_KEYS[p]), kind: 'box' }],
          }), { label: `${rowLabel(r)}, ${PERIOD_LABELS[p]} : ${valueFormat(v, p)}` });
        });
      });
      svg('line', { x1: mid, x2: mid, y1: pad.top - 4, y2: H - pad.bottom, class: 'baseline' }, root);
    }

    function drawProfile() {
      const totals = [0, 1].map((p) => current.visits[p].reduce((a, b) => a + b, 0));
      const rows = current.bands.map((b, i) => ({ band: b, values: [0, 1].map((p) => current.visits[p][i] / totals[p]), counts: [0, 1].map((p) => current.visits[p][i]) })).reverse();
      document.getElementById('profile-title').textContent = `Où l'on butine ${current.name}`;
      mirrored(profileEl, rows, {
        label: 'des visites de la période', valueFormat: (v) => pct(v), rowLabel: (r) => `${fmt.num(r.band, 0)}–${fmt.num(r.band + 200, 0)} m`,
        max: 1, title: `Profil de visite de ${current.name} le long de l'altitude`,
      });
    }

    function drawVisitors() {
      const rows = [...current.visitors].sort((a, b) => (b.n[0] + b.n[1]) - (a.n[0] + a.n[1])).map((v) => ({ species: v.species, values: v.n }));
      const max = Math.max(...rows.flatMap((r) => r.values));
      document.getElementById('visitors-sub').textContent = `Visites par espèce · Jaccard ${fmt.num(current.jaccard, 2)} (${current.shared} espèces communes)`;
      mirrored(visitorsEl, rows, {
        label: 'visites', valueFormat: (v) => String(v), rowLabel: (r) => r.species, max, rowH: 28, italic: true,
        title: `Espèces de bourdons visitant ${current.name}`,
      });
    }

    render();
  }

  /* ---------- Navigation : section active ---------- */
  function scrollSpy() {
    const links = [...document.querySelectorAll('.sitenav a')];
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const sections = [...document.querySelectorAll('main section[id]')];
    const visible = new Map();
    // État recalculé à chaque changement : la section active est celle qui coupe la bande
    // centrale de l'écran (aucune pour l'ouverture), même si la mise en page bouge au chargement.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => visible.set(e.target.id, e.isIntersecting));
      const active = sections.filter((s) => visible.get(s.id)).pop();
      links.forEach((link) => {
        if (active && link === byId.get(active.id)) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
  }

  fillNumbers();
  contours();
  heroChart();
  climateChart();
  landUseCharts();
  altitudes();
  nicheChart();
  diversity();
  plants();
  scrollSpy();
})();
