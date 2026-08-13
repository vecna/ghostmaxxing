(function () {
    var trigger = document.getElementById('knowMoreTrigger');
    var menu = document.getElementById('knowMoreMenu');
    trigger.addEventListener('click', function () {
        var open = menu.classList.toggle('open');
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
        if (!menu.contains(e.target) && e.target !== trigger) { menu.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); }
    });

    var TYPES = [
        { label: 'Dome camera', key: 'dome' },
        { label: 'Box camera', key: 'cube' },
        { label: 'Smart glasses', key: 'glasses' },
        { label: 'Pill sensor', key: 'pill' },
        { label: 'Street pole unit', key: 'street' },
        { label: 'Bullet camera', key: 'bullet' }
    ];

    /* The icons are cloned from <template id="camtpl-*"> in index.html rather
       than loaded as <img src="images/icons/cam-*.svg">. Those files are
       class-driven — no fill attributes — and an <img>-loaded SVG is an
       isolated document that never sees cameras.css, so every camera came out
       solid black. A clone is an ordinary node and gets styled normally.

       Ids are suffixed per instance because .cam-iris carries one and the field
       puts 26 cameras on the page. */
    var uid = 0;
    function makeCam(key) {
        var tpl = document.getElementById('camtpl-' + key);
        if (!tpl) return null;
        var svg = tpl.content.firstElementChild.cloneNode(true);
        var n = ++uid;
        var withId = svg.querySelectorAll('[id]');
        for (var j = 0; j < withId.length; j++) { withId[j].id = withId[j].id + '-f' + n; }
        return svg;
    }
    var field = document.getElementById('camField');
    var halfTop = document.getElementById('camHalfTop');
    var halfBottom = document.getElementById('camHalfBottom');
    var halfTopText = document.getElementById('camHalfTopText');
    var halfBottomText = document.getElementById('camHalfBottomText');
    var FACTS = null;
    /* data/camera-facts.json is optional. Without the catch, a 404 makes
       r.json() reject and the console fills with an unhandled rejection; the
       click handler already falls back to the plain camera label. */
    fetch('/data/camera-facts.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { FACTS = j; })
        .catch(function () { FACTS = null; });

    var seed = 17;
    function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

    function buildCamField(density, sizeScale) {
        seed = 17;
        field.innerHTML = '';
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
            btn.setAttribute('aria-label', t.label);
            btn.dataset.topPct = topPct;
            btn.dataset.key = t.key;
            var art = makeCam(t.key);
            if (art) { btn.appendChild(art); }
            btn.addEventListener('click', function (label, key, el) {
                return function () {
                    var group = field.querySelectorAll('.cam-spot[data-key="' + key + '"]');
                    group.forEach(function (g) { g.remove(); });
                    var list = (FACTS && FACTS[key]) || [];
                    var msg = list.length ? list[Math.floor(Math.random() * list.length)] : label;
                    var full = label + ' — ' + msg;
                    var clickedTop = parseFloat(el.dataset.topPct) < 44;
                    halfTop.classList.remove('show');
                    halfBottom.classList.remove('show');
                    if (clickedTop) { halfBottomText.textContent = full; halfBottom.classList.add('show'); }
                    else { halfTopText.textContent = full; halfTop.classList.add('show'); }
                };
            }(t.label, t.key, btn));
            frag.appendChild(btn);
        }
        field.appendChild(frag);
    }
    buildCamField(26, 1);

    halfTop.addEventListener('click', function () { halfTop.classList.remove('show'); });
    halfBottom.addEventListener('click', function () { halfBottom.classList.remove('show'); });
})();
