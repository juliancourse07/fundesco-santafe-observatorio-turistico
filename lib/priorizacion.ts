import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { SurveyRecord } from './normalize';

export const criteriosPriorizacion = [
  ['Pertinencia turística fortalecible', 14, 'Producto o experiencia turística con potencial de fortalecimiento.'],
  ['Relevancia territorial', 12, 'Ubicación y articulación con la oferta de Santa Fe.'],
  ['Formalización y habilitación', 12, 'Registro mercantil, RUT, RNT y condiciones habilitantes.'],
  ['Capacidades DTI', 14, 'Gobernanza, tecnología, innovación, sostenibilidad, accesibilidad, comercio y redes.'],
  ['Preparación e infraestructura', 10, 'Condiciones para atender visitantes con seguridad.'],
  ['Mercado y comercialización digital', 10, 'Segmentos definidos y canales de promoción o venta.'],
  ['Sostenibilidad responsable', 8, 'Prácticas ambientales y certificaciones.'],
  ['Articulación e inclusión', 8, 'Redes, enfoque diferencial y empleo inclusivo.'],
  ['Compromiso con el fortalecimiento', 6, 'Interés, capacitación previa y necesidades identificadas.'],
  ['Evidencia, oportunidad y riesgo', 6, 'Información completa y oportunidades identificadas.'],
] as const;

const score = (value: number) => Math.max(1, Math.min(10, Math.round(value)));
const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1;
const bool = (value: boolean | null) => value === true ? 10 : value === false ? 1 : 1;

export type FilaPriorizacion = { identificacion: string; barrio: string; tipoActor: string; criterios: Record<string, number>; puntajePonderado: number; posicion: number; seleccionado: 'Sí' | 'No' };

export function priorizar(records: SurveyRecord[]): FilaPriorizacion[] {
  const rows = records.map(record => {
    const formal = avg([bool(record.tieneRegistroMercantil), bool(record.tieneRUT), bool(record.tieneRNT)]);
    const dti = avg(Object.values(record.scores).map(value => value * 2));
    const infraestructura = avg([bool(record.tieneSedeFisica), bool(record.tieneBanos), bool(record.tieneSeñalizacion), bool(record.tieneBotiquin), record.conectividad ? 10 : 1]);
    const criterios: Record<string, number> = {
      [criteriosPriorizacion[0][0]]: score((record.tipo ? 5 : 1) + (record.quiereRuta ? 3 : 0) + (record.propuestaArticulacion ? 2 : 0)),
      [criteriosPriorizacion[1][0]]: score((record.barrio && record.barrio !== 'Otro' ? 6 : 1) + (record.zona ? 2 : 0) + (record.atractivosCercanos ? 2 : 0)),
      [criteriosPriorizacion[2][0]]: score(formal),
      [criteriosPriorizacion[3][0]]: score(dti),
      [criteriosPriorizacion[4][0]]: score(infraestructura),
      [criteriosPriorizacion[5][0]]: score((record.segmentosMercado.length ? 4 : 1) + (record.canalesDigitales.length ? 4 : 0) + (record.publicoObjetivo ? 2 : 0)),
      [criteriosPriorizacion[6][0]]: score((record.practicasSostenibilidad.length ? 6 : 1) + (record.certificaciones.length ? 4 : 0)),
      [criteriosPriorizacion[7][0]]: score((record.scores.Gobernanza ?? 0) + (record.scores['Tejido empresarial'] ?? 0)),
      [criteriosPriorizacion[8][0]]: score((record.nivelInteresFortalecer || 1) * 2),
      [criteriosPriorizacion[9][0]]: score((record.estado ? 5 : 1) + (record.oportunidades ? 3 : 0) + (record.riesgos ? 2 : 0)),
    };
    const puntajePonderado = criteriosPriorizacion.reduce((total, [name, weight]) => total + criterios[name] * weight / 10, 0);
    return { identificacion: record.nombre || record.id, barrio: record.barrio, tipoActor: record.tipo, criterios, puntajePonderado: Number(puntajePonderado.toFixed(2)), posicion: 0, seleccionado: 'No' as const };
  }).sort((a, b) => b.puntajePonderado - a.puntajePonderado);
  return rows.map((row, index) => ({ ...row, posicion: index + 1, seleccionado: index < 70 ? 'Sí' : 'No' }));
}

export function csvPriorizacion(rows: FilaPriorizacion[], blank = false) {
  const headers = ['Identificación', 'Barrio', 'Tipo de actor', ...criteriosPriorizacion.map(([name]) => name), 'Puntaje ponderado', 'Posición', 'Seleccionado'];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const body = blank ? [] : rows.map(row => [row.identificacion, row.barrio, row.tipoActor, ...criteriosPriorizacion.map(([name]) => row.criterios[name]), row.puntajePonderado, row.posicion, row.seleccionado]);
  return [headers, ...body].map(row => row.map(escape).join(',')).join('\r\n');
}

export async function pdfPriorizacion(rows: FilaPriorizacion[]) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); let page = pdf.addPage([612, 792]); let y = 755;
  const line = (text: string, size = 9) => { if (y < 40) { page = pdf.addPage([612, 792]); y = 755; } page.drawText(text.slice(0, 115), { x: 35, y, size, font, color: rgb(0.05, 0.2, 0.16) }); y -= size + 5; };
  line('Formato de evaluación de pertinencia - selección de 70 emprendimientos', 14);
  line('Escala: 1-3 bajo; 4-6 medio; 7-8 alto; 9-10 sobresaliente. Puntaje ponderado sobre 100.');
  criteriosPriorizacion.forEach(([name, weight, description]) => line(`${weight}% ${name}: ${description}`));
  line('Ranking (los primeros 70 están marcados como Seleccionado)', 11);
  rows.forEach(row => line(`${row.posicion}. ${row.identificacion} | ${row.barrio} | ${row.puntajePonderado}/100 | ${row.seleccionado}`));
  return pdf.save();
}
