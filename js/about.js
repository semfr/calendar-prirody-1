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

  function checkBottomSection() {
    var scrollTop = window.scrollY;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight > 0 && docHeight - scrollTop < 50) {
      setActiveChapter('contacts');
    }
  }

  window.addEventListener('scroll', function () { updateProgress(); checkBottomSection(); }, { passive: true });
  updateProgress();

  // ── Chapter data ──────────────────────────────────────────
  const chapters = [
    { id: 'artifact',  num: 1, name: 'Что это такое' },
    { id: 'samizdat',  num: 2, name: 'Советский самиздат' },
    { id: 'source',    num: 3, name: 'Книга Стрижёва' },
    { id: 'krugolyet', num: 4, name: 'Ранняя традиция' },
    { id: 'digitize',  num: 5, name: 'Оцифровка' },
    { id: 'sources',   num: 6, name: 'Источники' },
    { id: 'roadmap',   num: 7, name: 'Обновления' },
    { id: 'contacts',  num: 8, name: 'Контакты' },
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
    // Отслеживание активной главы по скроллу:
    // Находим секцию, чей верх ближе всего к верху viewport (но уже прокручен)
    var ticking = false;
    function updateActiveChapter() {
      var best = null;
      var bestTop = -Infinity;
      sections.forEach(function (s) {
        var top = s.getBoundingClientRect().top - 150; // offset: хедер + запас чтобы заголовок секции уже считался активным
        if (top <= 0 && top > bestTop) {
          bestTop = top;
          best = s.id;
        }
      });
      if (best) setActiveChapter(best);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateActiveChapter);
      }
    }, { passive: true });
    updateActiveChapter();
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

  // ── Carousel buttons ──────────────────────────────────────
  document.querySelectorAll('.carousel-wrap').forEach(function (wrap) {
    var carousel = wrap.querySelector('.carousel');
    var prev = wrap.querySelector('.carousel-btn--prev');
    var next = wrap.querySelector('.carousel-btn--next');
    if (!carousel) return;
    var scrollAmount = 240;
    prev.addEventListener('click', function () {
      carousel.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    });
    next.addEventListener('click', function () {
      carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    });
  });

  // Click on images to open lightbox
  document.querySelectorAll('.gallery img, .photo-single img, .carousel img').forEach(function (img) {
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

  // ── Anchor navigation with lazy-image compensation ──────
  // Lazy-loaded images cause layout shifts after anchor scroll,
  // so we re-scroll to the target after images have loaded.
  function scrollToSection(id) {
    var el = document.getElementById(id);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth' });

    // Re-scroll after potential layout shift from lazy images
    var attempts = 0;
    var maxAttempts = 5;
    var interval = setInterval(function () {
      attempts++;
      el.scrollIntoView({ behavior: 'smooth' });
      if (attempts >= maxAttempts) clearInterval(interval);
    }, 300);

    // Stop re-scrolling once all images near the target are loaded
    var nearbyImages = el.querySelectorAll('img[loading="lazy"]');
    if (nearbyImages.length) {
      var loaded = 0;
      nearbyImages.forEach(function (img) {
        if (img.complete) { loaded++; return; }
        img.addEventListener('load', function () {
          loaded++;
          if (loaded >= nearbyImages.length) clearInterval(interval);
        });
      });
      if (loaded >= nearbyImages.length) clearInterval(interval);
    }
  }

  // Intercept sidebar TOC clicks
  sidebarLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var id = link.getAttribute('data-section');
      scrollToSection(id);
      history.replaceState(null, '', '#' + id);
    });
  });

  // Intercept mobile sheet TOC clicks
  sheetLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var id = link.getAttribute('data-section');
      closeSheet();
      scrollToSection(id);
      history.replaceState(null, '', '#' + id);
    });
  });
})();
