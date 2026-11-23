/**
 * Menú lateral único. Todas las pantallas lo montan desde aquí.
 */
const PAGINA_ACTIVA = {
  'registros-reportes.html': 'navSidebarReportes',
  'reportes.html': 'navSidebarReportes',
  'atencion.html': 'navSidebarReportes',
  'atenciones.html': 'navSidebarReportes',
  'solicitudes-lamparas.html': 'navSidebarReportes',
  'index.html': 'navSidebarEvidencias',
  'registros.html': 'navSidebarEvidencias',
  'personal.html': 'navSidebarPersonal',
  'lamparas-instaladas.html': 'navSidebarLamparas',
  'nueva-lampara.html': 'navSidebarLamparas',
  'herramientas.html': 'navSidebarHerramientas',
  'dias-inhabiles.html': 'navSidebarHerramientas',
  'justificantes.html': 'navSidebarHerramientas',
  'control-combustibles.html': 'navSidebarHerramientas',
  'comunidades-colonias.html': 'navSidebarHerramientas',
  'requi.html': 'navSidebarHerramientas',
  'bitacoras-gasolina.html': 'navSidebarHerramientas',
  'bitacoras-combustible.html': 'navSidebarHerramientas',
  'vehiculos.html': 'navSidebarHerramientas',
  'ajustes-combustible.html': 'navSidebarHerramientas',
};

const MENU = "<aside class=\"app-sidebar noprint\">\r\n      <div class=\"sidebar-brand\">\r\n        <div class=\"sidebar-brand-badge\">\r\n          <svg class=\"lantern-mark\" width=\"28\" height=\"36\" viewBox=\"0 0 64 84\" aria-hidden=\"true\">\r\n            <ellipse class=\"ln-glow\" cx=\"32\" cy=\"44\" rx=\"20\" ry=\"18\"></ellipse>\r\n            <circle class=\"ln-line\" cx=\"32\" cy=\"6\" r=\"3.15\"></circle>\r\n            <path class=\"ln-line\" d=\"M18 24.5C18 8 46 8 46 24.5\"></path>\r\n            <path class=\"ln-fill\" d=\"M24.5 12.2h15v3.4h-15z\"></path>\r\n            <path class=\"ln-fill\" d=\"M22.2 15.4h19.6v5.4c0 .9-.9 1.6-2 1.6H24.2c-1.1 0-2-.7-2-1.6z\"></path>\r\n            <circle class=\"ln-hole\" cx=\"28\" cy=\"18.4\" r=\"1\"></circle>\r\n            <circle class=\"ln-hole\" cx=\"32\" cy=\"18.4\" r=\"1\"></circle>\r\n            <circle class=\"ln-hole\" cx=\"36\" cy=\"18.4\" r=\"1\"></circle>\r\n            <circle class=\"ln-line\" cx=\"15.5\" cy=\"24.2\" r=\"2.15\"></circle>\r\n            <circle class=\"ln-line\" cx=\"48.5\" cy=\"24.2\" r=\"2.15\"></circle>\r\n            <path class=\"ln-line ln-arm\" d=\"M20 27C11 39 12 55 21 64\"></path>\r\n            <path class=\"ln-line ln-arm\" d=\"M44 27C53 39 52 55 43 64\"></path>\r\n            <path class=\"ln-glass\" d=\"M24.2 27.2c-4.2 9.2-3.6 20.2.6 31h14.4c4.2-10.8 4.8-21.8.6-31z\"></path>\r\n            <path class=\"ln-line ln-guard\" d=\"M26.2 34c5.2 6.2 7.2 13.2 11.2 22\"></path>\r\n            <path class=\"ln-line ln-guard\" d=\"M37.8 34c-5.2 6.2-7.2 13.2-11.2 22\"></path>\r\n            <path class=\"ln-flame\" d=\"M32 52.2c-1.7-4.1-4.4-5.8-2.1-10.6 3.4 3 4.8 4.6 2.1 10.6z\"></path>\r\n            <path class=\"ln-flame-core\" d=\"M32 50.6c-.8-2.3-2-3.2-1.1-5.8 1.7 1.5 2.4 2.3 1.1 5.8z\"></path>\r\n            <path class=\"ln-fill\" d=\"M18.2 59.2h27.6l3.3 7.4c.9 3.5-1.7 6.8-6.4 7.8H21.3c-4.7-1-7.3-4.3-6.4-7.8z\">\r\n            </path>\r\n            <circle class=\"ln-knob\" cx=\"32\" cy=\"69\" r=\"2.35\"></circle>\r\n          </svg>\r\n        </div>\r\n        <div class=\"sidebar-brand-text\">\r\n          <span class=\"sidebar-brand-title\">ALUMBRADO</span>\r\n          <span class=\"sidebar-brand-sub\">PÚBLICO</span>\r\n        </div>\r\n      </div>\r\n\r\n      <nav class=\"sidebar-menu\">\r\n        <a href=\"registros-reportes.html\" class=\"sidebar-menu-item\" id=\"navSidebarReportes\">\r\n          <svg class=\"sidebar-menu-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n            stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n            <path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"></path>\r\n            <polyline points=\"14 2 14 8 20 8\"></polyline>\r\n            <line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"></line>\r\n            <line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"></line>\r\n            <polyline points=\"10 9 9 9 8 9\"></polyline>\r\n          </svg>\r\n          <span>Reportes</span>\r\n        </a>\r\n\r\n        <a href=\"registros.html\" class=\"sidebar-menu-item\" id=\"navSidebarEvidencias\">\r\n          <svg class=\"sidebar-menu-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n            stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n            <path d=\"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z\"></path>\r\n            <circle cx=\"12\" cy=\"13\" r=\"4\"></circle>\r\n          </svg>\r\n          <span>Evidencias</span>\r\n        </a>\r\n\r\n        <a href=\"personal.html\" class=\"sidebar-menu-item\" id=\"navSidebarPersonal\">\r\n          <svg class=\"sidebar-menu-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n            stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n            <path d=\"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2\"></path>\r\n            <circle cx=\"9\" cy=\"7\" r=\"4\"></circle>\r\n            <path d=\"M23 21v-2a4 4 0 0 0-3-3.87\"></path>\r\n            <path d=\"M16 3.13a4 4 0 0 1 0 7.75\"></path>\r\n          </svg>\r\n          <span>Personal</span>\r\n        </a>\r\n\r\n        <!-- Opción de primer nivel Lámparas LED -->\r\n        <a href=\"lamparas-instaladas.html\" class=\"sidebar-menu-item\" id=\"navSidebarLamparas\">\r\n          <svg class=\"sidebar-menu-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n            stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n            <circle cx=\"12\" cy=\"12\" r=\"5\"></circle>\r\n            <line x1=\"12\" y1=\"1\" x2=\"12\" y2=\"3\"></line>\r\n            <line x1=\"12\" y1=\"21\" x2=\"12\" y2=\"23\"></line>\r\n            <line x1=\"4.22\" y1=\"4.22\" x2=\"5.64\" y2=\"5.64\"></line>\r\n            <line x1=\"18.36\" y1=\"18.36\" x2=\"19.78\" y2=\"19.78\"></line>\r\n            <line x1=\"1\" y1=\"12\" x2=\"3\" y2=\"12\"></line>\r\n            <line x1=\"21\" y1=\"12\" x2=\"23\" y2=\"12\"></line>\r\n            <line x1=\"4.22\" y1=\"19.78\" x2=\"5.64\" y2=\"18.36\"></line>\r\n            <line x1=\"18.36\" y1=\"5.64\" x2=\"19.78\" y2=\"4.22\"></line>\r\n          </svg>\r\n          <span>Lámparas LED</span>\r\n        </a>\r\n\r\n        <!-- Menú desplegable Herramientas -->\r\n        <a href=\"herramientas.html\" class=\"sidebar-menu-item\" id=\"navSidebarHerramientas\">\r\n          <svg class=\"sidebar-menu-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n            stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n            <path\r\n              d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z\">\r\n            </path>\r\n          </svg>\r\n          <span>Herramientas</span>\r\n        </a>\r\n      </nav>\r\n\r\n      <div class=\"sidebar-skyline\" aria-hidden=\"true\"></div>\r\n\r\n      <!-- Footer del Sidebar: Google Sheets -->\r\n      <div class=\"sidebar-footer\">\r\n        <button type=\"button\" class=\"sidebar-footer-btn\" id=\"btnSidebarGoogleSheets\"\r\n          title=\"Sincronización con Google Sheets\">\r\n          <svg class=\"sidebar-menu-icon\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\"\r\n            stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\r\n            <path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"></path>\r\n            <polyline points=\"14 2 14 8 20 8\"></polyline>\r\n            <line x1=\"8\" y1=\"13\" x2=\"16\" y2=\"13\"></line>\r\n            <line x1=\"8\" y1=\"17\" x2=\"16\" y2=\"17\"></line>\r\n            <polyline points=\"10 9 9 9 8 9\"></polyline>\r\n          </svg>\r\n          <span>Google Sheets</span>\r\n        </button>\r\n      </div>\r\n    </aside>";

const mount = document.getElementById('appSidebarMount');
if (mount) {
  mount.outerHTML = MENU;
  const pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const id = PAGINA_ACTIVA[pagina];
  const actual = id ? document.getElementById(id) : null;
  if (actual) {
    actual.classList.add('active');
    actual.setAttribute('aria-current', 'page');
  }

  const sheets = document.getElementById('btnSidebarGoogleSheets');
  if (sheets && pagina !== 'personal.html') {
    sheets.addEventListener('click', () => {
      location.href = 'personal.html?openSheets=1';
    });
  }
}
