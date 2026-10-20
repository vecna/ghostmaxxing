/* Static navigation enhancement. Native details work before/without this file.
   Keep HTML copies in sync: tutorials/navigation-maintenance.md. */
(function () {
  'use strict';
  var header = document.querySelector('.gm-site-header');
  var mobile = header && header.querySelector('.gm-site-nav-toggle');
  var groups = Array.from(document.querySelectorAll('.gm-site-nav__group'));
  function closeGroups(except) {
    groups.forEach(function (group) { if (group !== except) group.open = false; });
  }
  function mobileOpen(open) {
    if (!header || !mobile) return;
    header.classList.toggle('gm-nav-open', open);
    mobile.setAttribute('aria-expanded', String(open));
    if (!open) closeGroups();
  }
  groups.forEach(function (group) {
    // Close siblings before the browser opens this disclosure. Using click
    // avoids queued toggle events closing a newer menu after a fast switch.
    group.querySelector('summary').addEventListener('click', function () {
      if (!group.open) closeGroups(group);
    });
    group.addEventListener('focusout', function (event) {
      if (!group.contains(event.relatedTarget)) group.open = false;
    });
  });
  if (mobile) {
    mobile.hidden = false;
    header.classList.add('gm-nav-ready');
    mobile.addEventListener('click', function () {
      mobileOpen(!header.classList.contains('gm-nav-open'));
    });
    header.addEventListener('focusout', function (event) {
      if (!header.contains(event.relatedTarget)) mobileOpen(false);
    });
  }
  document.addEventListener('click', function (event) {
    groups.forEach(function (group) { if (!group.contains(event.target)) group.open = false; });
    if (header && !header.contains(event.target)) mobileOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var open = groups.find(function (group) { return group.open; });
    if (open) {
      open.open = false;
      open.querySelector('summary').focus();
      event.preventDefault();
    } else if (header && header.classList.contains('gm-nav-open')) {
      mobileOpen(false);
      mobile.focus();
      event.preventDefault();
    }
  });
})();
