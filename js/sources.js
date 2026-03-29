// js/sources.js
// Управление переключением источников на сайте.

import { loadSources, loadMergedCalendar } from './data.js?v=7';

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

  // При изменении — перезагрузка
  container.addEventListener('change', async (e) => {
    const checkbox = e.target.closest('input[type="checkbox"]');
    if (!checkbox) return;

    const newIds = getCheckedIds(container);
    // Стрижёв нельзя отключить
    if (!newIds.includes('strizhev')) {
      checkbox.checked = true;
      return;
    }

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
      if (Array.isArray(ids) && ids.includes('strizhev')) return ids;
    }
  } catch { /* ignore */ }

  // По умолчанию — только Стрижёв
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
    const wrap = document.createElement('label');
    wrap.className = 'source-toggle';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = src.id;
    cb.checked = activeIds.includes(src.id);
    // Стрижёв нельзя отключить
    if (src.default) cb.disabled = true;

    const badge = document.createElement('span');
    badge.className = 'source-badge';
    // Формат: КРП (Стрижёв «Календарь русской природы»)
    const short = src.shortName || src.name;
    badge.textContent = `${short} (${src.name} \u00ab${src.title}\u00bb)`;
    badge.title = `${src.author}. ${src.title}, ${src.year}`;

    wrap.appendChild(cb);
    wrap.appendChild(badge);
    container.appendChild(wrap);
  }
}

function getCheckedIds(container) {
  return Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
}
