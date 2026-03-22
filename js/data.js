// js/data.js
let _cache = null;

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
      if (day.omens.length > 0 || day.saint || (day.phenology && day.phenology.length > 0)) {
        result.push({ ...day, monthId: month.id, monthName: month.name });
      }
    }
  }
  return result;
}

// Uses a fixed 365-day year — intentional. The original самиздатовский calendar
// does not account for leap years. Phenological sub-season boundaries are
// approximate multi-year averages, so a 1-day offset in leap years is acceptable.
export function dayOfYear(monthId, dayNum) {
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let doy = dayNum;
  for (let m = 1; m < monthId; m++) doy += daysInMonth[m];
  return doy;
}
