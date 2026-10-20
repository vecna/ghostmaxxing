/** Keep the reporting link aligned with the lab interface language. */
function updateNinaLinks() {
  const lang = document.documentElement.lang === 'it' ? 'it' : 'en';
  document.querySelectorAll('[data-nina-report]').forEach(a => {
    a.href = lang === 'it'
      ? 'https://sindacato.nina.watch/it/ghostati/segnalazioni/'
      : 'https://sindacato.nina.watch/en/ghostati/report/';
  });
}
updateNinaLinks();
new MutationObserver(updateNinaLinks).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
