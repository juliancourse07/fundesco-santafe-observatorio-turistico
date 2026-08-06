import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { buildDeterministicAnalysis, buildFallbackSummary, sanitizePdfText, type StatsInput } from '@/lib/analysis';
import { santafeImages } from '@/lib/santafeImages';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FOREST = rgb(0.063, 0.282, 0.239);
const GREEN = rgb(0.09, 0.55, 0.45);
const LIME = rgb(0.71, 0.827, 0.204);
const CREAM = rgb(0.97, 0.95, 0.91);
const DARK = rgb(0.1, 0.1, 0.1);
const MID = rgb(0.35, 0.35, 0.35);
const WHITE = rgb(1, 1, 1);
const LIGHT = rgb(0.95, 0.99, 0.97);
const STRIP = rgb(0.93, 0.97, 0.95);

const PW = 612;
const PH = 792;
const ML = 48;
const MR = 564;
const MT = 756;
const MB = 44;

type Cursor = { page: PDFPage; y: number; title: string };
type Fonts = { regular: PDFFont; bold: PDFFont };
type TocItem = { label: string; pageNumber: number };
type TableColumn<T> = { label: string; x: number; width?: number; value: (row: T) => string; align?: 'left' | 'right' | 'center' };

function safe(text: string) {
  return sanitizePdfText(text || '');
}

function drawText(page: PDFPage, text: string, options: Parameters<PDFPage['drawText']>[1]) {
  page.drawText(safe(text), options);
}

function splitLongWord(word: string, width: number, font: PDFFont, size: number) {
  const pieces: string[] = [];
  let current = '';
  for (const char of word) {
    const candidate = current + char;
    const limitReached = font.widthOfTextAtSize(candidate + '-', size) > width;
    if (current && limitReached) {
      pieces.push(current + '-');
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces.length ? pieces : [word];
}

function wrapToWidth(text: string, width: number, font: PDFFont, size: number) {
  const words = safe(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current: string[] = [];
  for (const rawWord of words) {
    const wordParts = font.widthOfTextAtSize(rawWord, size) > width ? splitLongWord(rawWord, width, font, size) : [rawWord];
    for (const word of wordParts) {
      const candidate = current.length ? `${current.join(' ')} ${word}` : word;
      if (current.length && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(current.join(' '));
        current = [word];
      } else if (!current.length && font.widthOfTextAtSize(word, size) > width) {
        lines.push(word);
      } else {
        current.push(word);
      }
    }
  }
  if (current.length) lines.push(current.join(' '));
  return lines;
}

function drawJustifiedParagraph(page: PDFPage, text: string, options: {
  x: number;
  y: number;
  width: number;
  size: number;
  font: PDFFont;
  lineHeight: number;
  color: ReturnType<typeof rgb>;
  onPageBreak?: () => { page: PDFPage; y: number };
}) {
  let currentPage = page;
  let currentY = options.y;
  const paragraphs = safe(text).split(/\n+/).map((item) => item.trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    const lines = wrapToWidth(paragraph, options.width, options.font, options.size);
    lines.forEach((line, index) => {
      if (currentY < MB + options.lineHeight) {
        const next = options.onPageBreak?.();
        if (next) {
          currentPage = next.page;
          currentY = next.y;
        }
      }
      const words = line.split(' ').filter(Boolean);
      const isLastLine = index === lines.length - 1;
      if (!isLastLine && words.length > 1) {
        const plainWidth = words.reduce((sum, word) => sum + options.font.widthOfTextAtSize(word, options.size), 0);
        const extra = Math.max(0, (options.width - plainWidth) / (words.length - 1));
        let cursorX = options.x;
        words.forEach((word, wordIndex) => {
          drawText(currentPage, word, { x: cursorX, y: currentY, size: options.size, font: options.font, color: options.color });
          cursorX += options.font.widthOfTextAtSize(safe(word), options.size);
          if (wordIndex < words.length - 1) cursorX += extra;
        });
      } else {
        drawText(currentPage, line, { x: options.x, y: currentY, size: options.size, font: options.font, color: options.color });
      }
      currentY -= options.lineHeight;
    });
    currentY -= 4;
  }
  return { page: currentPage, y: currentY };
}

function drawHeader(page: PDFPage, title: string, fonts: Fonts, pageN: number, totalPages: number) {
  page.drawRectangle({ x: 0, y: PH - 36, width: PW, height: 36, color: FOREST });
  drawText(page, 'FUNDESCO · Observatorio Turístico Santa Fe', { x: ML, y: PH - 23, size: 9, font: fonts.bold, color: LIME });
  drawText(page, title, { x: 212, y: PH - 23, size: 10, font: fonts.bold, color: WHITE });
  drawText(page, `Pág. ${pageN} / ${totalPages}`, { x: 500, y: PH - 23, size: 9, font: fonts.bold, color: LIME });
}

function drawFooter(page: PDFPage, fonts: Fonts) {
  page.drawRectangle({ x: 0, y: 0, width: PW, height: MB, color: FOREST });
  drawText(page, 'Fundesco Santa Fe | Observatorio Turístico | Documento de trabajo', { x: ML, y: 14, size: 8, font: fonts.regular, color: WHITE });
}

function sectionTitle(cursor: Cursor, text: string, fonts: Fonts) {
  cursor.page.drawRectangle({ x: ML - 8, y: cursor.y - 4, width: MR - ML + 16, height: 22, color: FOREST });
  drawText(cursor.page, text, { x: ML, y: cursor.y + 2, size: 11, font: fonts.bold, color: WHITE });
  cursor.y -= 28;
}

function subTitle(cursor: Cursor, text: string, fonts: Fonts) {
  drawText(cursor.page, text, { x: ML, y: cursor.y, size: 10, font: fonts.bold, color: FOREST });
  cursor.y -= 16;
}

function ensureSpace(cursor: Cursor, minHeight: number, newPage: (title: string) => Cursor) {
  if (cursor.y - minHeight < MB + 10) return newPage(cursor.title);
  return cursor;
}

function drawInfoBox(cursor: Cursor, title: string, body: string[], fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, 56 + body.length * 18, newPage);
  cursor.page.drawRectangle({ x: ML, y: cursor.y - 8, width: MR - ML, height: 28, color: GREEN });
  drawText(cursor.page, title, { x: ML + 8, y: cursor.y, size: 10, font: fonts.bold, color: WHITE });
  const boxHeight = Math.max(56, body.length * 18 + 18);
  cursor.page.drawRectangle({ x: ML, y: cursor.y - boxHeight, width: MR - ML, height: boxHeight - 10, color: WHITE, borderColor: LIME, borderWidth: 1.2 });
  cursor.y -= 26;
  for (const paragraph of body) {
    const result = drawJustifiedParagraph(cursor.page, paragraph, {
      x: ML + 10,
      y: cursor.y,
      width: MR - ML - 20,
      size: 9,
      font: fonts.regular,
      lineHeight: 13,
      color: DARK,
      onPageBreak: () => {
        cursor = newPage(cursor.title);
        return { page: cursor.page, y: cursor.y };
      },
    });
    cursor.page = result.page;
    cursor.y = result.y;
  }
  cursor.y -= 6;
  return cursor;
}

function drawBulletList(cursor: Cursor, items: string[], fonts: Fonts, newPage: (title: string) => Cursor) {
  for (const item of items) {
    cursor = ensureSpace(cursor, 30, newPage);
    drawText(cursor.page, '•', { x: ML, y: cursor.y, size: 11, font: fonts.bold, color: FOREST });
    const result = drawJustifiedParagraph(cursor.page, item, {
      x: ML + 14,
      y: cursor.y,
      width: MR - ML - 14,
      size: 9,
      font: fonts.regular,
      lineHeight: 13,
      color: DARK,
      onPageBreak: () => {
        cursor = newPage(cursor.title);
        return { page: cursor.page, y: cursor.y };
      },
    });
    cursor.page = result.page;
    cursor.y = result.y - 2;
  }
  return cursor;
}

function drawPctBar(cursor: Cursor, label: string, pctValue: number, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, 18, newPage);
  const bw = 160;
  const fill = Math.max(4, Math.round((Math.max(0, pctValue) / 100) * bw));
  drawText(cursor.page, label, { x: ML, y: cursor.y, size: 8.5, font: fonts.regular, color: DARK });
  cursor.page.drawRectangle({ x: ML + 190, y: cursor.y - 2, width: bw, height: 10, color: LIGHT });
  cursor.page.drawRectangle({ x: ML + 190, y: cursor.y - 2, width: fill, height: 10, color: GREEN });
  drawText(cursor.page, `${pctValue}%`, { x: ML + 360, y: cursor.y, size: 8.5, font: fonts.bold, color: FOREST });
  cursor.y -= 16;
  return cursor;
}

function drawMiniBar(cursor: Cursor, label: string, value: number, maxValue: number, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, 18, newPage);
  const bw = 200;
  const fill = maxValue > 0 ? Math.max(4, Math.round((value / maxValue) * bw)) : 4;
  drawText(cursor.page, label, { x: ML, y: cursor.y, size: 8.5, font: fonts.regular, color: DARK });
  cursor.page.drawRectangle({ x: ML + 230, y: cursor.y - 2, width: bw, height: 10, color: LIGHT });
  cursor.page.drawRectangle({ x: ML + 230, y: cursor.y - 2, width: fill, height: 10, color: GREEN });
  drawText(cursor.page, String(value), { x: ML + 440, y: cursor.y, size: 8.5, font: fonts.bold, color: FOREST });
  cursor.y -= 16;
  return cursor;
}

function truncate(text: string, limit = 58) {
  const sanitized = safe(text);
  return sanitized.length > limit ? `${sanitized.slice(0, limit - 1)}…` : sanitized;
}

function drawTableHeader<T>(cursor: Cursor, columns: TableColumn<T>[], fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, 20, newPage);
  cursor.page.drawRectangle({ x: ML - 4, y: cursor.y - 4, width: MR - ML + 8, height: 16, color: GREEN });
  columns.forEach((column) => drawText(cursor.page, column.label, { x: column.x, y: cursor.y, size: 8.5, font: fonts.bold, color: WHITE }));
  cursor.y -= 18;
  return cursor;
}

function drawTableRows<T>(cursor: Cursor, rows: T[], columns: TableColumn<T>[], fonts: Fonts, newPage: (title: string) => Cursor) {
  rows.forEach((row, rowIndex) => {
    cursor = ensureSpace(cursor, 15, newPage);
    cursor.page.drawRectangle({ x: ML - 4, y: cursor.y - 4, width: MR - ML + 8, height: 14, color: rowIndex % 2 === 0 ? STRIP : WHITE });
    columns.forEach((column) => {
      const value = truncate(column.value(row), column.width ? Math.max(10, Math.floor(column.width / 5.8)) : 60);
      const textWidth = fonts.regular.widthOfTextAtSize(value, 8.5);
      let x = column.x;
      if (column.align === 'right' && column.width) x = column.x + column.width - textWidth;
      if (column.align === 'center' && column.width) x = column.x + (column.width - textWidth) / 2;
      drawText(cursor.page, value, { x, y: cursor.y, size: 8.5, font: fonts.regular, color: DARK });
    });
    cursor.y -= 14;
  });
  return cursor;
}

async function readLocalImage(relativeSrc: string) {
  const absolute = path.join(process.cwd(), 'public', relativeSrc.replace(/^\//, ''));
  try {
    return await fs.readFile(absolute);
  } catch {
    return null;
  }
}

async function drawContextImage(pdfDoc: PDFDocument, cursor: Cursor, imageMeta: typeof santafeImages[number], fonts: Fonts, options: { width: number; height: number }) {
  const bytes = await readLocalImage(imageMeta.src);
  const boxY = cursor.y - options.height;
  if (bytes) {
    try {
      const image = imageMeta.src.toLowerCase().endsWith('.png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      const dims = image.scaleToFit(options.width, options.height);
      const x = ML + (options.width - dims.width) / 2;
      cursor.page.drawImage(image, { x, y: boxY + (options.height - dims.height), width: dims.width, height: dims.height });
    } catch {
      cursor.page.drawRectangle({ x: ML, y: boxY, width: options.width, height: options.height, color: LIGHT, borderColor: LIME, borderWidth: 1.2 });
    }
  } else {
    cursor.page.drawRectangle({ x: ML, y: boxY, width: options.width, height: options.height, color: LIGHT, borderColor: LIME, borderWidth: 1.2 });
    drawText(cursor.page, imageMeta.title, { x: ML + 14, y: boxY + options.height - 24, size: 14, font: fonts.bold, color: FOREST });
    drawText(cursor.page, 'Placeholder grafico: el archivo libre definitivo no existe en esta copia local.', { x: ML + 14, y: boxY + options.height - 44, size: 8.5, font: fonts.regular, color: MID });
    drawText(cursor.page, imageMeta.credit, { x: ML + 14, y: boxY + 18, size: 7.5, font: fonts.regular, color: MID });
  }
  cursor.y = boxY - 10;
  drawText(cursor.page, imageMeta.caption, { x: ML, y: cursor.y, size: 8, font: fonts.regular, color: MID });
  cursor.y -= 10;
  drawText(cursor.page, `${imageMeta.credit} Fuente: ${imageMeta.source}`, { x: ML, y: cursor.y, size: 7, font: fonts.regular, color: MID });
  cursor.y -= 14;
  return cursor;
}

function parseSummary(summary: string) {
  return safe(summary).split('\n').map((line) => line.trimEnd());
}

function renderSummaryLines(cursor: Cursor, lines: string[], fonts: Fonts, newPage: (title: string) => Cursor) {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      cursor.y -= 6;
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      cursor = ensureSpace(cursor, 18, newPage);
      subTitle(cursor, line.replace(/^#{1,3}\s+/, ''), fonts);
      continue;
    }
    if (line.startsWith('- ')) {
      cursor = drawBulletList(cursor, [line.slice(2)], fonts, newPage);
      continue;
    }
    const result = drawJustifiedParagraph(cursor.page, line, {
      x: ML,
      y: cursor.y,
      width: MR - ML,
      size: 9,
      font: fonts.regular,
      lineHeight: 13,
      color: DARK,
      onPageBreak: () => {
        cursor = newPage(cursor.title);
        return { page: cursor.page, y: cursor.y };
      },
    });
    cursor.page = result.page;
    cursor.y = result.y;
  }
  return cursor;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const stats: StatsInput = payload?.stats ?? { total: 0, rutas: 0, exactos: 0, estimados: 0 };
  const summaryInput: string = payload?.summary ?? '';
  const updatedAt: string = payload?.updatedAt ?? new Date().toLocaleString('es-CO');
  const mapImageBase64: string = payload?.mapImageBase64 ?? '';
  const pdfDoc = await PDFDocument.create();
  const fonts: Fonts = {
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
  };
  const analysis = buildDeterministicAnalysis(stats);
  const summary = summaryInput.trim() ? summaryInput : buildFallbackSummary(stats);
  const pageTitles = new Map<PDFPage, string>();
  const tocItems: TocItem[] = [];

  const cover = pdfDoc.addPage([PW, PH]);
  cover.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: CREAM });
  cover.drawRectangle({ x: 0, y: PH - 220, width: PW, height: 220, color: FOREST });
  cover.drawRectangle({ x: 0, y: PH - 228, width: PW, height: 8, color: LIME });
  drawText(cover, 'FUNDESCO', { x: ML, y: PH - 50, size: 13, font: fonts.bold, color: LIME });
  drawText(cover, 'Observatorio Turístico de Santa Fe', { x: ML, y: PH - 78, size: 22, font: fonts.bold, color: WHITE });
  drawText(cover, 'Informe ampliado de caracterización territorial y madurez del ecosistema turístico', { x: ML, y: PH - 104, size: 11, font: fonts.regular, color: rgb(0.85, 0.95, 0.9) });
  drawText(cover, 'Bogotá D.C. | Localidad Santa Fe', { x: ML, y: PH - 126, size: 10, font: fonts.regular, color: rgb(0.75, 0.88, 0.82) });
  cover.drawRectangle({ x: ML, y: PH - 350, width: MR - ML, height: 118, color: WHITE, borderColor: LIME, borderWidth: 1.5 });
  cover.drawRectangle({ x: ML, y: PH - 258, width: MR - ML, height: 26, color: GREEN });
  drawText(cover, 'Resumen ejecutivo del periodo', { x: ML + 8, y: PH - 250, size: 10, font: fonts.bold, color: WHITE });
  [
    ['Periodo de recolección', `${stats.fechaInicio || 'N/D'} - ${stats.fechaFin || 'N/D'}`],
    ['Total de registros analizados', String(stats.total ?? 0)],
    ['Interés en rutas turísticas', `${stats.rutas ?? 0} emprendimientos`],
    ['Tasa de completitud', `${stats.tasaCompletitud ?? 0}%`],
    ['Índice de madurez', `${analysis.maturity.score}/100 (${analysis.maturity.level})`],
  ].forEach(([label, value], index) => {
    const y = PH - 277 - index * 18;
    drawText(cover, `${label}:`, { x: ML + 8, y, size: 9, font: fonts.bold, color: FOREST });
    drawText(cover, value, { x: ML + 185, y, size: 9, font: fonts.regular, color: DARK });
  });
  const coverCursor: Cursor = { page: cover, y: PH - 395, title: 'Portada' };
  await drawContextImage(pdfDoc, coverCursor, santafeImages[0], fonts, { width: MR - ML, height: 200 });
  cover.drawRectangle({ x: 0, y: 0, width: PW, height: 44, color: FOREST });
  drawText(cover, 'Documento generado automáticamente por el sistema de monitoreo Fundesco', { x: ML, y: 26, size: 8.5, font: fonts.regular, color: rgb(0.7, 0.85, 0.8) });
  drawText(cover, `Generado: ${updatedAt}`, { x: ML, y: 12, size: 8, font: fonts.regular, color: rgb(0.6, 0.75, 0.7) });

  const tocPage = pdfDoc.addPage([PW, PH]);
  pageTitles.set(tocPage, 'Tabla de contenido');

  const newPage = (title: string): Cursor => {
    const page = pdfDoc.addPage([PW, PH]);
    pageTitles.set(page, title);
    return { page, y: MT - 10, title };
  };

  const startSection = (label: string): Cursor => {
    const cursor = newPage(label);
    tocItems.push({ label, pageNumber: pdfDoc.getPageCount() });
    sectionTitle(cursor, label.toUpperCase(), fonts);
    return cursor;
  };

  const sectionLabels = (() => {
    const labels = [
      'Resumen ejecutivo',
      'Contexto territorial',
      mapImageBase64 ? 'Mapa territorial' : null,
      'Metodología y hallazgos clave',
      'Concentración y lectura geográfica',
      'Formalización e infraestructura',
      'Empleo e índice de madurez',
      'Mercado, capacidades y sostenibilidad',
      (stats.byFecha?.length || stats.topEncuestadores?.length || stats.completitudDist?.length) ? 'Recolección y calidad de datos' : null,
      'Brechas y recomendaciones',
      'Anexo técnico y glosario',
      'Créditos fotográficos',
    ].filter(Boolean) as string[];
    return labels.map((label, index) => `${index + 1}. ${label}`);
  })();

  let sectionIndex = 0;

  let cursor = startSection(sectionLabels[sectionIndex++]);
  cursor = renderSummaryLines(cursor, parseSummary(summary), fonts, newPage);

  cursor = startSection(sectionLabels[sectionIndex++]);
  const introText = ['La lectura del observatorio se enriquece con referentes de paisaje, patrimonio y espacio público que ayudan a entender cómo la oferta turística se inserta en Santa Fe. Cuando el archivo local de la imagen no existe, el informe preserva la estructura visual mediante un placeholder y mantiene visible la fuente prevista para la curaduría final.'];
  cursor = drawInfoBox(cursor, 'Contexto territorial de la localidad', introText, fonts, newPage);
  for (const image of santafeImages) {
    cursor = ensureSpace(cursor, 230, newPage);
    cursor = await drawContextImage(pdfDoc, cursor, image, fonts, { width: MR - ML, height: 150 });
  }

  if (mapImageBase64) {
    cursor = startSection(sectionLabels[sectionIndex++]);
    cursor = drawInfoBox(cursor, 'Interpretación del mapa', [
      `El mapa territorial combina ${stats.exactos || 0} puntos exactos y ${stats.estimados || 0} puntos estimados por centroide de barrio.`,
      analysis.concentration.paragraph,
    ], fonts, newPage);
    try {
      const imgBytes = Buffer.from(mapImageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const image = mapImageBase64.startsWith('data:image/png') ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
      const dims = image.scaleToFit(MR - ML, 300);
      cursor.page.drawImage(image, { x: ML + (MR - ML - dims.width) / 2, y: cursor.y - dims.height, width: dims.width, height: dims.height });
      cursor.y -= dims.height + 12;
      drawText(cursor.page, 'Leyenda: punto exacto = ubicación capturada en campo; punto estimado = centroide del barrio.', { x: ML, y: cursor.y, size: 8, font: fonts.regular, color: MID });
      cursor.y -= 16;
    } catch {
      cursor = drawInfoBox(cursor, 'Mapa no disponible', ['No fue posible embeber la captura del mapa en esta generación. El PDF continúa con el análisis territorial sin interrumpirse.'], fonts, newPage);
    }
  }

  cursor = startSection(sectionLabels[sectionIndex++]);
  cursor = drawInfoBox(cursor, analysis.methodology.title, analysis.methodology.paragraphs, fonts, newPage);
  subTitle(cursor, 'Hallazgos clave cuantificados', fonts);
  cursor = drawBulletList(cursor, analysis.hallazgos.slice(0, 8), fonts, newPage);

  cursor = startSection(sectionLabels[sectionIndex++]);
  analysis.narratives.geography.forEach((paragraph) => {
    const result = drawJustifiedParagraph(cursor.page, paragraph, { x: ML, y: cursor.y, width: MR - ML, size: 9, font: fonts.regular, lineHeight: 13, color: DARK, onPageBreak: () => { cursor = newPage(cursor.title); return { page: cursor.page, y: cursor.y }; } });
    cursor.page = result.page;
    cursor.y = result.y;
  });
  cursor.y -= 4;
  if ((stats.avanceBarrio?.length ?? 0) > 0) {
    subTitle(cursor, 'Tabla de avance por barrio', fonts);
    cursor = drawTableHeader(cursor, [
      { label: 'Barrio', x: ML, width: 150, value: (row: any) => row.nombre },
      { label: 'Encuestas', x: ML + 165, width: 60, value: (row: any) => String(row.cantidad), align: 'center' },
      { label: '% total', x: ML + 240, width: 55, value: (row: any) => `${row.pctTotal}%`, align: 'center' },
      { label: 'Madurez', x: ML + 305, width: 70, value: (row: any) => `${analysis.maturity.byBarrio.find((item) => item.barrio === row.nombre)?.score ?? 0}`, align: 'center' },
      { label: '% RNT', x: ML + 385, width: 55, value: (row: any) => row.pctRNT !== undefined ? `${row.pctRNT}%` : '—', align: 'center' },
      { label: '% Reg. M.', x: ML + 448, width: 66, value: (row: any) => row.pctRegistroMercantil !== undefined ? `${row.pctRegistroMercantil}%` : '—', align: 'center' },
    ], fonts, newPage);
    cursor = drawTableRows(cursor, stats.avanceBarrio ?? [], [
      { label: 'Barrio', x: ML, width: 150, value: (row: any) => row.nombre },
      { label: 'Encuestas', x: ML + 165, width: 60, value: (row: any) => String(row.cantidad), align: 'center' },
      { label: '% total', x: ML + 240, width: 55, value: (row: any) => `${row.pctTotal}%`, align: 'center' },
      { label: 'Madurez', x: ML + 305, width: 70, value: (row: any) => `${analysis.maturity.byBarrio.find((item) => item.barrio === row.nombre)?.score ?? 0}`, align: 'center' },
      { label: '% RNT', x: ML + 385, width: 55, value: (row: any) => row.pctRNT !== undefined ? `${row.pctRNT}%` : '—', align: 'center' },
      { label: '% Reg. M.', x: ML + 448, width: 66, value: (row: any) => row.pctRegistroMercantil !== undefined ? `${row.pctRegistroMercantil}%` : '—', align: 'center' },
    ], fonts, newPage);
  }
  if ((stats.byUpz?.length ?? 0) > 0) {
    cursor.y -= 8;
    subTitle(cursor, 'Distribución por UPZ', fonts);
    cursor = drawTableHeader(cursor, [
      { label: 'UPZ', x: ML, width: 240, value: (row: any) => row.name },
      { label: 'Encuestas', x: ML + 255, width: 90, value: (row: any) => String(row.value), align: 'center' },
      { label: '% del total', x: ML + 360, width: 90, value: (row: any) => `${Math.round((row.value / Math.max(stats.total || 1, 1)) * 100)}%`, align: 'center' },
    ], fonts, newPage);
    cursor = drawTableRows(cursor, stats.byUpz ?? [], [
      { label: 'UPZ', x: ML, width: 240, value: (row: any) => row.name },
      { label: 'Encuestas', x: ML + 255, width: 90, value: (row: any) => String(row.value), align: 'center' },
      { label: '% del total', x: ML + 360, width: 90, value: (row: any) => `${Math.round((row.value / Math.max(stats.total || 1, 1)) * 100)}%`, align: 'center' },
    ], fonts, newPage);
  }

  cursor = startSection(sectionLabels[sectionIndex++]);
  analysis.narratives.formalization.forEach((paragraph) => {
    const result = drawJustifiedParagraph(cursor.page, paragraph, { x: ML, y: cursor.y, width: MR - ML, size: 9, font: fonts.regular, lineHeight: 13, color: DARK, onPageBreak: () => { cursor = newPage(cursor.title); return { page: cursor.page, y: cursor.y }; } });
    cursor.page = result.page;
    cursor.y = result.y;
  });
  cursor.y -= 4;
  subTitle(cursor, 'Indicadores de formalización', fonts);
  const formal = stats.formalizacion;
  if (formal) {
    for (const row of [
      ['Registro Mercantil / Cámara de Comercio', formal.pctRegistroMercantil],
      ['Registro Nacional de Turismo (RNT)', formal.pctRNT],
      ['RUT', formal.pctRUT],
      ['Facturación electrónica', formal.pctFacturacionElectronica],
      ['Afiliación a seguridad social', formal.pctAfiliacionSS ?? 0],
      ['Seguro de responsabilidad civil', formal.pctSeguro ?? 0],
    ] as Array<[string, number]>) cursor = drawPctBar(cursor, row[0], row[1], fonts, newPage);
  }
  cursor.y -= 6;
  analysis.narratives.infrastructure.forEach((paragraph) => {
    const result = drawJustifiedParagraph(cursor.page, paragraph, { x: ML, y: cursor.y, width: MR - ML, size: 9, font: fonts.regular, lineHeight: 13, color: DARK, onPageBreak: () => { cursor = newPage(cursor.title); return { page: cursor.page, y: cursor.y }; } });
    cursor.page = result.page;
    cursor.y = result.y;
  });
  cursor.y -= 4;
  subTitle(cursor, 'Indicadores de infraestructura', fonts);
  const infra = stats.infraestructura;
  if (infra) {
    for (const row of [
      ['Sede física', infra.pctSedeFisica],
      ['Señalización visible', infra.pctSeñalizacion],
      ['Baños disponibles', infra.pctBanos],
      ['Botiquín / emergencias', infra.pctBotiquin],
      ['Conectividad a internet', infra.pctConectividad],
    ] as Array<[string, number]>) cursor = drawPctBar(cursor, row[0], row[1], fonts, newPage);
  }

  cursor = startSection(sectionLabels[sectionIndex++]);
  analysis.narratives.employment.forEach((paragraph) => {
    const result = drawJustifiedParagraph(cursor.page, paragraph, { x: ML, y: cursor.y, width: MR - ML, size: 9, font: fonts.regular, lineHeight: 13, color: DARK, onPageBreak: () => { cursor = newPage(cursor.title); return { page: cursor.page, y: cursor.y }; } });
    cursor.page = result.page;
    cursor.y = result.y;
  });
  cursor.y -= 4;
  const empleo = stats.empleo;
  if (empleo) {
    subTitle(cursor, 'Indicadores agregados de empleo', fonts);
    cursor = drawTableHeader(cursor, [
      { label: 'Indicador', x: ML, width: 280, value: (row: any) => row.label },
      { label: 'Total', x: ML + 320, width: 60, value: (row: any) => String(row.value), align: 'center' },
    ], fonts, newPage);
    cursor = drawTableRows(cursor, [
      { label: 'Empleos formales', value: empleo.totalFormales },
      { label: 'Empleos informales / familiares', value: empleo.totalInformales },
      { label: 'Mujeres vinculadas', value: empleo.totalMujeres },
      { label: 'Jóvenes vinculados', value: empleo.totalJovenes },
      { label: 'Adultos mayores (60+)', value: empleo.totalMayores60 },
      { label: 'Población diversa', value: empleo.totalDiversidad },
    ], [
      { label: 'Indicador', x: ML, width: 280, value: (row: any) => row.label },
      { label: 'Total', x: ML + 320, width: 60, value: (row: any) => String(row.value), align: 'center' },
    ], fonts, newPage);
  }
  cursor.y -= 8;
  cursor = drawInfoBox(cursor, 'Indice sintetico de madurez', [analysis.maturity.paragraph, analysis.maturity.formula], fonts, newPage);
  subTitle(cursor, 'Componentes del indice', fonts);
  analysis.maturity.components.forEach((component) => {
    cursor = drawPctBar(cursor, `${component.label} (peso ${component.weight}%)`, Math.round(component.score), fonts, newPage);
  });
  if (analysis.maturity.byBarrio.length) {
    cursor.y -= 6;
    subTitle(cursor, 'Madurez aproximada por barrio', fonts);
    cursor = drawTableHeader(cursor, [
      { label: 'Barrio', x: ML, width: 220, value: (row: any) => row.barrio },
      { label: 'Score', x: ML + 260, width: 55, value: (row: any) => String(row.score), align: 'center' },
      { label: 'Nivel', x: ML + 340, width: 70, value: (row: any) => row.level, align: 'center' },
    ], fonts, newPage);
    cursor = drawTableRows(cursor, analysis.maturity.byBarrio.slice(0, 10), [
      { label: 'Barrio', x: ML, width: 220, value: (row: any) => row.barrio },
      { label: 'Score', x: ML + 260, width: 55, value: (row: any) => String(row.score), align: 'center' },
      { label: 'Nivel', x: ML + 340, width: 70, value: (row: any) => row.level, align: 'center' },
    ], fonts, newPage);
  }

  cursor = startSection(sectionLabels[sectionIndex++]);
  [...analysis.narratives.market, ...analysis.narratives.sustainability, ...analysis.narratives.capacities].forEach((paragraph) => {
    const result = drawJustifiedParagraph(cursor.page, paragraph, { x: ML, y: cursor.y, width: MR - ML, size: 9, font: fonts.regular, lineHeight: 13, color: DARK, onPageBreak: () => { cursor = newPage(cursor.title); return { page: cursor.page, y: cursor.y }; } });
    cursor.page = result.page;
    cursor.y = result.y;
  });
  const segmentList = stats.productoMercado?.topSegmentos ?? [];
  if (segmentList.length) {
    cursor.y -= 6;
    subTitle(cursor, 'Segmentos de mercado atendidos', fonts);
    const maxValue = Math.max(...segmentList.map((item) => item.value), 1);
    segmentList.slice(0, 8).forEach((item) => { cursor = drawMiniBar(cursor, item.name, item.value, maxValue, fonts, newPage); });
  }
  const channelList = stats.topCanales ?? [];
  if (channelList.length) {
    cursor.y -= 6;
    subTitle(cursor, 'Canales digitales activos', fonts);
    const maxValue = Math.max(...channelList.map((item) => item.value), 1);
    channelList.slice(0, 8).forEach((item) => { cursor = drawMiniBar(cursor, item.name, item.value, maxValue, fonts, newPage); });
  }
  const sustainabilityList = stats.topPracticasSostenibilidad ?? [];
  if (sustainabilityList.length) {
    cursor.y -= 6;
    subTitle(cursor, 'Prácticas de sostenibilidad reportadas', fonts);
    const maxValue = Math.max(...sustainabilityList.map((item) => item.value), 1);
    sustainabilityList.slice(0, 8).forEach((item) => { cursor = drawMiniBar(cursor, item.name, item.value, maxValue, fonts, newPage); });
  }

  if ((stats.byFecha?.length ?? 0) > 0 || (stats.topEncuestadores?.length ?? 0) > 0 || (stats.completitudDist?.length ?? 0) > 0) {
    cursor = startSection(sectionLabels[sectionIndex++]);
    cursor = drawInfoBox(cursor, 'Calidad y trazabilidad de recolección', [
      `Periodo observado: ${stats.fechaInicio || 'N/D'} - ${stats.fechaFin || 'N/D'}.`,
      `La tasa de completitud calculada es ${stats.tasaCompletitud ?? 0}%.`,
    ], fonts, newPage);
    if ((stats.topEncuestadores?.length ?? 0) > 0) {
      subTitle(cursor, 'Encuestas por encuestador/a', fonts);
      cursor = drawTableHeader(cursor, [
        { label: 'Encuestador/a', x: ML, width: 240, value: (row: any) => row.name },
        { label: 'Encuestas', x: ML + 260, width: 70, value: (row: any) => String(row.value), align: 'center' },
        { label: '% del total', x: ML + 350, width: 80, value: (row: any) => `${Math.round((row.value / Math.max(stats.total || 1, 1)) * 100)}%`, align: 'center' },
      ], fonts, newPage);
      cursor = drawTableRows(cursor, stats.topEncuestadores ?? [], [
        { label: 'Encuestador/a', x: ML, width: 240, value: (row: any) => row.name },
        { label: 'Encuestas', x: ML + 260, width: 70, value: (row: any) => String(row.value), align: 'center' },
        { label: '% del total', x: ML + 350, width: 80, value: (row: any) => `${Math.round((row.value / Math.max(stats.total || 1, 1)) * 100)}%`, align: 'center' },
      ], fonts, newPage);
      cursor.y -= 8;
    }
    if ((stats.byFecha?.length ?? 0) > 0) {
      subTitle(cursor, 'Serie diaria de recolección', fonts);
      const maxValue = Math.max(...(stats.byFecha ?? []).map((item) => item.value), 1);
      (stats.byFecha ?? []).forEach((item) => { cursor = drawMiniBar(cursor, item.fecha, item.value, maxValue, fonts, newPage); });
    }
    if ((stats.completitudDist?.length ?? 0) > 0) {
      cursor.y -= 8;
      subTitle(cursor, 'Estados de completitud', fonts);
      cursor = drawTableHeader(cursor, [
        { label: 'Estado', x: ML, width: 260, value: (row: any) => row.name },
        { label: 'Registros', x: ML + 280, width: 70, value: (row: any) => String(row.value), align: 'center' },
        { label: '% del total', x: ML + 370, width: 80, value: (row: any) => `${Math.round((row.value / Math.max(stats.total || 1, 1)) * 100)}%`, align: 'center' },
      ], fonts, newPage);
      cursor = drawTableRows(cursor, stats.completitudDist ?? [], [
        { label: 'Estado', x: ML, width: 260, value: (row: any) => row.name },
        { label: 'Registros', x: ML + 280, width: 70, value: (row: any) => String(row.value), align: 'center' },
        { label: '% del total', x: ML + 370, width: 80, value: (row: any) => `${Math.round((row.value / Math.max(stats.total || 1, 1)) * 100)}%`, align: 'center' },
      ], fonts, newPage);
    }
  }

  cursor = startSection(sectionLabels[sectionIndex++]);
  subTitle(cursor, 'Brechas y riesgos principales', fonts);
  cursor = drawBulletList(cursor, analysis.brechasYRiesgos, fonts, newPage);
  cursor.y -= 6;
  subTitle(cursor, 'Recomendaciones priorizadas', fonts);
  cursor = drawTableHeader(cursor, [
    { label: 'Acción', x: ML, width: 270, value: (row: any) => row.action },
    { label: 'Prioridad', x: ML + 286, width: 60, value: (row: any) => row.priority, align: 'center' },
    { label: 'Indicador sugerido', x: ML + 360, width: 150, value: (row: any) => row.indicator },
  ], fonts, newPage);
  cursor = drawTableRows(cursor, analysis.recommendations, [
    { label: 'Acción', x: ML, width: 270, value: (row: any) => row.action },
    { label: 'Prioridad', x: ML + 286, width: 60, value: (row: any) => row.priority, align: 'center' },
    { label: 'Indicador sugerido', x: ML + 360, width: 150, value: (row: any) => row.indicator },
  ], fonts, newPage);

  cursor = startSection(sectionLabels[sectionIndex++]);
  subTitle(cursor, 'Ficha técnica resumida', fonts);
  cursor = drawTableHeader(cursor, [
    { label: 'Campo', x: ML, width: 180, value: (row: any) => row.label },
    { label: 'Valor', x: ML + 200, width: 280, value: (row: any) => row.value },
  ], fonts, newPage);
  cursor = drawTableRows(cursor, analysis.methodology.technicalSheet, [
    { label: 'Campo', x: ML, width: 180, value: (row: any) => row.label },
    { label: 'Valor', x: ML + 200, width: 280, value: (row: any) => row.value },
  ], fonts, newPage);
  cursor.y -= 8;
  subTitle(cursor, 'Glosario', fonts);
  analysis.glossary.forEach((entry) => {
    cursor = ensureSpace(cursor, 32, newPage);
    drawText(cursor.page, `${entry.term}:`, { x: ML, y: cursor.y, size: 9, font: fonts.bold, color: FOREST });
    const result = drawJustifiedParagraph(cursor.page, entry.definition, { x: ML + 54, y: cursor.y, width: MR - ML - 54, size: 8.5, font: fonts.regular, lineHeight: 12, color: DARK, onPageBreak: () => { cursor = newPage(cursor.title); return { page: cursor.page, y: cursor.y }; } });
    cursor.page = result.page;
    cursor.y = result.y;
  });

  cursor = startSection(sectionLabels[sectionIndex++]);
  cursor = drawInfoBox(cursor, 'Créditos y estado de la galería', [
    'La carpeta public/images/santafe/ queda documentada para alojar únicamente imágenes de dominio público o con licencia libre. En esta copia local no fue posible descargar los binarios desde Wikimedia Commons, por lo que el PDF y la web muestran placeholders sin interrumpir la generación del informe.',
    'Revise public/images/santafe/CREDITS.md antes de incorporar archivos finales y complete autor, URL del archivo y licencia específica de cada fotografía seleccionada.',
  ], fonts, newPage);
  cursor = drawTableHeader(cursor, [
    { label: 'Tema', x: ML, width: 120, value: (row: any) => row.title },
    { label: 'Fuente', x: ML + 135, width: 200, value: (row: any) => row.source },
    { label: 'Licencia', x: ML + 350, width: 150, value: (row: any) => row.license },
  ], fonts, newPage);
  cursor = drawTableRows(cursor, santafeImages, [
    { label: 'Tema', x: ML, width: 120, value: (row: any) => row.title },
    { label: 'Fuente', x: ML + 135, width: 200, value: (row: any) => row.source },
    { label: 'Licencia', x: ML + 350, width: 150, value: (row: any) => row.license },
  ], fonts, newPage);

  const totalPages = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    if (index <= 1) return;
    drawHeader(page, pageTitles.get(page) || 'Informe', fonts, index + 1, totalPages);
    drawFooter(page, fonts);
  });

  drawHeader(tocPage, 'Tabla de contenido', fonts, 2, totalPages);
  drawFooter(tocPage, fonts);
  let y = MT - 10;
  drawText(tocPage, 'Tabla de contenido', { x: ML, y, size: 16, font: fonts.bold, color: FOREST });
  y -= 8;
  tocPage.drawRectangle({ x: ML, y, width: MR - ML, height: 2, color: LIME });
  y -= 20;
  tocItems.forEach((item, index) => {
    if (y < MB + 24) return;
    tocPage.drawRectangle({ x: ML - 4, y: y - 5, width: MR - ML + 8, height: 22, color: index % 2 === 0 ? STRIP : WHITE });
    drawText(tocPage, item.label, { x: ML + 4, y: y + 3, size: 10, font: fonts.bold, color: FOREST });
    drawText(tocPage, '.'.repeat(Math.max(4, 92 - item.label.length)), { x: ML + 4 + item.label.length * 5.1, y: y + 3, size: 9, font: fonts.regular, color: rgb(0.7, 0.7, 0.7) });
    drawText(tocPage, String(item.pageNumber), { x: MR - 16, y: y + 3, size: 10, font: fonts.bold, color: FOREST });
    y -= 26;
  });

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
