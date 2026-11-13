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
  getAllSolicitudesLamparas,
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
  const toLocalIso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const fechaIni = filtro?.fechaIni || toLocalIso(primerDiaMes);
  const fechaFin = filtro?.fechaFin || toLocalIso(hoy);

  let allReportes = [];
  let allEvidencias = [];
  let allPersonal = [];
  let allSolicitudes = [];

  try {
    const res = await Promise.all([
      getAllReportes(),
      getAllEvidencias(),
      getAllPersonal(),
      getAllSolicitudesLamparas(),
    ]);
    allReportes = res[0] || [];
    allEvidencias = res[1] || [];
    allPersonal = res[2] || [];
    allSolicitudes = res[3] || [];
  } catch (err) {
    console.error('Error al cargar datos para el informe:', err);
  }

  const enRango = (fecha) => {
    const dia = String(fecha || '').slice(0, 10);
    return dia.length === 10 && dia >= fechaIni && dia <= fechaFin;
  };

  const reportesFiltrados = allReportes.filter((r) => enRango(r.fecha));
  const solicitudesFiltradas = allSolicitudes.filter((s) => enRango(s.fecha_solicitud));

  const fullHtml = buildReporteEstadisticoHTML(
    reportesFiltrados,
    allEvidencias,
    allPersonal,
    fechaIni,
    fechaFin,
    getFullName,
    solicitudesFiltradas
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
