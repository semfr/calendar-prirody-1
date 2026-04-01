// js/data.js
let _cache = null;
let _sourcesCache = null;
let _sourceDataCache = {};  // { sourceId: data }
let _mergedCache = null;
let _activeSourceIds = null;
let _subseasonsCache = null;
let _saintsCache = null;

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

// ── Subseasons — загружаются всегда, независимо от источников ────────────────

/**
 * Загрузить общие данные (seasons, subseasons, monthMeta).
 * Формат subseasons.json: { seasons: [...], subseasons: [...], monthMeta: { "1": { avgTemp, season }, ... } }
 */
async function loadSharedData() {
  if (_subseasonsCache) return _subseasonsCache;
  try {
    const resp = await fetch('./data/subseasons.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('fetch subseasons failed');
    const raw = await resp.json();
    // Поддержка обоих форматов: массив (старый) и объект (новый)
    if (Array.isArray(raw)) {
      _subseasonsCache = { seasons: [], subseasons: raw, monthMeta: {} };
    } else {
      _subseasonsCache = {
        seasons: raw.seasons || [],
        subseasons: raw.subseasons || [],
        monthMeta: raw.monthMeta || {},
      };
    }
    return _subseasonsCache;
  } catch {
    try {
      const cal = await loadCalendar();
      _subseasonsCache = {
        seasons: cal.seasons || [],
        subseasons: cal.subseasons || [],
        monthMeta: {},
      };
    } catch {
      _subseasonsCache = { seasons: [], subseasons: [], monthMeta: {} };
    }
    return _subseasonsCache;
  }
}

// ── Saints — единая база святых ─────────────────────────────────────────────

async function loadSaints() {
  if (_saintsCache) return _saintsCache;
  try {
    const resp = await fetch('./data/saints.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('fetch saints failed');
    const data = await resp.json();
    // Индекс: "month-day" → saint entry
    _saintsCache = {};
    for (const s of (data.saints || [])) {
      _saintsCache[`${s.month}-${s.day}`] = s;
    }
    return _saintsCache;
  } catch {
    console.warn('Не удалось загрузить saints.json');
    _saintsCache = {};
    return _saintsCache;
  }
}

/**
 * Применить единую базу святых к календарю.
 * Заменяет saint, fullName, aliases из saints.json для каждого дня.
 */
function applySaints(calendar, saintsIndex) {
  for (const month of (calendar.months || [])) {
    for (const day of (month.days || [])) {
      const key = `${month.id}-${day.day}`;
      const saint = saintsIndex[key];
      if (saint) {
        day.saint = saint.name;
        day.fullName = saint.fullName || null;
        day.aliases = saint.aliases || [];
      }
      // Убираем extraSaints — больше не нужны
      delete day.extraSaints;
      delete day.saintSource;
    }
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
 * Загрузить и слить данные из выбранных источников.
 * Работает с любой комбинацией: один, несколько или ноль источников.
 * subseasons загружаются всегда отдельно.
 */
export async function loadMergedCalendar(activeIds) {
  const shared = await loadSharedData();
  const { seasons, subseasons, monthMeta } = shared;

  // 0 источников — пустой календарь
  if (!activeIds || activeIds.length === 0) {
    return buildEmptyCalendar(seasons, subseasons, monthMeta);
  }

  // Проверяем кеш
  const cacheKey = [...activeIds].sort().join(',');
  if (_mergedCache && _activeSourceIds && [..._activeSourceIds].sort().join(',') === cacheKey) {
    return _mergedCache;
  }

  // Загружаем все источники и святых параллельно
  const [saintsIndex, ...loadedSources] = await Promise.all([
    loadSaints(),
    ...activeIds.map(id => loadSourceData(id).then(data => data ? { id, data } : null))
  ]);

  const sourcesData = loadedSources.filter(Boolean);

  if (sourcesData.length === 0) {
    _activeSourceIds = activeIds;
    _mergedCache = buildEmptyCalendar(seasons, subseasons, monthMeta);
    return _mergedCache;
  }

  // Один источник — оптимизация
  if (sourcesData.length === 1) {
    const { id, data } = sourcesData[0];
    _mergedCache = wrapSingleSource(data, id, seasons, subseasons, monthMeta);
  } else {
    // Несколько источников — мерж
    _mergedCache = mergeCalendars(sourcesData, seasons, subseasons, monthMeta);
  }

  // Применяем единую базу святых
  applySaints(_mergedCache, saintsIndex);

  _activeSourceIds = activeIds;
  return _mergedCache;
}

/**
 * Обернуть данные единственного источника в формат {text, source}.
 */
function wrapSingleSource(data, sourceId, seasons, subseasons, monthMeta) {
  const wrapped = JSON.parse(JSON.stringify(data));
  wrapped.subseasons = subseasons;
  wrapped.seasons = wrapped.seasons || seasons;

  for (const month of wrapped.months) {
    // Заполняем avgTemp и season из общих данных если отсутствуют
    const meta = monthMeta[String(month.id)];
    if (meta) {
      if (month.avgTemp == null) month.avgTemp = meta.avgTemp;
      if (!month.season) month.season = meta.season;
    }

    if (month.generalSayings) {
      month.generalSayings = month.generalSayings.map(s =>
        typeof s === 'string' ? { text: s, source: sourceId } : s
      );
    }
    for (const day of (month.days || [])) {
      if (day.omens) {
        day.omens = day.omens.map(o =>
          typeof o === 'string' ? { text: o, source: sourceId } : o
        );
      }
      if (day.phenology) {
        day.phenology = day.phenology.map(p =>
          typeof p === 'string' ? { text: p, source: sourceId } : p
        );
      }
      if (day.traditions) {
        day.traditions = day.traditions.map(t =>
          typeof t === 'string' ? { text: t, source: sourceId } : t
        );
      }
      if (!day.subseason) {
        day.subseason = findSubseason(subseasons, month.id, day.day);
      }
    }
  }

  return wrapped;
}

/**
 * Слить данные из нескольких источников.
 * Первый источник — база, остальные добавляются поверх.
 */
function mergeCalendars(sourcesData, seasons, subseasons, monthMeta) {
  const [first, ...rest] = sourcesData;
  const merged = wrapSingleSource(first.data, first.id, seasons, subseasons, monthMeta);

  // Индекс месяцев
  const monthIndex = {};
  for (const month of merged.months) {
    monthIndex[month.id] = month;
    month._dayIndex = {};
    for (const day of (month.days || [])) {
      month._dayIndex[day.day] = day;
    }
  }

  // Добавляем данные из остальных источников
  for (const { id: sourceId, data: srcData } of rest) {
    for (const srcMonth of (srcData.months || [])) {
      let targetMonth = monthIndex[srcMonth.id];

      // Если месяца нет в базе — создаём
      if (!targetMonth) {
        targetMonth = {
          id: srcMonth.id,
          name: srcMonth.name,
          generalSayings: [],
          days: [],
          _dayIndex: {},
        };
        merged.months.push(targetMonth);
        monthIndex[srcMonth.id] = targetMonth;
      }

      // generalSayings
      if (srcMonth.generalSayings) {
        if (!targetMonth.generalSayings) targetMonth.generalSayings = [];
        for (const saying of srcMonth.generalSayings) {
          targetMonth.generalSayings.push({ text: saying, source: sourceId });
        }
      }

      // Дни
      for (const srcDay of (srcMonth.days || [])) {
        const existing = targetMonth._dayIndex[srcDay.day];

        if (existing) {
          // День существует — дополняем
          if (!existing.omens) existing.omens = [];
          for (const omen of (srcDay.omens || [])) {
            existing.omens.push({ text: omen, source: sourceId });
          }
          if (srcDay.traditions) {
            if (!existing.traditions) existing.traditions = [];
            for (const t of srcDay.traditions) {
              existing.traditions.push({ text: t, source: sourceId });
            }
          }
          if (srcDay.phenology) {
            if (!existing.phenology) existing.phenology = [];
            for (const p of srcDay.phenology) {
              existing.phenology.push({ text: p, source: sourceId });
            }
          }
          if (srcDay.saint && !existing.saint) {
            existing.saint = srcDay.saint;
          }
          if (srcDay.leapYearOnly) {
            existing.leapYearOnly = true;
          }
        } else {
          // Новый день
          const newDay = {
            day: srcDay.day,
            saint: srcDay.saint || null,
            subseason: findSubseason(subseasons, srcMonth.id, srcDay.day),
            omens: (srcDay.omens || []).map(o => ({ text: o, source: sourceId })),
          };
          if (srcDay.traditions) {
            newDay.traditions = srcDay.traditions.map(t => ({ text: t, source: sourceId }));
          }
          if (srcDay.phenology) {
            newDay.phenology = srcDay.phenology.map(p => ({ text: p, source: sourceId }));
          }
          if (srcDay.leapYearOnly) {
            newDay.leapYearOnly = true;
          }
          targetMonth.days.push(newDay);
          targetMonth._dayIndex[srcDay.day] = newDay;
        }
      }

      targetMonth.days.sort((a, b) => a.day - b.day);
    }
  }

  // Сортируем месяцы и убираем служебные индексы
  merged.months.sort((a, b) => a.id - b.id);
  for (const month of merged.months) {
    delete month._dayIndex;
  }

  return merged;
}

/**
 * Пустой календарь (когда ни один источник не выбран).
 */
function buildEmptyCalendar(seasons, subseasons, monthMeta) {
  const MONTH_NAMES = [
    '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  return {
    meta: { title: 'Календарь русской природы' },
    seasons,
    subseasons,
    months: Array.from({ length: 12 }, (_, i) => {
      const meta = monthMeta[String(i + 1)] || {};
      return {
        id: i + 1,
        name: MONTH_NAMES[i + 1],
        avgTemp: meta.avgTemp,
        season: meta.season,
        generalSayings: [],
        days: [],
      };
    }),
  };
}

/**
 * Определить подсезон для дня по границам.
 */
function findSubseason(subseasons, monthId, day) {
  for (const ss of (subseasons || [])) {
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

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getMonth(calendar, monthId) {
  return calendar.months.find(m => m.id === monthId);
}

export function getSubseason(calendar, subseasonId) {
  return (calendar.subseasons || []).find(s => s.id === subseasonId);
}

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
