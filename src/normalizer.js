/**
 * ============================================================================
 * NORMALIZADOR UNIVERSAL DE INPUTS Y TEXTAREAS
 * ============================================================================
 * Reglas solicitadas:
 * 1. Siempre se escribe en MAYÚSCULAS automáticamente.
 * 2. Solo se permite un espacio, siempre entre palabras.
 * 3. Nunca se permite espacio al inicio.
 * 4. Nunca se permite espacio al final (se limpia en blur / submit).
 * ============================================================================
 */

/**
 * Normalización en vivo (mientras el usuario teclea)
 * - Convierte a mayúsculas
 * - Elimina cualquier espacio al inicio
 * - Colapsa múltiples espacios consecutivos a uno solo
 */
export function normalizeLive(val) {
  if (typeof val !== 'string') return '';
  return val
    .toUpperCase()
    .replace(/^\s+/, '')      // Nunca espacio al inicio
    .replace(/\s{2,}/g, ' '); // Solo un espacio entre palabras
}

/**
 * Normalización final (al salir del input o al enviar formulario)
 * - Aplica normalizeLive y además elimina espacios sobrantes al final
 */
export function normalizeFinal(val) {
  if (typeof val !== 'string') return '';
  return normalizeLive(val).trim();
}

/**
 * Conecta los listeners de normalización automática a todos los inputs
 * de texto y textareas dentro de un contenedor dado.
 * Se excluyen campos especiales como contraseñas o fechas.
 */
export function attachInputNormalizers(container = document) {
  const selector = 'input[type="text"], input[type="search"], textarea';
  const elements = container.querySelectorAll(selector);

  elements.forEach((el) => {
    // Excluir si ya fue inicializado o si es un enlace de maps
    if (el.dataset.normalizerAttached === 'true') return;
    if (el.id === 'geoLink') return; // Conservar URLs tal cual

    el.dataset.normalizerAttached = 'true';

    // Normalización al teclear
    el.addEventListener('input', () => {
      const original = el.value;
      const start = el.selectionStart;
      const normalized = normalizeLive(original);

      if (original !== normalized) {
        el.value = normalized;
        // Restaurar posición del cursor
        if (start !== null) {
          const diff = original.length - normalized.length;
          const newPos = Math.max(0, start - diff);
          el.setSelectionRange(newPos, newPos);
        }
      }
    });

    // Normalización al perder el foco (eliminar espacio final)
    el.addEventListener('blur', () => {
      el.value = normalizeFinal(el.value);
    });
  });
}

