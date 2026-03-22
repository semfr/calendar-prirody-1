/* ============================================================
   rotation.js — Rotate wheel to current month and highlight today
   Календарь русской природы
   ============================================================ */

/**
 * Initialize rotation: highlight current month/day and rotate wheel.
 * @param {Object} calendar — calendar data (from data.js)
 */
export function initRotation(calendar) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;  // 1-12
  const currentDay = now.getDate();          // 1-31

  highlightCurrentMonth(currentMonth);
  highlightCurrentDay(currentMonth, currentDay);
}

/**
 * Highlight the current month arc with .active class
 * @param {number} monthId — month number 1–12
 */
function highlightCurrentMonth(monthId) {
  document.querySelectorAll('.month-arc').forEach(el => {
    el.classList.remove('active');
    if (parseInt(el.dataset.month) === monthId) {
      el.classList.add('active');
    }
  });
}

/**
 * Highlight current day: mark day tick and today-dot with .today/.active classes
 * @param {number} monthId — month number 1–12
 * @param {number} dayNum — day of month 1–31
 */
function highlightCurrentDay(monthId, dayNum) {
  // Find all elements with matching [data-month][data-day], add .today class
  const selector = `[data-month="${monthId}"][data-day="${dayNum}"]`;
  document.querySelectorAll(selector).forEach(el => {
    el.classList.add('today');
  });

  // Also look for .today-dot placed by wheel.js, add .active if it matches today
  document.querySelectorAll('.today-dot').forEach(el => {
    const elMonth = parseInt(el.dataset.month);
    const elDay = parseInt(el.dataset.day);
    if (elMonth === monthId && elDay === dayNum) {
      el.classList.add('active');
    }
  });
}

