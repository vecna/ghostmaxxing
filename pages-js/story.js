/* The homepage story carousel.
 *
 * Eight cards, and the argument is their order: a Ghostyle works on the face
 * it was drawn on, fails in two different ways on two other faces, and comes
 * back as a new Ghostyle. See the comment above the markup in index.html.
 *
 * Three decisions worth keeping:
 *
 *   It opens on card 2, not card 1. Card 1 is the baseline, which is a setup
 *   rather than a claim, and most people look at one card and leave. Landing
 *   on the Ghostyle that worked means a reader who never swipes still gets the
 *   whole proposition, and the baseline is one swipe backwards for anyone who
 *   wonders what it crossed from.
 *
 *   The scroller is the browser's, not ours. Horizontal swipe is a free
 *   gesture on a phone: vertical scroll still belongs to the page, so this
 *   carousel can never trap someone the way a pinned scroll sequence does.
 *   Momentum, rubber-banding and keyboard arrows all come from the platform.
 *   scroll-snap-stop: always is set in the CSS so one flick cannot skip from
 *   card 2 to card 6 and lose the failure that the story turns on.
 *
 *   Nothing moves on its own. An auto-advancing carousel decides what you look
 *   at, which is a strange thing to build for a project about machines
 *   deciding what to look at, and it would need a pause control to be
 *   accessible anyway.
 *
 * Without this file the track is still a horizontal scroller with all eight
 * cards in it. Only the dots, the arrows and the opening position are lost.
 */
(function () {
    'use strict';

    var track = document.getElementById('storyTrack');
    var controls = document.getElementById('storyControls');
    var dotList = document.getElementById('storyDots');
    if (!track || !controls || !dotList) return;

    var cards = Array.prototype.slice.call(track.querySelectorAll('.story__card'));
    if (cards.length < 2) return;

    var OPENS_ON = 1; // zero-based: the second card
    var current = OPENS_ON;
    var dots = [];

    /* The card whose centre is nearest the viewport centre. Reading the
       positions is more reliable than counting scroll steps: the snap points
       are the browser's and it is free to land where it likes. */
    function nearestCard() {
        var mid = track.scrollLeft + track.clientWidth / 2;
        var best = 0;
        var bestGap = Infinity;
        for (var i = 0; i < cards.length; i += 1) {
            var centre = cards[i].offsetLeft + cards[i].offsetWidth / 2;
            var gap = Math.abs(centre - mid);
            if (gap < bestGap) { bestGap = gap; best = i; }
        }
        return best;
    }

    function markCurrent(index) {
        if (index === current) return;
        current = index;
        for (var i = 0; i < dots.length; i += 1) {
            var isHere = i === index;
            dots[i].classList.toggle('is-current', isHere);
            dots[i].setAttribute('aria-current', isHere ? 'true' : 'false');
        }
    }

    /* A smooth scroll fires dozens of scroll events on its way, and the
       handler below would read the card it is passing over as the current one.
       While a programmatic scroll is in flight the handler stands down, or a
       second tap on an arrow acts on whichever card the animation happened to
       be crossing. */
    var movingUntil = 0;

    function goTo(index, smooth) {
        var clamped = Math.max(0, Math.min(cards.length - 1, index));
        var card = cards[clamped];
        var left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
        if (smooth && !prefersStill()) {
            movingUntil = Date.now() + 700;
            track.scrollTo({ left: left, behavior: 'smooth' });
        } else {
            movingUntil = Date.now() + 120;
            track.scrollLeft = left;
        }
        markCurrent(clamped);
    }

    function prefersStill() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /* Dots. Buttons, not decoration: they are the only affordance for a reader
       who is not going to drag anything, and a label that says which card it
       is beats "slide 4 of 8" read out with no idea what is on it. */
    cards.forEach(function (card, index) {
        var state = card.querySelector('.story__state');
        var label = state ? state.textContent.trim() : 'Card ' + (index + 1);
        var item = document.createElement('li');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'story__dot';
        button.setAttribute('aria-label', (index + 1) + ' of ' + cards.length + ': ' + label);
        button.setAttribute('aria-current', 'false');
        button.addEventListener('click', function () { goTo(index, true); });
        item.appendChild(button);
        dotList.appendChild(item);
        dots.push(button);
    });

    Array.prototype.forEach.call(controls.querySelectorAll('[data-story-step]'), function (button) {
        button.addEventListener('click', function () {
            goTo(current + Number(button.getAttribute('data-story-step')), true);
        });
    });

    var settling = null;
    track.addEventListener('scroll', function () {
        window.clearTimeout(settling);
        settling = window.setTimeout(function () {
            if (Date.now() < movingUntil) return;
            markCurrent(nearestCard());
        }, 90);
    }, { passive: true });

    window.addEventListener('resize', function () {
        /* A resize changes every offsetLeft, so the scroll position now points
           at the wrong card. Put the reader back on the one they were reading
           rather than wherever the arithmetic landed. */
        goTo(current, false);
    });

    controls.hidden = false;
    markCurrent(-1);

    /* Opening position, after layout: offsetLeft is only meaningful once the
       cards have been laid out, and the images carry width and height so that
       happens before they load. */
    if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () { goTo(OPENS_ON, false); });
    } else {
        goTo(OPENS_ON, false);
    }
}());
