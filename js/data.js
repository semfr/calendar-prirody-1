// js/data.js
let _cache = null;
let _sourcesCache = null;
let _sourceDataCache = {};  // { sourceId: data }
let _mergedCache = null;
let _activeSourceIds = null;

export async function loadCalendar() {
  if (_cache) return _cache;

  // Try fetch first (works on http://)
  try {
    const resp = await fetch('./data/calendar.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('fetch failed');
    _cache = await resp.json();
    return _cache;
  } catch {
    // Fallback: inline data embedded by index.html
    if (window.CALENDAR_DATA) {
      _cache = window.CALENDAR_DATA;
      return _cache;
    }
    throw new Error('Не удалось загрузить данные календаря. Откройте через локальный сервер или используйте GitHub Pages.');
  }
}

// ── Multi-source API ─────────────────────────────────────────────────────────

export async function loadSources() {
  if (_sourcesCache) return _sourcesCache;
  try {
    const resp = await fetch('./data/sources.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('fetch sources failed');
    _sourcesCache = await resp.json();
    return _sourcesCache;
  } catch {
    // Fallback: only Strizhev
    _sourcesCache = {
      sources: [{
        id: 'strizhev', name: 'Стрижёв', file: 'calendar.json',
        color: '#4A7C59', icon: '📗', default: true
      }]
    };
    return _sourcesCache;
  }
}

export async function loadSourceData(sourceId) {
  if (_sourceDataCache[sourceId]) return _sourceDataCache[sourceId];

  const sources = await loadSources();
  const src = sources.sources.find(s => s.id === sourceId);
  if (!src) return null;

  // Стрижёв — это основной calendar.json
  if (src.id === 'strizhev') {
    const data = await loadCalendar();
    _sourceDataCache[sourceId] = data;
    return data;
  }

  try {
    const resp = await fetch(`./data/${src.file}`, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`fetch ${src.file} failed`);
    const data = await resp.json();
    _sourceDataCache[sourceId] = data;
    return data;
  } catch {
    console.warn(`Не удалось загрузить источник: ${sourceId}`);
    return null;
  }
}

/**
 * Загрузить и слить данные из нескольких источников.
 * Если activeIds содержит только 'strizhev' — возвращает оригинальный формат.
 * Если несколько — omens и generalSayings становятся объектами {text, source}.
 */
export async function loadMergedCalendar(activeIds) {
  // Оптимизация: если один Стрижёв — вернуть как есть
  if (activeIds.length === 1 && activeIds[0] === 'strizhev') {
    _activeSourceIds = activeIds;
    _mergedCache = null;
    return loadCalendar();
  }

  // Проверяем кеш
  const cacheKey = activeIds.sort().join(',');
  if (_mergedCache && _activeSourceIds && _activeSourceIds.sort().join(',') === cacheKey) {
    return _mergedCache;
  }

  const base = await loadCalendar();
  const additionalData = [];

  for (const id of activeIds) {
    if (id === 'strizhev') continue;
    const data = await loadSourceData(id);
    if (data) additionalData.push({ id, data });
  }

  if (additionalData.length === 0) {
    _activeSourceIds = activeIds;
    _mergedCache = null;
    return base;
  }

  _mergedCache = mergeCalendars(base, additionalData);
  _activeSourceIds = activeIds;
  return _mergedCache;
}

/**
 * Слить данные: base (Стрижёв) + дополнительные источники.
 * omens/generalSayings становятся массивами {text, source}.
 */
function mergeCalendars(base, additionalSources) {
  const merged = JSON.parse(JSON.stringify(base));

  // Преобразуем omens Стрижёва в формат {text, source}
  for (const month of merged.months) {
    if (month.generalSayings) {
      month.generalSayings = month.generalSayings.map(s =>
        typeof s === 'string' ? { text: s, source: 'strizhev' } : s
      );
    }
    for (const day of (month.days || [])) {
      if (day.omens) {
        day.omens = day.omens.map(o =>
          typeof o === 'string' ? { text: o, source: 'strizhev' } : o
        );
      }
      if (day.phenology) {
        day.phenology = day.phenology.map(p =>
          typeof p === 'string' ? { text: p, source: 'strizhev' } : p
        );
      }
    }
  }

  // Индекс месяцев для быстрого доступа
  const monthIndex = {};
  for (const month of merged.months) {
    monthIndex[month.id] = month;
    // Индекс дней внутри месяца
    month._dayIndex = {};
    for (const day of (month.days || [])) {
      month._dayIndex[day.day] = day;
    }
  }

  // Добавляем данные из дополнительных источников
  for (const { id: sourceId, data: srcData } of additionalSources) {
    for (const srcMonth of (srcData.months || [])) {
      const targetMonth = monthIndex[srcMonth.id];
      if (!targetMonth) continue;

      // Добавляем generalSayings
      if (srcMonth.generalSayings) {
        for (const saying of srcMonth.generalSayings) {
          targetMonth.generalSayings.push({ text: saying, source: sourceId });
        }
      }

      // Добавляем дни
      for (const srcDay of (srcMonth.days || [])) {
        const existing = targetMonth._dayIndex[srcDay.day];

        if (existing) {
          // День существует — добавляем данные из нового источника
          for (const omen of (srcDay.omens || [])) {
            existing.omens.push({ text: omen, source: sourceId });
          }
          // traditions и commentary — новые поля
          if (srcDay.traditions) {
            if (!existing.traditions) existing.traditions = [];
            for (const t of srcDay.traditions) {
              existing.traditions.push({ text: t, source: sourceId });
            }
          }
          if (srcDay.commentary) {
            if (!existing.commentary) existing.commentary = [];
            for (const c of srcDay.commentary) {
              existing.commentary.push({ text: c, source: sourceId });
            }
          }
          // Дополняем saint: если пусто — ставим, если есть — сохраняем как extraSaints
          if (srcDay.saint) {
            if (!existing.saint) {
              existing.saint = srcDay.saint;
              existing.saintSource = sourceId;
            } else {
              if (!existing.extraSaints) existing.extraSaints = [];
              existing.extraSaints.push({ name: srcDay.saint, source: sourceId });
            }
          }
          // leapYearOnly
          if (srcDay.leapYearOnly) {
            existing.leapYearOnly = true;
          }
        } else {
          // Нового дня в Стрижёве нет — создаём
          const newDay = {
            day: srcDay.day,
            saint: srcDay.saint || null,
            saintSource: sourceId,
            subseason: findSubseason(merged, srcMonth.id, srcDay.day),
            omens: (srcDay.omens || []).map(o => ({ text: o, source: sourceId })),
          };
          if (srcDay.traditions) {
            newDay.traditions = srcDay.traditions.map(t => ({ text: t, source: sourceId }));
          }
          if (srcDay.commentary) {
            newDay.commentary = srcDay.commentary.map(c => ({ text: c, source: sourceId }));
          }
          targetMonth.days.push(newDay);
          targetMonth._dayIndex[srcDay.day] = newDay;
        }
      }

      // Сортируем дни по числу
      targetMonth.days.sort((a, b) => a.day - b.day);
    }
  }

  // Убираем служебные индексы
  for (const month of merged.months) {
    delete month._dayIndex;
  }

  return merged;
}

/**
 * Определить подсезон для дня по границам из базы Стрижёва.
 */
function findSubseason(calendar, monthId, day) {
  for (const ss of (calendar.subseasons || [])) {
    const start = ss.startMonth * 100 + ss.startDay;
    const end = ss.endMonth * 100 + ss.endDay;
    const current = monthId * 100 + day;

    if (ss.wrapsYear) {
      if (current >= start || current <= end) return ss.id;
    } else {
      if (current >= start && current <= end) return ss.id;
    }
  }
  return null;
}

// ── Helpers (unchanged) ─────────────────────────────────────────────────────

// Helper: get month data by id (1-12)
export function getMonth(calendar, monthId) {
  return calendar.months.find(m => m.id === monthId);
}

// Helper: get subseason by id
export function getSubseason(calendar, subseasonId) {
  return calendar.subseasons.find(s => s.id === subseasonId);
}

// Helper: get all days with omens (omens.length > 0) across all months
export function getAllDaysWithOmens(calendar) {
  const result = [];
  for (const month of calendar.months) {
    for (const day of month.days) {
      const hasOmens = day.omens && day.omens.length > 0;
      const hasPhenology = day.phenology && day.phenology.length > 0;
      if (hasOmens || day.saint || hasPhenology) {
        result.push({ ...day, monthId: month.id, monthName: month.name });
      }
    }
  }
  return result;
}

// Month names in genitive case (index 0 is empty for 1-based month IDs)
export const MONTH_NAMES_GENITIVE = [
  '', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

// Uses a fixed 365-day year — intentional. The original самиздатовский calendar
// does not account for leap years. Phenological sub-season boundaries are
// approximate multi-year averages, so a 1-day offset in leap years is acceptable.
export function dayOfYear(monthId, dayNum) {
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let doy = dayNum;
  for (let m = 1; m < monthId; m++) doy += daysInMonth[m];
  return doy;
}
