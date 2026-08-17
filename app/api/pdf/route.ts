import { NextRequest } from 'next/server';
import { generatePdfReport } from '@/lib/pdfReport';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const { pdfBytes, logs } = await generatePdfReport({ ...payload, reportType: payload.reportType ?? 'diagnostico' });
  logs.forEach((entry) => console.info(`[pdf] ${entry}`));

  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="informe-fundesco-santa-fe.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
