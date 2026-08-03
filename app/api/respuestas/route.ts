import { NextResponse } from "next/server";
import { fetchSheetRows } from "@/lib/csv";
import { buildStats, normaliseRecord } from "@/lib/normalize";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const rows = await fetchSheetRows();
    const records = rows.map((row, index) => normaliseRecord(row, index));
    return NextResponse.json({
      records,
      stats: buildStats(records),
      updatedAt: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'No fue posible leer la fuente de datos.',
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }
}
