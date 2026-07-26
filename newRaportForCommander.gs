// ================================================================
// ГЕНЕРАТОР ДОПОВІДІ КОМАНДИРУ
//
// ВСІ ПЛАНИ БЕРУТЬСЯ З АРКУША "План Лог День Ніч"
//   — дата в плані = дата ФОРМУВАННЯ (знімок о 18:00)
//   — план за 19.07 "День" → застосовується 20.07 вдень
//   — план за 19.07 "Ніч"  → ніч 19.07 19:00 → 20.07 07:00
//
// Сьогодні вдень (07:00–16:00) — план: дата (today-1), зміна "День"
// Вчора вдень    (16:00–19:59) — план: дата (today-2), зміна "День"
// Сьогодні вночі (19:00–06:59) — план: дата (today-1), зміна "Ніч"
//
// Вильоти і втрати ворога — з "Лог БР"
//
// SPILLOVER (продовження зміни):
//   — у денний блок добираємо вильоти з нічного вікна < 07:00
//   — у вечірній блок добираємо вильоти з нічного вікна >= 20:00
//
// ПОСЛІДОВНІСТЬ ПОВНОЇ ДОПОВІДІ:
//   РОБОТА → ПЛАНИ НА НІЧ → ПЛАНИ НА ЗАВТРА → Neon (зона Харків)
//   → Детекції (підрахунок) → КП СОТА → КП БРАМА → КП ЕЛЕМЕНТ → КП АРКАН
//   → ВИСНОВКИ ТА ПРОБЛЕМНІ ПИТАННЯ (у самому кінці)
// ================================================================

// ── Константи ────────────────────────────────────────────────────
var DRONHO_CREWS = ["К'юбі", "Куби", "Натс"];
var IZD_POSITIONS = ["Дуб", "Санаторій"];

// Джерело плану для доповіді
var REPORT_PLAN_SOURCE_SHEET = 'План Лог День Ніч';

// Поріг (хвилин) для визначення "продовження зміни"
var SHIFT_BOUNDARY_THRESHOLD_MIN = 180; // 3 години

// Аркуші з детекціями
var FILTER_SHEET_NAME     = 'Фільтер Детекції';
var DIRECTIONS_SHEET_NAME = 'Напрямки';

// Порядок напрямків у доповіді
var DIRECTIONS_ORDER = [
  'Богодухівський',
  'Вовчанськ',
  'Старий Салтів',
  'Великий Бурлук',
  'Мілове',
  "Кам'янка",
  'Дворічна',
  'Берестове/Токарівка',
  'Купʼянськ',
  'Ягідне',
  'Харківський',
  'Запорізький'
];

// Пороги класифікації рівня детекцій
var DETECTION_LOW_MAX    = 30; // ≤ 30 — низький
var DETECTION_MEDIUM_MAX = 50; // 31–50 — середній,  > 50 — високий

// Аркуш детекцій (IMPORTRANGE "New Log")
var LOG_DETECTIONS_SHEET = 'Log Detections';

// Папка на Google Drive, куди зберігати доповіді
var REPORTS_FOLDER_NAME = 'Доповіді на командира';

// ================================================================
// БЛОК 1. БОЙОВА РОБОТА (вильоти, ураження, втрати)
// ================================================================

// ── Нормалізація АК ──────────────────────────────────────────────
function normalizeAK(ak, crewName) {
  var cn = String(crewName).toUpperCase();
  for (var i = 0; i < DRONHO_CREWS.length; i++) {
    if (cn.indexOf(DRONHO_CREWS[i].toUpperCase()) >= 0) return 'ГЕНДАЛЬФ';
  }
  var s = String(ak).trim().toUpperCase();
  if (s.indexOf('ГЕНДАЛЬФ') >= 0) return 'ГЕНДАЛЬФ';
  if (s === '16АК' || s === '16 АК' || (s.indexOf('16') >= 0 && s.indexOf('АК') >= 0)) return '16 АК';
  if (s === '17АК' || s === '17 АК' || (s.indexOf('17') >= 0 && s.indexOf('АК') >= 0)) return '17 АК';
  if (s === '10АК' || s === '10 АК' || (s.indexOf('10') >= 0 && s.indexOf('АК') >= 0)) return 'ГЕНДАЛЬФ';
  if (s === '14АК' || s === '14 АК' || (s.indexOf('14') >= 0 && s.indexOf('АК') >= 0)) return 'СОТА';
  if (s.indexOf('НГУ') >= 0) return 'СОТА';
  if (s === 'СОТА')          return 'СОТА';
  return 'СОТА';
}

function findAK(row, crewName) {
  var cn = String(crewName).toUpperCase();
  for (var i = 0; i < DRONHO_CREWS.length; i++) {
    if (cn.indexOf(DRONHO_CREWS[i].toUpperCase()) >= 0) return 'ГЕНДАЛЬФ';
  }
  var checkOrder = [36, 35, 37, 34, 38, 33, 39];
  for (var i = 0; i < checkOrder.length; i++) {
    var val = String(row[checkOrder[i]] || '').trim().toUpperCase();
    if (val === '16АК' || val === '16 АК') return '16 АК';
    if (val === '17АК' || val === '17 АК') return '17 АК';
    if (val === '20АК' || val === '20 АК') return '20 АК';
    if (val === '10АК' || val === '10 АК') return 'ГЕНДАЛЬФ';
    if (val === '14АК' || val === '14 АК') return 'СОТА';
    if (val.indexOf('НГУ') >= 0)           return 'СОТА';
    if (val === 'СОТА')                    return 'СОТА';
    if (val === 'ГЕНДАЛЬФ')                return 'ГЕНДАЛЬФ';
    if (val.indexOf('16') >= 0 && val.indexOf('АК') >= 0) return '16 АК';
    if (val.indexOf('17') >= 0 && val.indexOf('АК') >= 0) return '17 АК';
    if (val.indexOf('20') >= 0 && val.indexOf('АК') >= 0) return '20 АК';
    if (val.indexOf('10') >= 0 && val.indexOf('АК') >= 0) return 'ГЕНДАЛЬФ';
    if (val.indexOf('14') >= 0 && val.indexOf('АК') >= 0) return 'СОТА';
  }
  return 'СОТА';
}

function buildLastAKCache(brData) {
  var cache = {};
  for (var r = brData.length - 1; r >= 2; r--) {
    var row = brData[r];
    if (!row[1]) continue;
    var crew = stripDCode(row[4]);
    if (!crew) continue;
    if (cache[crew]) continue;
    cache[crew] = findAK(row, crew);
  }
  return cache;
}

// Те саме що findAK, але повертає null замість 'СОТА' якщо жодного
// валідного АК не знайдено (ігнорує "Південь" та інші некоректні значення).
function extractValidAKFromRow(row, crewName) {
  var cn = String(crewName || '').toUpperCase();
  for (var i = 0; i < DRONHO_CREWS.length; i++) {
    if (cn.indexOf(DRONHO_CREWS[i].toUpperCase()) >= 0) return 'ГЕНДАЛЬФ';
  }
  var checkOrder = [36, 35, 37, 34, 38, 33, 39];
  for (var i = 0; i < checkOrder.length; i++) {
    var val = String(row[checkOrder[i]] || '').trim().toUpperCase();
    if (!val) continue;
    if (val === '16АК' || val === '16 АК' || (val.indexOf('16') >= 0 && val.indexOf('АК') >= 0)) return '16 АК';
    if (val === '17АК' || val === '17 АК' || (val.indexOf('17') >= 0 && val.indexOf('АК') >= 0)) return '17 АК';
    if (val === '20АК' || val === '20 АК' || (val.indexOf('20') >= 0 && val.indexOf('АК') >= 0)) return '20 АК';
    if (val === '10АК' || val === '10 АК' || (val.indexOf('10') >= 0 && val.indexOf('АК') >= 0)) return 'ГЕНДАЛЬФ';
    if (val === '14АК' || val === '14 АК' || (val.indexOf('14') >= 0 && val.indexOf('АК') >= 0)) return 'СОТА';
    if (val.indexOf('НГУ') >= 0) return 'СОТА';
    if (val === 'СОТА')         return 'СОТА';
    if (val === 'ГЕНДАЛЬФ')     return 'ГЕНДАЛЬФ';
    // "Південь", "2К НГУ" та інше — пропускаємо
  }
  return null;
}

// Кеш: позиція → АК.
// Пріоритет: аркуш "Позиції АК" → перший валідний АК з рядків цієї позиції в "Лог БР".
// Сканує зверху вниз: перша поява позиції = найімовірніше коректний запис.
function buildPositionAKCache(brData) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var ws    = ss.getSheetByName('Позиції АК');
  var cache = {};

  if (ws && ws.getLastRow() > 1) {
    var rows = ws.getDataRange().getValues();
    for (var r = 1; r < rows.length; r++) {
      var pos = String(rows[r][0] || '').trim();
      var ak  = String(rows[r][1] || '').trim();
      if (pos && ak) cache[pos] = ak;
    }
  }

  // Fallback: перший валідний АК з рядків тієї позиції (ігноруємо сміттєві значення)
  for (var r = 2; r < brData.length; r++) {
    var row  = brData[r];
    if (!row[1]) continue;
    var pos  = String(row[0] || '').trim();
    var crew = String(row[4] || '').trim();
    if (!pos || cache[pos]) continue;
    var ak = extractValidAKFromRow(row, crew);
    if (ak) cache[pos] = ak;
  }

  return cache;
}

// Перевіряє "Лог БР" на нові позиції, яких немає в аркуші "Позиції АК",
// і дописує їх. Підсвічує червоним рядки без визначеного АК.
// Повертає кількість доданих позицій.
function syncPositionsAKSheet(brData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Позиції АК');
  if (!ws) {
    ws = ss.insertSheet('Позиції АК');
    ws.getRange(1, 1, 1, 2).setValues([['Позиція', 'АК']]);
    ws.getRange(1, 1, 1, 2).setFontWeight('bold');
    ws.setColumnWidth(1, 220);
    ws.setColumnWidth(2, 120);
  }

  // Читаємо вже відомі позиції
  var existing = {};
  var lastRow = ws.getLastRow();
  if (lastRow > 1) {
    var sheetData = ws.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = 0; r < sheetData.length; r++) {
      var p = String(sheetData[r][0] || '').trim();
      if (p) existing[p] = true;
    }
  }

  // Знаходимо перший валідний АК для кожної позиції з Лог БР (зверху вниз)
  var brPositionAK = {};
  for (var r = 2; r < brData.length; r++) {
    var row  = brData[r];
    if (!row[1]) continue;
    var pos  = String(row[0] || '').trim();
    var crew = String(row[4] || '').trim();
    if (!pos) continue;
    if (!(pos in brPositionAK)) brPositionAK[pos] = null;
    if (brPositionAK[pos]) continue;
    var ak = extractValidAKFromRow(row, crew);
    if (ak) brPositionAK[pos] = ak;
  }

  // Нові позиції — тих яких немає в аркуші
  var newRows = [];
  for (var pos in brPositionAK) {
    if (existing[pos]) continue;
    newRows.push([pos, brPositionAK[pos] || '']);
  }
  if (newRows.length === 0) return 0;

  newRows.sort(function(a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });

  var appendAt = ws.getLastRow() + 1;
  ws.getRange(appendAt, 1, newRows.length, 2).setValues(newRows);

  // Підсвічуємо рядки без АК одним пакетним викликом
  var bgMatrix = newRows.map(function(r) {
    var c = r[1] ? null : '#fce4ec';
    return [c, c];
  });
  ws.getRange(appendAt, 1, newRows.length, 2).setBackgrounds(bgMatrix);

  return newRows.length;
}

function getCrewType(crewName, squadType) {
  var cn = String(crewName).toUpperCase();
  var sq = String(squadType).toUpperCase();
  if (cn.indexOf('-МН') >= 0 || cn.indexOf('АРТ') >= 0 || cn.indexOf('ART') >= 0 ||
      cn.indexOf('КОРШУН') >= 0 || cn.indexOf('БАРС') >= 0) return 'МН';
  if (cn.indexOf('-АШ') >= 0 || cn.indexOf('АШ') >= 0 ||
      sq.indexOf('АНТИШАХЕД') >= 0) return 'АШ';
  if (cn.indexOf('-КН') >= 0 || cn.indexOf('КН') >= 0 ||
      cn.indexOf('ГАРПІЯ') >= 0 || cn.indexOf('МАРВЕЛ') >= 0) return 'КН';
  if (cn.indexOf('-КД') >= 0 || cn.indexOf('КД') >= 0) return 'КД';
  return 'АШ';
}

// ── Утиліти часу/дати ────────────────────────────────────────────
function rowToMinutes(val) {
  if (val instanceof Date) return val.getHours() * 60 + val.getMinutes();
  var parts = String(val).split(':');
  return parseInt(parts[0]) * 60 + (parseInt(parts[1]) || 0);
}

function fmtTime(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Europe/Kiev', 'HH:mm');
  return String(val).trim().substring(0, 5);
}

function fmtDate(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'Europe/Kiev', 'dd.MM.yyyy');
  var s = String(val).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[3] + '.' + m[2] + '.' + m[1];
  return s;
}

// Конвертує Date-об'єкти в колонці дат (idx=1) у рядки "dd.MM.yyyy" один раз.
// Після цього fmtDate повертає рядок напряму без повторних API-викликів.
function preprocessBRDates(data) {
  for (var r = 2; r < data.length; r++) {
    if (data[r][1] instanceof Date) {
      data[r][1] = Utilities.formatDate(data[r][1], 'Europe/Kiev', 'dd.MM.yyyy');
    }
  }
}

function parseDate(str) {
  if (!str) return null;
  var p = String(str).split('.');
  if (p.length < 3) return null;
  return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
}

// Зсуває дату на N днів і повертає рядок dd.MM.yyyy
function shiftDateStr(dateStr, deltaDays) {
  var d = parseDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + deltaDays);
  var dd = d.getDate(), mo = d.getMonth() + 1, y = d.getFullYear();
  return (dd < 10 ? '0' : '') + dd + '.' + (mo < 10 ? '0' : '') + mo + '.' + y;
}

// ── Перевірка чи рядок входить у вікно ───────────────────────────
function isRowInWindow(rowDate, m, dateStr1, dateStr2, fromMin, toMin) {
  if (fromMin < toMin) {
    return (rowDate === dateStr1 && m >= fromMin && m < toMin);
  } else {
    if (rowDate === dateStr1 && m >= fromMin) return true;
    if (dateStr2 && rowDate === dateStr2 && m < toMin) return true;
    return false;
  }
}

// ── Агрегація вильотів у вікні ───────────────────────────────────
function aggregateSorties(brData, dateStr1, dateStr2, fromMin, toMin) {
  var crewStats = {};

  function ensureCrew(crew, pos, ak) {
    if (!crewStats[crew]) {
      crewStats[crew] = { v: 0, u: 0, vt: 0, pos: pos, ak: ak, kills: [] };
    }
  }

  for (var r = 2; r < brData.length; r++) {
    var row = brData[r];
    if (!row[1]) continue;
    var rowDate = fmtDate(row[1]);
    var m       = rowToMinutes(row[2]);

    if (!isRowInWindow(rowDate, m, dateStr1, dateStr2, fromMin, toMin)) continue;

    var crew = stripDCode(row[4]);
    var pos  = String(row[0]).trim();
    var res  = String(row[11]).trim();
    var prob = String(row[14]).trim();
    var fn   = String(row[5]).trim();
    var t    = fmtTime(row[2]);
    var tgt  = String(row[6]).trim();
    var np   = String(row[39] || row[40] || '').trim();
    var ak   = findAK(row, crew);

    ensureCrew(crew, pos, ak);
    crewStats[crew].v++;

    var notes        = String(row[9] || '').toUpperCase();
    var isAirClosure = tgt.toUpperCase().indexOf('ЗАКРИТТЯ') >= 0 ||
                       notes.indexOf('ЗАКРИТТЯ') >= 0 ||
                       notes.indexOf('ПОВІТРЯНОГО ПРОСТОРУ') >= 0;

    var isKill = (res === 'Знищено' || res === 'Успішно' || res === 'Пошкоджено') && !isAirClosure;

    if (isKill) {
      crewStats[crew].u++;
      var killWord = (res === 'Пошкоджено') ? 'пошкоджено' : 'знищено';
      crewStats[crew].kills.push(
        fn + '-ий виліт - ' + t + ' ' + killWord + ' ' + tgt + ' р-н н.п. ' + np + '.'
      );
    }
    if (prob === 'ВТРАТА БОРТА' && !isKill) {
      crewStats[crew].vt++;
    }
  }
  return crewStats;
}

// ── Кеш найранішого вильоту в заданому вікні ─────────────────────
function buildFirstSortieTimeCache(brData, dateStr1, dateStr2, fromMin, toMin) {
  var cache = {};

  for (var r = 2; r < brData.length; r++) {
    var row = brData[r];
    if (!row[1]) continue;
    var rowDate = fmtDate(row[1]);
    var m       = rowToMinutes(row[2]);

    if (!isRowInWindow(rowDate, m, dateStr1, dateStr2, fromMin, toMin)) continue;

    var crew = stripDCode(row[4]);
    if (!crew) continue;

    var existing = cache[crew];
    if (!existing) {
      cache[crew] = { mins: m, date: rowDate };
    } else {
      var existingIsDate1 = (existing.date === dateStr1);
      var newIsDate1      = (rowDate === dateStr1);

      if (newIsDate1 && !existingIsDate1) {
        cache[crew] = { mins: m, date: rowDate };
      } else if (newIsDate1 === existingIsDate1 && m < existing.mins) {
        cache[crew] = { mins: m, date: rowDate };
      }
    }
  }
  return cache;
}

// ── Чи перший виліт близько до межі ІНШОЇ зміни? ─────────────────
function isCloseToOtherShift(firstSortie, otherShiftStartMin, windowStartDate, windowEndDate) {
  if (!firstSortie || otherShiftStartMin === undefined || otherShiftStartMin === null) return false;

  var fsAbs;
  if (windowStartDate === windowEndDate || !windowEndDate) {
    fsAbs = firstSortie.mins;
    return Math.abs(fsAbs - otherShiftStartMin) <= SHIFT_BOUNDARY_THRESHOLD_MIN;
  }

  fsAbs = (firstSortie.date === windowEndDate) ? (firstSortie.mins + 24 * 60) : firstSortie.mins;

  var oshStart = otherShiftStartMin;
  var oshEnd   = otherShiftStartMin + 24 * 60;

  return Math.min(Math.abs(fsAbs - oshStart), Math.abs(fsAbs - oshEnd))
         <= SHIFT_BOUNDARY_THRESHOLD_MIN;
}

// ── Розширення crewStats: додає вильоти "продовження зміни" ──────
function extendStatsWithBoundarySpillover(crewStats, brData,
                                          currentPlannedSet,
                                          spilloverDate1, spilloverDate2,
                                          spilloverFrom, spilloverTo,
                                          currentShiftBoundary,
                                          excludePlannedSet) {
  var spillStats = aggregateSorties(brData, spilloverDate1, spilloverDate2,
                                    spilloverFrom, spilloverTo);
  var spillFirst = buildFirstSortieTimeCache(brData, spilloverDate1, spilloverDate2,
                                             spilloverFrom, spilloverTo);

  for (var crew in spillStats) {
    if (!currentPlannedSet[crew]) continue;
    if (excludePlannedSet && excludePlannedSet[crew]) continue;
    if (!spillFirst[crew]) continue;

    if (!isCloseToOtherShift(spillFirst[crew], currentShiftBoundary,
                             spilloverDate1, spilloverDate2)) continue;

    var sd = spillStats[crew];

    if (!crewStats[crew]) {
      crewStats[crew] = { v: 0, u: 0, vt: 0, pos: sd.pos, ak: sd.ak, kills: [] };
    }
    crewStats[crew].v  += sd.v;
    crewStats[crew].u  += sd.u;
    crewStats[crew].vt += sd.vt;
    for (var k = 0; k < sd.kills.length; k++) {
      crewStats[crew].kills.push(sd.kills[k]);
    }
  }
}

// ── Кеш ротної приналежності розрахунків ─────────────────────────
// Аркуш "Розрахунки по ротам":
//   A (idx=0) — Підрозділ (ББАК / ЗЗП)
//   B (idx=1) — Рота (9 рота / 10 рота / 11 рота / Іздатіль)
//   C (idx=2) — Назва розрахунку
function buildCrewRotaCache() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var ws    = ss.getSheetByName('Розрахунки по ротам');
  var cache = {};
  if (!ws) return cache;

  var data = ws.getDataRange().getValues();
  for (var r = 0; r < data.length; r++) {
    var rota = String(data[r][1] || '').trim().toLowerCase();
    var crew = String(data[r][2] || '').trim();
    if (!crew) continue;

    var key = null;
    if (rota.indexOf('9 рота')  >= 0 || rota === '9')  key = '9';
    else if (rota.indexOf('10 рота') >= 0 || rota === '10') key = '10';
    else if (rota.indexOf('11 рота') >= 0 || rota === '11') key = '11';
    else if (rota.indexOf('іздат') >= 0 || rota.indexOf('изд') >= 0) key = 'Ізд.';

    if (key) cache[crew] = key;
  }
  return cache;
}

function normalizeCrewKey(crew) {
  return stripDCode(String(crew || '')).toUpperCase().replace(/\s+/g, ' ').trim();
}

function lookupRota(crewName, rotaCache) {
  if (!rotaCache) return null;
  if (rotaCache[crewName]) return rotaCache[crewName];

  var normTarget = normalizeCrewKey(crewName);
  for (var k in rotaCache) {
    if (normalizeCrewKey(k) === normTarget) return rotaCache[k];
  }
  return null;
}

// Групує список планів по ротам у фіксованому порядку.
// Повертає { groups: {'9':[...], '10':[...], '11':[...], 'Ізд.':[...], 'noRota':[...]}, order: [...] }
function groupPlannedByRota(planned, rotaCache) {
  var groups = { '9': [], '10': [], '11': [], 'Ізд.': [], 'noRota': [] };
  for (var i = 0; i < planned.length; i++) {
    var key = lookupRota(planned[i].crew, rotaCache) || 'noRota';
    groups[key].push(planned[i]);
  }
  return { groups: groups, order: ['9', '10', '11', 'Ізд.'] };
}

// ── Єдина логіка визначення АК розрахунку ────────────────────────
// Використовується і в блоках РОБОТА, і в підсумках по напрямкам,
// щоб АК у рядках і в підсумках завжди збігались.
// Пріоритет: довідник "Позиції АК" за позицією → останній АК розрахунку
//            (lastAKCache) → АК поточного вильоту (d.ak) → 'СОТА'.
function resolveCrewAK(pos, crew, d, positionAKCache, lastAKCache) {
  var cleanPos = stripDCode(pos);
  if (positionAKCache && cleanPos && positionAKCache[cleanPos]) return positionAKCache[cleanPos];
  if (lastAKCache && crew && lastAKCache[crew]) return lastAKCache[crew];
  if (d && d.ak) return d.ak;
  return 'СОТА';
}

// ── Побудова блоку звіту ─────────────────────────────────────────
function buildBlock(label, planned, crewStats, plannedSet, lastAKCache,
                    otherShiftPlannedSet, firstSortieCache, otherShiftStartMin,
                    windowStartDateStr, windowEndDateStr, rotaCache, positionAKCache) {
  var items = [];

  function addLine(text, opts) {
    opts = opts || {};
    items.push({ text: text, bold: opts.bold || false, color: opts.color || null,
                 italic: opts.italic || false, size: opts.size || null });
  }

  // ── Визначаємо unplanned заздалегідь (потрібно для точних totals у заголовку) ──
  var boundaries = (otherShiftStartMin instanceof Array) ? otherShiftStartMin : [otherShiftStartMin];

  var unplanned = [];
  for (var crew in crewStats) {
    if (plannedSet[crew]) continue;
    var isContinuation = false;
    if (otherShiftPlannedSet && otherShiftPlannedSet[crew] &&
        firstSortieCache && firstSortieCache[crew]) {
      for (var bi = 0; bi < boundaries.length; bi++) {
        if (isCloseToOtherShift(firstSortieCache[crew], boundaries[bi],
                                windowStartDateStr, windowEndDateStr)) {
          isContinuation = true;
          break;
        }
      }
    }
    if (!isContinuation) unplanned.push(crew);
  }

  // Totals = заплановані + поза планом (continuation не враховується)
  var totV = 0, totU = 0, totVt = 0;
  for (var p = 0; p < planned.length; p++) {
    var d = crewStats[planned[p].crew];
    if (!d) continue;
    totV += d.v; totU += d.u; totVt += d.vt;
  }
  for (var u = 0; u < unplanned.length; u++) {
    var d = crewStats[unplanned[u]];
    totV += d.v; totU += d.u; totVt += d.vt;
  }

  var totalCrews = planned.length + unplanned.length;
  addLine(label + ': вильотів - ' + totV + '; втрат - ' + totVt +
          '; уражень - ' + totU + '.', { bold: true });
  addLine(totalCrews + ' розрахунків:');
  addLine('');

  // ========== ЗАПЛАНОВАНІ РОЗРАХУНКИ (по ротам) ==========
  var grouping = groupPlannedByRota(planned, rotaCache);

  function emitPlannedLine(pl) {
    var d  = crewStats[pl.crew];
    if (!d) d = { v: 0, u: 0, vt: 0, kills: [] };
    // АК: довідник "Позиції АК" за позицією плану → lastAKCache → d.ak → СОТА
    var ak        = resolveCrewAK(pl.pos, pl.crew, d, positionAKCache, lastAKCache);
    var ctype     = getCrewType(pl.crew, pl.squad);
    var suf       = d.u > 0 ? ('; уражень ' + d.u + ':') : ('; уражень ' + d.u + '.');
    var cleanPos  = stripDCode(pl.pos);
    var cleanCrew = stripDCode(pl.crew);

    addLine('1 ' + ctype + ' (' + ak + ') - вильотів ' + d.v + '; втрат ' + d.vt +
            suf + '\t\t' + cleanCrew + ' (' + cleanPos + ')');

    for (var k = 0; k < d.kills.length; k++) {
      addLine('- ' + d.kills[k], { italic: true });
    }
  }

  for (var ri = 0; ri < grouping.order.length; ri++) {
    var key = grouping.order[ri];
    if (grouping.groups[key].length === 0) continue;
    addLine(key + ':', { bold: true });
    for (var i = 0; i < grouping.groups[key].length; i++) emitPlannedLine(grouping.groups[key][i]);
    addLine('');
  }
  if (grouping.groups.noRota.length > 0) {
    for (var i = 0; i < grouping.groups.noRota.length; i++) emitPlannedLine(grouping.groups.noRota[i]);
  }

  // ========== НЕЗАПЛАНОВАНІ РОЗРАХУНКИ ==========
  if (unplanned.length > 0) {
    addLine('');
    addLine('── Примітка: розрахунки поза планом ──', { italic: true, color: '#7f8c8d' });
    unplanned.sort();

    for (var u = 0; u < unplanned.length; u++) {
      var crew      = unplanned[u];
      var d         = crewStats[crew];
      // АК: довідник "Позиції АК" за фактичною позицією вильоту → lastAKCache → d.ak → СОТА
      var ak        = resolveCrewAK(d.pos, crew, d, positionAKCache, lastAKCache);
      var ctype     = getCrewType(crew, '');
      var suf       = d.u > 0 ? ('; уражень ' + d.u + ':') : ('; уражень ' + d.u + '.');
      var cleanPos  = stripDCode(d.pos);
      var cleanCrew = stripDCode(crew);

      addLine('1 ' + ctype + ' (' + ak + ') - вильотів ' + d.v + '; втрат ' + d.vt +
              suf + '\t\t' + cleanCrew + ' (' + cleanPos + ')');

      for (var k = 0; k < d.kills.length; k++) {
        addLine('- ' + d.kills[k], { italic: true });
      }
    }
  }

  return items;
}

// ── Підсумки по напрямкам ────────────────────────────────────────
function buildDirectionSummary(allStatsList, allPlannedList, lastAKCache, positionAKCache) {
  var zapV = 0, zapVt = 0, zapU = 0;
  var kharkV = 0, kharkVt = 0, kharkU = 0;

  for (var b = 0; b < allStatsList.length; b++) {
    var crewStats = allStatsList[b];
    var planned   = allPlannedList[b];

    for (var p = 0; p < planned.length; p++) {
      var crew = planned[p].crew;
      var d    = crewStats[crew];
      // Та сама логіка, що й у рядках блоку (resolveCrewAK за позицією плану),
      // щоб підсумки напрямків збігались з АК у рядках розрахунків.
      var ak   = resolveCrewAK(planned[p].pos, crew, d, positionAKCache, lastAKCache);
      if (!d) d = { v: 0, u: 0, vt: 0 };
      if (ak === '17 АК') {
        zapV  += d.v;
        zapVt += d.vt;
        zapU  += d.u;
      } else {
        kharkV  += d.v;
        kharkVt += d.vt;
        kharkU  += d.u;
      }
    }
  }

  var items = [];
  function addLine(text, opts) {
    opts = opts || {};
    items.push({ text: text, bold: opts.bold || false, color: opts.color || null,
                 italic: opts.italic || false, size: opts.size || null });
  }

  addLine('');
  addLine('Запорізький напрямок: вильотів ' + zapV +
          '; втрат ' + zapVt + '; уражень ' + zapU + '.', { bold: true, italic: true });
  addLine('Харківський напрямок: вильотів ' + kharkV +
          '; втрат ' + kharkVt + '; уражень ' + kharkU + '.', { bold: true, italic: true });

  return items;
}

// ── Загальні втрати противника ───────────────────────────────────
function buildEnemyLossesReport(brData) {
  var today        = new Date();
  var yesterday    = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  var todayStr     = Utilities.formatDate(today,     'Europe/Kiev', 'dd.MM.yyyy');
  var yesterdayStr = Utilities.formatDate(yesterday, 'Europe/Kiev', 'dd.MM.yyyy');

  var DIRS = ['Запорізький', 'Харківський'];
  var destroyed = { 'Запорізький': {}, 'Харківський': {} };
  var damaged   = { 'Запорізький': {}, 'Харківський': {} };

  for (var r = 2; r < brData.length; r++) {
    var row = brData[r];
    if (!row[1]) continue;

    var rowDate = fmtDate(row[1]);
    var m       = rowToMinutes(row[2]);
    var res     = String(row[11]).trim();
    var tgt     = String(row[6]).trim();
    var notes   = String(row[9] || '').toUpperCase();

    var inWindow = false;
    if (rowDate === yesterdayStr && m >= 16 * 60) inWindow = true;
    if (rowDate === todayStr     && m <  16 * 60) inWindow = true;
    if (!inWindow) continue;

    if (res === 'Тест' || res === 'Неуспішно') continue;
    var isAirClosure = tgt.toUpperCase().indexOf('ЗАКРИТТЯ') >= 0 ||
                       notes.indexOf('ЗАКРИТТЯ') >= 0 ||
                       notes.indexOf('ПОВІТРЯНОГО ПРОСТОРУ') >= 0;
    if (isAirClosure) continue;
    if (!tgt) continue;

    var pos = String(row[0] || '').trim().toUpperCase();
    var ak  = findAK(row, String(row[4] || ''));
    var dir;
    if (ak === '17 АК' || ak === '20 АК') {
      dir = 'Запорізький';
    } else {
      // Усе інше (зокрема колишній "Сумський" — позиції "НАФТА") → Харківський
      dir = 'Харківський';
    }

    if (res === 'Знищено' || res === 'Успішно') {
      destroyed[dir][tgt] = (destroyed[dir][tgt] || 0) + 1;
    } else if (res === 'Пошкоджено') {
      damaged[dir][tgt] = (damaged[dir][tgt] || 0) + 1;
    }
  }

  var items = [];
  function addLine(text, opts) {
    opts = opts || {};
    items.push({ text: text, bold: opts.bold || false, color: opts.color || null,
                 italic: opts.italic || false, size: opts.size || null });
  }

  var hasAny = false;
  for (var d = 0; d < DIRS.length; d++) {
    if (Object.keys(destroyed[DIRS[d]]).length > 0 || Object.keys(damaged[DIRS[d]]).length > 0) {
      hasAny = true;
      break;
    }
  }
  if (!hasAny) return items;

  addLine('');
  addLine('Загальні втрати противника за звітній період:', { bold: true });

  for (var d = 0; d < DIRS.length; d++) {
    var dir = DIRS[d];
    var dKeys = Object.keys(destroyed[dir]).sort(function(a, b) { return destroyed[dir][b] - destroyed[dir][a]; });
    var mKeys = Object.keys(damaged[dir]).sort(function(a, b) { return damaged[dir][b] - damaged[dir][a]; });
    if (dKeys.length === 0 && mKeys.length === 0) continue;

    addLine(dir + ' напрямок:', { bold: true });
    for (var i = 0; i < dKeys.length; i++) {
      addLine('     Знищено ' + dKeys[i] + ' - ' + destroyed[dir][dKeys[i]] + ' од.', { italic: true });
    }
    for (var i = 0; i < mKeys.length; i++) {
      addLine('     Пошкоджено ' + mKeys[i] + ' - ' + damaged[dir][mKeys[i]] + ' од.', { italic: true });
    }
  }

  return items;
}


// ================================================================
// БЛОК 2. КП (СОТА / БРАМА / ЕЛЕМЕНТ / АРКАН)
// ================================================================


// ── Конфіг джерел КП ─────────────────────────────────────────────
// Кожен КП: { sheet, dateCol, resultCol, lossCol, sectorCol, sectors }
//   dateCol/resultCol/lossCol/sectorCol — 0-based індекси колонок.
//   lossCol   — колонка статусу борта ("Борт втрачено"). Якщо втрата
//               позначається прямо в колонці результату (як у "Брама лог":
//               "Не уражено - Борт втрачено") → lossCol: null.
//   sectorCol=null    → весь аркуш = один КП (фільтр по сектору не потрібен).
//   sectors           → токени, що мають міститись у колонці "Сектор" цього КП
//                       (порівняння: без лапок, регістронезалежно, "містить").
//
// УВАГА: СОТА/АРКАН/ЕЛЕМЕНТ/АТЛАС-16 читаються з одного аркуша "Сота Лог"
//   (дата = кол. N = 13, результат = кол. O = 14, статус борта = кол. Q = 16,
//    сектор = кол. A = 0), розділяються за колонкою "Сектор".
//   Кожен КП = свій сектор ПУ (СОТА / АРКАН / ЕЛЕМЕНТ / АТЛАС-16). БРАМА окремо.
var KP_CONFIG = {
  'СОТА':     { sheet: 'Сота Лог',      dateCol: 13, resultCol: 14, lossCol: 16,   sectorCol: 0,    sectors: ['СОТА']     },
  'АРКАН':    { sheet: 'Сота Лог',      dateCol: 13, resultCol: 14, lossCol: 16,   sectorCol: 0,    sectors: ['АРКАН']    },
  'ЕЛЕМЕНТ':  { sheet: 'Сота Лог',      dateCol: 13, resultCol: 14, lossCol: 16,   sectorCol: 0,    sectors: ['ЕЛЕМЕНТ']  },
  'АТЛАС-16': { sheet: 'Сота Лог',      dateCol: 13, resultCol: 14, lossCol: 16,   sectorCol: 0,    sectors: ['АТЛАС-16'] },
  'БРАМА':    { sheet: 'Фільтер Брама', dateCol: 1,  resultCol: 12, lossCol: null, sectorCol: null, sectors: null        }
};

// Нормалізує значення сектора: прибирає лапки/nbsp, стискає пробіли, верхній регістр.
function normalizeSector(v) {
  return String(v || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[«»""'']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

// Робастний парсер дати/часу для аркушів КП.
// Підтримує: Date-об'єкт; серійне число; "dd.MM.yyyy HH:mm:ss";
//            "dd.MM.yyyy, HH:mm" (кома-роздільник, як у "Сота Лог"); лише дату.
function parseKPDateTime(val) {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    if (val > 1 && val < 100000) return new Date(Math.round((val - 25569) * 86400 * 1000));
    return null;
  }
  var s = String(val).trim();
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Визначає втрату борта за значенням клітинки.
// Ловить обидві основи: "втрачено" (ВТРАЧ) і "втрата" (ВТРАТ), стійко до nbsp.
function isLossValue(v) {
  var up = String(v || '').replace(/\u00A0/g, ' ').toUpperCase();
  return up.indexOf('ВТРАЧ') >= 0 || up.indexOf('ВТРАТ') >= 0;
}

// Класифікує значення результату КП (БЕЗ втрат — вони рахуються окремо
// через isLossValue за колонкою lossCol/resultCol).
// Стійко до nbsp/зайвих пробілів і варіацій формулювання (пошук за основою,
// а не точний збіг). "НЕ УРАЖЕНО" перевіряється ПЕРШИМ, бо містить "УРАЖЕНО".
//   "kill" — ураження; "failed" — не уражено;
//   "other" — інше (напр. "Успішне патрулювання") → рахується як виліт, але
//             не входить в ураження/втрати/неуспішно.
function classifyKPResult(result) {
  var up = String(result || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!up) return 'other';
  if (up.indexOf('НЕ УРАЖЕНО') >= 0) return 'failed';
  if (up.indexOf('ЗНИЩЕНО')   >= 0 ||
      up.indexOf('ПОШКОДЖЕНО') >= 0 ||
      up.indexOf('УРАЖЕНО')    >= 0 ||
      up === 'УСПІШНО') return 'kill';
  return 'other';   // "Успішне патрулювання" тощо
}

function buildKPSummary(kpLabel) {
  var items = [];
  function addLine(text, opts) {
    opts = opts || {};
    items.push({ text: text, bold: opts.bold || false, color: opts.color || null,
                 italic: opts.italic || false, size: opts.size || null });
  }

  var cfg = KP_CONFIG[kpLabel];
  if (!cfg) return items;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(cfg.sheet);
  if (!ws) return items;

  var now      = new Date();
  var todayStr = Utilities.formatDate(now, 'Europe/Kiev', 'dd.MM.yyyy');
  var yest     = new Date(now);
  yest.setDate(yest.getDate() - 1);
  var yestStr  = Utilities.formatDate(yest, 'Europe/Kiev', 'dd.MM.yyyy');

  var fromTs = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 16, 0, 0).getTime();
  var toTs   = new Date(now.getFullYear(),  now.getMonth(),  now.getDate(),  16, 0, 0).getTime();

  // Токени сектора (нормалізовані) — якщо кілька КП в одному аркуші
  var sectorTokens = null;
  if (cfg.sectorCol !== null && cfg.sectorCol !== undefined && cfg.sectors && cfg.sectors.length) {
    sectorTokens = cfg.sectors.map(function(t) { return normalizeSector(t); });
  }

  var data = ws.getDataRange().getValues();

  var totalSorties = 0, totalKills = 0, totalLosses = 0;

  for (var r = 0; r < data.length; r++) {
    var row = data[r];

    // Фільтр по сектору
    if (sectorTokens) {
      var sec = normalizeSector(row[cfg.sectorCol]);
      var match = false;
      for (var t = 0; t < sectorTokens.length; t++) {
        if (sec.indexOf(sectorTokens[t]) >= 0) { match = true; break; }
      }
      if (!match) continue;
    }

    var dt = parseKPDateTime(row[cfg.dateCol]);
    if (!dt) continue;
    var ts = dt.getTime();
    if (ts < fromTs || ts >= toTs) continue;

    totalSorties++;

    var cls = classifyKPResult(row[cfg.resultCol]);
    var hasLossCol = (cfg.lossCol !== null && cfg.lossCol !== undefined);
    var isLoss = hasLossCol ? isLossValue(row[cfg.lossCol]) : isLossValue(row[cfg.resultCol]);

    // Кожен виліт рахується РІВНО ОДИН РАЗ, з пріоритетом УРАЖЕННЯ над втратою:
    //   "Знищено" (навіть з втраченим бортом) → ураження (камікадзе/перехоплення);
    //   інакше "Борт втрачено" → втрата;
    //   решта (Не уражено / патрулювання / Не встановлено) → неуспішно (через віднімання).
    if (cls === 'kill') {
      totalKills++;
    } else if (isLoss) {
      totalLosses++;
    }
  }

  // Неуспішно = все, що не ураження і не втрата (гарантовано ≥ 0).
  var totalFailed = totalSorties - totalKills - totalLosses;

  addLine('');
  addLine('КП ' + kpLabel, { bold: true });
  addLine('За період ' + yestStr + ' 16:00:00 - ' + todayStr + ' 16:00:00:');
  addLine('');
  addLine('* Здійснили: вильотів - ' + totalSorties +
          ', уражень - ' + totalKills +
          ', втрат - ' + totalLosses +
          ', неуспішно - ' + totalFailed + '.');

  return items;
}

// ================================================================
// БЛОК 2.5. ДОПОВІДЬ ПО АРКУШУ "Неон"
// (КП СОТА — деталізація по розрахунках, цілях, причинах неураження)
// ================================================================

// Колонки аркуша "Неон":
//   A(0)=Розрахунок  B(1)=Дата+час   D(3)=БпЛА    E(4)=Тип цілі
//   F(5)=Номер цілі  M(12)=Результат вильоту
//   Q(16)=Основна причина неураження
//
// ВАЖЛИВО:
//   "Зайшло N цілей" — це кількість УНІКАЛЬНИХ номерів цілей
//   "Тип(N)" та "Розрахунок(N)" — це кількість ВИЛЬОТІВ
//   Один номер цілі може мати кілька вильотів від різних розрахунків

// Парсить значення комірки: Date-об'єкт або рядок "DD.MM.YYYY HH:MM:SS"
function parseSheetDateTime(val) {
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  var s = String(val || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6]||0), 0);
  return null;
}

function buildNeonReport() {
  var items = [];
  function addLine(text, opts) {
    opts = opts || {};
    items.push({ text: text, bold: opts.bold || false, color: opts.color || null,
                 italic: opts.italic || false, size: opts.size || null });
  }

  // Період рахується автоматично: вчора 16:00 → сьогодні 16:00 (звітна доба).
  // Дані з аркуша "Неон" наразі НЕ беруться — заповнюються вручну.
  var now  = new Date();
  var yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  var fromDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 16, 0, 0);
  var toDate   = new Date(now.getFullYear(),  now.getMonth(),  now.getDate(),  16, 0, 0);

  var fromLabel = Utilities.formatDate(fromDate, 'Europe/Kiev', 'dd.MM.yyyy HH:mm:ss');
  var toLabel   = Utilities.formatDate(toDate,   'Europe/Kiev', 'dd.MM.yyyy HH:mm:ss');

  addLine('');
  addLine('За період ' + fromLabel + ' - ' + toLabel +
          ' в зоні міста Харків зафіксовано:', { bold: true });
  addLine('');  // порожній рядок для ручного заповнення

  return items;
}

// Плюралізація слова "ціль" згідно української граматики
function pluralizeTarget(n) {
  var n100 = n % 100;
  var n10  = n % 10;
  if (n100 >= 11 && n100 <= 14) return 'цілей';
  if (n10 === 1) return 'ціль';
  if (n10 >= 2 && n10 <= 4) return 'цілі';
  return 'цілей';
}

// Форматує об'єкт причин у "Причина1, Причина2(N)"
// Якщо причина зустрічається 1 раз — без числа в дужках
// Якщо більше 1 разу — з числом: "Ціль зайшла на удар(2)"
function formatReasons(reasonsMap) {
  var keys = Object.keys(reasonsMap);
  if (keys.length === 0) return 'Не вказано';
  // Сортування: спочатку найчастіші
  keys.sort(function(a, b) { return reasonsMap[b] - reasonsMap[a]; });
  return keys.map(function(k) {
    var n = reasonsMap[k];
    return n > 1 ? (k + '(' + n + ')') : k;
  }).join(', ');
}

function buildSotaKPSummary()    { return buildKPSummary('СОТА');    }
function buildBramaKPSummary()   { return buildKPSummary('БРАМА');   }
function buildElementKPSummary() { return buildKPSummary('ЕЛЕМЕНТ'); }
function buildBastionKPSummary() { return buildKPSummary('БАСТІОН'); }
function buildArkanKPSummary()   { return buildKPSummary('АРКАН');   }
function buildAtlasKPSummary()   { return buildKPSummary('АТЛАС-16'); }

function parseSotaDate(val) {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    if (val > 1 && val < 100000) {
      return new Date(Math.round((val - 25569) * 86400 * 1000));
    }
    return null;
  }
  var s = String(val).trim();
  if (!s) return null;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function debugKPSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ['Сота Лог', 'Брама лог', 'Фільтер Брама'];

  var debugWs = ss.getSheetByName('DEBUG КП');
  if (!debugWs) debugWs = ss.insertSheet('DEBUG КП');
  debugWs.clearContents();
  debugWs.clearFormats();

  var output = [];
  output.push(['Аркуш', 'Інфо', 'Деталі']);

  sheets.forEach(function(name) {
    var ws = ss.getSheetByName(name);
    if (!ws) {
      output.push([name, '❌ НЕ ЗНАЙДЕНО', '']);
      return;
    }

    var data = ws.getDataRange().getValues();
    output.push([name, 'Всього рядків', data.length]);
    output.push([name, 'Колонок', data[0] ? data[0].length : 0]);

    // Заголовки
    if (data[0]) {
      for (var c = 0; c < data[0].length; c++) {
        output.push([name, 'Заголовок idx=' + c + ' (' + columnIndexToLetter(c) + ')',
                     formatCellValue(data[0][c])]);
      }
    }

    // Перші 3 рядки даних — повний дамп
    for (var r = 1; r <= Math.min(3, data.length - 1); r++) {
      output.push([name, '── Рядок ' + (r + 1) + ' ──', '']);
      for (var c = 0; c < data[r].length; c++) {
        output.push([name, 'idx=' + c + ' (' + columnIndexToLetter(c) + ')',
                     formatCellValue(data[r][c])]);
      }
    }

    // Унікальні значення колонки B (дата) — типи
    var bTypes = {};
    var bExamples = {};
    var bParsedOk = 0;
    var bParsedFail = 0;
    for (var r = 1; r < data.length; r++) {
      var v = data[r][1];
      var t = (v instanceof Date) ? 'Date' : (typeof v);
      if (v === '' || v === null || v === undefined) t = 'empty';
      bTypes[t] = (bTypes[t] || 0) + 1;
      if (!bExamples[t]) bExamples[t] = formatCellValue(v);

      if (t !== 'empty') {
        var parsed = parseSotaDate(v);
        if (parsed) bParsedOk++;
        else        bParsedFail++;
      }
    }
    output.push([name, '── Колонка B (дата) ──', '']);
    Object.keys(bTypes).forEach(function(t) {
      output.push([name, 'тип "' + t + '"', bTypes[t] + ' шт. | приклад: ' + bExamples[t]]);
    });
    output.push([name, 'parseSotaDate OK',   bParsedOk]);
    output.push([name, 'parseSotaDate FAIL', bParsedFail]);

    // Унікальні значення колонки M (результат)
    var mCounts = {};
    for (var r = 1; r < data.length; r++) {
      var v = String(data[r][12] || '').trim();
      if (!v) v = '(порожньо)';
      mCounts[v] = (mCounts[v] || 0) + 1;
    }
    output.push([name, '── Колонка M (результат) ──', '']);
    Object.keys(mCounts).sort().forEach(function(k) {
      output.push([name, '"' + k + '"', mCounts[k]]);
    });

    output.push([name, '', '']);
  });

  debugWs.getRange(1, 1, output.length, 3).setValues(output);
  debugWs.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#fff2cc');
  debugWs.setFrozenRows(1);
  for (var c = 1; c <= 3; c++) debugWs.autoResizeColumn(c);

  SpreadsheetApp.getUi().alert('✅ Готово! Дивись аркуш "DEBUG КП".');
}


// ================================================================
// БЛОК 3. ЗАПИС У АРКУШ "Доповідь"
// ================================================================

function writeItems(ws, items, startRow) {
  if (!items || items.length === 0) return startRow;

  var n      = items.length;
  var vals   = [];
  var bolds  = [];
  var styles = [];
  var colors = [];
  var sizes  = [];
  var hasSizes = false;

  for (var i = 0; i < n; i++) {
    var it = items[i];
    vals.push([it.text != null ? it.text : '']);
    bolds.push([it.bold   ? 'bold'   : 'normal']);
    styles.push([it.italic ? 'italic' : 'normal']);
    colors.push([it.color  || '#000000']);
    if (it.size) { sizes.push([it.size]); hasSizes = true; }
    else           sizes.push([10]);
  }

  var rng = ws.getRange(startRow, 1, n, 1);
  rng.setValues(vals);
  rng.setFontWeights(bolds);
  rng.setFontStyles(styles);
  rng.setFontColors(colors);
  if (hasSizes) rng.setFontSizes(sizes);

  return startRow + n;
}

function getOrCreateSheet(ss, name) {
  var ws = ss.getSheetByName(name);
  if (!ws) ws = ss.insertSheet(name);
  return ws;
}

function stripDCode(str) {
  return String(str || '')
    .replace(/\u00A0/g, ' ')            // nbsp → звичайний пробіл
    .trim()
    .replace(/^[ДдDd]\s*\d+\s*/, '')    // Д-код: Д/D + цифри (напр. "Д1107 " або "D 12")
    .replace(/\s+/g, ' ')               // множинні пробіли → один
    .trim();
}

// ================================================================
// БЛОК 4. ГЕНЕРАТОРИ ЗВІТІВ (день / вечір / ніч / повний)
// ================================================================

// ── ДЕННИЙ БЛОК (07:00–16:00, сьогодні) ─────────────────────────
function generateDayReport() {
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var today    = new Date();
  var todayStr = Utilities.formatDate(today, 'Europe/Kiev', 'dd.MM.yyyy');

  var wsLog   = ss.getSheetByName(REPORT_PLAN_SOURCE_SHEET);
  var wsLogBR = ss.getSheetByName('Лог БР');
  if (!wsLog)   { SpreadsheetApp.getUi().alert('Аркуш "' + REPORT_PLAN_SOURCE_SHEET + '" не знайдено!'); return; }
  if (!wsLogBR) { SpreadsheetApp.getUi().alert('Аркуш "Лог БР" не знайдено!'); return; }

  var brData = wsLogBR.getDataRange().getValues();
  preprocessBRDates(brData);

  var logData = wsLog.getDataRange().getValues();

  // План на "сьогодні вдень" сформовано вчора → дата (today-1), зміна "День"
  var yestStr    = shiftDateStr(todayStr, -1);
  var planned    = getPlanned(logData, yestStr, 'день');
  var plannedSet = makePlannedSet(planned);

  var nightPlannedSet = makePlannedSet(getPlanned(logData, yestStr, 'ніч'));

  var crewStats   = aggregateSorties(brData, todayStr, null, 7 * 60, 16 * 60);
  var lastAKCache = buildLastAKCache(brData);
  var rotaCache   = buildCrewRotaCache();
  var positionAKCache = buildPositionAKCache(brData);

  // SPILLOVER: ранкові вильоти 00:00–07:00 для денних розрахунків
  extendStatsWithBoundarySpillover(
    crewStats, brData, plannedSet,
    todayStr, null, 0, 7 * 60, 7 * 60,
    nightPlannedSet
  );

  var firstSortieCache = buildFirstSortieTimeCache(brData, todayStr, null, 7 * 60, 16 * 60);

  var wsDop = getOrCreateSheet(ss, 'Доповідь');
  wsDop.clearContents();
  wsDop.clearFormats();
  wsDop.setColumnWidth(1, 900);

  var row = 1;
  row = writeItems(wsDop,
    [{ text: 'РОБОТА (' + todayStr + ')', bold: true, size: 13 }], row);
  row = writeItems(wsDop,
    buildBlock('Сьогодні вдень (07:00-16:00)', planned, crewStats, plannedSet, lastAKCache,
               nightPlannedSet, firstSortieCache, 7 * 60, todayStr, todayStr, rotaCache, positionAKCache), row);
  row = writeItems(wsDop, buildDirectionSummary([crewStats], [planned], lastAKCache, positionAKCache), row);
  row = writeItems(wsDop, buildEnemyLossesReport(brData), row);
  row = writeItems(wsDop, buildSotaKPSummary(),    row);
  row = writeItems(wsDop, buildNeonReport(),       row);
  row = writeItems(wsDop, buildBramaKPSummary(),   row);
  row = writeItems(wsDop, buildElementKPSummary(), row);
  row = writeItems(wsDop, buildArkanKPSummary(),   row);
  row = writeItems(wsDop, buildAtlasKPSummary(),   row);

  SpreadsheetApp.getUi().alert('✅ Денний блок за ' + todayStr + ' готовий!');
}

// ── ВЕЧІРНІЙ БЛОК (16:00–19:59, вчора) ──────────────────────────
function generateEveningReport() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var today     = new Date();
  var yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  var reportDate = Utilities.formatDate(today,     'Europe/Kiev', 'dd.MM.yyyy');
  var dataDate   = Utilities.formatDate(yesterday, 'Europe/Kiev', 'dd.MM.yyyy');

  var wsLog   = ss.getSheetByName(REPORT_PLAN_SOURCE_SHEET);
  var wsLogBR = ss.getSheetByName('Лог БР');
  if (!wsLog)   { SpreadsheetApp.getUi().alert('Аркуш "' + REPORT_PLAN_SOURCE_SHEET + '" не знайдено!'); return; }
  if (!wsLogBR) { SpreadsheetApp.getUi().alert('Аркуш "Лог БР" не знайдено!'); return; }

  var brData = wsLogBR.getDataRange().getValues();
  preprocessBRDates(brData);

  var logData = wsLog.getDataRange().getValues();

  // Вчорашній денний план сформовано позавчора → дата (today-2), зміна "День"
  var planDate        = shiftDateStr(dataDate, -1);
  var planned         = getPlanned(logData, planDate, 'день');
  var plannedSet      = makePlannedSet(planned);
  var nightPlannedSet = makePlannedSet(getPlanned(logData, planDate, 'ніч'));

  var crewStats   = aggregateSorties(brData, dataDate, null, 16 * 60, 19 * 60);
  var lastAKCache = buildLastAKCache(brData);
  var rotaCache   = buildCrewRotaCache();
  var positionAKCache = buildPositionAKCache(brData);

  // SPILLOVER: пізні вильоти 20:00–24:00 для денних розрахунків
  extendStatsWithBoundarySpillover(
    crewStats, brData, plannedSet,
    dataDate, null, 20 * 60, 24 * 60, 19 * 60,
    nightPlannedSet
  );

  var firstSortieCache = buildFirstSortieTimeCache(brData, dataDate, null, 16 * 60, 19 * 60);

  var wsDop = getOrCreateSheet(ss, 'Доповідь');
  wsDop.clearContents();
  wsDop.clearFormats();
  wsDop.setColumnWidth(1, 900);

  var row = 1;
  row = writeItems(wsDop,
    [{ text: 'РОБОТА (' + reportDate + ')', bold: true, size: 13 }], row);
  row = writeItems(wsDop,
    buildBlock('Вчора вдень допрацьовували (16:00-19:00)', planned, crewStats, plannedSet, lastAKCache,
               nightPlannedSet, firstSortieCache, 19 * 60, dataDate, dataDate, rotaCache, positionAKCache), row);
  row = writeItems(wsDop, buildDirectionSummary([crewStats], [planned], lastAKCache, positionAKCache), row);
  row = writeItems(wsDop, buildEnemyLossesReport(brData), row);
  row = writeItems(wsDop, buildSotaKPSummary(),    row);
  row = writeItems(wsDop, buildBramaKPSummary(),   row);
  row = writeItems(wsDop, buildElementKPSummary(), row);
  row = writeItems(wsDop, buildArkanKPSummary(),   row);
  row = writeItems(wsDop, buildAtlasKPSummary(),   row);

  SpreadsheetApp.getUi().alert('✅ Вечірній блок за ' + dataDate + ' готовий!');
}

// ── НІЧНИЙ БЛОК (19:00–06:59, вчора→сьогодні) ───────────────────
function generateNightReport() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var today     = new Date();
  var yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  var reportDate = Utilities.formatDate(today,     'Europe/Kiev', 'dd.MM.yyyy');
  var dataDate   = Utilities.formatDate(yesterday, 'Europe/Kiev', 'dd.MM.yyyy');

  var wsLog   = ss.getSheetByName(REPORT_PLAN_SOURCE_SHEET);
  var wsLogBR = ss.getSheetByName('Лог БР');
  if (!wsLog)   { SpreadsheetApp.getUi().alert('Аркуш "' + REPORT_PLAN_SOURCE_SHEET + '" не знайдено!'); return; }
  if (!wsLogBR) { SpreadsheetApp.getUi().alert('Аркуш "Лог БР" не знайдено!'); return; }

  var brData  = wsLogBR.getDataRange().getValues();
  preprocessBRDates(brData);
  var logData = wsLog.getDataRange().getValues();

  // Нічний план сформовано вчора о 18:00 → дата (today-1), зміна "Ніч"
  var planned    = getPlanned(logData, dataDate, 'ніч');
  var plannedSet = makePlannedSet(planned);

  // Об'єднаний денний план: сьогоднішній (сформовано вчора) + вчорашній (сформовано позавчора)
  var dayPlannedSet   = {};
  var dayTodayPlanned = getPlanned(logData, dataDate,                   'день');
  var dayYestPlanned  = getPlanned(logData, shiftDateStr(dataDate, -1), 'день');
  for (var i = 0; i < dayTodayPlanned.length; i++) dayPlannedSet[dayTodayPlanned[i].crew] = true;
  for (var i = 0; i < dayYestPlanned.length;  i++) dayPlannedSet[dayYestPlanned[i].crew]  = true;

  var crewStats        = aggregateSorties(brData, dataDate, reportDate, 19 * 60, 7 * 60);
  var lastAKCache      = buildLastAKCache(brData);
  var rotaCache        = buildCrewRotaCache();
  var positionAKCache  = buildPositionAKCache(brData);

  // SPILLOVER: ранні вильоти 16:00–19:00 вчора для нічних розрахунків,
  // які почали працювати раніше офіційного старту нічної зміни.
  // Виключаємо тих, хто є у вчорашньому денному плані (= вечірня зміна),
  // щоб їхні вильоти 16-19 не подвоїти.
  var eveningPlannedSet = makePlannedSet(dayYestPlanned);
  extendStatsWithBoundarySpillover(
    crewStats, brData, plannedSet,
    dataDate, null, 16 * 60, 19 * 60, 19 * 60,
    eveningPlannedSet
  );

  var firstSortieCache = buildFirstSortieTimeCache(brData, dataDate, reportDate, 19 * 60, 7 * 60);

  var wsDop = getOrCreateSheet(ss, 'Доповідь');
  wsDop.clearContents();
  wsDop.clearFormats();
  wsDop.setColumnWidth(1, 900);

  var row = 1;
  row = writeItems(wsDop,
    [{ text: 'РОБОТА (' + reportDate + ')', bold: true, size: 13 }], row);
  row = writeItems(wsDop,
    buildBlock('Сьогодні вночі (19:00-07:00)', planned, crewStats, plannedSet, lastAKCache,
               dayPlannedSet, firstSortieCache, [19 * 60, 7 * 60], dataDate, reportDate, rotaCache, positionAKCache), row);
  row = writeItems(wsDop, buildDirectionSummary([crewStats], [planned], lastAKCache, positionAKCache), row);
  row = writeItems(wsDop, buildEnemyLossesReport(brData), row);
  row = writeItems(wsDop, buildSotaKPSummary(),    row);
  row = writeItems(wsDop, buildBramaKPSummary(),   row);
  row = writeItems(wsDop, buildElementKPSummary(), row);
  row = writeItems(wsDop, buildArkanKPSummary(),   row);
  row = writeItems(wsDop, buildAtlasKPSummary(),   row);

  SpreadsheetApp.getUi().alert('✅ Нічний блок за ' + dataDate + '→' + reportDate + ' готовий!');
}

// ── ПОВНА ДОПОВІДЬ (вечір + ніч + день) ─────────────────────────
// ПОСЛІДОВНІСТЬ: РОБОТА → ПЛАНИ НА НІЧ → ПЛАНИ НА ЗАВТРА → Neon
//   → Детекції (підрахунок) → КП СОТА/БРАМА/ЕЛЕМЕНТ/АРКАН → ВИСНОВКИ
function generateFullReport() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var today     = new Date();
  var yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  var todayStr   = Utilities.formatDate(today,     'Europe/Kiev', 'dd.MM.yyyy');
  var reportDate = todayStr;
  var dataDate   = Utilities.formatDate(yesterday, 'Europe/Kiev', 'dd.MM.yyyy');

  var wsLog   = ss.getSheetByName(REPORT_PLAN_SOURCE_SHEET);
  var wsLogBR = ss.getSheetByName('Лог БР');
  if (!wsLog)   { SpreadsheetApp.getUi().alert('Аркуш "' + REPORT_PLAN_SOURCE_SHEET + '" не знайдено!'); return; }
  if (!wsLogBR) { SpreadsheetApp.getUi().alert('Аркуш "Лог БР" не знайдено!'); return; }

  var brData         = wsLogBR.getDataRange().getValues();
  preprocessBRDates(brData);
  var lastAKCache    = buildLastAKCache(brData);

  var newPos = syncPositionsAKSheet(brData);
  if (newPos > 0) {
    SpreadsheetApp.getUi().alert(
      '⚠️ Додано ' + newPos + ' нових позицій до аркуша "Позиції АК".\n' +
      'Рядки без АК підсвічені червоним — заповніть вручну.\n\n' +
      'Доповідь буде згенерована зараз. Після перегляду оновіть аркуш і перегенеруйте.'
    );
  }

  var positionAKCache = buildPositionAKCache(brData);
  var rotaCache       = buildCrewRotaCache();

  // Читаємо план один раз — передаємо масив у всі getPlanned виклики
  var logData = wsLog.getDataRange().getValues();

  // Усі плани доби
  // Дата в "План Лог День Ніч" = дата формування (знімок о 18:00), а не виконання:
  //   "19.07 День" сформовано 19.07 → застосовується 20.07 вдень (today-1)
  //   "19.07 Ніч"  сформовано 19.07 → ніч 19→20.07 (today-1)
  //   "18.07 День" сформовано 18.07 → застосовується 19.07 вдень (today-2)
  var dayPlanned    = getPlanned(logData, dataDate,                   'день');
  var dayPlannedSet = makePlannedSet(dayPlanned);

  var evPlanned    = getPlanned(logData, shiftDateStr(dataDate, -1), 'день');
  var evPlannedSet = makePlannedSet(evPlanned);

  var nPlanned    = getPlanned(logData, dataDate, 'ніч');
  var nPlannedSet = makePlannedSet(nPlanned);

  // Нічний план що передував денному (для spillover ранкових вильотів)
  var prevNightDate       = shiftDateStr(dataDate, -1);
  var prevNightPlannedSet = makePlannedSet(getPlanned(logData, prevNightDate, 'ніч'));

  // Об'єднаний денний план для нічного блоку
  var allDayPlannedSet = {};
  for (var k in dayPlannedSet) allDayPlannedSet[k] = true;
  for (var k in evPlannedSet)  allDayPlannedSet[k] = true;

  // Статистика по вікнах
  var dayStats = aggregateSorties(brData, todayStr, null,       7 * 60,  16 * 60);
  var evStats  = aggregateSorties(brData, dataDate, null,       16 * 60, 19 * 60);
  var nStats   = aggregateSorties(brData, dataDate, reportDate, 19 * 60, 7 * 60);

  // SPILLOVER для денного — ранкові вильоти (00:00–07:00 сьогодні)
  extendStatsWithBoundarySpillover(
    dayStats, brData, dayPlannedSet,
    todayStr, null, 0, 7 * 60, 7 * 60,
    prevNightPlannedSet
  );

  // SPILLOVER для вечірнього — пізні вильоти (20:00–23:59 вчора)
  extendStatsWithBoundarySpillover(
    evStats, brData, evPlannedSet,
    dataDate, null, 20 * 60, 24 * 60, 19 * 60,
    nPlannedSet
  );

  // SPILLOVER для нічного — ранні вильоти 16:00–19:00 вчора
  // (нічний розрахунок почав працювати раніше офіційного старту 19:00).
  // Виключаємо тих, хто є у вечірньому/денному плані вчора, щоб не подвоїти.
  extendStatsWithBoundarySpillover(
    nStats, brData, nPlannedSet,
    dataDate, null, 16 * 60, 19 * 60, 19 * 60,
    evPlannedSet
  );

  var dayFirstSortie = buildFirstSortieTimeCache(brData, todayStr, null,       7 * 60,  16 * 60);
  var evFirstSortie  = buildFirstSortieTimeCache(brData, dataDate, null,       16 * 60, 19 * 60);
  var nFirstSortie   = buildFirstSortieTimeCache(brData, dataDate, reportDate, 19 * 60, 7 * 60);

  var wsDop = getOrCreateSheet(ss, 'Доповідь');
  wsDop.clearContents();
  wsDop.clearFormats();
  wsDop.setColumnWidth(1, 900);

  var row = 1;
  row = writeItems(wsDop,
    [{ text: 'РОБОТА (' + reportDate + ')', bold: true, size: 13 }], row);

  // 1. Вчора вдень допрацьовували (16:00–19:00)
  var evBlock = buildBlock('Вчора вдень допрацьовували (16:00-19:00)', evPlanned, evStats, evPlannedSet, lastAKCache,
               nPlannedSet, evFirstSortie, 19 * 60, dataDate, dataDate, rotaCache, positionAKCache);
  evBlock.push({ text: '' });
  row = writeItems(wsDop, evBlock, row);

  // 2. Сьогодні вночі (19:00–07:00)
  var nBlock = buildBlock('Сьогодні вночі (19:00-07:00)', nPlanned, nStats, nPlannedSet, lastAKCache,
               allDayPlannedSet, nFirstSortie, [19 * 60, 7 * 60], dataDate, reportDate, rotaCache, positionAKCache);
  nBlock.push({ text: '' });
  row = writeItems(wsDop, nBlock, row);

  // 3. Сьогодні вдень (07:00–16:00)
  row = writeItems(wsDop,
    buildBlock('Сьогодні вдень (07:00-16:00)', dayPlanned, dayStats, dayPlannedSet, lastAKCache,
               nPlannedSet, dayFirstSortie, 7 * 60, todayStr, todayStr, rotaCache, positionAKCache), row);

  // ── Блок РОБОТА: напрямки + втрати противника ──
  row = writeItems(wsDop,
    buildDirectionSummary(
      [dayStats,   evStats,   nStats],
      [dayPlanned, evPlanned, nPlanned],
      lastAKCache,
      positionAKCache
    ), row);
  row = writeItems(wsDop, buildEnemyLossesReport(brData), row);

  // ── ПЛАНИ (ніч + завтра) — одразу після РОБОТА ──
  var planData = buildPlanItems();
  if (planData) row = writeItems(wsDop, planData.items, row);

  // ── Neon (в зоні міста Харків) ──
  row = writeItems(wsDop, buildNeonReport(), row);

  // ── Детекції "Log Detections" — тільки підрахунок ──
  row = writeItems(wsDop, generateLogDetectionsCountLines(), row);

  // ── КП ──
  row = writeItems(wsDop, buildSotaKPSummary(),    row);
  row = writeItems(wsDop, buildBramaKPSummary(),   row);
  row = writeItems(wsDop, buildElementKPSummary(), row);
  row = writeItems(wsDop, buildArkanKPSummary(),   row);
  row = writeItems(wsDop, buildAtlasKPSummary(),   row);

  // ── ВИСНОВКИ ТА ПРОБЛЕМНІ ПИТАННЯ — у самому кінці ──
  row = writeItems(wsDop, generateLogDetectionsConclusionLines(), row);

  SpreadsheetApp.getUi().alert('✅ Повна доповідь готова!');
}

// ================================================================
// БЛОК 5. ПЛАН (на ніч + на завтра)
// ================================================================

// Будує рядки планів (ПЛАНИ НА НІЧ + ПЛАНИ НА ЗАВТРА) без запису в аркуш.
// Повертає { items, dayCount, nightCount } або null, якщо джерела немає.
function buildPlanItems() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var wsSrc = ss.getSheetByName(WORK_DN_SOURCE_SHEET);
  if (!wsSrc) return null;

  var rotaCache = buildCrewRotaCache();
  var data      = wsSrc.getDataRange().getValues();

  // Читаємо довідник Позиції АК → { позиція: АК }
  var posAKMap = {};
  var wsPosAK = ss.getSheetByName('Позиції АК');
  if (wsPosAK) {
    var posAKData = wsPosAK.getDataRange().getValues();
    for (var i = 1; i < posAKData.length; i++) {
      var p = String(posAKData[i][0] || '').trim();
      var a = String(posAKData[i][1] || '').trim();
      if (p && a) posAKMap[p] = a;
    }
  }

  // Колонки "Робота День Ніч": [0]АК [1]Позиція [2]Розрахунок [3]ОС [4]Режим [5]Засіб
  // Два блоки: верхній (рядок-заголовок "Позиція") = День, нижній = Ніч.
  var dayList     = [];
  var nightList   = [];
  var headerCount = 0;
  var currentShift = '';
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var pos = String(row[1] || '').trim();
    if (pos === 'Позиція') {
      headerCount++;
      currentShift = (headerCount === 1) ? 'День' : 'Ніч';
      continue;
    }
    if (!currentShift) continue;       // дані до першого заголовка ігноруємо
    var crew = String(row[2] || '').trim();
    if (!crew || !pos) continue;
    // АК — пріоритет: аркуш "Позиції АК" → колонка АК джерела → СОТА
    var ak = posAKMap[pos] || String(row[0] || '').trim() || 'СОТА';
    var entry = { pos: pos, crew: crew, ak: ak };
    if (currentShift === 'День') dayList.push(entry);
    if (currentShift === 'Ніч')  nightList.push(entry);
  }

  dayList   = deduplicateByCrew(dayList);
  nightList = deduplicateByCrew(nightList);

  var items = [];
  function addLine(text, opts) {
    opts = opts || {};
    items.push({ text: text, bold: opts.bold || false, italic: opts.italic || false,
                 color: opts.color || null, size: opts.size || null });
  }

  function emitPlanLine(pl) {
    addLine('1 ' + getCrewType(pl.crew, '') +
            ' (' + pl.ak + ')\t\t\t\t' +
            stripDCode(pl.crew) + ' (' + stripDCode(pl.pos) + ')');
  }

  function emitPlanSection(title, list) {
    addLine('');
    addLine(title, { bold: true });
    addLine(list.length + ' розрахунків:');
    var grouping = groupPlannedByRota(list, rotaCache);
    for (var ri = 0; ri < grouping.order.length; ri++) {
      var key = grouping.order[ri];
      if (grouping.groups[key].length === 0) continue;
      addLine(key + ':', { bold: true });
      for (var j = 0; j < grouping.groups[key].length; j++) emitPlanLine(grouping.groups[key][j]);
    }
    for (var j = 0; j < grouping.groups.noRota.length; j++) emitPlanLine(grouping.groups.noRota[j]);
  }

  emitPlanSection('ПЛАНИ НА НІЧ',    nightList);
  emitPlanSection('ПЛАНИ НА ЗАВТРА', dayList);

  return { items: items, dayCount: dayList.length, nightCount: nightList.length };
}

// Ручне додавання плану в кінець "Доповіді" (залишено для окремого запуску).
// УВАГА: у "Повній доповіді" план уже додається автоматично через buildPlanItems.
function appendPlanToReport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var wsSrc = ss.getSheetByName(WORK_DN_SOURCE_SHEET);
  if (!wsSrc) { SpreadsheetApp.getUi().alert('Аркуш "' + WORK_DN_SOURCE_SHEET + '" не знайдено!'); return; }
  var wsDop = ss.getSheetByName('Доповідь');
  if (!wsDop) { SpreadsheetApp.getUi().alert('Аркуш "Доповідь" не знайдено!\nСпочатку згенеруйте доповідь.'); return; }

  var plan = buildPlanItems();
  if (!plan) { SpreadsheetApp.getUi().alert('Не вдалося зчитати план.'); return; }

  writeItems(wsDop, plan.items, wsDop.getLastRow() + 1);

  SpreadsheetApp.getUi().alert(
    '✅ План додано до Доповіді (джерело: "' + WORK_DN_SOURCE_SHEET + '")!\n' +
    '🌙 Ніч: '    + plan.nightCount + ' розрахунків\n' +
    '☀️ Завтра: ' + plan.dayCount   + ' розрахунків'
  );
}

function writeRobotaAKTable(wsDop) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var wsAK = ss.getSheetByName('Робота в АК');
  if (!wsAK) return;

  var allData = wsAK.getDataRange().getValues();

  // Збираємо рядки де колонка A непорожня, починаючи з рядка 3 (індекс 2)
  var dataRows = [];
  for (var i = 2; i < allData.length; i++) {
    if (String(allData[i][0]).trim() !== '') dataRows.push(allData[i]);
  }
  if (dataRows.length === 0) return;

  // Заголовок блоку — звичайний текст (стовпець 1)
  var titleItems = [
    { text: '', bold: false, italic: false, color: null, size: null },
    { text: 'ЗВЕДЕННЯ РОБОТИ В АК:', bold: true, italic: false, color: null, size: null }
  ];
  var startRow = wsDop.getLastRow() + 1;
  writeItems(wsDop, titleItems, startRow);
  startRow += titleItems.length;

  // Будуємо рядки таблиці: 2 заголовки + дані
  var tableRows = [
    ['', 'Кількість позицій', '', '', '', 'Кількість розрахунків в зоні', '', '', ''],
    ['Корпус', 'Всього', 'Денна', 'Нічна', 'Цілодобова', 'Всього', 'Денна', 'Нічна', 'Цілодобова']
  ];
  for (var i = 0; i < dataRows.length; i++) {
    var r = dataRows[i];
    tableRows.push([
      String(r[0] || '').trim(),
      Number(r[1]||0), Number(r[2]||0), Number(r[3]||0), Number(r[4]||0),
      Number(r[5]||0), Number(r[6]||0), Number(r[7]||0), Number(r[8]||0)
    ]);
  }

  // Записуємо таблицю в стовпці 1–9
  var numRows  = tableRows.length;
  var tblRange = wsDop.getRange(startRow, 1, numRows, 9);
  tblRange.setValues(tableRows);
  tblRange.setFontWeight('normal');
  tblRange.setBorder(true, true, true, true, true, true);

  // Чергування фону: заголовки (рядки 0–1) — зелені,
  // 1-й рядок АК і кожен непарний — білий, парний — зелений
  for (var r = 0; r < numRows; r++) {
    var bg = (r < 2) ? '#b7d7a8' : (r % 2 === 0 ? '#ffffff' : '#b7d7a8');
    wsDop.getRange(startRow + r, 1, 1, 9).setBackground(bg);
  }
  wsDop.getRange(startRow, 1, 2, 9).setFontWeight('bold');

  // Ширина стовпців: стовпці "Цілодобова" (5 і 9) — ширші
  for (var c = 2; c <= 9; c++) {
    wsDop.setColumnWidth(c, (c === 5 || c === 9) ? 105 : 85);
  }
}

function resolveAKForPlan(crewName, squadType, lastAKCache) {
  var cn = String(crewName).toUpperCase();
  for (var i = 0; i < DRONHO_CREWS.length; i++) {
    if (cn.indexOf(DRONHO_CREWS[i].toUpperCase()) >= 0) return 'ГЕНДАЛЬФ';
  }
  if (lastAKCache && lastAKCache[crewName]) return lastAKCache[crewName];
  return 'СОТА';
}

function isValidCrew(crew) {
  if (!crew) return false;
  var c = crew.toLowerCase();
  if (c === 'розрахунок') return false;
  if (c === 'дрон')       return false;
  if (c.indexOf('до 18:00') >= 0) return false;
  if (c.indexOf('до 19:00') >= 0) return false;
  if (c.indexOf('з 6:00')   >= 0) return false;
  if (c.indexOf('року')     >= 0) return false;
  if (c.indexOf('день')     >= 0) return false;
  if (c.indexOf('ніч')      >= 0) return false;
  if (c.indexOf('завдання') >= 0) return false;
  if (!/[а-яёїієa-z]/i.test(crew)) return false;
  if (crew.length < 3) return false;
  return true;
}

function isValidPos(pos) {
  if (!pos) return false;
  var p = pos.toLowerCase();
  if (p === 'позиція')   return false;
  if (p === 'завдання')  return false;
  if (p.indexOf('ббак') >= 0) return false;
  if (p.length < 2)     return false;
  return true;
}

function deduplicateByCrew(list) {
  var seen = {};
  var result = [];
  for (var i = 0; i < list.length; i++) {
    var key = list[i].crew;
    if (!seen[key]) {
      seen[key] = true;
      result.push(list[i]);
    }
  }
  return result;
}

// ================================================================
// БЛОК 6. ДОПОМІЖНІ ФУНКЦІЇ ПЛАНУ
// ================================================================

// Читає план з аркуша.
// Підтримує три формати — визначає по заголовку рядка 0 (колонка B):
//   "План Лог День Ніч"  : h1="Зміна", значення "День"/"Ніч",
//                          [0]Дата [1]Зміна [2]АК [3]Позиція [4]Розрахунок (з Д-кодами)
//   "Лог плану позицій"  : h1="Зміна", значення "Денна"/"Нічна",
//                          [0]Дата [1]Зміна [3]Позиція [4]Розрахунок
//   "Лог" IMPORTRANGE    : col[1]="start_date", col[3]=day_night,
//                          col[6]=position, col[8]=squad_name
function getPlanned(wsOrData, dateStr, dayNight) {
  var logData = Array.isArray(wsOrData) ? wsOrData : wsOrData.getDataRange().getValues();
  if (logData.length === 0) return [];

  var planned = [];
  var h1 = String(logData[0][1] || '').trim().toLowerCase();

  if (h1 === 'зміна') {
    // "План Лог День Ніч" або "Лог плану позицій":
    // [0]Дата [1]Зміна [2]АК [3]Позиція [4]Розрахунок
    var wantDay = (dayNight === 'день');
    for (var i = 1; i < logData.length; i++) {
      var row = logData[i];
      // Дата може бути Date-об'єктом або рядком — нормалізуємо через fmtDate
      if (fmtDate(row[0]) !== dateStr) continue;

      var zm = String(row[1] || '').trim().toLowerCase();
      var zmIsDay   = (zm === 'денна' || zm === 'день');
      var zmIsNight = (zm === 'нічна' || zm === 'ніч');
      if (wantDay && !zmIsDay)    continue;
      if (!wantDay && !zmIsNight) continue;

      // Зрізаємо Д-коди ("Д1310 Токіо-АШ" → "Токіо-АШ"),
      // щоб назви матчились із "Лог БР"
      var pos  = stripDCode(row[3]);
      var crew = stripDCode(row[4]);
      if (pos && crew) planned.push({ pos: pos, crew: crew, squad: '' });
    }
  } else {
    // "Лог" IMPORTRANGE: [1]start_date [3]day_night [5]squad_major_in [6]position [8]squad_name
    for (var i = 1; i < logData.length; i++) {
      var row = logData[i];
      if (!row[1]) continue;
      var sd = fmtDate(row[1]);
      var dn = String(row[3] || '').trim().toLowerCase();
      if (sd !== dateStr || dn !== dayNight) continue;
      var pos  = String(row[6] || '').trim();
      var crew = String(row[8] || '').trim();
      var sq   = String(row[5] || '').trim();
      if (pos && crew) planned.push({ pos: pos, crew: crew, squad: sq });
    }
  }
  return planned;
}

function makePlannedSet(planned) {
  var set = {};
  for (var i = 0; i < planned.length; i++) set[planned[i].crew] = true;
  return set;
}

// ================================================================
// БЛОК 7. ДЕТЕКЦІЇ
// ================================================================

function loadDirectionsMap(sheet) {
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  var map  = {};
  data.forEach(function(row) {
    var direction = String(row[0] || '').trim();
    var np        = String(row[1] || '').trim();
    if (np && direction) {
      map[np.toLowerCase()] = direction;
    }
  });
  return map;
}

function loadDetections(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // A:Дата, B:Час, C:НП, D:Тип цілі
  var data   = sheet.getRange(1, 1, lastRow, 4).getValues();
  var result = [];

  data.forEach(function(row) {
    var date = row[0];
    var time = row[1];
    var np   = String(row[2] || '').trim();
    var type = String(row[3] || '').trim();

    if (!np || !type) return;
    if (!(date instanceof Date) && !date) return;

    result.push({ date: date, time: time, np: np, type: type });
  });

  return result;
}

function combineDateTime(date, time) {
  if (!(date instanceof Date)) return null;
  var dt = new Date(date);
  if (time instanceof Date) {
    dt.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0);
  } else if (typeof time === 'string' && /^\d{1,2}:\d{2}/.test(time)) {
    var parts = time.split(':');
    dt.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
  } else {
    dt.setHours(0, 0, 0, 0);
  }
  return dt;
}

function computePeriod(detections) {
  var minDT = null;
  var maxDT = null;

  detections.forEach(function(d) {
    var dt = combineDateTime(d.date, d.time);
    if (!dt) return;
    if (!minDT || dt < minDT) minDT = dt;
    if (!maxDT || dt > maxDT) maxDT = dt;
  });

  if (!minDT) return { start: null, end: null };

  // Звітна доба: 16:00 → 16:00 наступного дня
  var start = new Date(minDT);
  if (start.getHours() < 16) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(16, 0, 0, 0);

  var end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start: start, end: end };
}

function groupDetections(detections, npToDirection) {
  var grouped = {};
  DIRECTIONS_ORDER.forEach(function(dir) { grouped[dir] = {}; });

  detections.forEach(function(d) {
    var direction = npToDirection[d.np.toLowerCase()] || 'Невідомий';
    if (!grouped[direction]) grouped[direction] = {};
    if (!grouped[direction][d.np]) grouped[direction][d.np] = {};
    grouped[direction][d.np][d.type] = (grouped[direction][d.np][d.type] || 0) + 1;
  });

  return grouped;
}

function formatDateTime(d) {
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
         ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

// ── Побудова рядків звіту по детекціях (з мітками bold) ──────────
function buildReportLines(total, period, grouped) {
  var lines = [];

  var periodStr = period.start && period.end
    ? '[' + formatDateTime(period.start) + ' - ' + formatDateTime(period.end) + ']'
    : '';

  lines.push({
    text: 'За період ' + periodStr + ' зафіксовано ' + total + ' детекцій:',
    bold: true
  });

  var printedDirections = {};

  DIRECTIONS_ORDER.forEach(function(dir) {
    appendDirectionLines(lines, dir, grouped[dir] || {});
    printedDirections[dir] = true;
  });

  Object.keys(grouped).forEach(function(dir) {
    if (printedDirections[dir]) return;
    appendDirectionLines(lines, dir, grouped[dir]);
  });

  return lines;
}

function appendDirectionLines(lines, direction, npMap) {
  var total = Object.keys(npMap).reduce(function(sum, np) {
    return sum + Object.values(npMap[np]).reduce(function(s, c) { return s + c; }, 0);
  }, 0);

  lines.push({
    text: '  - На напрямку "' + direction + '" [' + total + ']:',
    bold: true
  });

  Object.keys(npMap).forEach(function(np) {
    var types = npMap[np];
    var parts = Object.keys(types).map(function(t) { return t + ' ' + types[t]; });
    lines.push({
      text: '    - в районі н.п. ' + np + ': ' + parts.join(', ') + ';',
      bold: false
    });
  });
}

// ── Висновок по детекціях ────────────────────────────────────────
// Класифікація рівня + топ-напрямки + найчастіший тип БпЛА
function buildDetectionConclusion(total, grouped) {
  var lines = [];

  // 1. Класифікація рівня
  var levelText;
  if (total <= DETECTION_LOW_MAX) {
    levelText = 'низький рівень детекцій';
  } else if (total <= DETECTION_MEDIUM_MAX) {
    levelText = 'середній рівень детекцій';
  } else {
    levelText = 'високий рівень детекцій';
  }

  // 2. Топ напрямків (ті, де total > 0; беремо до 2-х найбільших)
  var dirTotals = [];
  Object.keys(grouped).forEach(function(dir) {
    var npMap = grouped[dir];
    var sum = Object.keys(npMap).reduce(function(acc, np) {
      return acc + Object.values(npMap[np]).reduce(function(s, c) { return s + c; }, 0);
    }, 0);
    if (sum > 0) dirTotals.push({ name: dir, count: sum });
  });
  dirTotals.sort(function(a, b) { return b.count - a.count; });

  var topDirs = dirTotals.slice(0, 2);
  var topDirText;
  if (topDirs.length === 0) {
    topDirText = 'немає';
  } else if (topDirs.length === 1) {
    topDirText = topDirs[0].name + ' (' + topDirs[0].count + ')';
  } else {
    topDirText = topDirs[0].name + ' (' + topDirs[0].count + ')' +
                 ', ' + topDirs[1].name + ' (' + topDirs[1].count + ')';
  }

  // 3. Найчастіший тип БпЛА
  var typeCounts = {};
  Object.keys(grouped).forEach(function(dir) {
    var npMap = grouped[dir];
    Object.keys(npMap).forEach(function(np) {
      var types = npMap[np];
      Object.keys(types).forEach(function(t) {
        typeCounts[t] = (typeCounts[t] || 0) + types[t];
      });
    });
  });
  var topType = null;
  var topTypeCount = 0;
  Object.keys(typeCounts).forEach(function(t) {
    if (typeCounts[t] > topTypeCount) {
      topTypeCount = typeCounts[t];
      topType = t;
    }
  });

  // 4. Формуємо текст висновку
  lines.push({ text: '',                                       bold: false });
  lines.push({ text: 'ВИСНОВКИ ТА ПРОБЛЕМНІ ПИТАННЯ:',         bold: true  });
  lines.push({
    text: 'Детекції: За минулу добу спостерігався ' + levelText + '. ' +
          'Найбільша активність ворожих БпЛА була на напрямку: ' + topDirText + '.' +
          (topType ? ' БпЛА що найбільше зустрічались: "' + topType + '".' : ''),
    bold: false
  });
  lines.push({ text: 'ПРОБЛЕМНІ ПИТАННЯ: відсутні.',           bold: true  });
  lines.push({ text: 'Дякую за увагу! Доповідь закінчив.',     bold: true  });

  return lines;
}

function generateDetectionReportLines() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var filterSheet     = ss.getSheetByName(FILTER_SHEET_NAME);
  var directionsSheet = ss.getSheetByName(DIRECTIONS_SHEET_NAME);

  if (!filterSheet)     throw new Error('Аркуш "' + FILTER_SHEET_NAME + '" не знайдено');
  if (!directionsSheet) throw new Error('Аркуш "' + DIRECTIONS_SHEET_NAME + '" не знайдено');

  var npToDirection = loadDirectionsMap(directionsSheet);
  var detections    = loadDetections(filterSheet);

  if (detections.length === 0) {
    return [{ text: 'За період даних немає.', bold: false }];
  }

  var period  = computePeriod(detections);
  var grouped = groupDetections(detections, npToDirection);

  var lines = buildReportLines(detections.length, period, grouped);
  // Додаємо висновок наприкінці
  var conclusion = buildDetectionConclusion(detections.length, grouped);
  for (var i = 0; i < conclusion.length; i++) lines.push(conclusion[i]);

  return lines;
}

function appendDetectionReportToActiveSheet() {
  var lines    = generateDetectionReportLines();
  var sheet    = SpreadsheetApp.getActiveSheet();
  var lastRow  = sheet.getLastRow();
  var startRow = lastRow + 2;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var cell = sheet.getRange(startRow + i, 1);
    cell.setValue(line.text);
    cell.setFontWeight(line.bold ? 'bold' : 'normal');
  }

  SpreadsheetApp.getActiveSpreadsheet().toast('Звіт додано', 'OK', 3);
}

function showDetectionReportDialog() {
  var lines = generateDetectionReportLines();

  var html = '<div style="font-family:monospace;font-size:12px;white-space:pre-wrap;">';
  for (var i = 0; i < lines.length; i++) {
    var safeText = String(lines[i].text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html += lines[i].bold ? ('<b>' + safeText + '</b>\n') : (safeText + '\n');
  }
  html += '</div>';

  var output = HtmlService.createHtmlOutput(html).setWidth(800).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(output, 'Звіт по детекціях');
}

// ================================================================
// БЛОК 7.5. ДЕТЕКЦІЇ З АРКУША "Log Detections"
//   Колонки: A(0)=Дата  B(1)=Час  C(2)=Тип БпЛА  H(7)=Напрямок/АК
//   Групування: напрямок (H) → тип БпЛА (C) → кількість.
//   Період: вчора 16:00 → сьогодні 16:00 (звітна доба, рахується сам).
//
//   Розділено на дві частини для нової послідовності доповіді:
//     - generateLogDetectionsCountLines()      — підрахунок (йде перед КП)
//     - generateLogDetectionsConclusionLines() — висновки (йдуть у КІНЦІ)
// ================================================================

// Комбінує дату (A) і час (B) у Date. Обидва можуть бути Date або рядком.
function combineLogDateTime(dateVal, timeVal) {
  var d;
  if (dateVal instanceof Date) {
    d = new Date(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate());
  } else {
    var s = String(dateVal || '').trim();
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!m) return null;
    d = new Date(+m[3], +m[2] - 1, +m[1]);
  }
  var hh = 0, mm = 0;
  if (timeVal instanceof Date) {
    hh = timeVal.getHours(); mm = timeVal.getMinutes();
  } else {
    var tm = String(timeVal || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (tm) { hh = +tm[1]; mm = +tm[2]; }
  }
  d.setHours(hh, mm, 0, 0);
  return d;
}

// Нормалізує тип БпЛА: прибирає nbsp, зайві пробіли, уніфікує лапки.
function normalizeUAVType(val) {
  return String(val || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[“”«»]/g, '"')
    .trim()
    .replace(/\s+/g, ' ');
}

// Прибирає префікс "БпЛА "/"БПЛА " і лапки — для висновку ("Zala", "SuperCam").
function stripUAVPrefix(type) {
  var s = String(type || '').trim();
  s = s.replace(/^Бп?ЛА\s+/i, '');
  s = s.replace(/"/g, '').trim();
  return s || String(type || '');
}

// Спільний розрахунок детекцій за звітну добу (вчора 16:00 → сьогодні 16:00).
// Повертає { total, groups, dirOrder, typeTotals, fromLabel, toLabel } або null.
function computeLogDetections() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(LOG_DETECTIONS_SHEET);
  if (!ws) return null;

  var data = ws.getDataRange().getValues();
  if (data.length < 2) return null;

  var now  = new Date();
  var yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  var fromTs = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 16, 0, 0).getTime();
  var toTs   = new Date(now.getFullYear(),  now.getMonth(),  now.getDate(),  16, 0, 0).getTime();

  var fromLabel = Utilities.formatDate(new Date(fromTs), 'Europe/Kiev', 'dd.MM.yyyy HH:mm');
  var toLabel   = Utilities.formatDate(new Date(toTs),   'Europe/Kiev', 'dd.MM.yyyy HH:mm');

  var groups = {}, dirOrder = [], typeTotals = {}, total = 0;

  for (var r = 1; r < data.length; r++) {
    var row  = data[r];
    var type = normalizeUAVType(row[2]);
    if (!type) continue;

    var dt = combineLogDateTime(row[0], row[1]);
    if (!dt) continue;
    var ts = dt.getTime();
    if (ts < fromTs || ts >= toTs) continue;

    var dir = String(row[7] || '').replace(/\u00A0/g, ' ').trim().replace(/\s+/g, ' ')
              || 'Невідомий напрямок';

    if (!groups[dir]) { groups[dir] = {}; dirOrder.push(dir); }
    groups[dir][type] = (groups[dir][type] || 0) + 1;
    typeTotals[type]  = (typeTotals[type] || 0) + 1;
    total++;
  }

  if (total === 0) return null;
  return { total: total, groups: groups, dirOrder: dirOrder,
           typeTotals: typeTotals, fromLabel: fromLabel, toLabel: toLabel };
}

// Тільки підрахунок: "За період ... зафіксовано N детекцій:" + розбивка по напрямках.
function generateLogDetectionsCountLines() {
  var d = computeLogDetections();
  var lines = [];
  if (!d) return lines;

  function addLine(text, opts) {
    opts = opts || {};
    lines.push({ text: text, bold: opts.bold || false, italic: opts.italic || false,
                 color: opts.color || null, size: opts.size || null });
  }

  addLine('');
  addLine('За період ' + d.fromLabel + ' - ' + d.toLabel +
          ' зафіксовано ' + d.total + ' детекцій:', { bold: true });

  for (var i = 0; i < d.dirOrder.length; i++) {
    var dir = d.dirOrder[i], typeMap = d.groups[dir];
    addLine('');
    addLine(dir + ':', { bold: true });
    var typeKeys = Object.keys(typeMap).sort(function(a, b) { return typeMap[b] - typeMap[a]; });
    for (var t = 0; t < typeKeys.length; t++) {
      addLine('-' + typeKeys[t] + ' ' + typeMap[typeKeys[t]]);
    }
  }
  return lines;
}

// Тільки висновки: "ВИСНОВКИ ТА ПРОБЛЕМНІ ПИТАННЯ:" ... "Доповідь закінчив."
function generateLogDetectionsConclusionLines() {
  var d = computeLogDetections();
  var lines = [];
  if (!d) return lines;

  function addLine(text, opts) {
    opts = opts || {};
    lines.push({ text: text, bold: opts.bold || false, italic: opts.italic || false,
                 color: opts.color || null, size: opts.size || null });
  }

  var total = d.total, groups = d.groups, dirOrder = d.dirOrder, typeTotals = d.typeTotals;

  var levelText = total <= DETECTION_LOW_MAX    ? 'низький рівень детекцій'
                : total <= DETECTION_MEDIUM_MAX ? 'середній рівень детекцій'
                :                                 'високий рівень детекцій';

  var dirTotals = dirOrder.map(function(dir) {
    var s = 0, tm = groups[dir];
    Object.keys(tm).forEach(function(k) { s += tm[k]; });
    return { name: dir, count: s };
  }).sort(function(a, b) { return b.count - a.count; });
  var topDir = dirTotals.length ? (dirTotals[0].name + ' (' + dirTotals[0].count + ')') : 'немає';

  var topTypes = Object.keys(typeTotals)
    .sort(function(a, b) { return typeTotals[b] - typeTotals[a]; })
    .slice(0, 2);
  var topTypesText = topTypes.map(function(t) { return '"' + stripUAVPrefix(t) + '"'; }).join(', ');

  addLine('');
  addLine('ВИСНОВКИ ТА ПРОБЛЕМНІ ПИТАННЯ:', { bold: true });
  addLine('Детекції: За минулу добу спостерігався ' + levelText + '. ' +
          'Найбільша активність ворожих БпЛА була на напрямку: ' + topDir + '.' +
          (topTypes.length ? ' БпЛА що найбільше зустрічались: ' + topTypesText + '.' : ''));
  addLine('ПРОБЛЕМНІ ПИТАННЯ: відсутні.', { bold: true });
  addLine('Дякую за увагу! Доповідь закінчив.', { bold: true });

  return lines;
}

// Обгортка для сумісності (використовується в appendLogDetectionsToActiveSheet).
function generateLogDetectionsReportLines() {
  return generateLogDetectionsCountLines().concat(generateLogDetectionsConclusionLines());
}

// Ручне додавання блоку детекцій "Log Detections" до активного аркуша
function appendLogDetectionsToActiveSheet() {
  var lines = generateLogDetectionsReportLines();
  if (lines.length === 0) {
    SpreadsheetApp.getUi().alert('За звітну добу детекцій у "' + LOG_DETECTIONS_SHEET + '" не знайдено.');
    return;
  }
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsDop = ss.getSheetByName('Доповідь') || SpreadsheetApp.getActiveSheet();
  var startRow = wsDop.getLastRow() + 1;
  writeItems(wsDop, lines, startRow);
  SpreadsheetApp.getActiveSpreadsheet().toast('Блок детекцій додано', 'OK', 3);
}

// ================================================================
// БЛОК 8. ЕКСПОРТ У GOOGLE DOC
// ================================================================

function appendTableToDoc_(body, tableData) {
  var GREEN = '#b7d7a8';
  var WHITE = '#ffffff';
  var COLS  = 9;
  var tbl   = body.appendTable();

  for (var r = 0; r < tableData.length; r++) {
    var docRow   = tbl.appendTableRow();
    var isHeader = (r < 2);
    // Заголовки — зелені; 1-й рядок АК і кожен парний (0,2,4…) — білий, непарний — зелений
    var bg = (isHeader) ? GREEN : (r % 2 === 0 ? WHITE : GREEN);
    for (var c = 0; c < COLS; c++) {
      var val  = (tableData[r][c] == null) ? '' : String(tableData[r][c]);
      var cell = docRow.appendTableCell(val);
      cell.setBackgroundColor(bg);
      var txt  = cell.editAsText();
      txt.setFontFamily('Times New Roman');
      txt.setFontSize(11);
      if (isHeader) txt.setBold(true);
    }
  }
}

function exportReportToDoc() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsDop = ss.getSheetByName('Доповідь');
  if (!wsDop) {
    SpreadsheetApp.getUi().alert('Аркуш "Доповідь" не знайдено!\nСпочатку згенеруйте доповідь.');
    return;
  }

  var lastRow = wsDop.getLastRow();
  if (lastRow === 0) {
    SpreadsheetApp.getUi().alert('Аркуш "Доповідь" порожній!\nСпочатку згенеруйте доповідь.');
    return;
  }

  var today   = Utilities.formatDate(new Date(), 'Europe/Kiev', 'dd.MM.yyyy HH:mm');
  var docName = 'Доповідь ' + today;
  var doc     = DocumentApp.create(docName);
  var body    = doc.getBody();

  body.setMarginTop(36);
  body.setMarginBottom(36);
  body.setMarginLeft(36);
  body.setMarginRight(36);
  body.clear();

  // Зчитуємо вміст аркуша "Доповідь" (9 стовпців — для таблиць) + форматування стовпця 1
  var allValues  = wsDop.getRange(1, 1, lastRow, 9).getValues();
  var fmtRange   = wsDop.getRange(1, 1, lastRow, 1);
  var fontWts    = fmtRange.getFontWeights();    // 'bold' / 'normal'
  var fontStyles = fmtRange.getFontStyles();     // 'italic' / 'normal'
  var fontColors = fmtRange.getFontColors();     // '#000000' тощо

  var i = 0;
  while (i < allValues.length) {
    var row = allValues[i];
    // Якщо стовпець 2 (індекс 1) непорожній — це рядок таблиці.
    // ВАЖЛИВО: 0 (число) теж є валідним значенням, тому не використовуємо || ''.
    var isTableRow = function(r) { return r[1] !== null && r[1] !== undefined && r[1] !== ''; };
    if (isTableRow(row)) {
      var tblRows = [];
      while (i < allValues.length && isTableRow(allValues[i])) {
        tblRows.push(allValues[i]);
        i++;
      }
      appendTableToDoc_(body, tblRows);
    } else {
      var text = String(row[0] || '');
      var para = body.appendParagraph(text);

      var cellBold   = (fontWts[i][0]    === 'bold');
      var cellItalic = (fontStyles[i][0] === 'italic');
      var cellColor  = fontColors[i][0] || '#000000';

      var isKillLine = text.indexOf('виліт -') >= 0 &&
                       (text.indexOf('знищено') >= 0 || text.indexOf('пошкоджено') >= 0);

      para.setAttributes({
        [DocumentApp.Attribute.FONT_FAMILY]:      'Times New Roman',
        [DocumentApp.Attribute.FONT_SIZE]:        13,
        [DocumentApp.Attribute.FOREGROUND_COLOR]: cellColor,
        [DocumentApp.Attribute.BOLD]:             cellBold,
        [DocumentApp.Attribute.ITALIC]:           cellItalic,
        [DocumentApp.Attribute.UNDERLINE]:        false,
        [DocumentApp.Attribute.SPACING_BEFORE]:   isKillLine ? 8 : 3,
        [DocumentApp.Attribute.SPACING_AFTER]:    3,
        [DocumentApp.Attribute.LINE_SPACING]:     1.15
      });
      i++;
    }
  }

  // Прапор: чи є вже в аркуші "Доповідь" блок детекцій
  // (щоб не дублювати його генерацією свіжого)
  var detectionStartIdx = -1;
  var detectionRegex    = /^За період\b.*зафіксовано\s+\d+\s+детекц/i;
  for (var k = 0; k < allValues.length; k++) {
    if (detectionRegex.test(String(allValues[k][0] || ''))) {
      detectionStartIdx = k;
      break;
    }
  }
  var npLineRegex = /^\s*-\s*в районі н\.п\./i;

  // Якщо в аркуші "Доповідь" блоку детекцій НЕМАЄ — згенерувати свіжий
  if (detectionStartIdx < 0) {
    var detectionLines = null;
    try {
      detectionLines = generateDetectionReportLines();
    } catch (e) {
      detectionLines = null;
    }

    if (detectionLines && detectionLines.length > 0) {
      body.appendParagraph('').setAttributes({
        [DocumentApp.Attribute.FONT_FAMILY]:    'Times New Roman',
        [DocumentApp.Attribute.FONT_SIZE]:      13,
        [DocumentApp.Attribute.SPACING_BEFORE]: 6,
        [DocumentApp.Attribute.SPACING_AFTER]:  3
      });

      for (var j = 0; j < detectionLines.length; j++) {
        var lineText = String(detectionLines[j].text || '');
        var isNpLine2 = npLineRegex.test(lineText);
        var isBold2   = !isNpLine2;

        var dPara = body.appendParagraph(lineText);
        dPara.setAttributes({
          [DocumentApp.Attribute.FONT_FAMILY]:      'Times New Roman',
          [DocumentApp.Attribute.FONT_SIZE]:        13,
          [DocumentApp.Attribute.FOREGROUND_COLOR]: '#000000',
          [DocumentApp.Attribute.BOLD]:             isBold2,
          [DocumentApp.Attribute.ITALIC]:           false,
          [DocumentApp.Attribute.UNDERLINE]:        false,
          [DocumentApp.Attribute.SPACING_BEFORE]:   2,
          [DocumentApp.Attribute.SPACING_AFTER]:    2,
          [DocumentApp.Attribute.LINE_SPACING]:     1.15
        });
      }
    }
  }

  // Курсивом: "знищено" — червоним, "пошкоджено" — синім
  paintWordWithColor(body, 'знищено',    '#FF0000');
  paintWordWithColor(body, 'пошкоджено', '#1F4E9D');

  doc.saveAndClose();

  // Переміщуємо документ у папку "Доповіді на командира"
  // (створюємо її, якщо ще немає)
  var folderInfo = '';
  try {
    var folder = getOrCreateReportsFolder();
    moveFileToFolder(doc.getId(), folder);
    folderInfo = '\nПапка: ' + REPORTS_FOLDER_NAME;
  } catch (e) {
    folderInfo = '\n⚠️ Не вдалося перемістити в папку: ' + e.message +
                 '\n(документ збережено в корені Drive)';
  }

  SpreadsheetApp.getUi().alert(
    '✅ Документ створено!\n\n' +
    'Назва: ' + docName + folderInfo + '\n\n' +
    'Документ на Google Drive.\n' +
    'Файл → Завантажити → Microsoft Word (.docx)'
  );
}

// Знаходить (або створює) папку з доповідями на верхньому рівні Drive.
// Якщо папок з такою назвою декілька — повертає першу знайдену.
function getOrCreateReportsFolder() {
  var folders = DriveApp.getFoldersByName(REPORTS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(REPORTS_FOLDER_NAME);
}

// Переміщує файл у вказану папку (видаляє з усіх інших батьків).
function moveFileToFolder(fileId, targetFolder) {
  var file = DriveApp.getFileById(fileId);
  file.moveTo(targetFolder);
  return file;
}

// Фарбує всі входження слова `word` у тексті `body` у вказаний колір
// (формат '#RRGGBB') і робить їх курсивом.
function paintWordWithColor(body, word, color) {
  var searchResult = body.findText(word);
  while (searchResult !== null) {
    var foundElement = searchResult.getElement();
    var start        = searchResult.getStartOffset();
    var end          = searchResult.getEndOffsetInclusive();
    var textElement  = foundElement.asText();
    textElement.setForegroundColor(start, end, color);
    textElement.setItalic(start, end, true);
    searchResult = body.findText(word, searchResult);
  }
}

// Фарбує "знищено" у червоний (зворотна сумісність зі старими викликами)
function paintWordRed(body, word) {
  paintWordWithColor(body, word, '#FF0000');
}

// ── Форматування існуючого документа ─────────────────────────────
function formatDocument() {
  var latestDoc  = null;
  var latestDate = new Date(0);

  // Шукаємо найсвіжішу доповідь спершу в папці "Доповіді на командира",
  // а якщо там нічого немає — серед усіх Docs у Drive.
  var fileIters = [];
  try {
    var folder = getOrCreateReportsFolder();
    fileIters.push(folder.getFilesByType(MimeType.GOOGLE_DOCS));
  } catch (e) {
    // якщо папка недоступна — просто пропускаємо її
  }
  fileIters.push(DriveApp.getFilesByType(MimeType.GOOGLE_DOCS));

  for (var fi = 0; fi < fileIters.length; fi++) {
    var iter = fileIters[fi];
    while (iter.hasNext()) {
      var file = iter.next();
      if (file.getName().indexOf('Доповідь') !== 0) continue;
      var fileDate = file.getDateCreated();
      if (fileDate > latestDate) {
        latestDate = fileDate;
        latestDoc  = file;
      }
    }
    // якщо вже знайшли в папці — далі не шукаємо
    if (latestDoc) break;
  }

  if (!latestDoc) {
    SpreadsheetApp.getUi().alert('Документ "Доповідь" не знайдено!');
    return;
  }

  var doc             = DocumentApp.openById(latestDoc.getId());
  var body            = doc.getBody();
  var totalParagraphs = body.getNumChildren();

  for (var i = 0; i < totalParagraphs; i++) {
    var element = body.getChild(i);
    if (element.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;

    var paragraph = element.asParagraph();
    var text      = paragraph.editAsText();
    var len       = text.getText().length;
    if (len > 0) {
      text.setAttributes(0, len - 1, {
        [DocumentApp.Attribute.FONT_FAMILY]:      'Times New Roman',
        [DocumentApp.Attribute.FONT_SIZE]:        13,
        [DocumentApp.Attribute.FOREGROUND_COLOR]: '#000000',
        [DocumentApp.Attribute.BACKGROUND_COLOR]: null,
        [DocumentApp.Attribute.BOLD]:             false,
        [DocumentApp.Attribute.ITALIC]:           false,
        [DocumentApp.Attribute.UNDERLINE]:        false,
        [DocumentApp.Attribute.STRIKETHROUGH]:    false
      });
    }
  }

  paintWordWithColor(body, 'знищено',    '#FF0000');
  paintWordWithColor(body, 'пошкоджено', '#1F4E9D');

  doc.saveAndClose();

  SpreadsheetApp.getUi().alert(
    '✅ Форматування завершено!\n\n' +
    '- Шрифт: Times New Roman 13pt\n' +
    '- Колір: чорний\n' +
    '- Слова "знищено": червоні\n' +
    '- Слова "пошкоджено": сині'
  );
}

// ================================================================
// БЛОК 9. ДІАГНОСТИКА
// ================================================================

function debugSotaSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Фільтер Сота');
  if (!ws) {
    SpreadsheetApp.getUi().alert('Аркуш "Фільтер Сота" не знайдено!');
    return;
  }

  var data = ws.getDataRange().getValues();
  if (data.length === 0) {
    SpreadsheetApp.getUi().alert('Аркуш "Фільтер Сота" порожній!');
    return;
  }

  var debugWs = ss.getSheetByName('DEBUG Фільтер Сота');
  if (!debugWs) debugWs = ss.insertSheet('DEBUG Фільтер Сота');
  debugWs.clearContents();
  debugWs.clearFormats();

  var numCols = data[0].length;
  var output  = [];
  output.push(['Літера', 'idx', 'Заголовок', 'Рядок 1', 'Рядок 2', 'Рядок 3']);

  for (var c = 0; c < numCols; c++) {
    var letter = columnIndexToLetter(c);
    var header = data[0] ? formatCellValue(data[0][c]) : '';
    var row1   = data[1] ? formatCellValue(data[1][c]) : '';
    var row2   = data[2] ? formatCellValue(data[2][c]) : '';
    var row3   = data[3] ? formatCellValue(data[3][c]) : '';
    output.push([letter, 'idx=' + c, header, row1, row2, row3]);
  }

  debugWs.getRange(1, 1, output.length, output[0].length).setValues(output);
  debugWs.getRange(1, 1, 1, output[0].length).setFontWeight('bold').setBackground('#fff2cc');
  debugWs.getRange(2, 3, numCols, 1).setBackground('#cfe2f3');

  for (var c = 1; c <= 6; c++) debugWs.autoResizeColumn(c);
  debugWs.setFrozenRows(1);

  SpreadsheetApp.getUi().alert(
    '✅ Готово! Дивись аркуш "DEBUG Фільтер Сота".\n\n' +
    'Кожна колонка вихідної таблиці = окремий рядок DEBUG.\n' +
    'Видно літеру колонки, idx для коду, заголовок і 3 рядки даних.'
  );
}

function formatCellValue(v) {
  if (v === null || v === undefined || v === '') return '(порожньо)';
  if (v instanceof Date) {
    return '[Date] ' + Utilities.formatDate(v, 'Europe/Kiev', 'dd.MM.yyyy HH:mm:ss');
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') {
    if (v > 40000 && v < 60000) {
      var d = new Date((v - 25569) * 86400 * 1000);
      return v + ' [можливо дата: ' + Utilities.formatDate(d, 'Europe/Kiev', 'dd.MM.yyyy HH:mm:ss') + ']';
    }
    return String(v);
  }
  return String(v);
}

function columnIndexToLetter(idx) {
  var s = '';
  idx = idx + 1;
  while (idx > 0) {
    var rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

// ── ДІАГНОСТИКА ПЛАНУ: що читається з "План Лог День Ніч" ────────
// Показує, які плани getPlanned повертає для всіх трьох блоків доповіді.
function debugPlanLogDayNight() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsLog = ss.getSheetByName(REPORT_PLAN_SOURCE_SHEET);
  if (!wsLog) {
    SpreadsheetApp.getUi().alert('Аркуш "' + REPORT_PLAN_SOURCE_SHEET + '" не знайдено!');
    return;
  }

  var logData   = wsLog.getDataRange().getValues();
  var today     = new Date();
  var todayStr  = Utilities.formatDate(today, 'Europe/Kiev', 'dd.MM.yyyy');
  var dataDate  = shiftDateStr(todayStr, -1);
  var evDate    = shiftDateStr(todayStr, -2);

  var dayPlanned = getPlanned(logData, dataDate, 'день');
  var evPlanned  = getPlanned(logData, evDate,   'день');
  var nPlanned   = getPlanned(logData, dataDate, 'ніч');

  function listCrews(list) {
    if (list.length === 0) return '  (порожньо)';
    return list.map(function(p) { return '  ' + p.crew + ' (' + p.pos + ')'; }).join('\n');
  }

  var msg =
    'Джерело: "' + REPORT_PLAN_SOURCE_SHEET + '"\n\n' +
    '☀️ Сьогодні вдень — план за ' + dataDate + ' "День": ' + dayPlanned.length + ' розр.\n' +
    listCrews(dayPlanned) + '\n\n' +
    '🌆 Вчора вдень — план за ' + evDate + ' "День": ' + evPlanned.length + ' розр.\n' +
    listCrews(evPlanned) + '\n\n' +
    '🌙 Сьогодні вночі — план за ' + dataDate + ' "Ніч": ' + nPlanned.length + ' розр.\n' +
    listCrews(nPlanned);

  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}

// ================================================================
// БЛОК: ЛОГ ПЛАНУ ПОЗИЦІЙ — щоденний знімок з "РОЗРАХУНКИ І АК"
// Викликається тригером о 18:00. Тільки "В роботі", без "Технічна".
// ================================================================

var PLAN_SOURCE_SHEET = 'РОЗРАХУНКИ І АК';
var PLAN_LOG_SHEET    = 'Лог плану позицій';

function generatePositionPlanSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsSrc = ss.getSheetByName(PLAN_SOURCE_SHEET);
  if (!wsSrc) return;

  var data      = wsSrc.getDataRange().getValues();
  var dayList   = [];
  var nightList = [];

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var pos    = String(row[1]  || '').trim();
    var ak     = String(row[7]  || '').trim();
    var period = String(row[8]  || '').trim();
    var crew   = String(row[9]  || '').trim();
    var os     = String(row[10] || '').trim();
    var status = String(row[11] || '').trim();
    var notes  = String(row[13] || '').trim();
    var equip  = String(row[14] || '').trim();

    if (!crew || !pos) continue;
    if (pos.toLowerCase().indexOf('технічна') >= 0) continue;
    if (status.toLowerCase().indexOf('не в роботі') >= 0) continue;
    if (status.toLowerCase().indexOf('в роботі') < 0) continue;

    var entry = {
      ak: ak || '—', pos: pos, crew: crew,
      os: os, period: period, equip: equip, notes: notes
    };
    var p = period.toLowerCase();
    if (p === 'денна'  || p === 'цілодобова') dayList.push(entry);
    if (p === 'нічна'  || p === 'цілодобова') nightList.push(entry);
  }

  var wsLog   = getOrCreateSheet(ss, PLAN_LOG_SHEET);
  var dateStr = Utilities.formatDate(new Date(), 'Europe/Kiev', 'dd.MM.yyyy');

  if (wsLog.getLastRow() === 0) {
    var hdr = ['Дата', 'Зміна', 'АК', 'Позиція', 'Розрахунок', 'ОС', 'Режим', 'Засіб АШ', 'Примітки'];
    wsLog.getRange(1, 1, 1, hdr.length).setValues([hdr])
         .setFontWeight('bold').setBackground('#b7d7a8')
         .setBorder(true, true, true, true, true, true);
    wsLog.setFrozenRows(1);
    var w = [110, 75, 130, 120, 140, 40, 100, 120, 160];
    for (var c = 0; c < w.length; c++) wsLog.setColumnWidth(c + 1, w[c]);
  }

  var rows = [];
  function addRows(list, label) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      rows.push([dateStr, label, e.ak, e.pos, e.crew, e.os, e.period, e.equip, e.notes]);
    }
  }
  addRows(dayList,   'Денна');
  addRows(nightList, 'Нічна');
  if (rows.length === 0) return;

  var startRow = wsLog.getLastRow() + 1;
  wsLog.getRange(startRow, 1, rows.length, 9)
       .setValues(rows).setBorder(true, true, true, true, true, true);
  wsLog.getRange(startRow, 1, 1, 9).setBackground('#ffe0b2');
}

// ================================================================
// БЛОК: ПЛАН ЛОГ ДЕНЬ НІЧ — щоденний знімок з "Робота День Ніч"
// Викликається тригером о 18:00. Два блоки джерела: верхній = День,
// нижній = Ніч. Повторний запуск того ж дня — перезаписує рядки за дату.
// ================================================================

var WORK_DN_SOURCE_SHEET = 'Робота День Ніч';
var WORK_DN_LOG_SHEET    = 'План Лог День Ніч';

// Ядро (UI-free — викликається тригером). Повертає кількість записаних рядків,
// або -1 якщо аркуша-джерела немає.
function generateWorkDayNightLog() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var wsSrc = ss.getSheetByName(WORK_DN_SOURCE_SHEET);
  if (!wsSrc) return -1;

  var data = wsSrc.getDataRange().getValues();

  // Колонки джерела: 0=АК, 1=Позиція, 2=Розрахунок, 3=ОС, 4=Режим, 5=Засіб
  var rows         = [];
  var dateStr      = Utilities.formatDate(new Date(), 'Europe/Kiev', 'dd.MM.yyyy');
  var headerCount  = 0;       // скільки рядків-заголовків зустріли
  var currentShift = '';

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var ak    = String(row[0] || '').trim();
    var pos   = String(row[1] || '').trim();
    var crew  = String(row[2] || '').trim();
    var os    = String(row[3] || '').trim();
    var mode  = String(row[4] || '').trim();
    var equip = String(row[5] || '').trim();

    // Рядок-заголовок: колонка "Позиція" дослівно. Перший → День, другий → Ніч.
    if (pos === 'Позиція') {
      headerCount++;
      currentShift = (headerCount === 1) ? 'День' : 'Ніч';
      continue;
    }
    if (!currentShift) continue;       // дані до першого заголовка ігноруємо
    if (!pos || !crew) continue;       // порожні/неповні рядки

    rows.push([dateStr, currentShift, ak, pos, crew, os, mode, equip]);
  }

  var wsLog = getOrCreateSheet(ss, WORK_DN_LOG_SHEET);
  if (wsLog.getLastRow() === 0) {
    var hdr = ['Дата', 'Зміна', 'АК', 'Позиція', 'Розрахунок', 'ОС', 'Режим', 'Засіб'];
    wsLog.getRange(1, 1, 1, hdr.length).setValues([hdr])
         .setFontWeight('bold').setBackground('#b7d7a8')
         .setBorder(true, true, true, true, true, true);
    wsLog.setFrozenRows(1);
    var w = [110, 75, 130, 120, 150, 40, 110, 130];
    for (var c = 0; c < w.length; c++) wsLog.setColumnWidth(c + 1, w[c]);
  }

  // Захист від дублювання: видаляємо рядки за сьогодні (знизу вгору)
  var lastRow = wsLog.getLastRow();
  if (lastRow > 1) {
    var dates = wsLog.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = dates.length - 1; r >= 0; r--) {
      if (fmtDate(dates[r][0]) === dateStr) wsLog.deleteRow(r + 2);
    }
  }

  if (rows.length === 0) return 0;

  var startRow = wsLog.getLastRow() + 1;
  wsLog.getRange(startRow, 1, rows.length, 8)
       .setValues(rows).setBorder(true, true, true, true, true, true);
  wsLog.getRange(startRow, 1, 1, 8).setBackground('#ffe0b2');

  return rows.length;
}

// Меню-обгортка з повідомленням (getUi() недоступний з тригера, тож тут окремо).
function runWorkDayNightLogManual() {
  var n = generateWorkDayNightLog();
  if (n < 0) {
    SpreadsheetApp.getUi().alert('Аркуш "' + WORK_DN_SOURCE_SHEET + '" не знайдено!');
    return;
  }
  var dateStr = Utilities.formatDate(new Date(), 'Europe/Kiev', 'dd.MM.yyyy');
  SpreadsheetApp.getUi().alert(
    '✅ Знімок за ' + dateStr + ' збережено в "' + WORK_DN_LOG_SHEET + '".\n' +
    'Записано рядків: ' + n + '.'
  );
}

// Встановлює щоденний тригер о 18:00 (Київ) на generateWorkDayNightLog.
function setWorkDayNightTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'generateWorkDayNightLog') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('generateWorkDayNightLog')
    .timeBased().everyDays(1).atHour(18).inTimezone('Europe/Kiev').create();
  SpreadsheetApp.getUi().alert('✅ Тригер встановлено! Щодня о 18:00 Київ.');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 Доповідь')
    .addSeparator()
    .addItem('📄 Доповідь по БР розрахунків за добу ', 'generateFullReport')
    .addSeparator()
    // Плани й детекції ВЖЕ входять у "Доповідь по БР розрахунків за добу".
    // Ручні пункти вимкнено, щоб не дублювати блоки в кінці доповіді.
    // .addItem('📅 Додати план (ніч+день) до Доповіді',  'appendPlanToReport')
    // .addItem('📋 Згенерувати звіт по детекціях',       'appendDetectionReportToActiveSheet')
    .addItem('📡 Детекції з "Log Detections"',          'appendLogDetectionsToActiveSheet')
    .addSeparator()
    .addItem('🔍 [DEBUG] Плани з "План Лог День Ніч"', 'debugPlanLogDayNight')
    .addSeparator()
    .addItem('📝 Закинути на Google Disk',             'exportReportToDoc')
    .addSeparator()
    .addItem('🗓 Зберегти знімок Робота День Ніч',     'runWorkDayNightLogManual')
    .addItem('⏰ Тригер 18:00 (Робота День Ніч)',      'setWorkDayNightTrigger')
    .addSeparator()
    .addItem('🗺 Відкрити довідник Позиції АК',        'openPositionsAKSheet')
    .addToUi();
}

// Відкриває (або створює) аркуш "Позиції АК" з заголовками
function openPositionsAKSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Позиції АК');
  if (!ws) {
    ws = ss.insertSheet('Позиції АК');
    ws.getRange(1, 1, 1, 2).setValues([['Позиція', 'АК']]);
    ws.getRange(1, 1, 1, 2).setFontWeight('bold');
    ws.setColumnWidth(1, 220);
    ws.setColumnWidth(2, 120);
    SpreadsheetApp.getUi().alert(
      'Аркуш "Позиції АК" створено.\n\n' +
      'Колонка A — назва позиції (як у "Лог БР").\n' +
      'Колонка B — АК: 17 АК / 16 АК / СОТА / ГЕНДАЛЬФ.\n\n' +
      'Якщо позиції немає в аркуші — береться АК з останнього вильоту з тієї позиції.'
    );
  }
  ss.setActiveSheet(ws);
}

function setDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'generateEveningReport') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('generateEveningReport')
    .timeBased().everyDays(1).atHour(20).inTimezone('Europe/Kiev').create();
  SpreadsheetApp.getUi().alert('✅ Тригер встановлено! Щодня о 20:00 Київ.');
}

function testKPLogic() {
  var testValues = ['Знищено', 'Уражено', 'Пошкоджено', 'Успішно',
                    'Не уражено - Борт втрачено', 'Не уражено - Борт повернуто'];
  var results = [];

  testValues.forEach(function(result) {
    var category;
    if (result === 'Не уражено - Борт втрачено') {
      category = 'ВТРАТА';
    } else if (result === 'Знищено' || result === 'Уражено' ||
               result === 'Пошкоджено' || result === 'Успішно') {
      category = 'УРАЖЕННЯ';
    } else if (result.indexOf('Не уражено') >= 0) {
      category = 'НЕУСПІШНО';
    } else {
      category = '❌ НЕ КЛАСИФІКОВАНО';
    }
    results.push('"' + result + '" → ' + category);
  });

  SpreadsheetApp.getUi().alert(results.join('\n'));
}

function checkKPSummaryNow() {
  var items = buildKPSummary('СОТА');
  var text = items.map(function(it) { return it.text; }).join('\n');
  Logger.log(text);
  SpreadsheetApp.getUi().alert(text);
}
