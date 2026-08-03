import { NextRequest } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createPdf(lines: string[]) {
  const content = ['BT', '/F1 12 Tf', '50 780 Td'];
  lines.forEach((line, index) => {
    const prefix = index === 0 ? '' : '0 -18 Td ';
    content.push(`${prefix}(${escapePdfText(line)}) Tj`);
  });
  content.push('ET');
  const stream = content.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const stats = payload?.stats ?? {};
  const summary = payload?.summary ?? 'Resumen no disponible.';
  const lines = [
    'Informe Fundesco Santa Fe - Observatorio turistico',
    `Fecha de generacion: ${new Date().toLocaleString('es-CO')}`,
    `Total de registros: ${stats.total ?? 0}`,
    `Interes en rutas turisticas: ${stats.rutas ?? 0}`,
    `Puntos exactos: ${stats.exactos ?? 0} | estimados: ${stats.estimados ?? 0}`,
    `Resumen: ${String(summary).slice(0, 240)}`,
  ];

  const pdf = createPdf(lines);
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="informe-fundesco-santa-fe.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
