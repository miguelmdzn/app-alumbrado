import { buildReporteEstadisticoHTML } from './reporte-estadistico.js';

const personal = [
  { id: 'id-ana', nombres: 'Ana', apellido1: 'Lopez', apellido2: 'Ruiz', numero_trabajador: '10' },
  { id: 'id-beto', nombres: 'Beto', apellido1: 'Diaz', apellido2: '', numero_trabajador: '11' },
  { id: 'id-caro', nombres: 'Caro', apellido1: 'Perez', apellido2: 'Nunez', numero_trabajador: '12' },
  { id: 'id-dani', nombres: 'Dani', apellido1: 'Soto', apellido2: '', numero_trabajador: '13' },
  { id: 'id-eva', nombres: 'Eva', apellido1: 'Gil', apellido2: '', numero_trabajador: '14' },
  { id: 'id-fran', nombres: 'Fran', apellido1: 'Orozco', apellido2: '', numero_trabajador: '15' },
  { id: 'id-gus', nombres: 'Gus', apellido1: 'Mora', apellido2: '', numero_trabajador: '16' },
];
const full = (p) => [p.nombres, p.apellido1, p.apellido2].filter(Boolean).join(' ');

const reportes = [
  { id: 'r1', folio: 'A-1', fecha: '2026-10-01', estatus: 'Atendido', colonia_comunidad: 'Centro', tipo_localidad: 'Cabecera municipal (Valle de Santiago)', numero_lamparas: 2, tipo_falla: 'No enciende', tipo_lampara: 'LED', atendio: 'id-ana,id-beto', direccion: 'Calle 1' },
  { id: 'r2', folio: 'A-2', fecha: '2026-10-02', estatus: 'Atendido', colonia_comunidad: 'centro', tipo_localidad: 'Cabecera municipal (Valle de Santiago)', numero_lamparas: 1, tipo_falla: 'No enciende', tipo_lampara: '', atendio: 'id-caro', direccion: 'Calle 2' },
  { id: 'r3', folio: 'A-3', fecha: '2026-10-03', estatus: 'Pendiente', colonia_comunidad: 'Monte', tipo_localidad: 'Comunidad', numero_lamparas: 3, tipo_falla: 'Intermitente', tipo_lampara: 'Amarilla sodio', atendio: '', direccion: 'Camino' },
  { id: 'r4', folio: 'A-4', fecha: '2026-10-04', estatus: 'Atendido', colonia_comunidad: 'Monte', tipo_localidad: 'Comunidad', numero_lamparas: 1, tipo_falla: 'Fundida', tipo_lampara: 'Blanca', atendio: '', direccion: 'Otra' },
  { id: 'r5', folio: 'A-5', fecha: '2026-11-10', estatus: 'Atendido', colonia_comunidad: 'Norte', tipo_localidad: 'Cabecera municipal (Valle de Santiago)', numero_lamparas: 4, tipo_falla: 'No enciende', tipo_lampara: 'LED', atendio: 'id-dani', direccion: 'Av' },
  { id: 'r6', folio: 'A-6', fecha: '2026-10-20', estatus: 'Atendido', colonia_comunidad: 'Sur', tipo_localidad: 'Cabecera municipal (Valle de Santiago)', numero_lamparas: 1, tipo_falla: 'Poste caido', tipo_lampara: 'LED', atendio: 'id-eva', direccion: 'Sur 1' },
  { id: 'r7', folio: 'A-7', fecha: '2026-10-21', estatus: 'Atendido', colonia_comunidad: 'Poniente', tipo_localidad: 'Cabecera municipal (Valle de Santiago)', numero_lamparas: 1, tipo_falla: 'Cable', tipo_lampara: 'LED', atendio: 'id-fran', direccion: 'Poniente 1' },
  { id: 'r8', folio: 'A-8', fecha: '2026-10-22', estatus: 'Atendido', colonia_comunidad: 'Oriente', tipo_localidad: 'Cabecera municipal (Valle de Santiago)', numero_lamparas: 1, tipo_falla: 'Balastro', tipo_lampara: 'LED', atendio: 'id-gus', direccion: 'Oriente 1' },
  { id: 'r9', folio: 'A-9', fecha: '2026-10-05', estatus: 'Atendido', colonia_comunidad: 'Centro', tipo_localidad: 'Cabecera municipal (Valle de Santiago)', numero_lamparas: 0, tipo_falla: 'No enciende', tipo_lampara: 'LED', atendio: 'Ana Lopez Ruiz', direccion: 'Calle 9' },
];

const evidencias = [
  { folio: 'A-4', fecha: '2026-10-06', atendio: 'id-ana', personal_instalo: 'id-beto' },
  { folio: 'A-1', fecha: '2026-10-02', atendio: 'id-ana' },
  { folio: 'fuera', fecha: '2026-10-08', atendio: 'id-gus' },
];

const solicitudes = [
  { fecha_solicitud: '2026-10-02', estatus: 'Atendido', cantidad_lamparas: 4, colonia_comunidad: 'Centro', tipo_localidad: 'Cabecera municipal (Valle de Santiago)', nombre_solicitante: 'Luis' },
  { fecha_solicitud: '2026-10-03', estatus: 'En espera', cantidad_lamparas: 2, colonia_comunidad: 'Monte', tipo_localidad: 'Comunidad', nombre_solicitante: 'Maria' },
  { fecha_solicitud: '2026-10-04', estatus: 'Urgente', cantidad_lamparas: 1, colonia_comunidad: 'monte', tipo_localidad: 'Comunidad', nombre_solicitante: 'Jose' },
  { fecha_solicitud: '2026-09-01', estatus: 'Atendido', cantidad_lamparas: 9, colonia_comunidad: 'Vieja', tipo_localidad: 'Comunidad', nombre_solicitante: 'FueraPeriodo' },
  { fecha_solicitud: '2026-10-11', estatus: 'Atendida', cantidad_lamparas: 3, colonia_comunidad: 'Centro', tipo_localidad: 'Cabecera municipal (Valle de Santiago)', nombre_solicitante: 'Rosa' },
];

const html = buildReporteEstadisticoHTML(
  reportes,
  evidencias,
  personal,
  '2026-10-01',
  '2026-11-15',
  full,
  solicitudes
);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('OK', msg);
  }
}

const names = ['Ana Lopez Ruiz', 'Beto Diaz', 'Caro Perez Nunez', 'Dani Soto', 'Eva Gil', 'Fran Orozco', 'Gus Mora'];
for (const n of names) assert(html.includes(n), 'aparece ' + n);

assert(html.includes('7 CON AL MENOS 1 SERVICIO'), 'lista a los 7 trabajadores');
assert(html.includes('Sin especificar'), 'lampara vacia no se vuelve Blanca');
assert(html.includes('INSTALACIÓN DE LÁMPARAS'), 'pagina solicitudes');
assert(!html.includes('FueraPeriodo'), 'solicitud fuera de rango excluida');
assert(!html.includes('Vieja'), 'localidad fuera excluida');
assert(html.includes('Página 3 de 3'), 'tercera pagina');
assert(html.includes('>14<'), 'total lamparas 14');
assert(html.includes('title="Día 10: 1 reportes"'), 'grafica incluye 10 de noviembre');
assert(!html.includes('Calle 1'), 'la calle no se cuenta como colonia');

const fallaSection = html.split('TIPO DE FALLA')[1].split('TIPO DE LÁMPARA')[0];
const pcts = [...fallaSection.matchAll(/\((\d+)%\)/g)].map((m) => Number(m[1]));
const sumPct = pcts.reduce((a, b) => a + b, 0);
assert(sumPct === 100, 'porcentajes de falla suman 100 (' + pcts.join(',') + ')');

const solSection = html.split('INSTALACIÓN DE LÁMPARAS')[1];
assert(solSection.includes('>4<'), '4 solicitudes en indicadores');
assert(solSection.includes('>10<'), '10 lamparas solicitadas');
assert(solSection.includes('>2<'), '2 solicitudes atendidas');

const personalSection = html.split('PERSONAL QUE ATENDIÓ')[1].split('Página 2 de 3')[0];
assert(personalSection.includes('>2<') || personalSection.includes('>3<'), 'Ana o Beto tienen mas de un servicio');

console.log(failed ? `FAILED ${failed}` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
