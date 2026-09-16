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

  /* ── kontaktní formulář (zatím bez backendu) ─────────── */
  var form = document.querySelector('.contact-form form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var success = form.parentElement.querySelector('.form-success');
      if (success) {
        success.classList.add('is-visible');
        success.textContent = 'Děkujeme za zprávu. Formulář zatím není napojen na e-mail / CRM — je potřeba doplnit backend (např. Formspree nebo vlastní API endpoint).';
      }
      form.reset();
    });
  }
});
