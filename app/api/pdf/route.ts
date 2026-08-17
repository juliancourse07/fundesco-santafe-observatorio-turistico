import { NextRequest } from 'next/server';
import { generatePdfReport } from '@/lib/pdfReport';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FILENAMES: Record<string, string> = {
  diagnostico: 'informe-1-diagnostico-fundesco-santa-fe.pdf',
  potenciales: 'informe-2-potenciales-fundesco-santa-fe.pdf',
  monitoreo: 'informe-3-monitoreo-fundesco-santa-fe.pdf',
};

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const reportType: string = payload.reportType ?? 'diagnostico';
  const { pdfBytes, logs } = await generatePdfReport({ ...payload, reportType });
  logs.forEach((entry) => console.info(`[pdf] ${entry}`));

  const filename = FILENAMES[reportType] ?? `informe-fundesco-santa-fe.pdf`;

  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
