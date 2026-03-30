import { loadCalendar, loadMergedCalendar } from './data.js';
import { initSources, getActiveSourceIds, isMultiSource, getSourceInfo } from './sources.js';

let _calendar = null;
let _activeSubseason = 'all';
let _searchTimeout = null;

// ─── Инициализация ───────────────────────────────────────────────────────────

async function init() {
  const activeIds = getActiveSourceIds();
  _calendar = await loadMergedCalendar(activeIds);
  buildSubseasonFilters();
  bindEvents();
  buildStats();

  // Инициализация тогглов источников
  const sourcesContainer = document.getElementById('sources-panel');
  if (sourcesContainer) {
    await initSources(async (newIds, newMerged) => {
      _calendar = newMerged;
      buildStats();
      runSearch();
    });
  }

  // Читаем параметр ?q= из URL и подставляем в поле поиска
  const params = new URLSearchParams(window.location.search);
  if (params.has('q')) {
    document.getElementById('search-input').value = params.get('q');
  }
  runSearch();
}

function buildStats() {
  let totalOmens = 0, totalPhenology = 0;
  for (const month of _calendar.months) {
    for (const day of (month.days || [])) {
      totalOmens     += (day.omens     || []).length;
      totalPhenology += (day.phenology || []).length;
    }
  }
  document.getElementById('count-total').textContent      = `Всего записей: ${totalOmens + totalPhenology}`;
  document.getElementById('count-omens').textContent      = `Народных примет: ${totalOmens}`;
  document.getElementById('count-phenology').textContent  = `Фенологических записей: ${totalPhenology}`;
}

// ─── Построение фильтров по подсезонам ───────────────────────────────────────

function buildSubseasonFilters() {
  const container = document.getElementById('subseason-filters');
  for (const ss of (_calendar.subseasons || [])) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.subseason = ss.id;
    btn.textContent = ss.name;
    // Лёгкая цветовая подсказка из сезона (через data-атрибут для CSS)
    if (ss.season) btn.dataset.season = ss.season;
    container.appendChild(btn);
  }
}

// ─── Привязка событий ─────────────────────────────────────────────────────────

function bindEvents() {
  // Поле поиска с дебаунсом
  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(runSearch, 200);
  });

  // Кнопки-фильтры подсезонов (делегирование)
  document.getElementById('subseason-filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _activeSubseason = btn.dataset.subseason;
    runSearch();
  });
}

// ─── Основная функция поиска ──────────────────────────────────────────────────

function runSearch() {
  if (!_calendar) return;
  const query = document.getElementById('search-input').value.trim().toLowerCase();

  let results = [];

  if (query === '') {
    // Без запроса — показываем все дни с приметами
    results = getAllResults();
  } else if (isDateQuery(query)) {
    results = searchByDate(query);
  } else if (isTemperatureQuery(query)) {
    results = searchByTemperature(query);
  } else {
    results = searchByKeyword(query);
  }

  // Применяем фильтр по подсезону
  if (_activeSubseason !== 'all') {
    results = results.filter(r => r.subseason === _activeSubseason);
  }

  renderResults(results, query);
}

// ─── Определение типа запроса ─────────────────────────────────────────────────

function isDateQuery(q) {
  // "25.12", "25/12", "1 декабря", "25 дек"
  return /^\d{1,2}[./]\d{1,2}$/.test(q) ||
         /^\d{1,2}\s+[а-яё]+/.test(q);
}

function isTemperatureQuery(q) {
  // "-10", "+16", "16" — чистое число, возможно со знаком
  return /^[+-]?\d{1,3}$/.test(q);
}

// ─── Словарь названий месяцев (русский, сокращения) ──────────────────────────

const MONTH_NAMES = {
  'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'май': 5, 'маю': 5,
  'июн': 6, 'июл': 7, 'август': 8, 'сентябр': 9, 'октябр': 10,
  'ноябр': 11, 'декабр': 12,
  'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4,
  'авг': 8, 'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12
};

// ─── Парсинг даты из запроса ──────────────────────────────────────────────────

function parseDate(q) {
  // "25.12" или "25/12"
  const dotMatch = q.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (dotMatch) {
    return { day: parseInt(dotMatch[1], 10), month: parseInt(dotMatch[2], 10) };
  }

  // "1 декабря" или "25 дек"
  const textMatch = q.match(/^(\d{1,2})\s+([а-яё]+)/);
  if (textMatch) {
    const dayNum = parseInt(textMatch[1], 10);
    const monthStr = textMatch[2].toLowerCase();
    for (const [key, val] of Object.entries(MONTH_NAMES)) {
      if (monthStr.startsWith(key) || key.startsWith(monthStr.substring(0, 3))) {
        return { day: dayNum, month: val };
      }
    }
  }
  return null;
}

// ─── Поиск по дате ────────────────────────────────────────────────────────────

function searchByDate(q) {
  const parsed = parseDate(q);
  if (!parsed) return [];

  const results = [];
  for (const month of _calendar.months) {
    if (month.id !== parsed.month) continue;
    for (const day of (month.days || [])) {
      if (day.day === parsed.day) {
        results.push(makeResult(day, month));
      }
    }
    // Если точного совпадения нет — возвращаем «заглушку» месяца
    if (results.length === 0) {
      results.push({
        type: 'month',
        monthId: month.id,
        monthName: month.name,
        day: parsed.day,
        subseason: null
      });
    }
  }
  return results;
}

// ─── Поиск по температуре ─────────────────────────────────────────────────────

function searchByTemperature(q) {
  const temp = parseFloat(q);
  const results = [];
  for (const month of _calendar.months) {
    if (Math.abs(month.avgTemp - temp) < 2) { // допуск ±2°C
      for (const day of (month.days || [])) {
        if ((day.omens || []).length > 0) results.push(makeResult(day, month));
      }
    }
  }
  return results;
}

// ─── Поиск по ключевому слову ─────────────────────────────────────────────────

function searchByKeyword(q) {
  const results = [];
  const qLower = q.toLowerCase();

  for (const month of _calendar.months) {
    // Совпадение с названием месяца → все дни месяца
    const monthMatches =
      month.name.toLowerCase().includes(qLower) ||
      (month.shortName && month.shortName.toLowerCase().includes(qLower));

    if (monthMatches) {
      for (const day of (month.days || [])) {
        results.push(makeResult(day, month, null));
      }
      // Общие поговорки месяца
      for (const saying of (month.generalSayings || [])) {
        const sayingText = typeof saying === 'object' ? saying.text : saying;
        results.push({
          type: 'general',
          monthId: month.id,
          monthName: month.name,
          text: sayingText,
          source: typeof saying === 'object' ? saying.source : null,
          matchedIn: 'omen',
          subseason: null
        });
      }
      continue;
    }

    // Совпадение с общими поговорками месяца
    for (const saying of (month.generalSayings || [])) {
      const sayingText = typeof saying === 'object' ? saying.text : saying;
      if (sayingText.toLowerCase().includes(qLower)) {
        results.push({
          type: 'general',
          monthId: month.id,
          monthName: month.name,
          text: sayingText,
          source: typeof saying === 'object' ? saying.source : null,
          matchedIn: 'omen',
          subseason: null
        });
      }
    }

    // Совпадение по отдельным дням
    for (const day of (month.days || [])) {
      const matches = [];

      // Имя святого
      if (day.saint && day.saint.toLowerCase().includes(qLower)) {
        matches.push({ field: 'saint', text: day.saint });
      }

      // Алиасы (полные формы имён святых и праздников — для поиска)
      if (day.aliases) {
        for (const alias of day.aliases) {
          if (alias.toLowerCase().includes(qLower)) {
            matches.push({ field: 'alias', text: alias });
            break;
          }
        }
      }

      // Дополнительные имена святых из других источников (extraSaints)
      if (day.extraSaints) {
        for (const es of day.extraSaints) {
          if (es.name && es.name.toLowerCase().includes(qLower)) {
            matches.push({ field: 'alias', text: es.name, source: es.source });
            break;
          }
        }
      }

      // Приметы — поддержка строк и объектов {text, source}
      for (const omen of (day.omens || [])) {
        const omenText = typeof omen === 'object' ? omen.text : omen;
        if (omenText.toLowerCase().includes(qLower)) {
          matches.push({ field: 'omen', text: omenText, source: typeof omen === 'object' ? omen.source : null });
        }
      }

      // Фенология — поддержка строк и объектов {text, source}
      for (const item of (day.phenology || [])) {
        const itemText = typeof item === 'object' ? item.text : item;
        if (itemText.toLowerCase().includes(qLower)) {
          matches.push({ field: 'phenology', text: itemText, source: typeof item === 'object' ? item.source : null });
        }
      }

      // Название подсезона
      if (day.subseason) {
        const ss = (_calendar.subseasons || []).find(s => s.id === day.subseason);
        if (ss && ss.name.toLowerCase().includes(qLower)) {
          matches.push({ field: 'subseason', text: ss.name });
        }
      }

      if (matches.length > 0) {
        results.push(makeResult(day, month, matches));
      }
    }
  }
  return results;
}

// ─── Вспомогательные конструкторы результатов ────────────────────────────────

function makeResult(day, month, matches = null) {
  return {
    type: 'day',
    monthId: month.id,
    monthName: month.name,
    day: day.day,
    saint: day.saint,
    omens: day.omens || [],
    phenology: day.phenology || [],
    subseason: day.subseason || null,
    matches // массив { field, text } или null
  };
}

function getAllResults() {
  const results = [];
  for (const month of _calendar.months) {
    for (const day of (month.days || [])) {
      if ((day.omens || []).length > 0) results.push(makeResult(day, month));
    }
  }
  return results;
}

// ─── Рендер результатов ───────────────────────────────────────────────────────

function renderResults(results, query) {
  const container = document.getElementById('results');
  const countEl = document.getElementById('results-count');
  const statsBlock = document.getElementById('stats-block');
  container.innerHTML = '';

  if (query === '') {
    statsBlock.style.display = 'flex';
    countEl.style.display = 'none';
  } else {
    statsBlock.style.display = 'none';
    countEl.style.display = 'block';
  }

  if (results.length === 0 && query !== '') {
    countEl.textContent = '';
    const msg = document.createElement('div');
    msg.id = 'no-results';
    msg.textContent = `По запросу «${query}» ничего не найдено`;
    container.appendChild(msg);
    return;
  }

  if (query !== '') {
    countEl.textContent = `Найдено: ${results.length}`;
  }

  for (const result of results) {
    container.appendChild(makeResultCard(result, query));
  }
}

function makeResultCard(result, query) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.tabIndex = 0;

  // ── Карточка «общая поговорка» ──
  if (result.type === 'general') {
    const header = document.createElement('div');
    header.className = 'result-card-header';
    const monthSpan = document.createElement('span');
    monthSpan.className = 'result-date';
    monthSpan.textContent = result.monthName;
    header.appendChild(monthSpan);
    card.appendChild(header);

    const text = document.createElement('p');
    text.className = 'result-omen';
    text.innerHTML = highlightText(result.text, query);
    card.appendChild(text);
    return card;
  }

  // ── Карточка «день» ──
  const header = document.createElement('div');
  header.className = 'result-card-header';

  const dateSpan = document.createElement('span');
  dateSpan.className = 'result-date';
  dateSpan.textContent = `${result.day} ${result.monthName}`;

  const saintSpan = document.createElement('span');
  saintSpan.className = 'result-saint';
  saintSpan.textContent = result.saint || '';

  header.appendChild(dateSpan);
  header.appendChild(saintSpan);

  // Если совпадение по алиасу — показываем его мелким текстом
  if (result.matches) {
    const aliasMatch = result.matches.find(m => m.field === 'alias');
    if (aliasMatch) {
      const aliasSpan = document.createElement('span');
      aliasSpan.className = 'result-alias-hint';
      aliasSpan.innerHTML = highlightText(aliasMatch.text, query);
      header.appendChild(aliasSpan);
    }
  }

  card.appendChild(header);

  // Приметы: показываем совпавшие (если есть) или все (макс. 3)
  const omensToShow = (result.matches && result.matches.length > 0)
    ? result.omens.filter(o => result.matches.some(m => m.field === 'omen' && m.text === o))
    : result.omens;

  if (omensToShow.length > 0) {
    const list = document.createElement('ul');
    list.className = 'result-omens-list';
    for (const omen of omensToShow.slice(0, 3)) {
      const p = document.createElement('p');
      p.className = 'result-omen';
      p.innerHTML = highlightText(omen, query);
      list.appendChild(p);
    }
    card.appendChild(list);
  }

  // Фенология: показываем совпавшие (если есть) или все (макс. 3)
  const phenToShow = (result.matches && result.matches.length > 0)
    ? result.phenology.filter(p => result.matches.some(m => m.field === 'phenology' && m.text === p))
    : result.phenology;

  if (phenToShow.length > 0) {
    const phenList = document.createElement('ul');
    phenList.className = 'result-phenology-list';
    for (const item of phenToShow.slice(0, 3)) {
      const p = document.createElement('p');
      p.className = 'result-phenology';
      p.innerHTML = highlightText(item, query);
      phenList.appendChild(p);
    }
    card.appendChild(phenList);
  }

  // Бейдж подсезона
  if (result.subseason) {
    const ss = (_calendar.subseasons || []).find(s => s.id === result.subseason);
    if (ss) {
      const badge = document.createElement('div');
      badge.className = 'result-subseason';
      badge.textContent = ss.name;
      if (ss.season) badge.dataset.season = ss.season;
      card.appendChild(badge);
    }
  }

  // Клик / Enter → переход на страницу с нужным месяцем и днём
  const navigate = () => {
    window.location.href = `index.html?month=${result.monthId}&day=${result.day}`;
  };
  card.addEventListener('click', navigate);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter') navigate();
  });

  return card;
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

function highlightText(text, query) {
  if (!query || query.length < 2) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = escapeRegex(query);
  return escaped.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark>$1</mark>');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Запуск ───────────────────────────────────────────────────────────────────

init();
