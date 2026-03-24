/**
 * about.js — Интерактивная логика страницы «О проекте»
 * - Reading progress bar
 * - Active chapter tracking (IntersectionObserver)
 * - Scroll-reveal animations (IntersectionObserver)
 * - Lightbox для изображений
 * - Bottom sheet (мобильный TOC)
 */
(function () {
  'use strict';

  // ── Reading Progress ──────────────────────────────────────
  const progressFill = document.getElementById('reading-progress-fill');

  function updateProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    const pct = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
    progressFill.style.width = pct + '%';
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  // ── Chapter data ──────────────────────────────────────────
  const chapters = [
    { id: 'artifact',  num: 1, name: 'Что это такое' },
    { id: 'samizdat',  num: 2, name: 'Советский самиздат' },
    { id: 'source',    num: 3, name: 'Книга Стрижёва' },
    { id: 'krugolyet', num: 4, name: 'Ранняя традиция' },
    { id: 'contacts',  num: 5, name: 'Контакты' },
  ];

  // ── Active Chapter Tracking ───────────────────────────────
  const sidebarLinks = document.querySelectorAll('.about-sidebar__link');
  const sheetLinks = document.querySelectorAll('.about-sheet__link');
  const sheetNum = document.getElementById('sheet-chapter-num');
  const sheetName = document.getElementById('sheet-chapter-name');

  function setActiveChapter(sectionId) {
    const ch = chapters.find(function (c) { return c.id === sectionId; });
    if (!ch) return;

    sidebarLinks.forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-section') === sectionId);
    });
    sheetLinks.forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-section') === sectionId);
    });
    if (sheetNum) sheetNum.textContent = ch.num;
    if (sheetName) sheetName.textContent = ch.name;
  }

  const sections = document.querySelectorAll('section[data-chapter]');
  if (sections.length) {
    var currentSection = 'artifact';
    var chapterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio > 0) {
          currentSection = entry.target.id;
          setActiveChapter(currentSection);
        }
      });
    }, {
      rootMargin: '-80px 0px -60% 0px',
      threshold: [0, 0.1, 0.25]
    });

    sections.forEach(function (s) { chapterObserver.observe(s); });
  }

  // ── Scroll Reveal ─────────────────────────────────────────
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Immediately reveal elements already in viewport on page load
    revealEls.forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add('revealed');
      }
    });

    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealEls.forEach(function (el) {
      if (!el.classList.contains('revealed')) {
        revealObserver.observe(el);
      }
    });
  } else {
    // If reduced motion or no observer support, show everything
    revealEls.forEach(function (el) { el.classList.add('revealed'); });
  }

  // ── Lightbox ──────────────────────────────────────────────
  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightbox-img');
  var lightboxCaption = document.getElementById('lightbox-caption');
  var lightboxClose = lightbox.querySelector('.lightbox__close');
  var lightboxPrev = lightbox.querySelector('.lightbox__prev');
  var lightboxNext = lightbox.querySelector('.lightbox__next');

  var galleryImages = [];
  var currentImageIndex = 0;

  function collectGalleryImages(clickedImg) {
    var galleryName = clickedImg.getAttribute('data-gallery');
    if (galleryName) {
      galleryImages = Array.from(
        document.querySelectorAll('img[data-gallery="' + galleryName + '"]')
      );
    } else {
      galleryImages = [clickedImg];
    }
    currentImageIndex = galleryImages.indexOf(clickedImg);
    if (currentImageIndex === -1) currentImageIndex = 0;
  }

  function showImage(index) {
    if (index < 0 || index >= galleryImages.length) return;
    currentImageIndex = index;
    var img = galleryImages[index];
    // Use original href if wrapped in <a>, otherwise src
    var src = img.closest('a') ? img.closest('a').href : img.src;
    lightboxImg.src = src;
    lightboxImg.alt = img.alt || '';
    lightboxCaption.textContent = img.getAttribute('data-caption') || '';

    // Show/hide nav buttons
    var hasMultiple = galleryImages.length > 1;
    lightboxPrev.style.display = hasMultiple ? '' : 'none';
    lightboxNext.style.display = hasMultiple ? '' : 'none';
  }

  function openLightbox(img) {
    collectGalleryImages(img);
    showImage(currentImageIndex);
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    lightboxImg.src = '';
  }

  // Click on images to open lightbox
  document.querySelectorAll('.gallery img, .photo-single img').forEach(function (img) {
    img.style.cursor = 'pointer';
    img.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openLightbox(img);
    });
    // Prevent <a> wrapper from navigating
    var link = img.closest('a');
    if (link) {
      link.addEventListener('click', function (e) { e.preventDefault(); });
    }
  });

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', function () {
    showImage((currentImageIndex - 1 + galleryImages.length) % galleryImages.length);
  });
  lightboxNext.addEventListener('click', function () {
    showImage((currentImageIndex + 1) % galleryImages.length);
  });

  // Close on overlay click
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  // Keyboard navigation
  document.addEventListener('keydown', function (e) {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') showImage((currentImageIndex - 1 + galleryImages.length) % galleryImages.length);
    if (e.key === 'ArrowRight') showImage((currentImageIndex + 1) % galleryImages.length);
  });

  // Touch swipe for lightbox
  var touchStartX = 0;
  lightbox.addEventListener('touchstart', function (e) {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      if (dx > 0) showImage((currentImageIndex - 1 + galleryImages.length) % galleryImages.length);
      else showImage((currentImageIndex + 1) % galleryImages.length);
    }
  });

  // ── Bottom Sheet (Mobile TOC) ─────────────────────────────
  var sheetTrigger = document.getElementById('sheet-trigger');
  var sheetPanel = document.getElementById('sheet-panel');
  var sheetOverlay = document.getElementById('sheet-overlay');

  function openSheet() {
    sheetPanel.classList.add('open');
    sheetOverlay.classList.add('open');
    sheetTrigger.style.display = 'none';
  }

  function closeSheet() {
    sheetPanel.classList.remove('open');
    sheetOverlay.classList.remove('open');
    sheetTrigger.style.display = '';
  }

  if (sheetTrigger) {
    sheetTrigger.addEventListener('click', openSheet);
  }
  if (sheetOverlay) {
    sheetOverlay.addEventListener('click', closeSheet);
  }

  // Sheet links: navigate and close
  sheetLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      // Let the browser handle the anchor navigation
      closeSheet();
    });
  });

  // Swipe down on handle to close
  if (sheetPanel) {
    var sheetTouchStartY = 0;
    sheetPanel.addEventListener('touchstart', function (e) {
      sheetTouchStartY = e.touches[0].clientY;
    }, { passive: true });
    sheetPanel.addEventListener('touchend', function (e) {
      var dy = e.changedTouches[0].clientY - sheetTouchStartY;
      if (dy > 60) closeSheet();
    });
  }

  // Smooth scroll for sidebar links
  sidebarLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        var headerH = document.querySelector('.site-header').offsetHeight;
        var offset = headerH + 3 + 16; // header + progress bar + buffer
        var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });
  });
})();
