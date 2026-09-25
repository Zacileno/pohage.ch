// pohage.ch — sdílené chování napříč stránkami
document.addEventListener('DOMContentLoaded', function () {

  /* ── mobilní navigace ─────────────────────────────────── */
  var navToggle = document.querySelector('.nav-toggle');
  var mainNav = document.querySelector('.main-nav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      var isOpen = mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      navToggle.textContent = isOpen ? '✕' : '☰';
    });
    mainNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mainNav.classList.remove('is-open');
        navToggle.textContent = '☰';
      });
    });
  }

  /* ── přepínač jazyků ──────────────────────────────────── */
  var langSwitch = document.querySelector('.lang-switch');
  var langToggle = document.querySelector('.lang-switch-toggle');
  if (langSwitch && langToggle) {
    langToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = langSwitch.classList.toggle('is-open');
      langToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!langSwitch.contains(e.target)) langSwitch.classList.remove('is-open');
    });
  }

  /* ── hero slider ──────────────────────────────────────── */
  var slider = document.querySelector('.hero-slider');
  if (slider) {
    var slides = Array.prototype.slice.call(slider.querySelectorAll('.slide'));
    var dots = Array.prototype.slice.call(slider.querySelectorAll('.slider-dots button'));
    var prevBtn = slider.querySelector('.slider-prev');
    var nextBtn = slider.querySelector('.slider-next');
    var countEl = slider.querySelector('.slider-count strong');
    var current = 0;
    var autoplayMs = 6000;
    var timer = null;

    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle('is-active', i === current); });
      dots.forEach(function (d, i) { d.classList.toggle('is-active', i === current); });
      if (countEl) countEl.textContent = String(current + 1).padStart(2, '0');
    }
    function next() { show(current + 1); }
    function prev() { show(current - 1); }
    function restartAutoplay() {
      if (timer) clearInterval(timer);
      timer = setInterval(next, autoplayMs);
    }

    if (nextBtn) nextBtn.addEventListener('click', function () { next(); restartAutoplay(); });
    if (prevBtn) prevBtn.addEventListener('click', function () { prev(); restartAutoplay(); });
    dots.forEach(function (d, i) {
      d.addEventListener('click', function () { show(i); restartAutoplay(); });
    });

    if (slides.length > 1) {
      show(0);
      restartAutoplay();
      slider.addEventListener('mouseenter', function () { if (timer) clearInterval(timer); });
      slider.addEventListener('mouseleave', restartAutoplay);
    }
  }

  /* ── FAQ akordeon ─────────────────────────────────────── */
  document.querySelectorAll('.faq-item h3').forEach(function (h3) {
    h3.addEventListener('click', function () {
      h3.parentElement.classList.toggle('is-open');
    });
  });

  /* ── kontaktní formulář ───────────────────────────────── */
  var CONTACT_WEBHOOK_URL = 'https://hook.eu2.make.com/rb567m6lsldz1d4r7aqefwu7lfy502wv';
  var DEFAULT_SUCCESS_MESSAGE = 'Děkujeme za zprávu, brzy se vám ozveme.';
  var DEFAULT_ERROR_MESSAGE = 'Zprávu se nepodařilo odeslat. Zkuste to prosím znovu, nebo nás kontaktujte telefonicky či e-mailem.';

  document.querySelectorAll('.contact-form:not(.booking) form').forEach(function (form) {
    var successEl = form.parentElement.querySelector('.form-success');
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn ? submitBtn.textContent : '';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!successEl) return;

      var payload = {
        name: (form.querySelector('[name="name"]') || {}).value || '',
        phone: (form.querySelector('[name="phone"]') || {}).value || '',
        email: (form.querySelector('[name="email"]') || {}).value || '',
        subject: (form.querySelector('[name="subject"]') || {}).value || '',
        message: (form.querySelector('[name="message"]') || {}).value || '',
        page: document.title
      };

      successEl.classList.remove('is-error');
      successEl.classList.remove('is-visible');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '…'; }

      fetch(CONTACT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Request failed');
          successEl.textContent = successEl.getAttribute('data-success') || DEFAULT_SUCCESS_MESSAGE;
          successEl.classList.add('is-visible');
          form.reset();
        })
        .catch(function () {
          successEl.textContent = successEl.getAttribute('data-error') || DEFAULT_ERROR_MESSAGE;
          successEl.classList.add('is-visible', 'is-error');
        })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitLabel; }
        });
    });
  });

  /* ── rezervace zpětného hovoru (termin) ──────────────────── */
  // Google Apps Script web app (tools/google-apps-script/booking.gs), končí na /exec.
  var BOOKING_URL = '';
  var SLOT_COUNT = 3;
  var WINDOWS = ['08-10', '10-12', '13-15', '15-17'];

  document.querySelectorAll('.booking form').forEach(function (form) {
    var box = form.parentElement;
    var successEl = box.querySelector('.form-success');
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn.textContent;
    var titleEl = form.querySelector('.booking-month-title');
    var gridEl = form.querySelector('.booking-grid');
    var windowsEl = form.querySelector('.booking-windows');
    var countEl = form.querySelector('.booking-count');
    var listEl = form.querySelector('.booking-list');
    var hintEl = form.querySelector('.booking-hint');
    var navBtns = form.querySelectorAll('.booking-nav');
    var t = form.dataset;
    var lang = document.documentElement.lang || 'de';
    var locale = { de: 'de-CH', fr: 'fr-CH', it: 'it-CH', en: 'en-GB', cs: 'cs-CZ' }[lang] || lang;

    navBtns[0].setAttribute('aria-label', t.prev);
    navBtns[1].setAttribute('aria-label', t.next);

    function pad(n) { return String(n).padStart(2, '0'); }
    function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function fromKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function windowLabel(w) { var h = w.split('-'); return +h[0] + '–' + +h[1] + ' ' + t.hours; }

    // Od zítřka na dva měsíce dopředu, jen pracovní dny.
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var first = new Date(today); first.setDate(first.getDate() + 1);
    var last = new Date(today); last.setMonth(last.getMonth() + 2);
    function bookable(d) { var w = d.getDay(); return d >= first && d <= last && w !== 0 && w !== 6; }

    var month = new Date(first.getFullYear(), first.getMonth(), 1);
    var lastMonth = new Date(last.getFullYear(), last.getMonth(), 1);
    var openDay = null;
    var slots = [];

    var monthFmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
    var dowFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    var dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'numeric' });
    var longFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });

    function renderCalendar() {
      titleEl.textContent = monthFmt.format(month);
      navBtns[0].disabled = month <= new Date(first.getFullYear(), first.getMonth(), 1);
      navBtns[1].disabled = month >= lastMonth;
      gridEl.innerHTML = '';
      for (var i = 0; i < 7; i++) {
        var dow = document.createElement('div');
        dow.className = 'booking-dow';
        dow.textContent = dowFmt.format(new Date(2024, 0, 1 + i)).replace('.', ''); // 1. 1. 2024 = pondělí
        gridEl.appendChild(dow);
      }
      var offset = (month.getDay() + 6) % 7;
      for (var e = 0; e < offset; e++) {
        var empty = document.createElement('span');
        empty.className = 'booking-day is-empty';
        gridEl.appendChild(empty);
      }
      var days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      for (var d = 1; d <= days; d++) {
        var date = new Date(month.getFullYear(), month.getMonth(), d);
        var k = key(date);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'booking-day';
        btn.textContent = d;
        btn.dataset.day = k;
        btn.setAttribute('aria-label', longFmt.format(date));
        if (!bookable(date)) btn.disabled = true;
        if (k === openDay) btn.classList.add('is-open');
        if (slots.some(function (s) { return s.indexOf(k) === 0; })) btn.classList.add('has-slot');
        gridEl.appendChild(btn);
      }
    }

    function renderWindows() {
      if (!openDay) {
        windowsEl.innerHTML = '<p>' + t.pickDay + '</p>';
        return;
      }
      var html = '<div class="booking-windows-title">' + longFmt.format(fromKey(openDay)) + '</div><div class="booking-windows-grid">';
      WINDOWS.forEach(function (w) {
        var slot = openDay + '|' + w;
        var on = slots.indexOf(slot) >= 0;
        html += '<button type="button" class="booking-window' + (on ? ' is-selected' : '') + '" data-slot="' + slot + '" aria-pressed="' + on + '">' + windowLabel(w) + '</button>';
      });
      windowsEl.innerHTML = html + '</div>';
    }

    function renderChosen() {
      countEl.textContent = t.count.replace('{n}', slots.length);
      countEl.classList.toggle('is-complete', slots.length === SLOT_COUNT);
      listEl.innerHTML = '';
      slots.forEach(function (slot) {
        var p = slot.split('|');
        var li = document.createElement('li');
        li.innerHTML = '<span></span><button type="button" aria-label="' + t.remove + '">×</button>';
        li.firstChild.textContent = dayFmt.format(fromKey(p[0])) + ', ' + windowLabel(p[1]);
        li.lastChild.dataset.slot = slot;
        listEl.appendChild(li);
      });
    }

    function render() { renderCalendar(); renderWindows(); renderChosen(); }

    function hint(text) { hintEl.textContent = text || ''; }

    function toggle(slot) {
      var i = slots.indexOf(slot);
      if (i >= 0) slots.splice(i, 1);
      else if (slots.length >= SLOT_COUNT) { hint(t.full); return; }
      else slots.push(slot);
      slots.sort();
      hint('');
      render();
    }

    navBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        month = new Date(month.getFullYear(), month.getMonth() + Number(b.dataset.dir), 1);
        renderCalendar();
      });
    });
    gridEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.booking-day');
      if (!btn || btn.disabled || !btn.dataset.day) return;
      openDay = btn.dataset.day;
      renderCalendar();
      renderWindows();
    });
    windowsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.booking-window');
      if (btn) toggle(btn.dataset.slot);
    });
    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (btn) toggle(btn.dataset.slot);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (slots.length !== SLOT_COUNT) {
        var missing = SLOT_COUNT - slots.length;
        hint(missing === 1 ? t.missingOne : t.missing.replace('{n}', missing));
        return;
      }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      hint('');

      var payload = {
        lang: lang,
        name: form.elements.name.value,
        phone: form.elements.phone.value,
        email: form.elements.email.value,
        consent: form.elements.consent.checked,
        website: form.elements.website.value,
        slots: slots.slice()
      };

      successEl.classList.remove('is-error', 'is-visible');
      submitBtn.disabled = true;
      submitBtn.textContent = '…';

      // text/plain = žádný CORS preflight, Apps Script ho neumí.
      var request = BOOKING_URL
        ? fetch(BOOKING_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
            .then(function (res) { return res.json(); })
        : Promise.resolve(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
            ? (console.log('booking (demo, BOOKING_URL chybí)', payload), { ok: true })
            : { ok: false });

      request
        .then(function (res) {
          if (!res || !res.ok) throw new Error('Request failed');
          successEl.textContent = successEl.getAttribute('data-success');
          successEl.classList.add('is-visible');
          form.reset();
          slots = [];
          openDay = null;
          month = new Date(first.getFullYear(), first.getMonth(), 1);
          render();
          box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .catch(function () {
          successEl.textContent = successEl.getAttribute('data-error');
          successEl.classList.add('is-visible', 'is-error');
        })
        .finally(function () {
          submitBtn.textContent = submitLabel;
          submitBtn.disabled = false;
        });
    });

    render();
  });
});
