/**
 * ============================================================================
 * INFORME ESTADÍSTICO — Controlador de Página (informe-estadistico-page.js)
 * ============================================================================
 */

import {
  initDatabase,
  getAllReportes,
  getAllEvidencias,
  getAllPersonal,
  getFullName,
} from './db.js';

import { buildReporteEstadisticoHTML } from './reporte-estadistico.js';

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('Error al conectar BD:', err);
  }

  let filtro = null;
  try {
    const raw = sessionStorage.getItem('informe_filtro');
    if (raw) filtro = JSON.parse(raw);
  } catch (err) {
    console.warn('Error al leer filtro de sessionStorage:', err);
  }

  // Si no hay filtro, usar el mes actual por defecto
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const toIso = (d) => d.toISOString().slice(0, 10);

  const fechaIni = filtro?.fechaIni || toIso(primerDiaMes);
  const fechaFin = filtro?.fechaFin || toIso(hoy);

  let allReportes = [];
  let allEvidencias = [];
  let allPersonal = [];

  try {
    const res = await Promise.all([
      getAllReportes(),
      getAllEvidencias(),
      getAllPersonal(),
    ]);
    allReportes = res[0] || [];
    allEvidencias = res[1] || [];
    allPersonal = res[2] || [];
  } catch (err) {
    console.error('Error al cargar datos para el informe:', err);
  }

  // Filtrar reportes en el rango de fechas
  const reportesFiltrados = allReportes.filter((r) => {
    if (!r.fecha) return false;
    return r.fecha >= fechaIni && r.fecha <= fechaFin;
  });

  // Generar HTML completo con el diseño exacto del PDF integrando reportes, evidencias y personal
  const fullHtml = buildReporteEstadisticoHTML(
    reportesFiltrados,
    allEvidencias,
    allPersonal,
    fechaIni,
    fechaFin,
    getFullName
  );

  // Inyectar en el documento
  document.open();
  document.write(fullHtml);
  document.close();

  // Agregar botón "Volver a Reportes" a la barra de acciones superior
  const setupNavButtons = () => {
    const bar = document.querySelector('.screen-action-bar');
    if (bar && !document.getElementById('btnVolverReportes')) {
      const btnVolver = document.createElement('button');
      btnVolver.id = 'btnVolverReportes';
      btnVolver.type = 'button';
      btnVolver.className = 'btn-action-print';
      btnVolver.style.background = '#334155';
      btnVolver.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        Volver a Reportes
      `;
      btnVolver.onclick = () => {
        window.location.href = 'registros-reportes.html';
      };
      bar.insertBefore(btnVolver, bar.firstChild);
    }
  };

  setTimeout(setupNavButtons, 60);
});
