/* The homepage camera field.
 *
 * The arc, and why it ends the way it does:
 *
 *   You tap a camera. Every camera of that type leaves the field and a fact
 *   about it appears, with the camera itself beside it — LIVE, yellow iris,
 *   because the fact describes something it is doing right now. Nothing here
 *   has been defeated; it has been named.
 *
 *   As types are cleared the plume head behind the field becomes more visible.
 *   It was always there. The cameras were the noise.
 *
 *   When the sixth type goes, the ground turns from soil to cream over two
 *   seconds and the whirlwind arrives. That is NOT a win screen. The two in the
 *   plume head are still reading and the closing line says so. What has changed
 *   is that you can see them.
 *
 * If you are tempted to make the plume head shrink and vanish here, read
 * tutorials/visual-direction.md first: "never claim the wind won."
 */
(function () {
    'use strict';

    var TYPES = [
        { label: 'Dome camera', key: 'dome' },
        { label: 'Box camera', key: 'cube' },
        { label: 'Smart glasses', key: 'glasses' },
        { label: 'Pill sensor', key: 'pill' },
        { label: 'Street pole unit', key: 'street' },
        { label: 'Bullet camera', key: 'bullet' }
    ];

    var field = document.getElementById('camField');
    var stage = document.getElementById('camStage');
    var halfTop = document.getElementById('camHalfTop');
    var halfBottom = document.getElementById('camHalfBottom');
    var plume = document.getElementById('camPlume');
    var finale = document.getElementById('camFinale');
    var resetBtn = document.getElementById('camReset');
    if (!field || !stage) { return; }

    var FACTS = null;
    var cleared = Object.create(null);
    var clearedCount = 0;

    /* Optional. Without the catch a 404 makes r.json() reject and the console
       fills with an unhandled rejection; the panel falls back to the label. */
    fetch('/data/camera-facts.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { FACTS = j; })
        .catch(function () { FACTS = null; });

    /* Icons are cloned from <template id="camtpl-*"> rather than loaded as
       <img src="images/icons/cam-*.svg">. Those files are class-driven — no
       fill attributes — and an <img>-loaded SVG never sees cameras.css, so
       through <img> every camera renders solid black.
       Ids are suffixed per instance because .cam-iris carries one. */
    var uid = 0;
    function makeCam(key) {
        var tpl = document.getElementById('camtpl-' + key);
        if (!tpl) { return null; }
        var svg = tpl.content.firstElementChild.cloneNode(true);
        var n = ++uid;
        var withId = svg.querySelectorAll('[id]');
        for (var j = 0; j < withId.length; j++) { withId[j].id = withId[j].id + '-f' + n; }
        return svg;
    }

    /* ---- the panel -------------------------------------------------------
       Built as nodes, never innerHTML. camera-facts.json is our own file on
       our own origin, but it is content — the day someone else edits it, or it
       is generated, an innerHTML here becomes an injection point. Two fields,
       text and an optional href, cost one createElement to stay safe. */
    function renderFact(panel, label, fact, key) {
        panel.textContent = '';

        var art = makeCam(key);
        if (art) {
            var frame = document.createElement('div');
            frame.className = 'cam-fact__art';
            frame.setAttribute('aria-hidden', 'true');
            frame.appendChild(art);
            panel.appendChild(frame);
        }

        var body = document.createElement('div');
        body.className = 'cam-fact__body';

        var kicker = document.createElement('p');
        kicker.className = 'cam-fact__kicker';
        kicker.textContent = label;
        body.appendChild(kicker);

        var p = document.createElement('p');
        p.className = 'cam-fact__text';

        if (fact.href) {
            var a = document.createElement('a');
            a.className = 'cam-fact__link';
            a.href = fact.href;
            a.textContent = fact.text;
            /* _blank even for same-origin links. Navigating away would throw
               away however many types the reader has cleared, and there is no
               way to restore that from a back button. */
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            p.appendChild(a);
            var mark = document.createElement('span');
            mark.className = 'cam-fact__ext';
            mark.setAttribute('aria-hidden', 'true');
            mark.textContent = ' \u2197';
            p.appendChild(mark);
        } else {
            p.textContent = fact.text;
        }

        body.appendChild(p);
        panel.appendChild(body);
    }

    /* ---- progress --------------------------------------------------------
       Six steps. The plume head does not appear, it stops being hidden — it is
       rendered from the first paint at low opacity and rises to full. */
    function updateProgress() {
        var pct = clearedCount / TYPES.length;
        if (plume) {
            plume.style.opacity = (0.14 + pct * 0.86).toFixed(3);
            plume.style.transform = 'translate(-50%, -50%) scale(' + (0.86 + pct * 0.14).toFixed(3) + ')';
        }
        stage.dataset.cleared = String(clearedCount);
        if (clearedCount >= TYPES.length) { enterFinale(); }
    }

    function enterFinale() {
        if (stage.classList.contains('is-finale')) { return; }
        stage.classList.add('is-finale');
        halfTop.classList.remove('show');
        halfBottom.classList.remove('show');
        if (finale) {
            finale.hidden = false;
            /* Announced once, after the two-second ground change, so a screen
               reader is not read the closing line over the transition. */
            window.setTimeout(function () { finale.classList.add('show'); }, 120);
        }
    }

    function leaveFinale() {
        stage.classList.remove('is-finale');
        if (finale) { finale.classList.remove('show'); finale.hidden = true; }
    }

    var seed = 17;
    function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

    function buildCamField(density, sizeScale) {
        seed = 17;
        field.textContent = '';
        halfTop.classList.remove('show');
        halfBottom.classList.remove('show');
        var frag = document.createDocumentFragment();

        for (var i = 0; i < density; i++) {
            var t = TYPES[i % TYPES.length];
            var size = Math.round((62 + rand() * 78) * sizeScale);
            var topPct = rand() * 88;
            var btn = document.createElement('button');
            btn.className = 'cam-spot';
            btn.style.left = (rand() * 90) + '%';
            btn.style.top = topPct + '%';
            btn.style.width = size + 'px';
            btn.style.height = size + 'px';
            btn.style.transform = 'rotate(' + (rand() * 30 - 15) + 'deg)';
            btn.setAttribute('aria-label', t.label + ' — read a fact about it');
            btn.dataset.topPct = topPct;
            btn.dataset.key = t.key;
            var art = makeCam(t.key);
            if (art) { btn.appendChild(art); }
            btn.addEventListener('click', onPick(t.label, t.key, btn));
            frag.appendChild(btn);
        }
        field.appendChild(frag);
    }

    function onPick(label, key, el) {
        return function () {
            var group = field.querySelectorAll('.cam-spot[data-key="' + key + '"]');
            for (var i = 0; i < group.length; i++) { group[i].remove(); }

            if (!cleared[key]) { cleared[key] = true; clearedCount++; }

            var list = (FACTS && FACTS[key]) || [];
            /* Deliberately random on every pick, not sequential. Three facts per
               type and no memory of which was shown is what makes reloading and
               tapping again worth doing. */
            var fact = list.length
                ? list[Math.floor(Math.random() * list.length)]
                : { text: label };

            var clickedTop = parseFloat(el.dataset.topPct) < 44;
            var panel = clickedTop ? halfBottom : halfTop;
            var other = clickedTop ? halfTop : halfBottom;
            other.classList.remove('show');
            renderFact(panel, label, fact, key);
            panel.classList.add('show');

            updateProgress();
        };
    }

    /* Dismiss on click, but not when the click was on the link itself. */
    function wireDismiss(panel) {
        panel.addEventListener('click', function (e) {
            if (e.target.closest('a')) { return; }
            panel.classList.remove('show');
        });
    }
    wireDismiss(halfTop);
    wireDismiss(halfBottom);

    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            cleared = Object.create(null);
            clearedCount = 0;
            leaveFinale();
            buildCamField(26, 1);
            updateProgress();
            field.querySelector('.cam-spot') && field.querySelector('.cam-spot').focus();
        });
    }

    buildCamField(26, 1);
    updateProgress();
})();
