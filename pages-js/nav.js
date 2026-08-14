/* Site nav — the "Know more" dropdown. Shared by every page.
 *
 * Was inside scripts/index.js, so the dropdown only existed on the homepage
 * and every other page shipped a different, flatter nav. Nothing here knows
 * about a page; it binds to whatever .gm-site-nav__trigger it finds.
 *
 * Load with defer, or after the header in the body. No dependencies. */
(function () {
    'use strict';

    var trigger = document.querySelector('.gm-site-nav__trigger');
    var menu = document.getElementById('gmSiteMenu');
    if (!trigger || !menu) { return; }

    function setOpen(open) {
        menu.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        setOpen(!menu.classList.contains('is-open'));
    });

    document.addEventListener('click', function (e) {
        if (!menu.contains(e.target) && e.target !== trigger) { setOpen(false); }
    });

    /* Escape closes and returns focus to the trigger, otherwise a keyboard user
       who opens the menu and changes their mind is stranded inside it. */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.classList.contains('is-open')) {
            setOpen(false);
            trigger.focus();
        }
    });

    /* Tabbing out of the last link should close it too. */
    menu.addEventListener('focusout', function (e) {
        if (!menu.contains(e.relatedTarget) && e.relatedTarget !== trigger) { setOpen(false); }
    });
})();
