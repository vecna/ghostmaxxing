/* Homepage story carousel.
 *
 * The browser owns the horizontal scroller and scroll snapping. JavaScript
 * adds the opening position, dots, buttons, keyboard navigation and clickable
 * side previews. Nothing advances automatically.
 */
(function () {
    'use strict';

    var track = document.getElementById('storyTrack');
    var controls = document.getElementById('storyControls');
    var dotList = document.getElementById('storyDots');
    if (!track || !controls || !dotList) return;

    var cards = Array.prototype.slice.call(track.querySelectorAll('.story__card'));
    if (cards.length < 2) return;

    var START_INDEX = 1; // story-card-2
    var current = -1;
    var dots = [];
    var scrollTimer = null;

    track.setAttribute('tabindex', '0');

    function nearestCard() {
        var trackBox = track.getBoundingClientRect();
        var trackCentre = trackBox.left + trackBox.width / 2;
        var nearest = 0;
        var nearestGap = Infinity;

        cards.forEach(function (card, index) {
            var cardBox = card.getBoundingClientRect();
            var cardCentre = cardBox.left + cardBox.width / 2;
            var gap = Math.abs(cardCentre - trackCentre);
            if (gap < nearestGap) {
                nearest = index;
                nearestGap = gap;
            }
        });

        return nearest;
    }

    function setCurrent(index) {
        current = index;

        cards.forEach(function (card, cardIndex) {
            if (cardIndex === index) {
                card.setAttribute('aria-current', 'true');
            } else {
                card.removeAttribute('aria-current');
            }
        });

        dots.forEach(function (dot, dotIndex) {
            var isCurrent = dotIndex === index;
            dot.classList.toggle('is-current', isCurrent);
            dot.setAttribute('aria-current', isCurrent ? 'true' : 'false');
        });
    }

    function goTo(index, smooth) {
        var targetIndex = Math.max(0, Math.min(cards.length - 1, index));
        var card = cards[targetIndex];
        var left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
        var reduceMotion = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        track.scrollTo({
            left: left,
            behavior: smooth && !reduceMotion ? 'smooth' : 'auto'
        });
        setCurrent(targetIndex);
    }

    cards.forEach(function (card, index) {
        var state = card.querySelector('.story__state');
        var label = state ? state.textContent.trim() : 'Card ' + (index + 1);
        var item = document.createElement('li');
        var button = document.createElement('button');

        button.type = 'button';
        button.className = 'story__dot';
        button.setAttribute('aria-label', (index + 1) + ' of ' + cards.length + ': ' + label);
        button.setAttribute('aria-current', 'false');
        button.addEventListener('click', function () {
            goTo(index, true);
        });

        item.appendChild(button);
        dotList.appendChild(item);
        dots.push(button);
    });

    Array.prototype.forEach.call(controls.querySelectorAll('[data-story-step]'), function (button) {
        button.addEventListener('click', function () {
            var step = Number(button.getAttribute('data-story-step'));
            goTo(current + step, true);
        });
    });

    track.addEventListener('click', function (event) {
        var card = event.target.closest('.story__card');
        if (!card || !track.contains(card)) return;

        var index = cards.indexOf(card);
        if (index < 0 || index === current) return;

        event.preventDefault();
        goTo(index, true);
    });

    document.addEventListener('keydown', function (event) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;

        event.preventDefault();
        goTo(current + (event.key === 'ArrowRight' ? 1 : -1), true);
    });

    track.addEventListener('scroll', function () {
        window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(function () {
            setCurrent(nearestCard());
        }, 100);
    }, { passive: true });

    controls.hidden = false;

    window.addEventListener('pageshow', function () {
        goTo(START_INDEX, false);
    }, { once: true });
}());
