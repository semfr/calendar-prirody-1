// js/sources.js
// Управление переключением источников на сайте.

import { loadSources, loadMergedCalendar } from './data.js?v=21';

const STORAGE_KEY = 'calendar_sources';
let _sourcesData = null;

/**
 * Инициализация панели источников.
 * Рендерит тогглы, восстанавливает состояние из localStorage,
 * и вызывает callback при изменении.
 *
 * @param {Function} onSourcesChanged - callback(activeSourceIds, mergedCalendar)
 */
export async function initSources(onSourcesChanged) {
  _sourcesData = await loadSources();
  const container = document.getElementById('sources-panel');
  if (!container) return;

  const activeIds = getActiveSourceIds();

  // Рендерим тогглы
  renderToggles(container, activeIds);

  // Клик по чипсу — toggle источника
  container.addEventListener('click', async (e) => {
    const chip = e.target.closest('.source-chip');
    if (!chip) return;

    chip.classList.toggle('active');

    const newIds = Array.from(container.querySelectorAll('.source-chip.active'))
      .map(c => c.dataset.sourceId);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newIds));
    const merged = await loadMergedCalendar(newIds);
    onSourcesChanged(newIds, merged);
  });
}

/**
 * Текущие активные источники.
 */
export function getActiveSourceIds() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const ids = JSON.parse(stored);
      if (Array.isArray(ids)) return ids;
    }
  } catch { /* ignore */ }

  // По умолчанию — все с default: true
  return _sourcesData
    ? _sourcesData.sources.filter(s => s.default).map(s => s.id)
    : ['strizhev'];
}

/**
 * Проверить, активно ли мультиисточниковое отображение.
 */
export function isMultiSource() {
  return getActiveSourceIds().length > 1;
}

/**
 * Получить данные источника по ID.
 */
export function getSourceInfo(sourceId) {
  if (!_sourcesData) return null;
  return _sourcesData.sources.find(s => s.id === sourceId) || null;
}

// ── Internal ─────────────────────────────────────────────────────────────────

function renderToggles(container, activeIds) {
  container.innerHTML = '';

  const label = document.createElement('span');
  label.className = 'sources-label';
  label.textContent = 'Источники:';
  container.appendChild(label);

  for (const src of _sourcesData.sources) {
    const chip = document.createElement('span');
    chip.className = 'source-chip';
    chip.dataset.sourceId = src.id;
    chip.style.setProperty('--chip-color', src.color);
    const short = src.shortName || src.name;
    chip.textContent = short;
    chip.title = `${src.name} \u00ab${src.title}\u00bb (${src.year})`;

    if (activeIds.includes(src.id)) {
      chip.classList.add('active');
    }

    container.appendChild(chip);
  }

  // Кнопка ⓘ для мобилки
  const infoBtn = document.createElement('button');
  infoBtn.className = 'sources-info-btn';
  infoBtn.textContent = '\u24d8';
  infoBtn.setAttribute('aria-label', 'Расшифровка источников');

  const infoBlock = document.createElement('div');
  infoBlock.className = 'sources-info-block';
  infoBlock.hidden = true;
  const lines = _sourcesData.sources.map(s => {
    const short = s.shortName || s.name;
    return `${short}: ${s.name} \u00ab${s.title}\u00bb (${s.year})`;
  });
  infoBlock.innerHTML = lines.join('<br>');

  infoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    infoBlock.hidden = !infoBlock.hidden;
  });

  container.appendChild(infoBtn);
  container.appendChild(infoBlock);
}
