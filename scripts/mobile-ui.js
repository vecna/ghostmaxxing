/** @module mobile-ui */
document.addEventListener('DOMContentLoaded', () => {
  // --- SETTINGS DRAWER TOGGLE ---
  const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsDrawer = document.getElementById('settingsDrawer');

  function toggleDrawer() {
    if (settingsDrawer) {
      settingsDrawer.classList.toggle('hidden');
    }
  }

  if (toggleSettingsBtn) toggleSettingsBtn.addEventListener('click', toggleDrawer);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', toggleDrawer);

  // --- FULLSCREEN TOGGLE ---
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  
  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) { /* Safari */
        document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) { /* IE11 */
        document.documentElement.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
      }
    }
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullScreen);
  }

  // --- GESTURES: SWIPE AND SCROLL TO CLEAR OVERLAY ---
  let touchStartY = 0;
  let touchEndY = 0;
  
  // Threshold to consider a swipe
  const SWIPE_THRESHOLD = 50;

  function handleGesture() {
    const distanceY = Math.abs(touchEndY - touchStartY);
    if (distanceY > SWIPE_THRESHOLD) {
      // Swipe up or down detected
      clearOverlayAndLogs();
    }
  }

  // Avoid triggering on elements that actually need to scroll (like the settings drawer)
  const isScrollableElement = (el) => {
    return el.closest('.scrollable') || el.closest('#settingsDrawer') || el.closest('#historyDrawer');
  };

  /* [SYSTEM API: document.addEventListener('touchstart'/'touchend')]
   * Funzionamento: API nativa per intercettare il tocco delle dita sui display touch.
   * Parametri: 'touchstart', callback(e), { passive: true } (migliora le performance dicendo al browser che non useremo preventDefault).
   * Feature: Registra l'inizio e la fine di uno swipe verticale per attivare la pulizia dei log e dell'overlay (gesture UI).
   */
  document.addEventListener('touchstart', (e) => {
    if (isScrollableElement(e.target)) return;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (isScrollableElement(e.target)) return;
    touchEndY = e.changedTouches[0].screenY;
    handleGesture();
  }, { passive: true });

  /* [SYSTEM API: document.addEventListener('wheel')]
   * Funzionamento: Intercetta la rotellina del mouse o il trackpad su desktop.
   * Parametri: 'wheel', callback(e), { passive: true }.
   * Feature: Replica il comportamento dello swipe (clear overlay e log) anche per gli utenti desktop tramite wheel/scroll.
   */
  document.addEventListener('wheel', (e) => {
    if (isScrollableElement(e.target)) return;
    // Debounce or just trigger on any significant scroll
    if (Math.abs(e.deltaY) > 20) {
      clearOverlayAndLogs();
    }
  }, { passive: true });

  function clearOverlayAndLogs() {
    // 1. Trigger the logic to clear the Ghostaoverlay if it exists

    // Removed at the moment, should be renamed OR we should clean the Ghostyle effect.

    // 2. Clear the visible logs
    if (window.gstmxx && window.gstmxx.clearVisibleLogs) {
       window.gstmxx.clearVisibleLogs();
    }
  }

});
