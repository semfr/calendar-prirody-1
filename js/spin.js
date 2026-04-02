/**
 * spin.js — Interactive wheel rotation with physics
 * Календарь русской природы
 *
 * Pointer Events API for unified mouse+touch drag rotation.
 * Native click events are NOT intercepted — wheel.js handles sidebar opening.
 */

import { rebuildLabels, removeLabels } from './wheel.js?v=20';
import { initRotation } from './rotation.js?v=20';

// ─── Constants ────────────────────────────────────────────────────────────────

const CX = 400;
const CY = 400;

const FRICTION_BASE    = 0.97;
const STOP_THRESHOLD   = 0.003;  // °/ms
const DRAG_THRESHOLD   = 5;      // px — below this = click, not drag
const AUTO_SPEED       = -0.0165; // °/ms (~2°/sec = 1 rev/3min CCW)
const VELOCITY_SAMPLES = 5;
const DT_MAX           = 100;
const FRAME_MS         = 16.67;

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  angle: 0,
  velocity: 0,
  isDragging: false,
  autoPlay: false,
  lastTime: 0,
  dragPrevAngle: 0,
  startX: 0,
  startY: 0,
  moved: false,
  samples: [],
  rafId: null,
  spinning: false,
};

let _svgRoot = null;
let _wheelGroup = null;
let _calendar = null;
let _spinToggle = null;
let _busy = false;

// ─── Coordinate conversion ──────────────────────────────────────────────────

function svgPoint(clientX, clientY) {
  const rect = _svgRoot.getBoundingClientRect();
  const vb = _svgRoot.viewBox.baseVal;
  return {
    x: vb.x + (clientX - rect.left) / rect.width  * vb.width,
    y: vb.y + (clientY - rect.top)  / rect.height * vb.height,
  };
}

function angleToCenter(pt) {
  return Math.atan2(pt.y - CY, pt.x - CX) * 180 / Math.PI;
}

// ─── Animation loop ─────────────────────────────────────────────────────────

function tick(now) {
  let dt = now - state.lastTime;
  state.lastTime = now;
  if (dt > DT_MAX) dt = FRAME_MS;

  if (!state.isDragging) {
    if (state.autoPlay) {
      const factor = 1 - Math.pow(0.95, dt / FRAME_MS);
      state.velocity += (AUTO_SPEED - state.velocity) * factor;
    } else {
      state.velocity *= Math.pow(FRICTION_BASE, dt / FRAME_MS);
    }
    state.angle += state.velocity * dt;
  }

  _wheelGroup.setAttribute('transform', `rotate(${state.angle}, ${CX}, ${CY})`);

  if (!state.autoPlay && !state.isDragging && Math.abs(state.velocity) < STOP_THRESHOLD) {
    state.velocity = 0;
    state.rafId = null;
    stopAndRebuild();
    return;
  }

  state.rafId = requestAnimationFrame(tick);
}

function startLoop() {
  if (state.rafId) return;
  state.lastTime = performance.now();
  state.rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

// ─── Text fade / rebuild ────────────────────────────────────────────────────

function setSpinning(val) {
  if (state.spinning === val) return;
  state.spinning = val;
  _svgRoot.classList.toggle('wheel-spinning', val);
}

function stopAndRebuild() {
  setSpinning(false);
  let effectiveAngle = state.angle % 360;
  if (effectiveAngle < 0) effectiveAngle += 360;
  rebuildLabels(effectiveAngle);
  initRotation(_calendar);
}

// ─── Pointer events (unified mouse + touch drag) ───────────────────────────

function onPointerDown(e) {
  if (!e.isPrimary) return;
  if (e.target.closest('#spin-toggle')) return;
  if (_busy) return;

  // If wheel is spinning — stop on click, defer DOM rebuild so click target stays valid
  if (state.spinning && !state.isDragging) {
    _busy = true;
    state.velocity = 0;
    state.autoPlay = false;
    updateToggleButton();
    stopLoop();
    setSpinning(false);
    _wheelGroup.setAttribute('transform', `rotate(${state.angle}, ${CX}, ${CY})`);
    setTimeout(() => {
      let effectiveAngle = state.angle % 360;
      if (effectiveAngle < 0) effectiveAngle += 360;
      rebuildLabels(effectiveAngle);
      initRotation(_calendar);
      _busy = false;
    }, 0);
    // Fall through — let isDragging/moved be set for proper click handling
  }

  const pt = svgPoint(e.clientX, e.clientY);
  state.isDragging = true;
  state.dragPrevAngle = angleToCenter(pt);
  state.startX = e.clientX;
  state.startY = e.clientY;
  state.moved = false;
  state.samples = [];
}

function onPointerMove(e) {
  if (!e.isPrimary || !state.isDragging) return;

  const dx = e.clientX - state.startX;
  const dy = e.clientY - state.startY;
  if (!state.moved && (dx * dx + dy * dy) < DRAG_THRESHOLD * DRAG_THRESHOLD) {
    return; // micro-movement, ignore
  }

  if (!state.moved) {
    state.moved = true;
    setSpinning(true);
    startLoop();
  }

  const pt = svgPoint(e.clientX, e.clientY);
  const currentAngle = angleToCenter(pt);
  let delta = currentAngle - state.dragPrevAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  state.angle += delta;
  state.dragPrevAngle = currentAngle;
  _wheelGroup.setAttribute('transform', `rotate(${state.angle}, ${CX}, ${CY})`);

  state.samples.push({ delta, time: performance.now() });
  if (state.samples.length > VELOCITY_SAMPLES) state.samples.shift();

  e.preventDefault();
}

function onPointerUp(e) {
  if (!e.isPrimary || !state.isDragging) return;
  state.isDragging = false;

  if (!state.moved) {
    // Click — native click event fires, wheel.js handles sidebar
    return;
  }

  // Drag — suppress next native click
  _svgRoot.addEventListener('click', function suppress(ev) {
    ev.stopImmediatePropagation();
    ev.preventDefault();
  }, { capture: true, once: true });

  state.velocity = avgVelocity();
  document.dispatchEvent(new CustomEvent('sidebar:closed'));
  startLoop();
}

function avgVelocity() {
  const s = state.samples;
  if (s.length < 2) return 0;
  const totalDelta = s.reduce((sum, sample) => sum + sample.delta, 0);
  const totalTime = s[s.length - 1].time - s[0].time;
  if (totalTime <= 0) return 0;
  return totalDelta / totalTime;
}

// ─── Auto-rotation (play/pause) ─────────────────────────────────────────────

export function toggleAutoPlay() {
  state.autoPlay = !state.autoPlay;
  updateToggleButton();
  if (state.autoPlay) {
    setSpinning(true);
    startLoop();
  } else {
    // Мгновенная остановка без инерции
    state.velocity = 0;
    stopLoop();
    stopAndRebuild();
  }
}

function updateToggleButton() {
  if (!_spinToggle) return;
  _spinToggle.innerHTML = state.autoPlay
    ? '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
    : '<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg>';
  _spinToggle.setAttribute('aria-label', state.autoPlay ? 'Остановить вращение' : 'Запустить вращение');
}

// ─── Double-click reset ─────────────────────────────────────────────────────

function onDblClick(e) {
  e.preventDefault();
  state.autoPlay = false;
  updateToggleButton();
  animateReset();
}

function animateReset() {
  stopLoop();
  state.isDragging = false;
  state.velocity = 0;

  let current = state.angle % 360;
  if (current > 180) current -= 360;
  if (current < -180) current += 360;

  const duration = 300;
  const startAngle = current;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    state.angle = startAngle * (1 - eased);
    _wheelGroup.setAttribute('transform', `rotate(${state.angle}, ${CX}, ${CY})`);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      state.angle = 0;
      _wheelGroup.setAttribute('transform', `rotate(0, ${CX}, ${CY})`);
      stopAndRebuild();
    }
  }
  setSpinning(true);
  requestAnimationFrame(step);
}

// ─── Visibility change ──────────────────────────────────────────────────────

function onVisibilityChange() {
  if (document.hidden && state.isDragging) {
    state.isDragging = false;
    state.velocity = 0;
    if (!state.autoPlay) {
      stopLoop();
      stopAndRebuild();
    }
  }
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function initSpin(svgRoot, calendar) {
  _svgRoot = svgRoot;
  _wheelGroup = document.getElementById('wheel-g');
  _calendar = calendar;
  _spinToggle = document.getElementById('spin-toggle');

  if (!_wheelGroup) {
    console.error('spin.js: #wheel-g not found');
    return;
  }

  // Pointer events — unified mouse + touch handling
  svgRoot.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);

  // Double-click → reset
  svgRoot.addEventListener('dblclick', onDblClick);

  // Play/pause button
  if (_spinToggle) {
    _spinToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAutoPlay();
    });
    updateToggleButton();
  }

  document.addEventListener('visibilitychange', onVisibilityChange);

  // Auto-start rotation (skip when navigating from search — sidebar opens faster)
  const fromSearch = new URLSearchParams(window.location.search).has('month');
  if (!fromSearch) toggleAutoPlay();
}

export function getAngle() { return state.angle; }
export { animateReset };
