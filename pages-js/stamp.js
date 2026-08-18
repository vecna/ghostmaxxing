/* ----------------------------------------------------------------------------
   STAMP — bends a camera caption around the bottom of a circle.

   The only script the genealogy page needs. Lifted out of the old inline
   page logic; fitStage() and ghostutter.js are both gone.

   Every knob is a CSS custom property on the .gm-stamp — never set them here.
   When --arc-mode is "flat" this restores plain centred text and returns, so
   the 700px breakpoint in cameras.css is all that switches layouts.

     GMStamp.layout()          lay out every stamp on the page
     GMStamp.layout(root)      ...or just the ones inside root
     GMStamp.watch()           re-layout on resize and once fonts land
---------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  function source(p) {
    if (!p.dataset.arcSource) {
      /* Cache once: after the first pass the <p> contains spans, so
         textContent would come back with the spacing baked in. */
      p.dataset.arcSource = (p.textContent || '').replace(/\s+/g, ' ').trim();
    }
    return p.dataset.arcSource;
  }

  function layoutOne(p) {
    var text = source(p);
    if (!text) return;

    var holder = p.closest('.gm-stamp') || p;
    var style = getComputedStyle(holder);

    if ((style.getPropertyValue('--arc-mode') || '').trim() === 'flat') {
      p.textContent = text;
      p.style.height = '';
      return;
    }

    var icon = holder.querySelector('svg, img');
    var iconH = icon ? icon.getBoundingClientRect().height : 0;
    var gap = parseFloat(getComputedStyle(p).marginTop) || 0;

    function num(name, fallback) {
      var v = parseFloat(style.getPropertyValue(name));
      return isFinite(v) ? v : fallback;
    }

    var radius = num('--arc-radius', iconH / 2 + 16);
    var centreY = num('--arc-centre-y', -(gap + iconH / 2));   // the icon's centre
    var spread = num('--arc-spread', 1);
    var flip = num('--arc-flip', 0) >= 0.5;

    var chars = Array.prototype.slice.call(text);
    var centreX = p.clientWidth / 2;

    /* Pass 1: lay the glyphs out flat to measure their real advance widths, so
       spacing along the arc matches the font instead of being stretched to an
       even angle per character. */
    p.textContent = '';
    var spans = chars.map(function (ch) {
      var span = document.createElement('span');
      span.className = 'arc-char';
      span.style.position = 'static';
      span.style.display = 'inline-block';
      span.textContent = ch === ' ' ? '\u00a0' : ch;
      p.appendChild(span);
      return span;
    });
    var widths = spans.map(function (s) { return s.getBoundingClientRect().width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) * spread;

    /* Pass 2: place each glyph. theta is measured from the bottom of the
       circle (0 = straight down), positive to the right. Arc length along the
       circle is the glyph advance, so every letter keeps its own width. */
    var walked = 0;
    for (var i = 0; i < spans.length; i++) {
      var advance = widths[i] * spread;
      var centreArc = walked + advance / 2 - total / 2;
      walked += advance;

      var theta = centreArc / radius;
      var x = centreX + Math.sin(theta) * radius;
      var y = centreY + Math.cos(theta) * radius;
      /* Rotating by -theta points every glyph's up-vector at the circle centre,
         so all letters converge on one point: the icon's middle. */
      var deg = (flip ? theta : -theta) * 180 / Math.PI;

      spans[i].style.position = 'absolute';
      spans[i].style.display = 'block';
      spans[i].style.left = x + 'px';
      spans[i].style.top = y + 'px';
      spans[i].style.transform = 'translate(-50%, -50%) rotate(' + deg + 'deg)';
    }

    var fontSize = parseFloat(getComputedStyle(p).fontSize) || 13;
    p.style.height = Math.max(0, Math.round(centreY + radius + fontSize)) + 'px';
  }

  function layout(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll('.gm-stamp > p'), layoutOne);
  }

  var timer;
  function watch(root) {
    global.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { layout(root); }, 150);
    });
    /* Web fonts land after first paint and change every glyph advance, so the
       arcs have to be measured again once the real faces are in. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { layout(root); });
    }
  }

  global.GMStamp = { layout: layout, watch: watch };
})(window);
