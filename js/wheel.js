/**
 * wheel.js — SVG circular calendar wheel generator (v2)
 * Календарь русской природы
 *
 * viewBox: "50 50 700 700", center: (400, 400)
 * Весеннее равноденствие (Mar 20, doy 79) at TOP (-90°), months go clockwise.
 */

import { openSidebar } from './sidebar.js?v=6';

// ─── Constants ────────────────────────────────────────────────────────────────

const CX = 400;
const CY = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Ring radii: [innerR, outerR]
const RING = {
  season:    { r1: 0,   r2: 55  },
  subseason: { r1: 57,  r2: 130 },
  month:     { r1: 132, r2: 150 },
};

// Axes: extent of lines and label radius
const R_AXIS_LINE  = 158;
const R_AXIS_LABEL = 168;

// Label radii
const R_SEASON_LABEL   = 35;
const R_SUBSEASON_LABEL = 94;

// Days in each month (non-leap year)
const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Per-month solid colors (seasonal palette)
const MONTH_COLORS = [
  null,
  '#b07aa8',  // 1  Jan — красно-фиолетовый (red-violet)
  '#8e7cb8',  // 2  Feb — фиолетовый (violet)
  '#6e8cc8',  // 3  Mar — сине-фиолетовый (blue-violet)
  '#5a9ecf',  // 4  Apr — голубой (blue)
  '#4da89a',  // 5  May — сине-зелёный (blue-green)
  '#5aad5a',  // 6  Jun — зелёный (green)
  '#8ab84a',  // 7  Jul — жёлто-зелёный (yellow-green)
  '#c4b840',  // 8  Aug — жёлтый (yellow)
  '#d4a04a',  // 9  Sep — жёлто-оранжевый (yellow-orange)
  '#cf7f3a',  // 10 Oct — оранжевый (orange)
  '#c46050',  // 11 Nov — красно-оранжевый (red-orange)
  '#c45060',  // 12 Dec — красный (red)
];

const SEASON_FULL_NAMES = {
  winter: 'ЗИМА',
  spring: 'ВЕСНА',
  summer: 'ЛЕТО',
  autumn: 'ОСЕНЬ',
};

// Season midpoint angles — phenological seasons (not astronomical).
// Зима 27.XI–17.III (111д), Весна 18.III–10.VI (85д),
// Лето 11.VI–26.VIII (76д), Осень 27.VIII–26.XI (93д). Sum=365✓
const SEASON_MID_ANGLES = {
  spring: -51,   // ~29 апр (mid of Mar18–Jun10)
  summer:  29,   // ~19 июл (mid of Jun11–Aug26)
  autumn: 113,   // ~12 окт (mid of Aug27–Nov26)
  winter: 213,   // ~21 янв (mid of Nov27–Mar17)
};

// Phenological season boundary data
const SEASON_PHENOL = [
  { id: 'winter', startDoy: 331, days: 111, dateRange: '27.XI–17.III' },  // Nov 27
  { id: 'spring', startDoy:  77, days:  85, dateRange: '18.III–10.VI'  },  // Mar 18
  { id: 'summer', startDoy: 162, days:  77, dateRange: '11.VI–26.VIII' },  // Jun 11
  { id: 'autumn', startDoy: 239, days:  93, dateRange: '27.VIII–26.XI' },  // Aug 27
];

const R_GOD_CIRCLE = 12;  // radius of inner circle (halved)

// ─── Geometry helpers ──────────────────────────────────────────────────────────

function polarToXY(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r1, r2, startDeg, endDeg) {
  const p1 = polarToXY(cx, cy, r2, startDeg);
  const p2 = polarToXY(cx, cy, r2, endDeg);
  const p3 = polarToXY(cx, cy, r1, endDeg);
  const p4 = polarToXY(cx, cy, r1, startDeg);
  const large = (endDeg - startDeg > 180) ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${r2} ${r2} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${r1} ${r1} 0 ${large} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

// ─── Date/angle helpers ────────────────────────────────────────────────────────

function dayOfYear(month, day) {
  let doy = 0;
  for (let m = 1; m < month; m++) doy += DAYS_IN_MONTH[m];
  return doy + day;
}

/**
 * doy → SVG angle. Spring equinox (Mar 20, doy=79) = top (-90°).
 * Goes clockwise.
 */
function doyToAngle(doy) {
  return (doy - 79) / 365 * 360 - 90;
}

/**
 * Start angle for month (based on day-of-year for accurate proportions).
 */
function monthStartAngle(monthId) {
  return doyToAngle(dayOfYear(monthId, 1));
}

function monthMidAngle(monthId) {
  const doy = dayOfYear(monthId, 1) + DAYS_IN_MONTH[monthId] / 2;
  return doyToAngle(doy);
}

// ─── SVG element factories ─────────────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function svgText(content, attrs = {}) {
  const el = svgEl('text', attrs);
  el.textContent = content;
  return el;
}

// ─── Roman month numerals ────────────────────────────────────────────────────
const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
function monthToRoman(m) { return ROMAN[m]; }

// ─── SVG <defs> manager ──────────────────────────────────────────────────────

function ensureDefs(svgRoot) {
  let defs = svgRoot.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svgRoot.prepend(defs);
  }
  // Clear stale arc paths on rebuild
  defs.querySelectorAll('[id^="arc-"]').forEach(el => el.remove());
  return defs;
}

// ─── Curved-text helpers ─────────────────────────────────────────────────────

/**
 * Create a circular arc <path> in <defs> for use with <textPath>.
 * Auto-flips the arc direction for bottom-half text so it reads L→R.
 *
 * @param {Element} defs  - SVG <defs> element
 * @param {string}  id    - unique path id (prefixed with "arc-")
 * @param {number}  cx,cy - center
 * @param {number}  r     - radius
 * @param {number}  startDeg, endDeg - arc span in degrees (SVG coords, 0=right)
 * @returns {Element} the <path> element
 */
function createArcPath(defs, id, cx, cy, r, startDeg, endDeg) {
  // Normalise midAngle to 0..360
  let mid = ((startDeg + endDeg) / 2) % 360;
  if (mid < 0) mid += 360;

  // Bottom half: 90 < mid < 270 → reverse direction for upright text
  const flip = mid > 90 && mid < 270;

  let s, e, sweepFlag;
  if (flip) {
    s = polarToXY(cx, cy, r, endDeg);
    e = polarToXY(cx, cy, r, startDeg);
    sweepFlag = 0; // counter-clockwise
  } else {
    s = polarToXY(cx, cy, r, startDeg);
    e = polarToXY(cx, cy, r, endDeg);
    sweepFlag = 1; // clockwise
  }

  const span = Math.abs(endDeg - startDeg);
  const largeArc = span > 180 ? 1 : 0;

  const d = `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${e.x} ${e.y}`;
  const path = svgEl('path', { id, d });
  defs.appendChild(path);
  return path;
}

/**
 * Add curved text along an existing <path> defined in <defs>.
 */
function addCurvedText(g, text, pathId, attrs = {}) {
  const textEl = svgEl('text', attrs);
  const tp = document.createElementNS(SVG_NS, 'textPath');
  tp.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#' + pathId);
  tp.setAttribute('href', '#' + pathId);
  tp.setAttribute('startOffset', '50%');
  tp.setAttribute('text-anchor', 'middle');
  tp.textContent = text;
  textEl.appendChild(tp);
  g.appendChild(textEl);
  return textEl;
}

/**
 * Place text character-by-character along a circular arc.
 * Each character is individually rotated so its top faces outward.
 * Reading direction is explicitly controlled via readDir.
 *
 * @param {Element} g       - SVG group to append to
 * @param {string}  text    - text to render
 * @param {number}  cx,cy   - center
 * @param {number}  r       - radius
 * @param {number}  startDeg,endDeg - arc span (SVG degrees)
 * @param {string}  readDir - 'cw' (clockwise) or 'ccw' (counter-clockwise)
 * @param {object}  attrs   - SVG attributes for each <text> element
 */
function placeCharsAlongArc(g, text, cx, cy, r, startDeg, endDeg, _readDir, attrs = {}) {
  const chars = text.split('');
  const n = chars.length;
  if (n === 0) return;

  // Per-word orientation based on word center position
  let mid = ((startDeg + endDeg) / 2) % 360;
  if (mid < 0) mid += 360;
  // Bottom half (0°–180°) → inward + CCW (L→R in page view)
  // Top half (180°–360°) → outward + CW (L→R in page view)
  const isBottom = mid > 0 && mid < 180;
  const autoDir = isBottom ? 'ccw' : 'cw';

  const span = endDeg - startDeg;
  const padding = span * 0.08;
  const usableStart = startDeg + padding;
  const usableEnd   = endDeg   - padding;
  const usableSpan  = usableEnd - usableStart;

  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const angle = (autoDir === 'cw')
      ? usableStart + usableSpan * t
      : usableEnd   - usableSpan * t;

    const pos = polarToXY(cx, cy, r, angle);

    // Per-word rotation: all chars share same orientation (no boundary jumps)
    const rot = isBottom ? angle - 90 : angle + 90;

    const el = svgEl('text', {
      x: pos.x, y: pos.y,
      transform: `rotate(${rot}, ${pos.x}, ${pos.y})`,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      ...attrs,
    });
    el.textContent = chars[i];
    g.appendChild(el);
  }
}

// Reading direction for phenological seasons (matches reference layout)
const SEASON_READ_DIR = {
  spring: 'cw',   // top: reads L→R
  summer: 'ccw',  // right side: reads bottom→top
  autumn: 'ccw',  // bottom: reads L→R from outside
  winter: 'ccw',  // left side: reads top→bottom
};

// Keep reference to defs at module scope so all builders can access it
let _defs = null;

// ─── Ring 0: Season center ─────────────────────────────────────────────────────

function buildSeasonRing(g, calendar) {
  // 1. Four clickable season sectors (replace single background circle)
  for (const sp of SEASON_PHENOL) {
    const startAngle = doyToAngle(sp.startDoy);
    const endAngle   = doyToAngle(sp.startDoy + sp.days);
    g.appendChild(svgEl('path', {
      d: describeArc(CX, CY, 0, RING.season.r2, startAngle, endAngle),
      stroke: 'rgba(42,34,32,0.15)',
      'stroke-width': '0.8',
      class: 'season-arc',
      'data-season': sp.id,
      tabindex: '0',
      role: 'button',
      'aria-label': SEASON_FULL_NAMES[sp.id] || sp.id,
    }));
  }

  // 2. Season sector separator lines (from center to outer edge of subseason ring)
  for (const sp of SEASON_PHENOL) {
    const angle = doyToAngle(sp.startDoy);
    const lineEnd = polarToXY(CX, CY, RING.subseason.r2, angle);
    g.appendChild(svgEl('line', {
      x1: CX, y1: CY,
      x2: lineEnd.x, y2: lineEnd.y,
      class: 'season-separator',
      stroke: 'rgba(42,34,32,0.25)',
      'stroke-width': '0.7',
      'pointer-events': 'none',
    }));
  }

  // 3. Inner «ГОД» circle (covers separator lines in the center)
  g.appendChild(svgEl('circle', {
    cx: CX, cy: CY, r: R_GOD_CIRCLE,
    fill: '#f5f4f0',
    stroke: 'rgba(42,34,32,0.30)',
    'stroke-width': '0.9',
  }));

  // 5. For each season: name + duration + dates (all char-by-char)
  for (const sp of SEASON_PHENOL) {
    const name = SEASON_FULL_NAMES[sp.id] || sp.id;
    const startAngle = doyToAngle(sp.startDoy);
    const endAngle   = doyToAngle(sp.startDoy + sp.days);
    const readDir    = SEASON_READ_DIR[sp.id];

    // Season name — char-by-char with letter spacing
    placeCharsAlongArc(g, name, CX, CY, 35, startAngle, endAngle, readDir, {
      class: 'season-label',
      'font-size': '9',
      'font-weight': '600',
      'pointer-events': 'none',
    });

    // Date range — curved along arc, ABOVE name (r=37)
    const midAngle = (startAngle + endAngle) / 2;
    const dateSpan = 35;
    placeCharsAlongArc(g, sp.dateRange, CX, CY, 49,
      midAngle - dateSpan / 2, midAngle + dateSpan / 2, 'auto', {
        class: 'season-date-label',
        'font-size': '5',
        'pointer-events': 'none',
      });

    // Duration — curved along arc, BELOW name (r=21)
    const durText = sp.days + ' дн';
    const durSpan = 40;
    placeCharsAlongArc(g, durText, CX, CY, 21,
      midAngle - durSpan / 2, midAngle + durSpan / 2, 'auto', {
        class: 'season-duration-label',
        'font-size': '5',
        'pointer-events': 'none',
      });
  }
}

// ─── Helpers: blended hover color for subseason arcs ─────────────────────────

function daysInMonth(m) {
  return [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function blendSubseasonColor(ss) {
  const BG = [245, 244, 240]; // #f5f4f0
  const LIGHTEN = 0.62;       // 62% к фону → пастельный тон

  const segments = [];
  const dim = m => daysInMonth(m);

  if (!ss.wrapsYear) {
    if (ss.startMonth === ss.endMonth) {
      segments.push({ month: ss.startMonth, days: ss.endDay - ss.startDay + 1 });
    } else {
      segments.push({ month: ss.startMonth, days: dim(ss.startMonth) - ss.startDay + 1 });
      for (let m = ss.startMonth + 1; m < ss.endMonth; m++)
        segments.push({ month: m, days: dim(m) });
      segments.push({ month: ss.endMonth, days: ss.endDay });
    }
  } else {
    // wrapsYear: startMonth → Dec, затем Jan → endMonth
    segments.push({ month: ss.startMonth, days: dim(ss.startMonth) - ss.startDay + 1 });
    for (let m = ss.startMonth + 1; m <= 12; m++)
      segments.push({ month: m, days: dim(m) });
    for (let m = 1; m < ss.endMonth; m++)
      segments.push({ month: m, days: dim(m) });
    segments.push({ month: ss.endMonth, days: ss.endDay });
  }

  const total = segments.reduce((s, seg) => s + seg.days, 0);
  let r = 0, g = 0, b = 0;
  for (const seg of segments) {
    const [sr, sg, sb] = hexToRgb(MONTH_COLORS[seg.month]);
    r += sr * seg.days;
    g += sg * seg.days;
    b += sb * seg.days;
  }
  r = r / total; g = g / total; b = b / total;
  r = Math.round(r + (BG[0] - r) * LIGHTEN);
  g = Math.round(g + (BG[1] - g) * LIGHTEN);
  b = Math.round(b + (BG[2] - b) * LIGHTEN);
  return `rgb(${r},${g},${b})`;
}

// ─── Ring 1: Sub-season arcs ──────────────────────────────────────────────────

function buildSubseasonRing(g, calendar) {
  const { subseasons } = calendar;
  const MIN_LABEL_SPAN = 5; // degrees — lowered to show "Глубокая осень" (8 days ≈ 7.9°)

  for (const ss of subseasons) {
    let startDOY = dayOfYear(ss.startMonth, ss.startDay);
    let endDOY   = dayOfYear(ss.endMonth,   ss.endDay);
    if (ss.wrapsYear) endDOY += 365;

    const startAngle = doyToAngle(startDOY);
    const endAngle   = doyToAngle(endDOY);
    const span       = Math.abs(endAngle - startAngle);

    // Duration in days
    let dur = endDOY - startDOY + 1;
    if (dur <= 0) dur += 365;

    const path = svgEl('path', {
      d: describeArc(CX, CY, RING.subseason.r1, RING.subseason.r2, startAngle, endAngle),
      stroke: 'rgba(42,34,32,0.12)',
      'stroke-width': '0.8',
      class: 'subseason-arc',
      'data-subseason': ss.id,
      tabindex: '0',
      role: 'button',
      'aria-label': ss.name,
      cursor: 'pointer',
    });
    path.style.setProperty('--hover-fill', blendSubseasonColor(ss));
    g.appendChild(path);

    if (span >= MIN_LABEL_SPAN) {
      const midDOY   = (startDOY + endDOY) / 2;
      const midAngle = doyToAngle(midDOY);

      const fontSize = 8;
      const metaFontSize = 5;
      const showMeta = span >= 12;  // hide meta for very narrow sectors (e.g. Глубокая осень)

      // Radial text: flip 180° for left half so text reads outward
      let rotAngle = midAngle;
      const isLeftHalf = midAngle > 90 && midAngle <= 270;
      if (isLeftHalf) rotAngle += 180;

      // ── Subseason name (single line) + meta below ──
      const pos = polarToXY(CX, CY, R_SUBSEASON_LABEL, midAngle);
      const textEl = svgEl('text', {
        x: pos.x, y: pos.y,
        transform: `rotate(${rotAngle}, ${pos.x}, ${pos.y})`,
        class: 'subseason-label',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': 'Cormorant Garamond, Georgia, serif',
        'font-style': 'italic',
        'font-size': `${fontSize}`,
        'pointer-events': 'none',
      });

      // Name — shift up by half the meta line height to center the group vertically
      const metaLineH = fontSize * 1.1;
      const nameShift = showMeta ? -metaLineH / 2 : 0;
      const tspanName = svgEl('tspan', { x: pos.x, dy: `${nameShift}` });
      tspanName.textContent = ss.name;
      textEl.appendChild(tspanName);

      // Meta — date + duration on a new line below the name (skip for very narrow sectors)
      if (showMeta) {
        const metaStr = `${ss.startDay}.${monthToRoman(ss.startMonth)} — ${dur} дн.`;
        const tspanMeta = svgEl('tspan', {
          x: pos.x,
          dy: `${metaLineH}`,
          'font-size': `${metaFontSize}`,
          'font-style': 'normal',
          fill: '#888',
        });
        tspanMeta.textContent = metaStr;
        textEl.appendChild(tspanMeta);
      }

      g.appendChild(textEl);
    }
  }
}

// ─── Ring 2: Month arcs ───────────────────────────────────────────────────────

function buildMonthRing(g, calendar) {
  const { months } = calendar;

  for (const month of months) {
    const startAngle = monthStartAngle(month.id);
    // End angle = start of next month (or start+30 as fallback for Dec)
    const endAngle = (month.id < 12)
      ? monthStartAngle(month.id + 1)
      : doyToAngle(dayOfYear(12, 1) + 31);
    const midAngle  = monthMidAngle(month.id);
    const color     = MONTH_COLORS[month.id] || '#888888';

    const path = svgEl('path', {
      d: describeArc(CX, CY, RING.month.r1, RING.month.r2, startAngle, endAngle),
      fill: color,
      stroke: '#faf7f0',
      'stroke-width': '0.8',
      class: 'month-arc',
      'data-month': month.id,
      tabindex: '0',
      role: 'button',
      'aria-label': month.name,
      cursor: 'pointer',
    });
    // CSS-переменные для hover-эффектов (варианты Д и Е)
    const [mr, mg, mb] = hexToRgb(color);
    const LIGHTEN_MONTH = 0.58;
    const pr = Math.round(mr + (245 - mr) * LIGHTEN_MONTH);
    const pg = Math.round(mg + (244 - mg) * LIGHTEN_MONTH);
    const pb = Math.round(mb + (240 - mb) * LIGHTEN_MONTH);
    path.style.setProperty('--month-color', color);
    path.style.setProperty('--pastel-color', `rgb(${pr},${pg},${pb})`);
    g.appendChild(path);

    // Month name: character-by-character along arc (auto-orientation)
    const textR = (RING.month.r1 + RING.month.r2) / 2;
    placeCharsAlongArc(g, month.name.toUpperCase(), CX, CY, textR,
      startAngle, endAngle, 'auto', {
        class: 'month-label',
        'font-size': '8',
        fill: '#000',
        'font-weight': '600',
        'pointer-events': 'none',
      });
  }
}


// ─── Axes: equinoxes / solstices ──────────────────────────────────────────────

function buildAxes(g, calendar) {
  const axes = [
    { angle: -90, label: 'Весеннее равноденствие', anchor: 'start', dy: 0, rotate: -90 },
    { angle:   0, label: 'Летнее солнцестояние',   anchor: 'start', dx: 4  },
    { angle:  90, label: 'Осеннее равноденствие',  anchor: 'end',   dy: 0, rotate: -90 },
    { angle: 180, label: 'Зимнее солнцестояние',   anchor: 'end',   dx: -4 },
  ];

  const LINE_H = 9; // межстрочный интервал для двухстрочных надписей

  // Two crossing lines
  const pairs = [
    { a1: -90, a2: 90 },  // vertical
    { a1:   0, a2: 180 }, // horizontal
  ];
  for (const { a1, a2 } of pairs) {
    const p1 = polarToXY(CX, CY, R_AXIS_LINE, a1);
    const p2 = polarToXY(CX, CY, R_AXIS_LINE, a2);
    g.appendChild(svgEl('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      class: 'axis-line',
    }));
  }

  // Labels (two-line, left-aligned via <tspan>)
  for (const ax of axes) {
    const pos = polarToXY(CX, CY, R_AXIS_LABEL, ax.angle);
    const baseX = pos.x + (ax.dx || 0);
    const baseY = pos.y + (ax.dy || 0);

    const txt = svgEl('text', {
      x: baseX,
      y: baseY,
      class: 'axis-label',
      'text-anchor': ax.anchor,
      'dominant-baseline': 'central',
      'font-size': '7',
    });

    // Разбиваем на 2 строки по пробелу
    const words = ax.label.split(' ');
    const tspan1 = svgEl('tspan', { x: baseX, dy: -LINE_H / 2 });
    tspan1.textContent = words[0];
    const tspan2 = svgEl('tspan', { x: baseX, dy: LINE_H });
    tspan2.textContent = words[1];
    txt.appendChild(tspan1);
    txt.appendChild(tspan2);

    if (ax.rotate) {
      txt.setAttribute('transform', `rotate(${ax.rotate}, ${baseX}, ${baseY})`);
    }
    g.appendChild(txt);
  }
}

// ─── Ring separator ───────────────────────────────────────────────────────────

function buildRingSeparator(g, r) {
  g.appendChild(svgEl('circle', {
    cx: CX, cy: CY, r,
    fill: 'none',
    stroke: 'rgba(42,34,32,0.12)',
    'stroke-width': '0.5',
    class: 'ring-separator',
    'pointer-events': 'none',
  }));
}

// ─── Highlight group (zone-based multi-arc selection with gradient fade) ───────

// Normalize angle so that all values are ≥ −90° (spring equinox).
// January (raw ≈ −167°) becomes ≈ 193°, keeping it in the winter region.
function normalizeAngle(deg) {
  return deg < -90 ? deg + 360 : deg;
}

// Get the [normStart, normEnd] angle range for an entity.
function getEntityAngleRange(type, id, calendar) {
  if (type === 'month') {
    const m = parseInt(id, 10);
    const s = normalizeAngle(doyToAngle(dayOfYear(m, 1)));
    let e = normalizeAngle(doyToAngle(dayOfYear(m, DAYS_IN_MONTH[m])));
    if (e < s) e += 360;
    return [s, e];
  }
  if (type === 'subseason') {
    const ss = (calendar.subseasons || []).find(x => x.id === id);
    if (!ss) return null;
    let endDOY = dayOfYear(ss.endMonth, ss.endDay);
    if (ss.wrapsYear) endDOY += 365;
    const s = normalizeAngle(doyToAngle(dayOfYear(ss.startMonth, ss.startDay)));
    let e = normalizeAngle(doyToAngle(endDOY));
    if (e < s) e += 360;
    return [s, e];
  }
  if (type === 'season') {
    const sp = SEASON_PHENOL.find(x => x.id === id);
    if (!sp) return null;
    const s = normalizeAngle(doyToAngle(sp.startDoy));
    let e = normalizeAngle(doyToAngle(sp.startDoy + sp.days - 1));
    if (e < s) e += 360;
    return [s, e];
  }
  return null;
}

// Angular overlap: returns fraction of arc [a0,a1] that lies within zone [z0,z1].
// Tries ±360° shifts to handle wrap-around (e.g. spring zone [268°,351°] vs April arc [−78°,−50°]).
function angularOverlapFraction(z0, z1, a0, a1) {
  const arcSpan = a1 - a0;
  if (arcSpan <= 0) return 0;
  for (const shift of [0, 360, -360]) {
    const overlapStart = Math.max(z0, a0 + shift);
    const overlapEnd   = Math.min(z1, a1 + shift);
    if (overlapEnd > overlapStart) {
      return (overlapEnd - overlapStart) / arcSpan;
    }
  }
  return 0;
}

// Highlight color for current color mode.
function getHighlightColor(arcEl, type) {
  const isFull  = document.body.classList.contains('scheme-full');
  const isColor = document.body.classList.contains('scheme-color');
  if (type === 'month') {
    return arcEl.style.getPropertyValue((isColor || isFull) ? '--month-color' : '--pastel-color').trim();
  }
  // subseason
  return arcEl.style.getPropertyValue('--hover-fill').trim();
}

// Base (non-highlighted) fill color for current color mode.
function getBaseColor(arcEl, type) {
  const isFull  = document.body.classList.contains('scheme-full');
  const isColor = document.body.classList.contains('scheme-color');
  if (type === 'month') {
    if (isFull)  return arcEl.style.getPropertyValue('--month-color').trim();
    if (isColor) return arcEl.style.getPropertyValue('--pastel-color').trim();
    return '#f5f4f0';
  }
  // subseason
  if (isFull) return arcEl.style.getPropertyValue('--hover-fill').trim();
  return window.getComputedStyle(arcEl).fill || '#f5f4f0';
}

// Shortest angular distance between two angles (0–180°).
function angularDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// Create a linear gradient in _defs and apply it as the arc's fill.
function applyArcGradient(arcEl, type, arcId, z0, z1, a0, a1) {
  const midR = type === 'month'
    ? (RING.month.r1 + RING.month.r2) / 2
    : (RING.subseason.r1 + RING.subseason.r2) / 2;

  // Highlighted end = arc edge closest to zone midpoint (use proper circular distance)
  const zoneMid = (z0 + z1) / 2;
  const distA0  = angularDistance(a0, zoneMid);
  const distA1  = angularDistance(a1, zoneMid);
  const hlAngle   = distA0 < distA1 ? a0 : a1;  // full color
  const fadeAngle = distA0 < distA1 ? a1 : a0;  // base color

  const p1 = polarToXY(CX, CY, midR, hlAngle);
  const p2 = polarToXY(CX, CY, midR, fadeAngle);

  const gradId = `grad-${type}-${arcId}`;
  const existing = _defs.querySelector(`#${CSS.escape(gradId)}`);
  if (existing) existing.remove();

  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', gradId);
  grad.setAttribute('gradientUnits', 'userSpaceOnUse');
  grad.setAttribute('x1', p1.x); grad.setAttribute('y1', p1.y);
  grad.setAttribute('x2', p2.x); grad.setAttribute('y2', p2.y);

  const s1 = document.createElementNS(SVG_NS, 'stop');
  s1.setAttribute('offset', '0%');
  s1.setAttribute('stop-color', getHighlightColor(arcEl, type));

  const s2 = document.createElementNS(SVG_NS, 'stop');
  s2.setAttribute('offset', '100%');
  s2.setAttribute('stop-color', getBaseColor(arcEl, type));

  grad.appendChild(s1);
  grad.appendChild(s2);
  _defs.appendChild(grad);

  arcEl.style.fill = `url(#${gradId})`;
}

// Clear all highlights and gradient fills from the SVG.
function clearHighlightGroup(svgRoot) {
  svgRoot.querySelectorAll('[data-month].selected, [data-subseason].selected, [data-season].selected')
    .forEach(el => el.classList.remove('selected'));
  svgRoot.querySelectorAll('[data-month], [data-subseason]')
    .forEach(el => el.style.removeProperty('fill'));
  if (_defs) {
    _defs.querySelectorAll('[id^="grad-"]').forEach(el => el.remove());
  }
}

// Highlight all arcs in the zone of the clicked entity.
function highlightGroup(type, id, svgRoot, calendar) {
  clearHighlightGroup(svgRoot);

  const zone = getEntityAngleRange(type, id, calendar);
  if (!zone) return;
  const [z0, z1] = zone;

  // ── Month arcs ──
  const monthArcs = svgRoot.querySelectorAll('[data-month]');
  monthArcs.forEach(arcEl => {
    const mId = arcEl.dataset.month;
    const range = getEntityAngleRange('month', mId, calendar);
    if (!range) return;
    const [a0, a1] = range;
    const frac = angularOverlapFraction(z0, z1, a0, a1);
    if (frac >= 0.999) {
      arcEl.classList.add('selected');
    } else if (frac > 0) {
      applyArcGradient(arcEl, 'month', mId, z0, z1, a0, a1);
    }
  });

  // ── Subseason arcs ──
  svgRoot.querySelectorAll('[data-subseason]').forEach(arcEl => {
    const ssId = arcEl.dataset.subseason;
    const range = getEntityAngleRange('subseason', ssId, calendar);
    if (!range) return;
    const [a0, a1] = range;
    const frac = angularOverlapFraction(z0, z1, a0, a1);
    if (frac >= 0.999) {
      arcEl.classList.add('selected');
    } else if (frac > 0) {
      applyArcGradient(arcEl, 'subseason', ssId, z0, z1, a0, a1);
    }
  });

  // ── Season arcs — only full overlap (gradient on center pie-slices looks bad) ──
  svgRoot.querySelectorAll('[data-season]').forEach(arcEl => {
    const sId = arcEl.dataset.season;
    const range = getEntityAngleRange('season', sId, calendar);
    if (!range) return;
    const [a0, a1] = range;
    const frac = angularOverlapFraction(z0, z1, a0, a1);
    if (frac >= 0.999) {
      arcEl.classList.add('selected');
    }
  });
}

// ─── Яндекс.Метрика: beacon для карты кликов ─────────────────────────────────

function fireYmBeacon(originalEvent) {
  const beacon = document.getElementById('ym-click-beacon');
  if (!beacon) return;
  const rect = beacon.parentElement.getBoundingClientRect();
  beacon.style.left = (originalEvent.clientX - rect.left) + 'px';
  beacon.style.top  = (originalEvent.clientY - rect.top) + 'px';
  const synth = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: originalEvent.clientX,
    clientY: originalEvent.clientY,
  });
  synth._ymBeacon = true;
  beacon.dispatchEvent(synth);
}

// ─── Events ───────────────────────────────────────────────────────────────────

function attachEvents(svgRoot, calendar) {
  document.addEventListener('sidebar:closed', () => clearHighlightGroup(svgRoot));
  document.addEventListener('scheme:changed', () => clearHighlightGroup(svgRoot));

  svgRoot.addEventListener('click', e => {
    const monthArc = e.target.closest('[data-month]');
    if (monthArc) {
      openSidebar('month', parseInt(monthArc.dataset.month, 10));
      highlightGroup('month', monthArc.dataset.month, svgRoot, calendar);
      fireYmBeacon(e);
      return;
    }
    const ssArc = e.target.closest('[data-subseason]');
    if (ssArc) {
      openSidebar('subseason', ssArc.dataset.subseason);
      highlightGroup('subseason', ssArc.dataset.subseason, svgRoot, calendar);
      fireYmBeacon(e);
      return;
    }
    const seasonArc = e.target.closest('[data-season]');
    if (seasonArc) {
      openSidebar('season', seasonArc.dataset.season);
      highlightGroup('season', seasonArc.dataset.season, svgRoot, calendar);
      fireYmBeacon(e);
    }
  });

  svgRoot.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function buildWheel(calendar) {
  const g = document.getElementById('wheel-g');
  if (!g) {
    console.error('wheel.js: element #wheel-g not found');
    return;
  }
  while (g.firstChild) g.removeChild(g.firstChild);

  const svgRoot = g.closest('svg') || g;
  _defs = ensureDefs(svgRoot);

  buildAxes(g, calendar);

  buildSeasonRing(g, calendar);

  buildRingSeparator(g, RING.subseason.r1 - 1);
  buildSubseasonRing(g, calendar);

  buildRingSeparator(g, RING.month.r1 - 1);
  buildMonthRing(g, calendar);

  attachEvents(svgRoot, calendar);
}
