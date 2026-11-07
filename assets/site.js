/* Seeking Aesthetics — shared helpers (nav, footer, data, compare) */
(function () {
  var LOGO = 'logo-128.png';
  var TERMLY = 'https://app.termly.io/policy-viewer/policy.html?policyUUID=';
  var FORM_INQUIRY = 'https://formspree.io/f/xlgoggve';
  var FORM_SCHOOL = 'https://formspree.io/f/xjybwqbj';

  var PHOTOS = {
    'Esthetics': 'img-facial.jpg',
    'Advanced Esthetics': 'img-laser.jpg',
    'Medical': 'img-injection.jpg'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderChrome() {
    var nav = document.getElementById('site-nav');
    if (nav) {
      nav.className = 'nav';
      nav.innerHTML =
        '<div class="wrap nav-inner">' +
        '<a class="brand" href="index.html"><img src="' + LOGO + '" alt="" width="44" height="44"><span>Seeking Aesthetics</span></a>' +
        '<button class="nav-toggle" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
        '<div class="nav-links">' +
        '<a href="index.html#search">Find a Program</a>' +
        '<a href="index.html#how">How It Works</a>' +
        '<a href="about.html">About</a>' +
        '<a href="contact.html">Contact</a>' +
        '<a class="btn btn-primary btn-sm" href="for-schools.html">For Schools &amp; Trainers</a>' +
        '</div></div>';
      var t = nav.querySelector('.nav-toggle'), l = nav.querySelector('.nav-links');
      t.addEventListener('click', function () {
        var open = l.classList.toggle('open');
        t.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    var foot = document.getElementById('site-footer');
    if (foot) {
      foot.innerHTML =
        '<div class="wrap"><div class="foot-grid">' +
        '<div><div class="foot-brand"><img src="' + LOGO + '" alt=""><span>Seeking Aesthetics</span></div>' +
        '<p>Find esthetics schools, advanced training and nurse injector courses — starting in Utah.</p></div>' +
        '<div><h4>Students</h4><a href="index.html#search">Find a Program</a><a href="index.html#how">How It Works</a><a href="compare.html">Compare Programs</a></div>' +
        '<div><h4>Schools</h4><a href="for-schools.html">List Your School</a><a href="for-schools.html#claim">Claim a Listing</a><a href="contact.html">Contact</a></div>' +
        '<div><h4>Company</h4><a href="about.html">About</a>' +
        '<a href="' + TERMLY + 'ee3a9182-d441-403d-a13e-b9c573ae861c" target="_blank" rel="noopener">Privacy</a>' +
        '<a href="' + TERMLY + 'ba1d51c6-cbf1-49a7-8446-70eaf5a17f91" target="_blank" rel="noopener">Terms</a>' +
        '<a href="' + TERMLY + '3c1940f9-6ac4-4c64-a3be-87919f697647" target="_blank" rel="noopener">Cookies</a></div>' +
        '</div><p class="disclaimer">Seeking Aesthetics is an education directory. Listings are provided by schools and trainers, who are responsible for verifying their own licensing and compliance. We do not verify licenses, guarantee enrollment, or provide medical services. Always confirm program details and licensing requirements with the school and the Utah Division of Professional Licensing (DOPL). © ' + new Date().getFullYear() + ' Seeking Aesthetics.</p></div>';
    }
  }

  function isPreview() {
    return /[?&]preview=1/.test(location.search);
  }

  function loadSchools() {
    return fetch('data/schools.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var all = d.schools || [];
        return isPreview() ? all : all.filter(function (s) { return s.published; });
      });
  }

  function photoFor(s) {
    if (s.photos && s.photos.length) return s.photos[0];
    return PHOTOS[s.categories[0]] || 'img-skincare.jpg';
  }

  function catLabel(c) {
    return c === 'Medical' ? 'Medical (RN/LPN)' : c;
  }

  /* compare (max 3), kept in this browser only */
  var KEY = 'sa_compare';
  function getCompare() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function setCompare(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 3))); } catch (e) {}
  }

  window.SA = {
    esc: esc, loadSchools: loadSchools, photoFor: photoFor, catLabel: catLabel,
    isPreview: isPreview, getCompare: getCompare, setCompare: setCompare,
    FORM_INQUIRY: FORM_INQUIRY, FORM_SCHOOL: FORM_SCHOOL
  };

  document.addEventListener('DOMContentLoaded', renderChrome);
})();
