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

  document.querySelectorAll('.contact-form form').forEach(function (form) {
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
});
