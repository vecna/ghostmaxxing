/** @module mobile-ui */
document.addEventListener('DOMContentLoaded', () => {
  // --- GESTURES: SWIPE AND SCROLL TO CLEAR OVERLAY ---
  let touchStartY = 0;
  let touchEndY = 0;
  
  // Threshold to consider a swipe
  const SWIPE_THRESHOLD = 50;

  function handleGesture() {
    const distanceY = Math.abs(touchEndY - touchStartY);
    if (distanceY > SWIPE_THRESHOLD) {
      // Swipe up or down detected
      clearVisibleLogsAfterGesture();
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
      clearVisibleLogsAfterGesture();
    }
  }, { passive: true });

  function clearVisibleLogsAfterGesture() {
    // Gestures currently clear only the visible log window; effects and
    // diagnostic canvases remain intact.
    if (window.gstmxx && window.gstmxx.clearVisibleLogs) {
       window.gstmxx.clearVisibleLogs();
    }
  }

});
