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
        { file: 'cam-dome.svg', label: 'Dome camera', key: 'dome' },
        { file: 'cam-cube.svg', label: 'Box camera', key: 'cube' },
        { file: 'cam-glasses.svg', label: 'Smart glasses', key: 'glasses' },
        { file: 'cam-pill.svg', label: 'Pill sensor', key: 'pill' },
        { file: 'cam-street.svg', label: 'Street pole unit', key: 'street' },
        { file: 'cam-bullet.svg', label: 'Bullet camera', key: 'bullet' }
    ];
    var field = document.getElementById('camField');
    var halfTop = document.getElementById('camHalfTop');
    var halfBottom = document.getElementById('camHalfBottom');
    var halfTopText = document.getElementById('camHalfTopText');
    var halfBottomText = document.getElementById('camHalfBottomText');
    var FACTS = null;
    fetch('/data/camera-facts.json').then(function (r) { return r.json(); }).then(function (j) { FACTS = j; });

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
            var img = document.createElement('img');
            img.src = '/images/icons/' + t.file;
            img.alt = '';
            btn.appendChild(img);
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
