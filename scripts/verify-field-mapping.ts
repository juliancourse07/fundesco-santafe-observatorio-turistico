#!/usr/bin/env tsx
/**
 * scripts/verify-field-mapping.ts
 *
 * Guardia contra mapeos rotos entre la fuente (SharePoint / Google Sheets) y los
 * campos internos. Falla (exit 1) si un campo OBLIGATORIO queda 100% nulo o si
 * más del 20% de sus valores no vacíos no se pueden parsear.
 *
 * Uso:
 *   npm run verify-mapping                 # contra la fuente activa (requiere env)
 *   npm run verify-mapping -- <archivo.csv> # contra un CSV local
 *
 * Códigos de salida:
 *   0 = todo obligatorio tiene al menos un valor reconocido
 *   1 = un campo obligatorio quedó 100% nulo, superó el umbral de no parseables o no se pudo leer la fuente
 */

import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { fetchSheetRows } from '../lib/csv';
import { buildStats, field, normaliseRecord, type SurveyRecord } from '../lib/normalize';

type CampoRequerido = {
  campo: keyof SurveyRecord;
  etiqueta: string;
  /** Encabezado(s) esperados en la fuente. */
  encabezados: string[];
  /** Si es true, el campo es obligatorio y no puede quedar 100% nulo. */
  obligatorio: boolean;
};

const UMBRAL_NO_PARSEABLE_OBLIGATORIO = 20;

// Bloque de empleo: es el que quedó en 0 en producción.
const CAMPOS_EMPLEO: CampoRequerido[] = [
  { campo: 'totalPersonasVinculadas', etiqueta: 'Personas vinculadas (total)', encabezados: ['Número total de empleados o personas vinculadas'], obligatorio: true },
  { campo: 'empleadosFormales', etiqueta: 'Empleos formales', encabezados: ['Número de empleados formales'], obligatorio: true },
  { campo: 'empleadosInformales', etiqueta: 'Empleos informales/familiares', encabezados: ['Número de empleados informales o familiares sin contrato'], obligatorio: true },
  { campo: 'mujeres', etiqueta: 'Mujeres vinculadas', encabezados: ['Número de mujeres vinculadas'], obligatorio: true },
  { campo: 'jovenes', etiqueta: 'Jóvenes vinculados', encabezados: ['Número de jóvenes vinculados'], obligatorio: true },
  { campo: 'mayores60', etiqueta: 'Adultos mayores 60+', encabezados: ['Número de personas mayores de 60 años vinculadas'], obligatorio: true },
  { campo: 'diversidad', etiqueta: 'Población diversa', encabezados: ['Número de personas de población diversa o enfoque diferencial vinculadas'], obligatorio: true },
];

// Campos estructurales (siempre deberían mapear algo si hay registros).
const CAMPOS_ESTRUCTURA: CampoRequerido[] = [
  { campo: 'barrio', etiqueta: 'Barrio', encabezados: ['Barrio donde opera el emprendimiento', 'Barrio / sector de aplicación'], obligatorio: true },
  { campo: 'tipo', etiqueta: 'Tipo de emprendimiento', encabezados: ['Tipo principal de emprendimiento'], obligatorio: true },
];

const CAMPOS_RANGOS_OPERATIVOS: CampoRequerido[] = [
  { campo: 'capacidadDiaria', etiqueta: 'Capacidad máxima diaria', encabezados: ['Capacidad máxima de atención diaria'], obligatorio: false },
  { campo: 'capacidadVisitantes', etiqueta: 'Visitantes simultáneos', encabezados: ['Capacidad máxima de visitantes al mismo tiempo'], obligatorio: false },
  { campo: 'numeroEspaciosAtencion', etiqueta: 'Espacios de atención', encabezados: ['Número de espacios de atención'], obligatorio: false },
  { campo: 'anosExperienciaTurismo', etiqueta: 'Años de experiencia', encabezados: ['Años de experiencia en turismo o actividad relacionada'], obligatorio: false },
];

const TODOS = [...CAMPOS_ESTRUCTURA, ...CAMPOS_EMPLEO, ...CAMPOS_RANGOS_OPERATIVOS];

function esValorReconocido(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true; // números y booleanos reconocidos (incluye 0 y false, que son datos reales)
}

function valorFuente(row: Record<string, unknown>, campo: CampoRequerido) {
  for (const encabezado of campo.encabezados) {
    const value = field(row, encabezado);
    if (value !== undefined) return value;
  }
  return undefined;
}

function esNoVacioFuente(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String((v as any)?.Value ?? (v as any)?.Title ?? v).trim() !== '';
}

async function leerFilas(): Promise<Record<string, unknown>[]> {
  const archivoCsv = process.argv[2];
  if (archivoCsv) {
    const full = path.resolve(process.cwd(), archivoCsv);
    const text = fs.readFileSync(full, 'utf8');
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
    if (parsed.errors.length) throw new Error(`Error procesando CSV local: ${parsed.errors[0].message}`);
    console.log(`[verify] Fuente: archivo local ${archivoCsv}`);
    return parsed.data;
  }
  const fuente = process.env.SHAREPOINT_LIST_URL?.trim()
    ? 'SHAREPOINT_LIST_URL (SharePoint)'
    : process.env.GOOGLE_SHEETS_CSV_URL?.trim()
      ? 'GOOGLE_SHEETS_CSV_URL (Google Sheets CSV)'
      : process.env.GOOGLE_APPS_SCRIPT_URL?.trim()
        ? 'GOOGLE_APPS_SCRIPT_URL (Apps Script)'
        : '(ninguna configurada)';
  console.log(`[verify] Fuente activa: ${fuente}`);
  return (await fetchSheetRows()) as Record<string, unknown>[];
}

async function main() {
  let rows: Record<string, unknown>[];
  try {
    rows = await leerFilas();
  } catch (error) {
    console.error(`[verify] ERROR leyendo la fuente: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  if (!rows.length) {
    console.error('[verify] ERROR: la fuente no devolvió registros.');
    process.exit(1);
  }

  const records = rows.map((row, i) => normaliseRecord(row, i));
  const stats = buildStats(records);
  const headersReales = [...new Set(rows.flatMap(r => Object.keys(r)))];

  console.log(`\n[verify] Registros: ${records.length} · columnas devueltas: ${headersReales.length}`);
  console.log('\n[verify] Cobertura por campo (reconocidos y no parseables):');

  let fallos = 0;
  for (const c of TODOS) {
    const conValor = records.filter(r => esValorReconocido(r[c.campo])).length;
    const noVaciosFuente = rows.filter(row => esNoVacioFuente(valorFuente(row, c))).length;
    const noParseables = Math.max(0, noVaciosFuente - conValor);
    const pct = Math.round((conValor / records.length) * 100);
    const pctNoParseable = noVaciosFuente ? Math.round((noParseables / noVaciosFuente) * 100) : 0;
    const marca = c.obligatorio ? '*' : ' ';
    const fallaNulo = pct === 0 && c.obligatorio;
    const fallaParseo = c.obligatorio && pctNoParseable > UMBRAL_NO_PARSEABLE_OBLIGATORIO;
    const estado = fallaNulo || fallaParseo ? 'FALLO' : 'ok';
    if (fallaNulo || fallaParseo) fallos += 1;
    console.log(`  ${marca} ${c.etiqueta.padEnd(32)} ${String(pct).padStart(3)}% reconocidos · ${String(pctNoParseable).padStart(3)}% no parseable (${noParseables}/${noVaciosFuente})  [${estado}]  ← ${c.encabezados.join(' | ')}`);
  }

  console.log('\n[verify] Totales de empleo calculados:');
  console.log(`  Personas vinculadas: ${stats.empleo.totalPersonasVinculadasMin}-${stats.empleo.totalPersonasVinculadasMax} · punto ${stats.empleo.totalPersonasVinculadasPunto}`);
  console.log(`  formales: ${stats.empleo.totalFormalesMin}-${stats.empleo.totalFormalesMax} · informales: ${stats.empleo.totalInformalesMin}-${stats.empleo.totalInformalesMax}`);
  console.log(`  mujeres: ${stats.empleo.totalMujeresMin}-${stats.empleo.totalMujeresMax} · jóvenes: ${stats.empleo.totalJovenesMin}-${stats.empleo.totalJovenesMax} · 60+: ${stats.empleo.totalMayores60Min}-${stats.empleo.totalMayores60Max} · diversa: ${stats.empleo.totalDiversidadMin}-${stats.empleo.totalDiversidadMax}`);

  if (fallos > 0) {
    console.error(`\n[verify] FALLO: ${fallos} campo(s) obligatorio(s) quedaron 100% nulos o superaron ${UMBRAL_NO_PARSEABLE_OBLIGATORIO}% de valores no parseables. Revisa encabezados y categorías textuales.`);
    process.exit(1);
  }

  console.log('\n[verify] OK: todos los campos obligatorios tienen al menos un valor reconocido.');
}

main().catch((error) => {
  console.error('[verify] ERROR inesperado:', error);
  process.exit(1);
});
