import { NextRequest } from 'next/server';
import { fetchSheetRows } from '@/lib/csv';
import { normaliseRecord } from '@/lib/normalize';
import { csvPriorizacion, pdfPriorizacion, priorizar } from '@/lib/priorizacion';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const format = request.nextUrl.searchParams.get('format') ?? 'csv';
    const blank = request.nextUrl.searchParams.get('blank') === 'true';
    const records = blank ? [] : (await fetchSheetRows()).map((row, index) => normaliseRecord(row, index));
    const rows = priorizar(records);
    if (format === 'pdf') return new Response(Buffer.from(await pdfPriorizacion(rows)), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="priorizacion-emprendimientos.pdf"' } });
    return new Response(csvPriorizacion(rows, blank), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="priorizacion-${blank ? 'en-blanco' : 'ranking'}.csv"` } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'No fue posible generar la priorización.' }, { status: 500 });
  }
}
