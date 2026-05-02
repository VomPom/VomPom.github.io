/**
 * Mermaid Viewer
 * - Adds a "zoom" button on every rendered <pre class="mermaid"> diagram.
 * - Opens a fullscreen modal with pan & zoom (wheel / drag / double-click / ESC).
 * - No external dependency. Works with mermaid v10+.
 */
(function () {
  'use strict';

  var CLOSE_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path fill="currentColor" d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 1 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"/>' +
    '</svg>';

  var PLUS_ICON =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
    '<path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';
  var MINUS_ICON =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
    '<path fill="currentColor" d="M5 11h14v2H5z"/></svg>';
  var RESET_ICON =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
    '<path fill="currentColor" d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>';

  var modal = null;
  var stage = null;
  var content = null;
  var state = { scale: 1, tx: 0, ty: 0 };
  var dragging = false;
  var dragStart = { x: 0, y: 0, tx: 0, ty: 0 };
  var MIN_SCALE = 0.2;
  var MAX_SCALE = 8;

  function buildModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'mermaid-viewer-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML =
      '<div class="mmv-backdrop"></div>' +
      '<button class="mmv-close" type="button" aria-label="Close">' + CLOSE_ICON + '</button>' +
      '<div class="mmv-stage">' +
      '  <div class="mmv-content"></div>' +
      '</div>' +
      '<div class="mmv-toolbar">' +
      '  <button class="mmv-btn" data-action="zoom-out" type="button" aria-label="Zoom out">' + MINUS_ICON + '</button>' +
      '  <span class="mmv-scale">100%</span>' +
      '  <button class="mmv-btn" data-action="zoom-in" type="button" aria-label="Zoom in">' + PLUS_ICON + '</button>' +
      '  <button class="mmv-btn" data-action="reset" type="button" aria-label="Reset">' + RESET_ICON + '</button>' +
      '</div>';
    document.body.appendChild(modal);

    stage = modal.querySelector('.mmv-stage');
    content = modal.querySelector('.mmv-content');

    modal.querySelector('.mmv-backdrop').addEventListener('click', closeViewer);
    modal.querySelector('.mmv-close').addEventListener('click', closeViewer);

    modal.addEventListener('click', function (e) {
      var target = e.target.closest('.mmv-btn');
      if (!target) return;
      var action = target.getAttribute('data-action');
      if (action === 'zoom-in') zoomBy(1.2);
      else if (action === 'zoom-out') zoomBy(1 / 1.2);
      else if (action === 'reset') resetTransform();
    });

    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? 1 / 1.1 : 1.1;
      zoomAtPoint(delta, e.clientX, e.clientY);
    }, { passive: false });

    stage.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true;
      dragStart.x = e.clientX;
      dragStart.y = e.clientY;
      dragStart.tx = state.tx;
      dragStart.ty = state.ty;
      stage.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      state.tx = dragStart.tx + (e.clientX - dragStart.x);
      state.ty = dragStart.ty + (e.clientY - dragStart.y);
      applyTransform();
    });

    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('is-dragging');
    });

    stage.addEventListener('dblclick', function () {
      resetTransform();
    });

    // Basic touch pinch & pan
    var touchStart = null;
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        touchStart = {
          type: 'pan',
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          tx: state.tx,
          ty: state.ty
        };
      } else if (e.touches.length === 2) {
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStart = {
          type: 'pinch',
          dist: Math.hypot(dx, dy),
          scale: state.scale,
          cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
          tx: state.tx,
          ty: state.ty
        };
      }
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      if (!touchStart) return;
      if (touchStart.type === 'pan' && e.touches.length === 1) {
        state.tx = touchStart.tx + (e.touches[0].clientX - touchStart.x);
        state.ty = touchStart.ty + (e.touches[0].clientY - touchStart.y);
        applyTransform();
      } else if (touchStart.type === 'pinch' && e.touches.length === 2) {
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        var dist = Math.hypot(dx, dy);
        var factor = dist / touchStart.dist;
        var newScale = clamp(touchStart.scale * factor, MIN_SCALE, MAX_SCALE);
        state.scale = newScale;
        applyTransform();
        e.preventDefault();
      }
    }, { passive: false });

    stage.addEventListener('touchend', function () {
      touchStart = null;
    });

    document.addEventListener('keydown', function (e) {
      if (modal.getAttribute('aria-hidden') === 'true') return;
      if (e.key === 'Escape') closeViewer();
      else if (e.key === '+' || e.key === '=') zoomBy(1.2);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.2);
      else if (e.key === '0') resetTransform();
    });

    return modal;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function applyTransform() {
    content.style.transform =
      'translate(' + state.tx + 'px, ' + state.ty + 'px) scale(' + state.scale + ')';
    var label = modal.querySelector('.mmv-scale');
    if (label) label.textContent = Math.round(state.scale * 100) + '%';
  }

  function resetTransform() {
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
    applyTransform();
  }

  function zoomBy(factor) {
    var rect = stage.getBoundingClientRect();
    zoomAtPoint(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function zoomAtPoint(factor, clientX, clientY) {
    var rect = stage.getBoundingClientRect();
    var cx = clientX - rect.left - rect.width / 2;
    var cy = clientY - rect.top - rect.height / 2;
    var newScale = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);
    var real = newScale / state.scale;
    state.tx = cx - (cx - state.tx) * real;
    state.ty = cy - (cy - state.ty) * real;
    state.scale = newScale;
    applyTransform();
  }

  function openViewer(svgEl) {
    buildModal();
    content.innerHTML = '';
    var clone = svgEl.cloneNode(true);

    // Derive intrinsic width/height from viewBox or original attrs,
    // because mermaid writes inline `style="max-width:..."` and sets width:100%.
    var vb = (clone.getAttribute('viewBox') || '').split(/\s+|,/).map(parseFloat);
    var intrinsicW = 0, intrinsicH = 0;
    if (vb.length === 4 && !isNaN(vb[2]) && !isNaN(vb[3])) {
      intrinsicW = vb[2];
      intrinsicH = vb[3];
    } else {
      var r = svgEl.getBoundingClientRect();
      intrinsicW = r.width;
      intrinsicH = r.height;
    }

    // Remove mermaid's inline max-width style and re-apply explicit size.
    clone.removeAttribute('style');
    clone.setAttribute('width', intrinsicW);
    clone.setAttribute('height', intrinsicH);
    clone.style.width = intrinsicW + 'px';
    clone.style.height = intrinsicH + 'px';
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';
    content.appendChild(clone);

    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('mmv-open');

    // Fit to viewport: if the diagram is larger than the stage, scale down;
    // otherwise keep 100% so small diagrams don't get upscaled.
    requestAnimationFrame(function () {
      var rect = stage.getBoundingClientRect();
      var pad = 64; // keep some breathing room around the diagram
      var availW = Math.max(100, rect.width - pad);
      var availH = Math.max(100, rect.height - pad);
      var fit = Math.min(availW / intrinsicW, availH / intrinsicH, 1);
      state.scale = fit > 0 && isFinite(fit) ? fit : 1;
      state.tx = 0;
      state.ty = 0;
      applyTransform();
    });
  }

  function closeViewer() {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('mmv-open');
    if (content) content.innerHTML = '';
  }

  function attachButtons(root) {
    var scope = root || document;
    var diagrams = scope.querySelectorAll('pre.mermaid');
    diagrams.forEach(function (pre) {
      if (pre.dataset.mmvReady === '1') return;
      var svg = pre.querySelector('svg');
      if (!svg) return;
      pre.dataset.mmvReady = '1';
      pre.classList.add('mermaid-has-viewer');

      // Click anywhere on the diagram to open the fullscreen viewer.
      pre.addEventListener('click', function () {
        openViewer(svg);
      });
    });
  }

  // Public API for manual triggering after mermaid.run()
  window.MermaidViewer = {
    scan: attachButtons,
    open: openViewer,
    close: closeViewer
  };

  // Auto-scan after a short delay (covers cases where mermaid renders async)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () { attachButtons(); }, 300);
    });
  } else {
    setTimeout(function () { attachButtons(); }, 300);
  }
})();
