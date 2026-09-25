/**
 * PoHaGe – callback booking endpoint.
 *
 * The /termin page posts three preferred callback slots here. The script validates
 * the request and appends one row to the "Termíny" sheet.
 *
 * Every 15 minutes sendPending() e-mails the office about rows that have not been
 * announced yet (with a link to the sheet and a "Zavoláno" button that ticks the row
 * off). If nothing new came in, it does nothing. Every Monday morning weeklyReport()
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

var NOTIFY_EMAIL = 'info@pohage.ch';

// The web app URL (ends with /exec), needed by the "Zavoláno" button. Time-driven runs
// cannot look it up reliably themselves.
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzmhM75HVOQH5ioOHsjCQRMD4cTI8-pmPD54-LwTVFxrWCYrpQlCFQ0vsAEWYNHttZI/exec';
var SHEET_NAME = 'Termíny';
var TIME_ZONE = 'Europe/Zurich';
var DAYS_AHEAD = 63;          // the page shows two months; a few days of slack
var SLOT_COUNT = 3;
var WINDOWS = ['08-10', '10-12', '13-15', '15-17'];
var LANGS = ['de', 'en', 'fr', 'it', 'cs'];
var REPORT_HOUR = 8;          // Monday report, hour in the project time zone
var HEADER = ['Jméno', 'Jazyk', 'Termín 1', 'Termín 2', 'Termín 3', 'Telefon', 'E-mail', 'Zavoláno', 'Přijato', 'ID', 'Odesláno'];
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var COL = { name: 1, lang: 2, slot1: 3, phone: 6, email: 7, called: 8, received: 9, id: 10, sent: 11 };

/* ── booking from the website ─────────────────────────────── */

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Honeypot: real visitors never fill the hidden "website" field.
    if (data.website) return json({ ok: true });

    var booking = validate(data);
    // The page sends one ID per filled-in form, so a retried request is stored once.
    booking.id = UUID.test(String(data.requestId)) ? String(data.requestId).toLowerCase() : Utilities.getUuid();

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (!findRow(booking.id)) appendRow(booking);
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message === 'invalid' ? 'invalid' : 'server' });
  }
}

function validate(data) {
  var name = clean(data.name, 100);
  var phone = clean(data.phone, 40);
  var email = clean(data.email, 150);
  var lang = LANGS.indexOf(data.lang) >= 0 ? data.lang : 'de';

  if (!name || !phone || !email) throw new Error('invalid');
  if (!/^[+0-9 ()\/.-]{6,40}$/.test(phone)) throw new Error('invalid');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid');
  if (data.consent !== true) throw new Error('invalid');

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

  return { name: name, phone: phone, email: email, lang: lang, slots: slots };
}

// Weekdays from today up to DAYS_AHEAD days, as yyyy-MM-dd in Swiss time.
// Today is accepted so a form opened just before midnight still goes through.
function allowedDates() {
  var result = {};
  var now = new Date();
  for (var i = 0; i <= DAYS_AHEAD; i++) {
    var day = new Date(now.getTime() + i * 86400000);
    var weekday = Number(Utilities.formatDate(day, TIME_ZONE, 'u')); // 1 = Monday … 7 = Sunday
    if (weekday <= 5) result[Utilities.formatDate(day, TIME_ZONE, 'yyyy-MM-dd')] = true;
  }
  return result;
}

/* ── sheet ────────────────────────────────────────────────── */

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEET_NAME);
  sheet.appendRow(HEADER);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADER.length).setFontWeight('bold');
  sheet.hideColumns(COL.id, 2);
  sheet.getRange('F:F').setNumberFormat('@'); // keeps leading zeros and + in phone numbers
  // Called rows turn grey.
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2=TRUE')
    .setBackground('#e8e8e8')
    .setFontColor('#888888')
    .setRanges([sheet.getRange('A2:K')])
    .build();
  sheet.setConditionalFormatRules([rule]);
  return sheet;
}

function appendRow(b) {
  var sheet = getSheet();
  sheet.appendRow([
    safe(b.name),
    b.lang,
    formatSlot(b.slots[0]),
    formatSlot(b.slots[1]),
    formatSlot(b.slots[2]),
    safe(b.phone),
    safe(b.email),
    false,
    Utilities.formatDate(new Date(), TIME_ZONE, 'dd.MM.yyyy HH:mm'),
    b.id,
    ''
  ]);
  sheet.getRange(sheet.getLastRow(), COL.called).insertCheckboxes();
}

function findRow(id) {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var ids = sheet.getRange(2, COL.id, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return 0;
}

/* ── e-mails (time-driven) ────────────────────────────────── */

// Every 15 minutes: announce rows that have not been e-mailed yet.
function sendPending() {
  if (!WEBAPP_URL) throw new Error('WEBAPP_URL is empty');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // the previous run is still busy
  try {
    var sheet = getSheet();
    var last = sheet.getLastRow();
    if (last < 2) return;
    var rows = sheet.getRange(2, 1, last - 1, HEADER.length).getValues();
    rows.forEach(function (r, i) {
      if (r[COL.sent - 1] || !r[COL.id - 1]) return;
      notify(r, i + 2);
      sheet.getRange(i + 2, COL.sent).setValue(Utilities.formatDate(new Date(), TIME_ZONE, 'dd.MM.yyyy HH:mm'));
      SpreadsheetApp.flush(); // a crash later on must not send this one twice
    });
  } finally {
    lock.releaseLock();
  }
}

function notify(r, row) {
  var sheet = getSheet();
  var sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl() +
    '#gid=' + sheet.getSheetId() + '&range=A' + row;
  var calledUrl = WEBAPP_URL + '?called=' + r[COL.id - 1];
  var name = String(r[COL.name - 1]);
  var lang = String(r[COL.lang - 1]);
  var phone = String(r[COL.phone - 1]);
  var email = String(r[COL.email - 1]);
  var slots = [r[COL.slot1 - 1], r[COL.slot1], r[COL.slot1 + 1]].map(String);

  var text = [
    'Nová žádost o zavolání z webu pohage.ch',
    '',
    'Jméno: ' + name,
    'Jazyk: ' + lang,
    'Telefon: ' + phone,
    'E-mail: ' + email,
    '',
    'Termíny, které se klientovi hodí:',
    '1. ' + slots[0],
    '2. ' + slots[1],
    '3. ' + slots[2],
    '',
    'Tabulka: ' + sheetUrl,
    'Označit jako zavoláno: ' + calledUrl
  ].join('\n');

  var cell = 'padding:6px 16px 6px 0;vertical-align:top;';
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5">' +
    '<h2 style="font-size:18px;margin:0 0 16px">Nová žádost o zavolání</h2>' +
    '<table style="border-collapse:collapse">' +
    '<tr><td style="' + cell + 'color:#666">Jméno</td><td style="' + cell + '"><b>' + esc(name) + '</b></td></tr>' +
    '<tr><td style="' + cell + 'color:#666">Jazyk</td><td style="' + cell + '">' + esc(lang) + '</td></tr>' +
    '<tr><td style="' + cell + 'color:#666">Telefon</td><td style="' + cell + '"><a href="tel:' + esc(phone.replace(/[^+0-9]/g, '')) + '">' + esc(phone) + '</a></td></tr>' +
    '<tr><td style="' + cell + 'color:#666">E-mail</td><td style="' + cell + '"><a href="mailto:' + esc(email) + '">' + esc(email) + '</a></td></tr>' +
    '<tr><td style="' + cell + 'color:#666">Termíny</td><td style="' + cell + '">' + slots.map(esc).join('<br>') + '</td></tr>' +
    '</table>' +
    '<p style="margin:24px 0 0">' +
    button(calledUrl, '✓ Zavoláno', true) + button(sheetUrl, 'Otevřít tabulku', false) +
    '</p></div>';

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    replyTo: email,
    subject: 'Zavolat: ' + name + ' (' + phone + ')',
    body: text,
    htmlBody: html
  });
}

// Every Monday: how many requests are still not ticked off. Sent even when it is zero,
// so a missing Monday e-mail means the script has stopped.
function weeklyReport() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  var open = 0;
  if (last >= 2) {
    sheet.getRange(2, 1, last - 1, HEADER.length).getValues().forEach(function (r) {
      if (r[COL.id - 1] && r[COL.called - 1] !== true) open++;
    });
  }
  var sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sheet.getSheetId();
  var summary = open === 0
    ? 'Všechny poptávky jsou vyřízené.'
    : 'Nevyřízené poptávky (bez „Zavoláno“): ' + open;

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'Kontrola rezervací: ' + open + ' nevyřízených',
    body: summary + '\n\nRezervační systém na pohage.ch funguje.\n\nTabulka: ' + sheetUrl,
    htmlBody:
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5">' +
      '<h2 style="font-size:18px;margin:0 0 12px">Týdenní kontrola rezervací</h2>' +
      '<p style="font-size:28px;font-weight:bold;margin:0 0 4px;color:' + (open ? '#c05600' : '#1f7a3a') + '">' + open + '</p>' +
      '<p style="margin:0 0 16px">' + esc(summary) + '</p>' +
      '<p style="margin:0 0 20px;color:#666">Rezervační systém na pohage.ch funguje.</p>' +
      button(sheetUrl, 'Otevřít tabulku', false) +
      '</div>'
  });
}

function button(url, label, primary) {
  return '<a href="' + url + '" style="display:inline-block;text-decoration:none;padding:12px 22px;border-radius:6px;margin:0 8px 8px 0;' +
    (primary ? 'background:#1f7a3a;color:#fff;font-weight:bold' : 'background:#fff;color:#1a1a1a;border:1px solid #ccc') +
    '">' + label + '</a>';
}

/* ── "Zavoláno" button from the e-mail ────────────────────── */

// The link only opens a confirmation page. The row is ticked when the button on that
// page is pressed, so mail scanners that open links on their own cannot tick it.
function doGet(e) {
  var id = String((e && e.parameter && e.parameter.called) || '');
  var row = UUID.test(id) ? findRow(id) : 0;
  var tpl;
  if (!row) {
    tpl = page('Záznam nenalezen', '<p>Tahle žádost v tabulce není. Mohla být smazána.</p>');
  } else {
    var values = getSheet().getRange(row, 1, 1, HEADER.length).getValues()[0];
    var done = values[COL.called - 1] === true;
    tpl = page(
      esc(values[0]) + ' · ' + esc(values[5]),
      done
        ? '<p class="ok">✓ Už je označeno jako zavoláno.</p>'
        : '<p>' + esc(values[2]) + '<br>' + esc(values[3]) + '<br>' + esc(values[4]) + '</p>' +
          '<button id="b" onclick="this.disabled=true;google.script.run.withSuccessHandler(function(){' +
          'document.getElementById(\'b\').outerHTML=\'<p class=ok>✓ Označeno jako zavoláno.</p>\'})' +
          '.markCalled(\'' + id + '\')">✓ Zavoláno</button>'
    );
  }
  return HtmlService.createHtmlOutput(tpl)
    .setTitle('PoHaGe – zavoláno')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function markCalled(id) {
  var row = UUID.test(String(id)) ? findRow(String(id)) : 0;
  if (!row) throw new Error('not found');
  getSheet().getRange(row, COL.called).setValue(true);
  return true;
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

// Run once from the editor: grants permissions, creates the sheet and the timers.
// Running it again is safe, it replaces the timers instead of adding more.
function setup() {
  getSheet();
  MailApp.getRemainingDailyQuota();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['sendPending', 'weeklyReport'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendPending').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(REPORT_HOUR).create();
}
