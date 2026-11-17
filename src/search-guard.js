/**
 * Evita que Edge/Chrome muestren búsquedas anteriores encima de las barras
 * de filtro y de los buscadores internos (personal, colonias, etc.).
 */
(function disarmBrowserSearchHistory() {
  function disarm(input) {
    if (!input || input.dataset.searchDisarmed === '1') return;
    input.dataset.searchDisarmed = '1';

    if (input.type === 'search') input.type = 'text';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    if (input.getAttribute('aria-autocomplete') !== 'list') {
      input.setAttribute('aria-autocomplete', 'none');
    }
    input.name = `filtro-app-${input.id || 'campo'}`;

    // El navegador no sugiere historial mientras el campo está en solo lectura.
    // Se habilita al usarlo, ya con el foco encima.
    input.readOnly = true;
    const unlock = () => {
      input.readOnly = false;
    };
    input.addEventListener('pointerdown', unlock);
    input.addEventListener('focus', unlock);
    input.addEventListener('keydown', unlock);
  }

  function run() {
    document.querySelectorAll(
      'input[type="search"], .records-search-wrapper input, .multiselect-input, .autocomplete-wrapper input'
    ).forEach(disarm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
