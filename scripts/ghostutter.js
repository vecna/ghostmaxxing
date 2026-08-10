/* ============================================================================
   GHOSTUTTER — vanilla runtime. No framework, no build step, no dependencies.
   Drop it in with a plain <script src="js/ghostutter.js"></script> and it works
   from file:// as happily as from a server.

   You do NOT need this file for hover, focus or --always. Those are pure CSS
   (styles/ghostutter.css). This adds exactly two things:

     1. Ghostutter.mark() / .attach() / .start() / .stop()  — marks from script
     2. the idle-cursor directive, --ghostutter-idle        — see section 4

   Everything is opt-in. Loading the script with no --ghostutter-idle set and no
   API calls costs one custom-property read and nothing else: no listeners are
   bound, no nodes are created.

   API surface, in full:

     Ghostutter.mark(opts?)            -> HTMLSpanElement
     Ghostutter.attach(target, opts?)  -> HTMLSpanElement  (mark over an icon)
     Ghostutter.start(el)              -> el               (add .is-ghostuttering)
     Ghostutter.stop(el)               -> el
     Ghostutter.toggle(el, on?)        -> el
     Ghostutter.idle.start(ms?)        -> boolean          (true if now watching)
     Ghostutter.idle.stop()            -> void
     Ghostutter.idle.refresh()         -> boolean          (re-read the CSS)
     Ghostutter.idle.delay             -> number | 0       (current interval, ms)

   opts for mark() and attach():
     { size, colour, profile, speed, always, left, top, centred, className }
     profile : 'stutter' (default) | 'panic' | 'smooth'
     speed   : null (default) | 'slow' | 'fast'
   ========================================================================= */

(function (window, document) {
  'use strict';

  var BASE = 'ghostutter';
  var RUNNING = 'is-ghostuttering';

  /* --- helpers ----------------------------------------------------------- */

  function reduceMotion() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function coarsePointer() {
    return window.matchMedia &&
           window.matchMedia('(pointer: coarse)').matches;
  }

  /* Parses a CSS time. Anything that is not a positive duration -- 'off',
     'none', '0', an empty property, a typo -- reads as "feature disabled",
     which is what makes the CSS side a real switch rather than a hint. */
  function parseTime(value) {
    if (!value) return 0;
    var raw = String(value).trim().toLowerCase();
    if (!raw || raw === 'off' || raw === 'none' || raw === 'false') return 0;
    var m = /^(-?[0-9]*\.?[0-9]+)\s*(ms|s)?$/.exec(raw);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    if (!isFinite(n) || n <= 0) return 0;
    return m[2] === 's' ? n * 1000 : n;   // bare numbers are treated as ms
  }

  function readDirective() {
    var root = document.documentElement;
    if (root.getAttribute('data-ghostutter-idle') === 'off') return 0;
    return parseTime(
      window.getComputedStyle(root).getPropertyValue('--ghostutter-idle')
    );
  }

  /* --- 1. Building marks -------------------------------------------------- */

  function mark(opts) {
    opts = opts || {};
    var el = document.createElement('span');
    var classes = [BASE];

    if (opts.profile && opts.profile !== 'stutter') classes.push(BASE + '--' + opts.profile);
    if (opts.speed) classes.push(BASE + '--' + opts.speed);
    if (opts.always) classes.push(BASE + '--always');
    if (opts.centred) classes.push(BASE + '--centred');
    if (opts.className) classes.push(opts.className);

    el.className = classes.join(' ');
    el.setAttribute('aria-hidden', 'true');

    if (opts.size) el.style.setProperty('--' + BASE + '-size', opts.size);
    if (opts.colour) el.style.setProperty('--' + BASE + '-colour', opts.colour);
    if (opts.left != null) el.style.left = typeof opts.left === 'number' ? opts.left + 'px' : opts.left;
    if (opts.top != null) el.style.top = typeof opts.top === 'number' ? opts.top + 'px' : opts.top;

    return el;
  }

  /* Puts a mark over an icon. If target is not already inside a
     .ghostutter-lens, one is wrapped around it in place, so calling this on a
     bare <img src="cam-dome.svg"> is enough — the icon keeps its position in
     the flow and the mark is absolutely placed against it.

     Offsets are per icon; the table is in README.md. Pass { centred: true }
     only for icons whose lens really is in the middle of their own box. */
  function attach(target, opts) {
    if (typeof target === 'string') target = document.querySelector(target);
    if (!target) return null;

    var lens = target.closest ? target.closest('.' + BASE + '-lens') : null;
    if (!lens) {
      lens = document.createElement('span');
      lens.className = BASE + '-lens';
      target.parentNode.insertBefore(lens, target);
      lens.appendChild(target);
    }

    var el = mark(opts);
    el.style.position = 'absolute';
    lens.appendChild(el);
    return el;
  }

  /* --- 2. Start / stop ---------------------------------------------------- */

  function each(el, fn) {
    if (!el) return el;
    if (typeof el === 'string') el = document.querySelectorAll(el);
    if (el.nodeType) { fn(el); return el; }
    Array.prototype.forEach.call(el, fn);
    return el;
  }

  function start(el) { return each(el, function (n) { n.classList.add(RUNNING); }); }
  function stop(el)  { return each(el, function (n) { n.classList.remove(RUNNING); }); }

  function toggle(el, on) {
    return each(el, function (n) {
      if (on === undefined) n.classList.toggle(RUNNING);
      else n.classList.toggle(RUNNING, !!on);
    });
  }

  /* --- 3. The idle cursor ------------------------------------------------- */

  var idleState = {
    delay: 0,
    node: null,
    timer: 0,
    x: 0,
    y: 0,
    bound: false,
    shown: false
  };

  function idleNode() {
    if (idleState.node) return idleState.node;
    var host = document.createElement('div');
    host.className = BASE + '-cursor';
    host.setAttribute('aria-hidden', 'true');
    host.appendChild(mark({ always: true }));
    document.body.appendChild(host);
    idleState.node = host;
    return host;
  }

  function showIdle() {
    var host = idleNode();
    /* Position is written only at the moment of appearing. Following the
       cursor while it moves would make it a cursor decoration; the point is
       that it marks where the cursor STOPPED. */
    host.style.transform = 'translate3d(' + idleState.x + 'px,' + idleState.y + 'px,0)';
    host.setAttribute('data-visible', '1');
    idleState.shown = true;
  }

  function hideIdle() {
    if (!idleState.shown || !idleState.node) return;
    idleState.node.removeAttribute('data-visible');
    idleState.shown = false;
  }

  function onMove(e) {
    idleState.x = e.clientX;
    idleState.y = e.clientY;
    hideIdle();
    window.clearTimeout(idleState.timer);
    idleState.timer = window.setTimeout(showIdle, idleState.delay);
  }

  function onLeave() {
    window.clearTimeout(idleState.timer);
    hideIdle();
  }

  function idleStart(ms) {
    var delay = ms == null ? readDirective() : parseTime(ms);

    /* Three reasons to refuse, all of them the user's own settings rather than
       ours: no directive, a pointer that cannot rest, or reduced motion. */
    if (!delay || coarsePointer() || reduceMotion()) {
      idleStop();
      return false;
    }

    idleState.delay = delay;
    if (idleState.bound) return true;

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mousedown', onLeave, { passive: true });
    document.addEventListener('scroll', onLeave, { passive: true });
    window.addEventListener('blur', onLeave);
    document.addEventListener('mouseleave', onLeave, { passive: true });
    idleState.bound = true;
    return true;
  }

  function idleStop() {
    window.clearTimeout(idleState.timer);
    hideIdle();
    if (!idleState.bound) return;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mousedown', onLeave);
    document.removeEventListener('scroll', onLeave);
    window.removeEventListener('blur', onLeave);
    document.removeEventListener('mouseleave', onLeave);
    idleState.bound = false;
    idleState.delay = 0;
  }

  /* --- 4. Auto-init ------------------------------------------------------- */

  function init() {
    idleStart();

    /* Follow the user changing their mind mid-session. */
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onChange = function () { idleStart(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* --- 5. Export ---------------------------------------------------------- */

  window.Ghostutter = {
    mark: mark,
    attach: attach,
    start: start,
    stop: stop,
    toggle: toggle,
    idle: {
      start: idleStart,
      stop: idleStop,
      refresh: function () { idleStop(); return idleStart(); },
      get delay() { return idleState.delay; }
    }
  };

})(window, document);
