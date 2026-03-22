// js/sidebar.js
// Detail panel: right-side drawer on desktop, bottom sheet on mobile.
// Exports: initSidebar, openSidebar, closeSidebar

import { getMonth, getSubseason } from './data.js';

const isDesktop = () => window.innerWidth >= 768;

let _calendar = null;

const panel       = () => document.getElementById('detail-panel');
const overlay     = () => document.getElementById('overlay');
const panelTitle  = () => document.getElementById('panel-title');
const panelSubtitle = () => document.getElementById('panel-subtitle');
const panelBody   = () => document.getElementById('panel-body');

// ── Public API ────────────────────────────────────────────────────────────────

export function initSidebar(calendar) {
  _calendar = calendar;

  // Close button
  document.getElementById('panel-close').addEventListener('click', closeSidebar);

  // Overlay click
  overlay().addEventListener('click', closeSidebar);

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });

  // Mobile swipe-to-close
  initSwipeToClose();

  // Handle URL param ?month=X&day=Y (from search page links)
  const params = new URLSearchParams(window.location.search);
  if (params.has('month')) {
    const monthId = parseInt(params.get('month'), 10);
    const day = params.has('day') ? parseInt(params.get('day'), 10) : null;
    // Small delay to let wheel render first
    setTimeout(() => openSidebar('month', monthId, day), 300);
  }
}

export function openSidebar(type, id, highlightDay = null) {
  if (!_calendar) return;

  const p = panel();
  if (!isDesktop()) p.removeAttribute('hidden');

  if (type === 'month') {
    renderMonthPanel(id, highlightDay);
  } else if (type === 'subseason') {
    renderSubseasonPanel(id);
  } else if (type === 'season') {
    renderSeasonPanel(id);
  }

  // Animate open (rAF ensures 'hidden' removal is painted before adding 'open')
  requestAnimationFrame(() => {
    p.classList.add('open');
    if (!isDesktop()) overlay().classList.add('visible');
  });

  // Focus management: move focus to close button
  document.getElementById('panel-close').focus();
}

export function closeSidebar() {
  document.dispatchEvent(new CustomEvent('sidebar:closed'));
  const p = panel();
  p.classList.remove('open');
  overlay().classList.remove('visible');
  // Hide element after CSS transition completes — only on mobile
  if (!isDesktop()) {
    p.addEventListener('transitionend', () => {
      p.setAttribute('hidden', '');
    }, { once: true });
  }
}

// ── Render: month panel ───────────────────────────────────────────────────────

function renderMonthPanel(monthId, highlightDay) {
  const month = getMonth(_calendar, monthId);
  if (!month) return;

  panelTitle().textContent = month.name;

  // Subtitle: average temperature
  const tempSign = month.avgTemp >= 0 ? '+' : '';
  panelSubtitle().textContent = `Средняя температура: ${tempSign}${month.avgTemp}°C`;

  const body = panelBody();
  body.innerHTML = ''; // safe: we build DOM manually below; no user input involved

  // General sayings at the top if present
  if (month.generalSayings && month.generalSayings.length > 0) {
    body.appendChild(makeSectionHeader('Общие приметы о месяце'));
    const list = document.createElement('ul');
    list.className = 'omens-list';
    for (const saying of month.generalSayings) {
      const li = document.createElement('li');
      li.textContent = saying;
      list.appendChild(li);
    }
    body.appendChild(list);
  }

  // Group days by sub-season
  const groups = {};
  for (const day of (month.days || [])) {
    const ssId = day.subseason || 'unknown';
    if (!groups[ssId]) groups[ssId] = [];
    groups[ssId].push(day);
  }

  // Render each sub-season group
  for (const [ssId, days] of Object.entries(groups)) {
    const ss = getSubseason(_calendar, ssId);
    if (ss) {
      body.appendChild(makeSectionHeader(ss.name));
      if (ss.description) {
        const desc = document.createElement('p');
        desc.className = 'subseason-desc';
        desc.textContent = ss.description;
        body.appendChild(desc);
      }
    }

    for (const day of days) {
      body.appendChild(makeDayEntry(day, month.id, highlightDay));
    }
  }

  // No days at all
  if ((month.days || []).length === 0) {
    const msg = document.createElement('p');
    msg.className = 'no-data-msg';
    msg.textContent = 'Для этого месяца записи не найдены.';
    body.appendChild(msg);
  }
}

// ── Render: sub-season panel ──────────────────────────────────────────────────

function renderSubseasonPanel(subseasonId) {
  const ss = getSubseason(_calendar, subseasonId);
  if (!ss) return;

  panelTitle().textContent = ss.name;
  panelSubtitle().textContent = formatDateRange(ss);

  const body = panelBody();
  body.innerHTML = ''; // safe: DOM-built only

  // Sub-season description
  if (ss.description) {
    const desc = document.createElement('p');
    desc.className = 'subseason-desc';
    desc.style.marginBottom = '1rem';
    desc.textContent = ss.description;
    body.appendChild(desc);
  }

  // Collect all days from this sub-season across all months
  let found = 0;
  for (const month of _calendar.months) {
    const monthDays = (month.days || []).filter(d => d.subseason === subseasonId);
    if (monthDays.length === 0) continue;

    body.appendChild(makeSectionHeader(month.name));
    for (const day of monthDays) {
      body.appendChild(makeDayEntry(day, month.id, null));
      found++;
    }
  }

  if (found === 0) {
    const msg = document.createElement('p');
    msg.className = 'no-data-msg';
    msg.textContent = 'Записи для этого подсезона не найдены.';
    body.appendChild(msg);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSectionHeader(text) {
  const div = document.createElement('div');
  div.className = 'subseason-header';
  div.textContent = text;
  return div;
}

function makeDayEntry(day, monthId, highlightDay) {
  const entry = document.createElement('div');
  entry.className = 'day-entry' + (day.day === highlightDay ? ' highlighted' : '');

  // Header row: day number + saint name
  const header = document.createElement('div');
  header.className = 'day-entry-header';

  const num = document.createElement('span');
  num.className = 'day-number';
  num.textContent = day.day;

  const saint = document.createElement('span');
  saint.className = 'saint-name';
  saint.textContent = day.saint || '';

  header.appendChild(num);
  header.appendChild(saint);
  entry.appendChild(header);

  // Omens list
  if (day.omens && day.omens.length > 0) {
    const list = document.createElement('ul');
    list.className = 'omens-list';
    for (const omen of day.omens) {
      const li = document.createElement('li');
      li.textContent = omen;
      list.appendChild(li);
    }
    entry.appendChild(list);
  }

  return entry;
}

function formatDateRange(ss) {
  const months = [
    '', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  return `${ss.startDay} ${months[ss.startMonth]} — ${ss.endDay} ${months[ss.endMonth]}`;
}

// ── Render: season panel ──────────────────────────────────────────────────────

function renderSeasonPanel(seasonId) {
  const season = (_calendar.seasons || []).find(s => s.id === seasonId);
  if (!season) return;

  panelTitle().textContent = season.name;

  // Collect subseasons for this season (in original order)
  const subseasons = (_calendar.subseasons || []).filter(ss => ss.season === seasonId);

  // Subtitle: date range from first→last subseason + total days
  const totalDays = subseasons.reduce((sum, ss) => {
    const start = (ss.startMonth - 1) * 31 + ss.startDay;
    const end   = (ss.endMonth   - 1) * 31 + ss.endDay;
    // rough day count from subseason span; use wrapsYear flag if present
    return sum + (ss.wrapsYear ? 365 - start + end : end - start + 1);
  }, 0);
  if (subseasons.length > 0) {
    const first = subseasons[0];
    const last  = subseasons[subseasons.length - 1];
    const months = ['', 'янв', 'фев', 'мар', 'апр', 'май', 'июн',
                    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    panelSubtitle().textContent =
      `${first.startDay} ${months[first.startMonth]} — ${last.endDay} ${months[last.endMonth]}`;
  } else {
    panelSubtitle().textContent = '';
  }

  const body = panelBody();
  body.innerHTML = '';

  if (subseasons.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'no-data-msg';
    msg.textContent = 'Подсезоны не найдены.';
    body.appendChild(msg);
    return;
  }

  // For each subseason: header + description + days grouped by month
  for (const ss of subseasons) {
    const hdr = document.createElement('div');
    hdr.className = 'subseason-header';
    hdr.textContent = ss.name;
    // append date range as secondary span
    const dateSpan = document.createElement('span');
    dateSpan.className = 'subseason-header-dates';
    dateSpan.textContent = ' · ' + formatDateRange(ss);
    hdr.appendChild(dateSpan);
    body.appendChild(hdr);

    if (ss.description) {
      const desc = document.createElement('p');
      desc.className = 'subseason-desc';
      desc.textContent = ss.description;
      body.appendChild(desc);
    }

    // Days in this subseason, grouped by month
    for (const month of _calendar.months) {
      const monthDays = (month.days || []).filter(d => d.subseason === ss.id);
      if (monthDays.length === 0) continue;
      body.appendChild(makeSectionHeader(month.name));
      for (const day of monthDays) {
        body.appendChild(makeDayEntry(day, month.id, null));
      }
    }
  }
}

// ── Mobile swipe-to-close ─────────────────────────────────────────────────────

function initSwipeToClose() {
  const p = panel();
  let startY = 0;

  p.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
  }, { passive: true });

  p.addEventListener('touchend', e => {
    const diff = e.changedTouches[0].clientY - startY;
    if (diff > 60) closeSidebar(); // swipe down > 60 px → close
  }, { passive: true });
}
