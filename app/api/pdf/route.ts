import { NextRequest } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Colors - fundesco-forest: #178C72, fundesco-lime: #A8D45A
const FOREST = rgb(0.09, 0.55, 0.45);
const LIME = rgb(0.66, 0.83, 0.35);
const CREAM = rgb(0.98, 0.96, 0.93);
const DARK = rgb(0.1, 0.1, 0.1);
const MID = rgb(0.35, 0.35, 0.35);
const LIGHT_BG = rgb(0.96, 0.99, 0.97);
const WHITE = rgb(1, 1, 1);

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const stats = payload?.stats ?? {};
  const summary: string = payload?.summary ?? 'Resumen no disponible.';
  const updatedAt: string = payload?.updatedAt ?? new Date().toLocaleString('es-CO');

  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // ─── PAGE 1: Cover ───────────────────────────────────────────────────────
  const coverPage = pdfDoc.addPage([612, 792]);
  // Header banner
  coverPage.drawRectangle({ x: 0, y: 680, width: 612, height: 112, color: FOREST });
  coverPage.drawRectangle({ x: 0, y: 670, width: 612, height: 12, color: LIME });
  coverPage.drawText('FUNDESCO', { x: 40, y: 760, size: 14, font: fontBold, color: LIME });
  coverPage.drawText('Observatorio Turístico Santa Fe', { x: 40, y: 736, size: 22, font: fontBold, color: WHITE });
  coverPage.drawText('Informe de Avance — Caracterización Territorial', { x: 40, y: 712, size: 12, font: fontReg, color: rgb(0.85, 0.95, 0.9) });
  // Meta box
  coverPage.drawRectangle({ x: 40, y: 600, width: 532, height: 62, color: CREAM, borderColor: LIME, borderWidth: 1.5 });
  coverPage.drawText(`Fecha de corte: ${updatedAt}`, { x: 56, y: 646, size: 11, font: fontReg, color: MID });
  coverPage.drawText(`Total de registros analizados: ${stats.total ?? 0}`, { x: 56, y: 626, size: 11, font: fontReg, color: MID });
  coverPage.drawText(`Interés en rutas turísticas: ${stats.rutas ?? 0} emprendimientos`, { x: 56, y: 608, size: 11, font: fontReg, color: MID });
  // KPI cards
  const kpis = [
    { label: 'Total registros', value: String(stats.total ?? 0) },
    { label: 'Interés rutas', value: String(stats.rutas ?? 0) },
    { label: 'Puntos exactos', value: String(stats.exactos ?? 0) },
    { label: 'Puntos estimados', value: String(stats.estimados ?? 0) },
  ];
  coverPage.drawText('KPIs principales', { x: 40, y: 576, size: 13, font: fontBold, color: FOREST });
  kpis.forEach((kpi, i) => {
    const x = 40 + i * 135;
    coverPage.drawRectangle({ x, y: 520, width: 125, height: 48, color: LIGHT_BG, borderColor: FOREST, borderWidth: 1 });
    coverPage.drawText(kpi.value, { x: x + 10, y: 550, size: 18, font: fontBold, color: FOREST });
    coverPage.drawText(kpi.label, { x: x + 10, y: 528, size: 9, font: fontReg, color: MID });
  });

  // Dimensiones scores
  const scores: Array<{ name: string; value: number }> = stats.scores ?? [];
  if (scores.length) {
    coverPage.drawText('Scores de fortalecimiento por dimensión (promedio /5)', { x: 40, y: 502, size: 11, font: fontBold, color: FOREST });
    scores.forEach((sc, i) => {
      const y = 484 - i * 20;
      const barW = Math.round((sc.value / 5) * 220);
      coverPage.drawRectangle({ x: 40, y: y - 4, width: 220, height: 14, color: rgb(0.9, 0.95, 0.92) });
      coverPage.drawRectangle({ x: 40, y: y - 4, width: barW, height: 14, color: FOREST });
      coverPage.drawText(`${sc.name}`, { x: 270, y, size: 9, font: fontReg, color: DARK });
      coverPage.drawText(`${sc.value}`, { x: 530, y, size: 9, font: fontBold, color: FOREST });
    });
  }
  // Footer
  coverPage.drawRectangle({ x: 0, y: 0, width: 612, height: 32, color: FOREST });
  coverPage.drawText('Fundesco Santa Fe | Observatorio Turístico | Documento confidencial', { x: 40, y: 12, size: 9, font: fontReg, color: WHITE });
  coverPage.drawText('1', { x: 580, y: 12, size: 9, font: fontBold, color: LIME });

  // ─── PAGE 2: Summary AI ───────────────────────────────────────────────────
  const aiPage = pdfDoc.addPage([612, 792]);
  aiPage.drawRectangle({ x: 0, y: 756, width: 612, height: 36, color: FOREST });
  aiPage.drawText('Resumen ejecutivo — Análisis integral', { x: 40, y: 768, size: 13, font: fontBold, color: WHITE });
  aiPage.drawRectangle({ x: 0, y: 0, width: 612, height: 32, color: FOREST });
  aiPage.drawText('Fundesco Santa Fe | Observatorio Turístico', { x: 40, y: 12, size: 9, font: fontReg, color: WHITE });
  aiPage.drawText('2', { x: 580, y: 12, size: 9, font: fontBold, color: LIME });

  let aiY = 738;
  const summaryLines = summary.split('\n');
  for (const rawLine of summaryLines) {
    if (aiY < 50) break;
    const line = rawLine.replace(/^#{1,3}\s+/, '');
    const isHeader = /^#{1,3}\s+/.test(rawLine);
    if (isHeader) {
      aiY -= 6;
      aiPage.drawRectangle({ x: 36, y: aiY - 2, width: 540, height: 18, color: LIME });
      aiPage.drawText(line, { x: 40, y: aiY, size: 11, font: fontBold, color: DARK });
      aiY -= 20;
    } else if (line.trim() === '') {
      aiY -= 8;
    } else {
      const wrapped = wrap(line, 92);
      for (const wl of wrapped) {
        if (aiY < 50) break;
        aiPage.drawText(wl, { x: 40, y: aiY, size: 9.5, font: fontReg, color: DARK });
        aiY -= 14;
      }
    }
  }

  // ─── PAGE 3: Tables ───────────────────────────────────────────────────────
  const tablePage = pdfDoc.addPage([612, 792]);
  tablePage.drawRectangle({ x: 0, y: 756, width: 612, height: 36, color: FOREST });
  tablePage.drawText('Avance territorial y necesidades', { x: 40, y: 768, size: 13, font: fontBold, color: WHITE });
  tablePage.drawRectangle({ x: 0, y: 0, width: 612, height: 32, color: FOREST });
  tablePage.drawText('Fundesco Santa Fe | Observatorio Turístico', { x: 40, y: 12, size: 9, font: fontReg, color: WHITE });
  tablePage.drawText('3', { x: 580, y: 12, size: 9, font: fontBold, color: LIME });

  let tY = 736;

  // Avance por barrio
  const avanceBarrio: Array<{ nombre: string; cantidad: number; pctTotal: number; scorePromedio: number }> = stats.avanceBarrio ?? [];
  if (avanceBarrio.length) {
    tablePage.drawText('Avance por barrio', { x: 40, y: tY, size: 11, font: fontBold, color: FOREST });
    tY -= 18;
    // header row
    tablePage.drawRectangle({ x: 40, y: tY - 4, width: 532, height: 16, color: FOREST });
    tablePage.drawText('Barrio', { x: 44, y: tY, size: 9, font: fontBold, color: WHITE });
    tablePage.drawText('Encuestas', { x: 220, y: tY, size: 9, font: fontBold, color: WHITE });
    tablePage.drawText('% del total', { x: 310, y: tY, size: 9, font: fontBold, color: WHITE });
    tablePage.drawText('Score prom.', { x: 410, y: tY, size: 9, font: fontBold, color: WHITE });
    tY -= 16;
    for (let i = 0; i < avanceBarrio.length && tY > 200; i++) {
      const row = avanceBarrio[i];
      const bg = i % 2 === 0 ? CREAM : WHITE;
      tablePage.drawRectangle({ x: 40, y: tY - 4, width: 532, height: 14, color: bg });
      tablePage.drawText(row.nombre, { x: 44, y: tY, size: 9, font: fontReg, color: DARK });
      tablePage.drawText(String(row.cantidad), { x: 240, y: tY, size: 9, font: fontReg, color: DARK });
      tablePage.drawText(`${row.pctTotal}%`, { x: 330, y: tY, size: 9, font: fontReg, color: DARK });
      tablePage.drawText(row.scorePromedio > 0 ? String(row.scorePromedio) : 'N/A', { x: 430, y: tY, size: 9, font: fontReg, color: DARK });
      tY -= 14;
    }
    tY -= 10;
  }

  // By UPZ
  const byUpz: Array<{ name: string; value: number }> = stats.byUpz ?? [];
  if (byUpz.length && tY > 200) {
    tablePage.drawText('Avance por UPZ', { x: 40, y: tY, size: 11, font: fontBold, color: FOREST });
    tY -= 18;
    tablePage.drawRectangle({ x: 40, y: tY - 4, width: 350, height: 16, color: FOREST });
    tablePage.drawText('UPZ', { x: 44, y: tY, size: 9, font: fontBold, color: WHITE });
    tablePage.drawText('Encuestas', { x: 260, y: tY, size: 9, font: fontBold, color: WHITE });
    tY -= 16;
    for (let i = 0; i < byUpz.length && tY > 160; i++) {
      const row = byUpz[i];
      const bg = i % 2 === 0 ? CREAM : WHITE;
      tablePage.drawRectangle({ x: 40, y: tY - 4, width: 350, height: 14, color: bg });
      tablePage.drawText(row.name, { x: 44, y: tY, size: 9, font: fontReg, color: DARK });
      tablePage.drawText(String(row.value), { x: 280, y: tY, size: 9, font: fontReg, color: DARK });
      tY -= 14;
    }
    tY -= 10;
  }

  // Necesidades
  const necesidades: Array<{ name: string; value: number }> = stats.necesidades ?? [];
  if (necesidades.length && tY > 120) {
    tablePage.drawText('Necesidades de apoyo más frecuentes', { x: 40, y: tY, size: 11, font: fontBold, color: FOREST });
    tY -= 18;
    tablePage.drawRectangle({ x: 40, y: tY - 4, width: 400, height: 16, color: FOREST });
    tablePage.drawText('Necesidad', { x: 44, y: tY, size: 9, font: fontBold, color: WHITE });
    tablePage.drawText('Menciones', { x: 300, y: tY, size: 9, font: fontBold, color: WHITE });
    tY -= 16;
    for (let i = 0; i < necesidades.length && tY > 50; i++) {
      const row = necesidades[i];
      const bg = i % 2 === 0 ? CREAM : WHITE;
      tablePage.drawRectangle({ x: 40, y: tY - 4, width: 400, height: 14, color: bg });
      const shortName = row.name.length > 55 ? row.name.slice(0, 52) + '...' : row.name;
      tablePage.drawText(shortName, { x: 44, y: tY, size: 9, font: fontReg, color: DARK });
      tablePage.drawText(String(row.value), { x: 320, y: tY, size: 9, font: fontReg, color: DARK });
      tY -= 14;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="informe-fundesco-santa-fe.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
