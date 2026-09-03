import { NextResponse } from 'next/server';
import schema from '@/schema-formulario.json';
import { fetchSheetRows } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await fetchSheetRows();
  const returned = [...new Set<string>(rows.flatMap(row => Object.keys(row as Record<string, unknown>)))].sort();
  const expected = schema.columns as string[];
  const nonNull = Object.fromEntries(returned.map(column => [column, rows.length ? Math.round(rows.filter(row => String((row as Record<string, unknown>)[column] ?? '').trim() !== '').length / rows.length * 100) : 0]));
  return NextResponse.json({
    totalRegistros: rows.length, columnasDevueltas: returned, columnasEsperadas: expected,
    huerfanasFuente: returned.filter(column => !expected.includes(column)),
    ausentesFuente: expected.filter(column => !returned.includes(column)),
    porcentajeNoNulo: nonNull,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
