/* Compact tool switcher. Kept in lab-js so native lab imports include it. */
(function () {
  'use strict';
  var group = document.querySelector('.gm-tool-nav details');
  if (!group) return;
  document.addEventListener('click', function (event) {
    if (!group.contains(event.target)) group.open = false;
  });
  group.addEventListener('focusout', function (event) {
    if (!group.contains(event.relatedTarget)) group.open = false;
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && group.open) {
      group.open = false;
      group.querySelector('summary').focus();
      event.preventDefault();
    }
  });
})();
