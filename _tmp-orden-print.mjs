import { htmlBitacoras } from './src/combustible/print.js';

const filas = [
  { vehiculo_id: 'v1', placas: 'ABC', fecha_ticket: '2026-11-20', numero_ticket: 'T20', lugar_comision: 'A', litros: 10, importe: 100, created_at: '2026-11-20T10:00:00' },
  { vehiculo_id: 'v1', placas: 'ABC', fecha_ticket: '2026-11-17', numero_ticket: 'T17', lugar_comision: 'A', litros: 10, importe: 100, created_at: '2026-11-17T10:00:00' },
  { vehiculo_id: 'v1', placas: 'ABC', fecha_ticket: '2026-11-18', numero_ticket: 'T18', lugar_comision: 'A', litros: 10, importe: 100, created_at: '2026-11-18T10:00:00' },
];

const tickets = (html) => [...html.matchAll(/<td>(T\d+)<\/td>/g)].map((m) => m[1]);
console.log('asc', tickets(htmlBitacoras(filas, 'X', 'asc')).join(','));
console.log('desc', tickets(htmlBitacoras(filas, 'X', 'desc')).join(','));
console.log('default', tickets(htmlBitacoras(filas, 'X')).join(','));
