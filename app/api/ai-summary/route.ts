import { NextRequest, NextResponse } from "next/server";
import { generateSummary } from "@/lib/summary";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await generateSummary(body?.stats ?? { total: 0, rutas: 0, exactos: 0, estimados: 0 });
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'No fue posible generar el resumen.' }, { status: 500 });
  }
}
