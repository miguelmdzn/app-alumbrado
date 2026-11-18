/** Documentos de bitácora y de ajuste, con el formato de las hojas del municipio. */

import {
  esc,
  formatoPesos,
  formatoLitros,
  fechaDocumento,
  tituloSemana,
  tanqueSvg,
} from './formato.js';

const ESTILO = `
  @page { size: letter landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
  h1, h2, p { margin: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #222; padding: 3px 4px; text-align: center; vertical-align: middle; font-size: 10px; text-transform: uppercase; }
  .hoja { page-break-after: always; padding: 8mm 9mm 10mm; text-align: center; text-transform: uppercase; }
  .hoja:last-child { page-break-after: auto; }
  .bit-muni { text-align: center; font-size: 15px; font-weight: 800; letter-spacing: .2px; }
  .bit-titulo { text-align: center; font-size: 13px; font-weight: 800; margin: 2px 0 8px; }
  .bit-vehiculo { margin-bottom: 8px; }
  .bit-vehiculo th { font-size: 9px; font-weight: 800; }
  .bit-vehiculo td { font-size: 11px; font-weight: 700; height: 28px; }
  .bit-cuerpo th { font-size: 9px; font-weight: 800; line-height: 1.15; }
  .bit-cuerpo td { height: 84px; }
  .bit-lugar { text-align: center; }
  .bit-total td { height: 22px; font-weight: 800; }
  .tanque-celda { padding: 2px; }
  .firmas { display: flex; justify-content: space-between; gap: 24px; margin-top: 26px; }
  .firma { flex: 1; text-align: center; }
  .firma-rol { font-size: 11px; font-weight: 800; margin-bottom: 22px; }
  .firma-nombre { font-size: 11px; font-weight: 700; min-height: 16px; }
  .firma-linea { border-top: 1px solid #222; margin: 4px 18px 2px; }
  .firma-leyenda { font-size: 10px; font-weight: 700; }
  .aj-fecha, .aj-dep { text-align: center; color: #148433; font-weight: 800; font-size: 14px; }
  .aj-dep { margin-bottom: 8px; }
  .aj-presupuesto { text-align: center; font-size: 12px; font-weight: 700; margin-bottom: 10px; }
  .aj-wrap { display: flex; gap: 22px; align-items: flex-start; }
  .aj-side { width: 48%; }
  .aj-banner { text-align: center; color: #148433; font-weight: 800; font-size: 16px; letter-spacing: .08em; margin-bottom: 2px; }
  .aj-side th { font-size: 11px; text-decoration: underline; border: none; }
  .aj-side td { height: 22px; font-size: 12px; }
  .aj-side .aj-total td { font-weight: 800; }
  .aj-extra { margin-top: 14px; }
  .aj-extra h3 { font-size: 12px; margin: 10px 0 4px; }
  .aj-firmas { margin-top: 28px; margin-left: auto; width: 340px; text-align: center; }
  .aj-firmas .firma-nombre { margin-top: 16px; }
  .aj-firmas .firma-rol { margin: 2px 0 14px; font-size: 11px; }
`;

function marcaVehiculo(v) {
  return [v.marca, v.descripcion].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
}

function modeloVehiculo(v) {
  const modelo = String(v.modelo || '').trim();
  const anio = v.anio ? String(v.anio) : '';
  return [modelo, anio].filter(Boolean).join(' ');
}

function filaBitacora(row) {
  const grafico = tanqueSvg(row.nivel_antes_cargar || 'Vacio', 104, row.nivel_despues_carga || 'Vacio');
  const antes = grafico;
  const despues = grafico;
  return `<tr>
    <td>${esc(fechaDocumento(row.fecha_ticket))}</td>
    <td>${esc(row.numero_ticket)}</td>
    <td class="bit-lugar">${esc(row.lugar_comision)}</td>
    <td>${esc(formatoLitros(row.litros))}</td>
    <td>${esc(formatoPesos(row.importe))}</td>
    <td>${row.km_anterior == null || row.km_anterior === '' ? '' : esc(row.km_anterior)}</td>
    <td>${row.km_actual == null || row.km_actual === '' ? '' : esc(row.km_actual)}</td>
    <td class="tanque-celda">${antes}</td>
    <td class="tanque-celda">${despues}</td>
  </tr>`;
}

function hojaBitacora(vehiculo, filas) {
  const total = filas.reduce((acc, row) => acc + (Number(row.importe) || 0), 0);
  const vacias = Math.max(0, 4 - filas.length);
  const cuerpo = filas.map(filaBitacora).join('') + Array.from({ length: vacias }, () => `
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  const responsable = vehiculo.responsable_bien || '';
  return `<section class="hoja">
    <h1 class="bit-muni">MUNICIPIO VALLE DE SANTIAGO, GTO.</h1>
    <h2 class="bit-titulo">BITACORA DE CONTROL DEL CONSUMO DE GASOLINA</h2>
    <table class="bit-vehiculo">
      <tr>
        <th>RESPONSABLE DEL BIEN</th>
        <th>MARCA DEL VEHICULO</th>
        <th>RESGUARDO</th>
        <th>PLACA</th>
        <th>MODELO</th>
        <th>NO. SERIE</th>
      </tr>
      <tr>
        <td>${esc(responsable)}</td>
        <td>${esc(marcaVehiculo(vehiculo))}</td>
        <td>${esc(vehiculo.num_resguardo)}</td>
        <td>${esc(vehiculo.placas)}</td>
        <td>${esc(modeloVehiculo(vehiculo))}</td>
        <td>${esc(vehiculo.numero_serie || vehiculo.vehiculo_id)}</td>
      </tr>
    </table>
    <table class="bit-cuerpo">
      <thead>
        <tr>
          <th>FECHA</th>
          <th>No.TICKET</th>
          <th>LUGAR DE COMISIÓN</th>
          <th>LITROS</th>
          <th>IMPORTE</th>
          <th>KM ANTERIOR</th>
          <th>KM ACTUAL</th>
          <th>NIVEL DEL TANQUE AL CARGAR</th>
          <th>NIVEL DEL TANQUE AL FINAL DEL DIA</th>
        </tr>
      </thead>
      <tbody>
        ${cuerpo}
        <tr class="bit-total">
          <td colspan="3"></td>
          <td>TOTAL</td>
          <td>${esc(formatoPesos(total))}</td>
          <td colspan="4"></td>
        </tr>
      </tbody>
    </table>
    <div class="firmas">
      <div class="firma">
        <div class="firma-rol">ELABORÓ</div>
        <div class="firma-nombre">LIC. EVELIN JOSELIN MÉNDEZ MIRANDA</div>
        <div class="firma-linea"></div>
        <div class="firma-leyenda">Nombre y firma</div>
      </div>
      <div class="firma">
        <div class="firma-rol">RESPONSABLE DE LA CARGA</div>
        <div class="firma-nombre">${esc(responsable)}</div>
        <div class="firma-linea"></div>
        <div class="firma-leyenda">Nombre y firma</div>
      </div>
      <div class="firma">
        <div class="firma-rol">&nbsp;</div>
        <div class="firma-nombre">${esc(responsable)}</div>
        <div class="firma-linea"></div>
        <div class="firma-leyenda">Nombre y firma</div>
      </div>
    </div>
  </section>`;
}

export function htmlBitacoras(filas) {
  const grupos = new Map();
  filas.forEach((row) => {
    const clave = row.vehiculo_id || row.numero_serie;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(row);
  });
  return [...grupos.values()].map((rows) => hojaBitacora(rows[0], rows)).join('');
}

function filasAjuste(items) {
  const minimo = Math.max(items.length, 8);
  const filas = [];
  for (let i = 0; i < minimo; i += 1) {
    const item = items[i];
    if (!item) {
      filas.push('<tr><td></td><td></td><td></td></tr>');
    } else {
      filas.push(`<tr>
        <td>${esc(item.placas)}</td>
        <td>${esc(formatoPesos(item.saldoCentavos))}</td>
        <td>${esc(formatoPesos(item.montoCentavos))}</td>
      </tr>`);
    }
  }
  return filas.join('');
}

function totalMonto(items) {
  return (items || []).reduce((acc, item) => acc + (Number(item.montoCentavos) || 0), 0);
}

export function htmlAjuste(detalle) {
  const periodo = detalle.periodo;
  const restar = detalle.restar || [];
  const sumar = detalle.sumar || [];
  const movimientos = detalle.movimientos || [];
  const saldos = (detalle.saldos || []).filter((s) => {
    const participo = movimientos.some((m) => m.origenId === s.vehiculoId || m.destinoId === s.vehiculoId);
    return s.saldoCentavos !== 0 || participo || s.vehiculoId === periodo.vehiculoInicialId;
  });
  const sobrante = periodo.estado === 'CERRADO' && periodo.sobranteCentavos != null
    ? periodo.sobranteCentavos
    : detalle.disponibleCentavos;
  const detalleFilas = movimientos.map((m) => `<tr>
    <td>${esc(fechaDocumento(m.fechaMovimiento))}</td>
    <td>${esc(m.origenPlacas)}</td>
    <td>${esc(m.destinoPlacas)}</td>
    <td>${esc(formatoPesos(m.importeCentavos))}</td>
    <td>${esc(m.observaciones)}</td>
  </tr>`).join('') || '<tr><td colspan="5">Sin transferencias en este periodo.</td></tr>';
  const saldoFilas = saldos.map((s) => `<tr>
    <td>${esc(s.placas || s.vehiculoId)}</td>
    <td>${esc(formatoPesos(s.saldoCentavos))}</td>
  </tr>`).join('');

  return `<section class="hoja">
    <div class="aj-fecha">FECHA : ${esc(tituloSemana(periodo.fechaInicio, periodo.fechaFin))}</div>
    <div class="aj-dep">DEPENDENCIA: ALUMBRADO PUBLICO</div>
    <div class="aj-presupuesto">PRESUPUESTO INICIAL: ${esc(formatoPesos(periodo.presupuestoCentavos))} &nbsp;&nbsp; VEHÍCULO INICIAL: ${esc(periodo.vehiculoInicialPlacas || periodo.vehiculoInicialId)}</div>
    <div class="aj-wrap">
      <div class="aj-side">
        <div class="aj-banner">RESTAR</div>
        <table>
          <thead><tr><th>PLACA</th><th>SALDO ACTUAL</th><th>MONTO A MOVER</th></tr></thead>
          <tbody>
            ${filasAjuste(restar)}
            <tr class="aj-total"><td colspan="2">TOTAL</td><td>${esc(formatoPesos(totalMonto(restar)))}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="aj-side">
        <div class="aj-banner">SUMAR</div>
        <table>
          <thead><tr><th>PLACA</th><th>SALDO ACTUAL</th><th>MONTO A MOVER</th></tr></thead>
          <tbody>
            ${filasAjuste(sumar)}
            <tr class="aj-total"><td colspan="2">TOTAL</td><td>${esc(formatoPesos(totalMonto(sumar)))}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="aj-extra">
      <h3>TRANSFERENCIAS</h3>
      <table>
        <thead><tr><th>FECHA</th><th>ORIGEN</th><th>DESTINO</th><th>IMPORTE</th><th>OBSERVACIONES</th></tr></thead>
        <tbody>${detalleFilas}</tbody>
      </table>
      <h3>SALDOS FINALES</h3>
      <table>
        <thead><tr><th>PLACA</th><th>SALDO FINAL</th></tr></thead>
        <tbody>${saldoFilas}</tbody>
      </table>
      <p class="aj-presupuesto">SOBRANTE SEMANAL: ${esc(formatoPesos(sobrante))}</p>
    </div>
    <div class="aj-firmas">
      <div class="firma-linea"></div>
      <div class="firma-nombre">C. JOSE LUIS VAZQUEZ MORALES</div>
      <div class="firma-rol">DIRECTOR DE SERVICIOS PÚBLICOS</div>
      <div class="firma-linea"></div>
      <div class="firma-nombre">C. Jairo Chavez Almanza</div>
      <div class="firma-rol">JEFE DEL DPTO. ALUMBRADO PUBLICO</div>
    </div>
  </section>`;
}

function documentoHtml(cuerpo) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title></title><style>${ESTILO}</style></head><body>${cuerpo}</body></html>`;
}

function imprimirEnVisor(doc) {
  let marco = document.getElementById('combustiblePrintFrame');
  if (!marco) {
    marco = document.createElement('iframe');
    marco.id = 'combustiblePrintFrame';
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;';
    document.body.appendChild(marco);
  }
  const ventana = marco.contentWindow;
  const documento = ventana.document;
  documento.open();
  documento.write(doc);
  documento.close();
  const tituloPrevio = document.title;
  document.title = '';
  setTimeout(() => {
    ventana.focus();
    ventana.print();
    setTimeout(() => { document.title = tituloPrevio; }, 800);
  }, 250);
}

export function imprimirDocumento(_titulo, cuerpo) {
  const doc = documentoHtml(cuerpo);
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== 'function') {
    imprimirEnVisor(doc);
    return Promise.resolve();
  }
  return invoke('imprimir_pdf_limpio', { html: doc });
}
