/**
 * PoHaGe – website forms endpoint.
 *
 * Two forms post here:
 * - /termin (type "booking"): three preferred callback slots → sheet "Schůzka",
 * - contact form on the homepage and /kontakt (type "contact") → sheet "Formulář".
 * The script validates the request and inserts one row at the top of the right sheet
 * (row 2, newest first).
 *
 * Every 15 minutes sendPending() e-mails the office about rows that have not been
 * announced yet (with a link to the sheet and a button that ticks the row off).
 * If nothing new came in, it does nothing. Every Monday morning weeklyReport()
 * sends the number of requests that are still not ticked off, which also shows that
 * the script is alive.
 *
 * Deploy: Extensions → Apps Script in the Google Sheet, paste this file,
 * Project settings → Time zone "(GMT+01:00) Zurich", run setup() once,
 * then Deploy → New deployment → Web app, "Execute as: Me", "Who has access: Anyone".
 * Paste the /exec URL into WEBAPP_URL below and deploy a new version.
 * The resulting /exec URL goes into BOOKING_URL in js/main.js.
 * After every change to this file: Deploy → Manage deployments → edit → New version.
 */

var NOTIFY_EMAILS = ['info@pohage.ch', 'michaela@zacileno.cz'];

// The web app URL (ends with /exec), needed by the buttons in the e-mails. Time-driven
// runs cannot look it up reliably themselves.
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzmhM75HVOQH5ioOHsjCQRMD4cTI8-pmPD54-LwTVFxrWCYrpQlCFQ0vsAEWYNHttZI/exec';
var TIME_ZONE = 'Europe/Zurich';
// First bookable weekday, yyyy-MM-dd. Must match FIRST_DAY in js/main.js.
var FIRST_DAY = '2026-10-26';
// The calendar runs to the end of this year; from July on, to the end of next year.
// Must match lastDay() in js/main.js.
var OPEN_NEXT_YEAR_FROM_MONTH = 7;
var SLOT_COUNT = 3;
var WINDOWS = ['08-10', '10-12', '13-15', '15-17'];
var LANGS = ['de', 'en', 'fr', 'it', 'cs'];
var REPORT_HOUR = 8;          // Monday report, hour in the project time zone
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One entry per sheet. COL numbers are 1-based columns of that sheet.
var SHEETS = {
  booking: {
    name: 'Schůzka',
    legacyName: 'Termíny',    // renamed on first use
    header: ['Jméno', 'Jazyk', 'Termín 1', 'Termín 2', 'Termín 3', 'Telefon', 'E-mail', 'Zavoláno', 'Přijato', 'ID', 'Odesláno'],
    col: { name: 1, lang: 2, slot1: 3, phone: 6, email: 7, done: 8, received: 9, id: 10, sent: 11 },
    doneLabel: 'Zavoláno'
  },
  contact: {
    name: 'Formulář',
    header: ['Jméno', 'Telefon', 'E-mail', 'Zájem o', 'Zpráva', 'Jazyk', 'Vyřízeno', 'Přijato', 'ID', 'Odesláno'],
    col: { name: 1, phone: 2, email: 3, subject: 4, message: 5, lang: 6, done: 7, received: 8, id: 9, sent: 10 },
    doneLabel: 'Vyřízeno'
  }
};
var KINDS = ['booking', 'contact'];

/* ── request from the website ─────────────────────────────── */

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Honeypot: real visitors never fill the hidden "website" field.
    if (data.website) return json({ ok: true });

    var kind = data.type === 'contact' ? 'contact' : 'booking';
    var entry = kind === 'contact' ? validateContact(data) : validateBooking(data);
    // The page sends one ID per filled-in form, so a retried request is stored once.
    entry.id = UUID.test(String(data.requestId)) ? String(data.requestId).toLowerCase() : Utilities.getUuid();

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (!findRow(kind, entry.id)) addRow(kind, entry);
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message === 'invalid' ? 'invalid' : 'server' });
  }
}

// Name, phone, e-mail, language and consent, shared by both forms.
function validatePerson(data) {
  var name = clean(data.name, 100);
  var phone = clean(data.phone, 40);
  var email = clean(data.email, 150);
  var lang = LANGS.indexOf(data.lang) >= 0 ? data.lang : 'de';

  if (!name || !phone || !email) throw new Error('invalid');
  if (!/^[+0-9 ()\/.-]{6,40}$/.test(phone)) throw new Error('invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid');
  if (data.consent !== true) throw new Error('invalid');

  return { name: name, phone: phone, email: email, lang: lang };
}

function validateBooking(data) {
  var b = validatePerson(data);
  var allowed = allowedDates();
  var seen = {};
  var slots = (Array.isArray(data.slots) ? data.slots : []).filter(function (slot) {
    if (typeof slot !== 'string' || seen[slot]) return false;
    var parts = slot.split('|');
    if (parts.length !== 2 || !allowed[parts[0]] || WINDOWS.indexOf(parts[1]) < 0) return false;
    seen[slot] = true;
    return true;
  });
  if (slots.length !== SLOT_COUNT) throw new Error('invalid');
  slots.sort();
  b.slots = slots;
  return b;
}

function validateContact(data) {
  var c = validatePerson(data);
  c.subject = clean(data.subject, 100);
  c.message = clean(data.message, 3000);
  return c;
}

function lastDay() {
  var now = new Date();
  var year = Number(Utilities.formatDate(now, TIME_ZONE, 'yyyy'));
  var month = Number(Utilities.formatDate(now, TIME_ZONE, 'M'));
  return (month >= OPEN_NEXT_YEAR_FROM_MONTH ? year + 1 : year) + '-12-31';
}

// Weekdays from FIRST_DAY (or today, if later) to lastDay(), as yyyy-MM-dd in Swiss time.
// Today is accepted so a form opened just before midnight still goes through.
function allowedDates() {
  var result = {};
  var last = lastDay();
  var day = new Date();
  for (var i = 0; i < 560; i++, day = new Date(day.getTime() + 86400000)) {
    var key = Utilities.formatDate(day, TIME_ZONE, 'yyyy-MM-dd');
    if (key > last) break;
    var weekday = Number(Utilities.formatDate(day, TIME_ZONE, 'u')); // 1 = Monday … 7 = Sunday
    if (key >= FIRST_DAY && weekday <= 5) result[key] = true;
  }
  return result;
}

/* ── sheets ───────────────────────────────────────────────── */

function getSheet(kind) {
  var cfg = SHEETS[kind];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(cfg.name);
  if (sheet) return sheet;

  var legacy = cfg.legacyName && ss.getSheetByName(cfg.legacyName);
  if (legacy) return legacy.setName(cfg.name);

  sheet = ss.insertSheet(cfg.name);
  sheet.appendRow(cfg.header);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, cfg.header.length).setFontWeight('bold');
  sheet.hideColumns(cfg.col.id, 2);
  // Keeps leading zeros and + in phone numbers.
  sheet.getRange(1, cfg.col.phone, sheet.getMaxRows(), 1).setNumberFormat('@');
  greyDoneRows(sheet, cfg);
  return sheet;
}

// Rows that are done turn grey. Set again after every new row, because inserting
// a row at the top shifts the rule's range down.
function greyDoneRows(sheet, cfg) {
  var doneCol = String.fromCharCode(64 + cfg.col.done);
  var lastCol = String.fromCharCode(64 + cfg.header.length);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$' + doneCol + '2=TRUE')
    .setBackground('#e8e8e8')
    .setFontColor('#888888')
    .setRanges([sheet.getRange('A2:' + lastCol)])
    .build();
  sheet.setConditionalFormatRules([rule]);
}

function addRow(kind, x) {
  var cfg = SHEETS[kind];
  var sheet = getSheet(kind);
  var received = Utilities.formatDate(new Date(), TIME_ZONE, 'dd.MM.yyyy HH:mm');
  var row = kind === 'contact'
    ? [safe(x.name), safe(x.phone), safe(x.email), safe(x.subject), safe(x.message), x.lang, false, received, x.id, '']
    : [safe(x.name), x.lang, formatSlot(x.slots[0]), formatSlot(x.slots[1]), formatSlot(x.slots[2]),
       safe(x.phone), safe(x.email), false, received, x.id, ''];
  // Newest on top: a fresh row 2 right under the header.
  sheet.insertRowBefore(2);
  var range = sheet.getRange(2, 1, 1, row.length);
  range.setFontWeight('normal').setBackground(null).setFontColor(null);
  sheet.getRange(2, cfg.col.phone).setNumberFormat('@');
  range.setValues([row]);
  sheet.getRange(2, cfg.col.done).insertCheckboxes();
  greyDoneRows(sheet, cfg);
}

function findRow(kind, id) {
  var sheet = getSheet(kind);
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, SHEETS[kind].col.id, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return 0;
}

// Looks the ID up in all sheets, for the buttons in the e-mails.
function locate(id) {
  for (var i = 0; i < KINDS.length; i++) {
    var row = findRow(KINDS[i], id);
    if (row) return { kind: KINDS[i], row: row };
  }
  return null;
}

/* ── e-mails (time-driven) ────────────────────────────────── */

// Every 15 minutes: announce rows that have not been e-mailed yet.
function sendPending() {
  if (!WEBAPP_URL) throw new Error('WEBAPP_URL is empty');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // the previous run is still busy
  try {
    KINDS.forEach(function (kind) {
      var cfg = SHEETS[kind];
      var sheet = getSheet(kind);
      var last = sheet.getLastRow();
      if (last < 2) return;
      var rows = sheet.getRange(2, 1, last - 1, cfg.header.length).getValues();
      rows.forEach(function (r, i) {
        if (r[cfg.col.sent - 1] || !r[cfg.col.id - 1]) return;
        notify(kind, r, i + 2);
        sheet.getRange(i + 2, cfg.col.sent).setValue(Utilities.formatDate(new Date(), TIME_ZONE, 'dd.MM.yyyy HH:mm'));
        SpreadsheetApp.flush(); // a crash later on must not send this one twice
      });
    });
  } finally {
    lock.releaseLock();
  }
}

function notify(kind, r, row) {
  var cfg = SHEETS[kind];
  var c = cfg.col;
  var sheet = getSheet(kind);
  var sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl() +
    '#gid=' + sheet.getSheetId() + '&range=A' + row;
  var doneUrl = WEBAPP_URL + '?done=' + r[c.id - 1];
  var name = String(r[c.name - 1]);
  var phone = String(r[c.phone - 1]);
  var email = String(r[c.email - 1]);

  var fields = [['Jméno', name], ['Jazyk', String(r[c.lang - 1])], ['Telefon', phone], ['E-mail', email]];
  var title, subject;
  if (kind === 'contact') {
    title = 'Nová poptávka z webu';
    subject = 'Poptávka z webu: ' + name;
    fields.push(['Zájem o', String(r[c.subject - 1])], ['Zpráva', String(r[c.message - 1])]);
  } else {
    title = 'Nová žádost o zavolání';
    subject = 'Zavolat: ' + name + ' (' + phone + ')';
    fields.push(['Termíny', [r[c.slot1 - 1], r[c.slot1], r[c.slot1 + 1]].map(String).join('\n')]);
  }

  var text = [title + ' (pohage.ch)', ''].concat(fields.map(function (f) {
    return f[0] + ': ' + f[1];
  })).concat(['', 'Tabulka: ' + sheetUrl, 'Označit jako ' + cfg.doneLabel.toLowerCase() + ': ' + doneUrl]).join('\n');

  var cell = 'padding:6px 16px 6px 0;vertical-align:top;';
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5">' +
    '<h2 style="font-size:18px;margin:0 0 16px">' + title + '</h2>' +
    '<table style="border-collapse:collapse">' +
    fields.map(function (f) {
      var value = esc(f[1]).replace(/\n/g, '<br>');
      if (f[0] === 'Jméno') value = '<b>' + value + '</b>';
      if (f[0] === 'Telefon') value = '<a href="tel:' + esc(phone.replace(/[^+0-9]/g, '')) + '">' + value + '</a>';
      if (f[0] === 'E-mail') value = '<a href="mailto:' + esc(email) + '">' + value + '</a>';
      return '<tr><td style="' + cell + 'color:#666">' + f[0] + '</td><td style="' + cell + '">' + value + '</td></tr>';
    }).join('') +
    '</table>' +
    '<p style="margin:24px 0 0">' +
    button(doneUrl, '✓ ' + cfg.doneLabel, true) + button(sheetUrl, 'Otevřít tabulku', false) +
    '</p></div>';

  MailApp.sendEmail({
    to: NOTIFY_EMAILS.join(','),
    replyTo: email,
    subject: subject,
    body: text,
    htmlBody: html
  });
}

// Every Monday: how many requests are still not ticked off. Sent even when it is zero,
// so a missing Monday e-mail means the script has stopped.
function weeklyReport() {
  var counts = KINDS.map(function (kind) {
    var cfg = SHEETS[kind];
    var sheet = getSheet(kind);
    var last = sheet.getLastRow();
    var open = 0;
    if (last >= 2) {
      sheet.getRange(2, 1, last - 1, cfg.header.length).getValues().forEach(function (r) {
        if (r[cfg.col.id - 1] && r[cfg.col.done - 1] !== true) open++;
      });
    }
    return { label: cfg.name + ' (bez „' + cfg.doneLabel + '“)', open: open };
  });
  var open = counts[0].open + counts[1].open;
  var sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  var summary = open === 0
    ? 'Všechny poptávky jsou vyřízené.'
    : counts.map(function (c) { return c.label + ': ' + c.open; }).join('\n');

  MailApp.sendEmail({
    to: NOTIFY_EMAILS.join(','),
    subject: 'Kontrola poptávek z webu: ' + open + ' nevyřízených',
    body: summary + '\n\nFormuláře na pohage.ch fungují.\n\nTabulka: ' + sheetUrl,
    htmlBody:
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5">' +
      '<h2 style="font-size:18px;margin:0 0 12px">Týdenní kontrola poptávek z webu</h2>' +
      '<p style="font-size:28px;font-weight:bold;margin:0 0 4px;color:' + (open ? '#c05600' : '#1f7a3a') + '">' + open + '</p>' +
      '<p style="margin:0 0 16px">' + esc(summary).replace(/\n/g, '<br>') + '</p>' +
      '<p style="margin:0 0 20px;color:#666">Formuláře na pohage.ch fungují.</p>' +
      button(sheetUrl, 'Otevřít tabulku', false) +
      '</div>'
  });
}

function button(url, label, primary) {
  return '<a href="' + url + '" style="display:inline-block;text-decoration:none;padding:12px 22px;border-radius:6px;margin:0 8px 8px 0;' +
    (primary ? 'background:#1f7a3a;color:#fff;font-weight:bold' : 'background:#fff;color:#1a1a1a;border:1px solid #ccc') +
    '">' + label + '</a>';
}

/* ── "Zavoláno" / "Vyřízeno" button from the e-mail ───────── */

// The link only opens a confirmation page. The row is ticked when the button on that
// page is pressed, so mail scanners that open links on their own cannot tick it.
// "?called=" is the parameter of e-mails sent before the contact form was added.
function doGet(e) {
  var p = (e && e.parameter) || {};
  var id = String(p.done || p.called || '');
  var hit = UUID.test(id) ? locate(id) : null;
  var tpl;
  if (!hit) {
    tpl = page('Záznam nenalezen', '<p>Tahle poptávka v tabulce není. Mohla být smazána.</p>');
  } else {
    var cfg = SHEETS[hit.kind];
    var c = cfg.col;
    var values = getSheet(hit.kind).getRange(hit.row, 1, 1, cfg.header.length).getValues()[0];
    var done = values[c.done - 1] === true;
    var detail = hit.kind === 'contact'
      ? esc(values[c.subject - 1]) + '<br>' + esc(values[c.message - 1]).replace(/\n/g, '<br>')
      : esc(values[c.slot1 - 1]) + '<br>' + esc(values[c.slot1]) + '<br>' + esc(values[c.slot1 + 1]);
    tpl = page(
      esc(values[c.name - 1]) + ' · ' + esc(values[c.phone - 1]),
      done
        ? '<p class="ok">✓ Už je označeno: ' + cfg.doneLabel.toLowerCase() + '.</p>'
        : '<p>' + detail + '</p>' +
          '<button id="b" onclick="this.disabled=true;google.script.run.withSuccessHandler(function(){' +
          'document.getElementById(\'b\').outerHTML=\'<p class=ok>✓ Označeno: ' + cfg.doneLabel.toLowerCase() + '.</p>\'})' +
          '.markDone(\'' + id + '\')">✓ ' + cfg.doneLabel + '</button>'
    );
  }
  return HtmlService.createHtmlOutput(tpl)
    .setTitle('PoHaGe – vyřízeno')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function markDone(id) {
  // Locked, so a new row inserted at the top cannot shift the row in between.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hit = UUID.test(String(id)) ? locate(String(id)) : null;
    if (!hit) throw new Error('not found');
    getSheet(hit.kind).getRange(hit.row, SHEETS[hit.kind].col.done).setValue(true);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function page(title, body) {
  return '<div style="font-family:Arial,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#1a1a1a;line-height:1.5">' +
    '<style>button{background:#1f7a3a;color:#fff;border:0;border-radius:6px;padding:14px 26px;font-size:16px;font-weight:bold;cursor:pointer}' +
    'button:disabled{opacity:.6}.ok{color:#1f7a3a;font-weight:bold}</style>' +
    '<h2 style="font-size:20px">' + title + '</h2>' + body + '</div>';
}

/* ── helpers ──────────────────────────────────────────────── */

// "2026-09-30|10-12" → "St 30. 9. 2026, 10–12 h"
function formatSlot(slot) {
  var parts = slot.split('|');
  var d = parts[0].split('-');
  var date = new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]), 12);
  var weekday = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'][date.getDay()];
  var hours = parts[1].split('-');
  return weekday + ' ' + Number(d[2]) + '. ' + Number(d[1]) + '. ' + d[0] + ', ' +
    Number(hours[0]) + '–' + Number(hours[1]) + ' h';
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Stops the sheet from treating visitor input as a formula.
function safe(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ── one-time setup ───────────────────────────────────────── */

// Run once from the editor: grants permissions, creates the sheets and the timers.
// Running it again is safe, it replaces the timers instead of adding more.
function setup() {
  KINDS.forEach(getSheet);
  MailApp.getRemainingDailyQuota();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['sendPending', 'weeklyReport'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendPending').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(REPORT_HOUR).create();
}
