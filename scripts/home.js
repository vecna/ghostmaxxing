import { applyI18n, initI18n, setupLocaleSelect } from './i18n.js';

initI18n();
setupLocaleSelect(document.getElementById('localeSelect'), () => {
   applyI18n();
});
