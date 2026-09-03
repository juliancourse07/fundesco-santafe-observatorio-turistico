import fs from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import formularioSchema from '@/schema-formulario.json';
import {
  PDFDocument,
  PDFPage,
  PDFFont,
  PDFEmbeddedPage,
  StandardFonts,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFImage,
} from 'pdf-lib';
import { buildDeterministicAnalysis, buildFallbackSummary, sanitizePdfText, type StatsInput } from './analysis';
import { colorHex, spacingScale, typeScale } from './designTokens';
import { buildMapSvgGeometry, type BarrioData } from './mapSvg';
import { getSectionsForReportType, type ReportType } from './reportSections';
import { santafeImages, type SantafeImage } from './santafeImages';

export type PdfReportPayload = {
  stats?: StatsInput;
  summary?: string;
  updatedAt?: string;
  reportType?: ReportType;
  /** @deprecated mapImageBase64 is no longer used; the map is generated as SVG server-side */
  mapImageBase64?: string;
};

type Fonts = { regular: PDFFont; bold: PDFFont };
type Cursor = { page: PDFPage; y: number; title: string };
type TocItem = { label: string; pageNumber: number };
type TableColumn<T> = { label: string; width: number; value: (row: T) => string; align?: 'left' | 'right' | 'center' };
type ImageFormat = 'jpg' | 'png';

type PdfBuildResult = {
  pdfBytes: Uint8Array;
  logs: string[];
};

const PAGE_W = 612;
const PAGE_H = 792;
const PAGE_MARGIN_X = spacingScale.xxxl;

// ─── Letterhead safe zones ────────────────────────────────────────────────
// MEMBRETE-FUNDESCO.pdf has an institutional header (~80 px) and footer (~60 px).
// CONTENT_TOP and CONTENT_BOTTOM leave generous clearance so no content ever
// overlaps the letterhead, watermark, logos or institutional footer.
const TEMPLATE_HEADER_SAFE_H = 90;  // pixels from top edge reserved for letterhead header
const TEMPLATE_FOOTER_SAFE_H = 68;  // pixels from bottom edge reserved for letterhead footer

const CONTENT_W = PAGE_W - PAGE_MARGIN_X * 2;
const CONTENT_TOP = PAGE_H - TEMPLATE_HEADER_SAFE_H - spacingScale.sm;
const CONTENT_BOTTOM = TEMPLATE_FOOTER_SAFE_H + spacingScale.sm;
const IMAGE_BOX_H = 164;
const TABLE_FONT_SIZE = 8.5;
const TABLE_LINE_H = 11;

const FOREST = toRgb(colorHex.forest);
const GREEN = toRgb(colorHex.green);
const LIME = toRgb(colorHex.lime);
const CREAM = toRgb(colorHex.cream);
const PAPER = toRgb(colorHex.paper);
const INK = toRgb(colorHex.ink);
const SLATE = toRgb(colorHex.slate);
const MUTED = toRgb(colorHex.muted);
const LINE = toRgb(colorHex.line);
const MIST = toRgb(colorHex.mist);
const STRIPE = toRgb(colorHex.stripe);
const WARNING = toRgb(colorHex.danger);

function toRgb(hex: string) {
  const clean = hex.replace('#', '');
  const bigint = Number.parseInt(clean, 16);
  return rgb(((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255);
}

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
    if (current && font.widthOfTextAtSize(candidate + '-', size) > width) {
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
    const parts = font.widthOfTextAtSize(rawWord, size) > width ? splitLongWord(rawWord, width, font, size) : [rawWord];
    for (const word of parts) {
      const candidate = current.length ? `${current.join(' ')} ${word}` : word;
      if (current.length && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(current.join(' '));
        current = [word];
      } else {
        current.push(word);
      }
    }
  }
  if (current.length) lines.push(current.join(' '));
  return lines;
}

function truncateToWidth(text: string, width: number, font: PDFFont, size: number) {
  const value = safe(text);
  if (!value) return '';
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let output = value;
  while (output.length > 1 && font.widthOfTextAtSize(`${output}…`, size) > width) output = output.slice(0, -1);
  return `${output}…`;
}

function ensureSpace(cursor: Cursor, needed: number, newPage: (title: string) => Cursor) {
  return cursor.y - needed < CONTENT_BOTTOM ? newPage(cursor.title) : cursor;
}

function createColumns<T>(columns: Array<Omit<TableColumn<T>, 'width'> & { width: number }>) {
  return columns;
}

function drawPageNumber(page: PDFPage, fonts: Fonts, pageNumber: number, totalPages: number) {
  // Only page number is drawn — the letterhead provides the full header/footer decoration
  const pageLabel = `Página ${pageNumber} de ${totalPages}`;
  const pageW = fonts.bold.widthOfTextAtSize(pageLabel, 8);
  drawText(page, pageLabel, { x: PAGE_W - PAGE_MARGIN_X - pageW, y: TEMPLATE_FOOTER_SAFE_H - 16, size: 8, font: fonts.bold, color: SLATE });
}

function drawSectionLabel(page: PDFPage, title: string, fonts: Fonts) {
  const safeTitle = truncateToWidth(title, CONTENT_W - 80, fonts.regular, 8);
  drawText(page, safeTitle, { x: PAGE_MARGIN_X, y: TEMPLATE_FOOTER_SAFE_H - 16, size: 8, font: fonts.regular, color: MUTED });
}

function sectionTitle(cursor: Cursor, text: string, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, 28, newPage);
  cursor.page.drawRectangle({ x: PAGE_MARGIN_X, y: cursor.y - 6, width: CONTENT_W, height: 22, color: FOREST });
  drawText(cursor.page, truncateToWidth(text, CONTENT_W - spacingScale.lg, fonts.bold, 11), { x: PAGE_MARGIN_X + spacingScale.sm, y: cursor.y + 1, size: 11, font: fonts.bold, color: PAPER });
  cursor.y -= 30;
  return cursor;
}

function subTitle(cursor: Cursor, text: string, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, 18, newPage);
  drawText(cursor.page, truncateToWidth(text, CONTENT_W, fonts.bold, 11), { x: PAGE_MARGIN_X, y: cursor.y, size: 11, font: fonts.bold, color: FOREST });
  cursor.y -= 18;
  return cursor;
}

function drawParagraph(cursor: Cursor, text: string, options: {
  font: PDFFont;
  size: number;
  lineHeight: number;
  color: ReturnType<typeof rgb>;
  x?: number;
  width?: number;
  justify?: boolean;
  gapAfter?: number;
}, newPage: (title: string) => Cursor) {
  const x = options.x ?? PAGE_MARGIN_X;
  const width = options.width ?? CONTENT_W;
  const paragraphs = safe(text).split(/\n+/).map((item) => item.trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    const lines = wrapToWidth(paragraph, width, options.font, options.size);
    lines.forEach((line, index) => {
      cursor = ensureSpace(cursor, options.lineHeight, newPage);
      const words = line.split(' ').filter(Boolean);
      const justify = options.justify && index < lines.length - 1 && words.length > 1;
      if (justify) {
        const plainWidth = words.reduce((sum, word) => sum + options.font.widthOfTextAtSize(word, options.size), 0);
        const extra = Math.max(0, (width - plainWidth) / (words.length - 1));
        let currentX = x;
        words.forEach((word, wordIndex) => {
          drawText(cursor.page, word, { x: currentX, y: cursor.y, size: options.size, font: options.font, color: options.color });
          currentX += options.font.widthOfTextAtSize(word, options.size);
          if (wordIndex < words.length - 1) currentX += extra;
        });
      } else {
        drawText(cursor.page, line, { x, y: cursor.y, size: options.size, font: options.font, color: options.color });
      }
      cursor.y -= options.lineHeight;
    });
    cursor.y -= options.gapAfter ?? spacingScale.sm;
  }
  return cursor;
}

function drawBulletList(cursor: Cursor, items: string[], fonts: Fonts, newPage: (title: string) => Cursor) {
  items.forEach((item) => {
    cursor = ensureSpace(cursor, 22, newPage);
    drawText(cursor.page, '•', { x: PAGE_MARGIN_X, y: cursor.y, size: 11, font: fonts.bold, color: FOREST });
    cursor = drawParagraph(cursor, item, {
      x: PAGE_MARGIN_X + spacingScale.lg,
      width: CONTENT_W - spacingScale.lg,
      size: 9.25,
      lineHeight: 13,
      font: fonts.regular,
      color: INK,
      justify: true,
      gapAfter: spacingScale.xs,
    }, newPage);
  });
  return cursor;
}

function drawInfoBox(cursor: Cursor, title: string, body: string[], fonts: Fonts, newPage: (title: string) => Cursor) {
  const bodyLines = body.flatMap((paragraph) => wrapToWidth(paragraph, CONTENT_W - spacingScale.xl, fonts.regular, 9).length ? [wrapToWidth(paragraph, CONTENT_W - spacingScale.xl, fonts.regular, 9).length] : [1]);
  const bodyHeight = bodyLines.reduce((sum, lines) => sum + (lines * 13) + spacingScale.sm, 0);
  const totalHeight = 24 + bodyHeight + spacingScale.lg;
  cursor = ensureSpace(cursor, totalHeight, newPage);
  const boxTop = cursor.y + spacingScale.sm;
  const boxBottom = cursor.y - totalHeight + spacingScale.sm;
  cursor.page.drawRectangle({ x: PAGE_MARGIN_X, y: boxBottom, width: CONTENT_W, height: totalHeight, color: PAPER, borderColor: LINE, borderWidth: 1 });
  cursor.page.drawRectangle({ x: PAGE_MARGIN_X, y: boxTop - 18, width: CONTENT_W, height: 18, color: GREEN });
  drawText(cursor.page, truncateToWidth(title, CONTENT_W - spacingScale.lg, fonts.bold, 9.5), { x: PAGE_MARGIN_X + spacingScale.sm, y: boxTop - 13, size: 9.5, font: fonts.bold, color: PAPER });
  cursor.y -= 28;
  body.forEach((paragraph) => {
    cursor = drawParagraph(cursor, paragraph, {
      x: PAGE_MARGIN_X + spacingScale.sm,
      width: CONTENT_W - spacingScale.lg,
      size: 9,
      lineHeight: 13,
      font: fonts.regular,
      color: INK,
      justify: true,
      gapAfter: spacingScale.xs,
    }, newPage);
  });
  cursor.y -= spacingScale.sm;
  return cursor;
}

function drawPercentBar(cursor: Cursor, label: string, pctValue: number, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, 20, newPage);
  const labelWidth = 218;
  const barWidth = 210;
  const valueWidth = CONTENT_W - labelWidth - barWidth - spacingScale.lg;
  const x = PAGE_MARGIN_X;
  const barX = x + labelWidth + spacingScale.md;
  const valueX = barX + barWidth + spacingScale.sm;
  drawText(cursor.page, truncateToWidth(label, labelWidth, fonts.regular, 8.75), { x, y: cursor.y, size: 8.75, font: fonts.regular, color: INK });
  cursor.page.drawRectangle({ x: barX, y: cursor.y - 1.5, width: barWidth, height: 10, color: MIST, borderColor: LINE, borderWidth: 0.6 });
  cursor.page.drawRectangle({ x: barX, y: cursor.y - 1.5, width: Math.max(4, (Math.max(0, pctValue) / 100) * barWidth), height: 10, color: GREEN });
  const value = `${pctValue}%`;
  const valueW = fonts.bold.widthOfTextAtSize(value, 8.75);
  drawText(cursor.page, value, { x: valueX + Math.max(0, valueWidth - valueW), y: cursor.y, size: 8.75, font: fonts.bold, color: FOREST });
  cursor.y -= 18;
  return cursor;
}

function drawMiniBar(cursor: Cursor, label: string, value: number, maxValue: number, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, 20, newPage);
  const labelWidth = 220;
  const barWidth = 186;
  const valueWidth = CONTENT_W - labelWidth - barWidth - spacingScale.lg;
  const x = PAGE_MARGIN_X;
  const barX = x + labelWidth + spacingScale.md;
  const valueX = barX + barWidth + spacingScale.sm;
  drawText(cursor.page, truncateToWidth(label, labelWidth, fonts.regular, 8.75), { x, y: cursor.y, size: 8.75, font: fonts.regular, color: INK });
  cursor.page.drawRectangle({ x: barX, y: cursor.y - 1.5, width: barWidth, height: 10, color: MIST, borderColor: LINE, borderWidth: 0.6 });
  cursor.page.drawRectangle({ x: barX, y: cursor.y - 1.5, width: maxValue > 0 ? Math.max(4, (value / maxValue) * barWidth) : 4, height: 10, color: GREEN });
  const valueText = String(value);
  const valueW = fonts.bold.widthOfTextAtSize(valueText, 8.75);
  drawText(cursor.page, valueText, { x: valueX + Math.max(0, valueWidth - valueW), y: cursor.y, size: 8.75, font: fonts.bold, color: FOREST });
  cursor.y -= 18;
  return cursor;
}

function drawTable<T>(cursor: Cursor, rows: T[], columns: TableColumn<T>[], fonts: Fonts, newPage: (title: string) => Cursor) {
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const left = PAGE_MARGIN_X;
  const padX = spacingScale.sm;

  const drawHeaderRow = () => {
    cursor = ensureSpace(cursor, 22, newPage);
    cursor.page.drawRectangle({ x: left, y: cursor.y - 6, width: totalWidth, height: 18, color: GREEN });
    let x = left;
    columns.forEach((column) => {
      drawText(cursor.page, truncateToWidth(column.label, column.width - padX * 2, fonts.bold, TABLE_FONT_SIZE), {
        x: x + padX,
        y: cursor.y - 1,
        size: TABLE_FONT_SIZE,
        font: fonts.bold,
        color: PAPER,
      });
      x += column.width;
    });
    cursor.y -= 22;
  };

  drawHeaderRow();
  rows.forEach((row, rowIndex) => {
    const wrappedCells = columns.map((column) => wrapToWidth(String(column.value(row) ?? '—'), column.width - padX * 2, fonts.regular, TABLE_FONT_SIZE));
    const rowLineCount = Math.max(...wrappedCells.map((cell) => cell.length), 1);
    const rowHeight = rowLineCount * TABLE_LINE_H + spacingScale.sm;
    cursor = ensureSpace(cursor, rowHeight + spacingScale.sm, newPage);
    if (cursor.y - (rowHeight + spacingScale.sm) < CONTENT_BOTTOM + 4) {
      cursor = newPage(cursor.title);
      drawHeaderRow();
    }

    cursor.page.drawRectangle({ x: left, y: cursor.y - rowHeight + 2, width: totalWidth, height: rowHeight, color: rowIndex % 2 === 0 ? STRIPE : PAPER, borderColor: LINE, borderWidth: 0.5 });
    let x = left;
    columns.forEach((column, index) => {
      const cellLines = wrappedCells[index];
      cellLines.forEach((line, lineIndex) => {
        const width = fonts.regular.widthOfTextAtSize(line, TABLE_FONT_SIZE);
        let textX = x + padX;
        if (column.align === 'right') textX = x + column.width - padX - width;
        if (column.align === 'center') textX = x + (column.width - width) / 2;
        drawText(cursor.page, line, {
          x: Math.max(x + padX, textX),
          y: cursor.y - (lineIndex * TABLE_LINE_H) - 3,
          size: TABLE_FONT_SIZE,
          font: fonts.regular,
          color: INK,
        });
      });
      x += column.width;
    });
    cursor.y -= rowHeight + spacingScale.xs;
  });
  return cursor;
}

async function readLocalImage(relativeSrc: string) {
  const absolute = path.join(process.cwd(), 'public', relativeSrc.replace(/^\//, ''));
  try {
    const bytes = await fs.readFile(absolute);
    return { bytes, absolute };
  } catch {
    return null;
  }
}

function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  return null;
}

async function embedImage(pdfDoc: PDFDocument, bytes: Uint8Array, format: ImageFormat) {
  return format === 'png' ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
}

function drawImageCover(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
  page.drawImage(image, { x: drawX, y: drawY, width: drawWidth, height: drawHeight });
  page.pushOperators(popGraphicsState());
}

async function drawContextImageCard(pdfDoc: PDFDocument, cursor: Cursor, imageMeta: SantafeImage, fonts: Fonts, logs: string[], newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, IMAGE_BOX_H + 72, newPage);
  const x = PAGE_MARGIN_X;
  const y = cursor.y - IMAGE_BOX_H;
  cursor.page.drawRectangle({ x, y, width: CONTENT_W, height: IMAGE_BOX_H, color: MIST, borderColor: LINE, borderWidth: 1 });
  const file = await readLocalImage(imageMeta.src);
  if (file) {
    const format = detectImageFormat(file.bytes);
    if (format) {
      try {
        const image = await embedImage(pdfDoc, file.bytes, format);
        drawImageCover(cursor.page, image, x, y, CONTENT_W, IMAGE_BOX_H);
        logs.push(`image ok: ${imageMeta.src} (${format})`);
      } catch (error) {
        logs.push(`image embed failed: ${imageMeta.src} (${error instanceof Error ? error.message : 'unknown error'})`);
        cursor.page.drawRectangle({ x, y, width: CONTENT_W, height: IMAGE_BOX_H, color: MIST, borderColor: WARNING, borderWidth: 1.2 });
        drawText(cursor.page, imageMeta.title, { x: x + spacingScale.lg, y: y + IMAGE_BOX_H - 28, size: 18, font: fonts.bold, color: FOREST });
      }
    } else {
      logs.push(`image unsupported: ${imageMeta.src}`);
      cursor.page.drawRectangle({ x, y, width: CONTENT_W, height: IMAGE_BOX_H, color: MIST, borderColor: WARNING, borderWidth: 1.2 });
      drawText(cursor.page, imageMeta.title, { x: x + spacingScale.lg, y: y + IMAGE_BOX_H - 28, size: 18, font: fonts.bold, color: FOREST });
    }
  } else {
    logs.push(`image missing: ${imageMeta.src}`);
    cursor.page.drawRectangle({ x, y, width: CONTENT_W, height: IMAGE_BOX_H, color: FOREST });
    drawText(cursor.page, imageMeta.title, { x: x + spacingScale.lg, y: y + IMAGE_BOX_H - 30, size: 18, font: fonts.bold, color: PAPER });
    cursor = drawParagraph(cursor, `Archivo local no disponible. Se conserva el bloque de respaldo para ${imageMeta.title}.`, {
      x: x + spacingScale.lg,
      width: CONTENT_W - spacingScale.xxl,
      size: 9,
      lineHeight: 12,
      font: fonts.regular,
      color: PAPER,
      gapAfter: 0,
    }, newPage);
    cursor.y = y - spacingScale.sm;
  }
  cursor.y = y - spacingScale.md;
  cursor = drawParagraph(cursor, imageMeta.caption, {
    size: 8.5,
    lineHeight: 12,
    font: fonts.regular,
    color: SLATE,
    gapAfter: spacingScale.xs,
  }, newPage);
  cursor = drawParagraph(cursor, `${imageMeta.credit} · Licencia: ${imageMeta.license}`, {
    size: 7.8,
    lineHeight: 11,
    font: fonts.regular,
    color: MUTED,
    gapAfter: spacingScale.xs,
  }, newPage);
  cursor = drawParagraph(cursor, `Fuente: ${imageMeta.source}`, {
    size: 7.5,
    lineHeight: 10,
    font: fonts.regular,
    color: MUTED,
    gapAfter: spacingScale.md,
  }, newPage);
  return cursor;
}

function drawMapLabels(page: PDFPage, labels: Array<{ text: string; x: number; y: number; size: number; bold: boolean; color: string; anchor: 'left' | 'center' | 'right' }>, fonts: Fonts, area: { x: number; y: number; width: number; height: number; svgWidth: number; svgHeight: number }) {
  const scaleX = area.width / area.svgWidth;
  const scaleY = area.height / area.svgHeight;
  const scale = Math.min(scaleX, scaleY);

  labels.forEach((label) => {
    const font = label.bold ? fonts.bold : fonts.regular;
    const size = label.size * scale;
    const textWidth = font.widthOfTextAtSize(safe(label.text), size);
    let drawX = area.x + (label.x * scaleX);
    if (label.anchor === 'center') drawX -= textWidth / 2;
    if (label.anchor === 'right') drawX -= textWidth;
    const drawY = area.y + (area.height - (label.y * scaleY));
    drawText(page, label.text, { x: drawX, y: drawY, size, font, color: /^#/.test(label.color) ? toRgb(label.color) : INK });
  });
}

function renderActorCharacterizationSection(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  const actorRows = (stats.byTipo ?? []).map((item) => ({
    tipo: item.name,
    volumen: item.value,
    pct: `${Math.round((item.value / Math.max(stats.total || 1, 1)) * 100)}%`,
  }));

  if (actorRows.length) {
    cursor = drawTable(cursor, actorRows, createColumns([
      { label: 'Tipo de Actor', width: 260, value: (row: any) => row.tipo },
      { label: 'Volumen (n)', width: 110, value: (row: any) => String(row.volumen), align: 'center' },
      { label: '% del total', width: 110, value: (row: any) => row.pct, align: 'center' },
    ]), fonts, newPage);
    const topActors = actorRows.slice(0, 3).map((row) => `${row.tipo} (${row.pct})`).join(', ');
    cursor = drawParagraph(cursor, `La composición del ecosistema turístico observado se concentra en ${topActors || 'tipologías aún no clasificadas'}, lo que permite orientar acciones de fortalecimiento diferenciadas por vocación productiva y peso relativo dentro de la muestra.`, {
      size: 9.25,
      lineHeight: 13,
      font: fonts.regular,
      color: INK,
      justify: true,
    }, newPage);
  } else {
    cursor = drawParagraph(cursor, 'No hay desagregación por tipo de actor disponible en la base consolidada para construir esta tabla.', {
      size: 9.25,
      lineHeight: 13,
      font: fonts.regular,
      color: INK,
    }, newPage);
  }

  if (stats.formalizacion && actorRows.length) {
    cursor = subTitle(cursor, 'Referencia general de formalización por composición actoral', fonts, newPage);
    cursor = drawParagraph(cursor, 'La fuente actual no desagrega formalización por tipo de actor; por transparencia se presenta una referencia general para leer la composición actoral frente al promedio de la base total.', {
      size: 8.5,
      lineHeight: 12,
      font: fonts.regular,
      color: MUTED,
      justify: true,
    }, newPage);
    cursor = drawTable(cursor, actorRows, createColumns([
      { label: 'Tipo de Actor', width: 180, value: (row: any) => row.tipo },
      { label: 'Participación', width: 80, value: (row: any) => row.pct, align: 'center' },
      { label: 'Reg. Mercantil', width: 80, value: () => `${stats.formalizacion?.pctRegistroMercantil ?? 0}%`, align: 'center' },
      { label: 'RNT', width: 60, value: () => `${stats.formalizacion?.pctRNT ?? 0}%`, align: 'center' },
      { label: 'RUT', width: 60, value: () => `${stats.formalizacion?.pctRUT ?? 0}%`, align: 'center' },
    ]), fonts, newPage);
  }

  return cursor;
}

function renderOpportunitiesSection(cursor: Cursor, stats: StatsInput, analysis: ReturnType<typeof buildDeterministicAnalysis>, fonts: Fonts, newPage: (title: string) => Cursor) {
  const weakestScore = stats.scores?.slice().sort((a, b) => a.value - b.value)[0];
  const patterns = [
    stats.formalizacion ? `La correlación entre formalización tributaria y turística sigue siendo dispareja: RUT (${stats.formalizacion.pctRUT}%) supera a RNT (${stats.formalizacion.pctRNT}%), lo que abre una oportunidad de acompañamiento focalizado.` : 'No hay datos suficientes para inferir correlaciones robustas de formalización.',
    `La concentración territorial ubica a ${analysis.concentration.topBarrio} como principal nodo observado y al top 3 de barrios con ${analysis.concentration.top3Share}% del total, señal de polos claros para activar circuitos y ampliar barridos complementarios.`,
    weakestScore ? `La brecha de capacidades más visible aparece en ${weakestScore.name} (${weakestScore.value}/5), con oportunidades de asistencia técnica asociadas a ${stats.necesidades?.slice(0, 3).map((item) => item.name).join(', ') || 'fortalecimiento operativo'}.` : 'No hay autoevaluaciones suficientes para aislar una brecha dominante de capacidades.',
  ];
  cursor = drawBulletList(cursor, patterns, fonts, newPage);

  const opportunityRows = analysis.recommendations.map((recommendation, index) => ({
    oportunidad: recommendation.action,
    evidencia: analysis.brechasYRiesgos[index] ?? recommendation.indicator,
    horizonte: recommendation.priority === 'Alta' ? 'Corto plazo' : recommendation.priority === 'Media' ? 'Mediano plazo' : 'Escalonado',
  }));

  cursor = drawTable(cursor, opportunityRows, createColumns([
    { label: 'Oportunidad identificada', width: 250, value: (row: any) => row.oportunidad },
    { label: 'Evidencia de soporte', width: 170, value: (row: any) => row.evidencia },
    { label: 'Horizonte', width: 80, value: (row: any) => row.horizonte, align: 'center' },
  ]), fonts, newPage);

  return cursor;
}

function renderExpandedMethodologySection(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  const exactPct = Math.round(((stats.exactos || 0) / Math.max(stats.total || 1, 1)) * 100);
  const estimatedPct = Math.round(((stats.estimados || 0) / Math.max(stats.total || 1, 1)) * 100);
  const schemaColumns = Array.isArray((formularioSchema as any).columns) ? (formularioSchema as any).columns as string[] : [];
  const variableGroups = [
    {
      title: 'Identificación, ubicación y trazabilidad territorial',
      fields: schemaColumns.filter((item) => /Fecha de aplicación|UPZ|Barrio|Lugar específico|Latitud|Longitud|Calidad del punto geográfico/i.test(item)).slice(0, 6),
    },
    {
      title: 'Tipología de oferta, productos y servicios',
      fields: schemaColumns.filter((item) => /Tipo principal de emprendimiento|Servicios|Producto turístico|Segmentos de mercado|Público objetivo|Idiomas/i.test(item)).slice(0, 6),
    },
    {
      title: 'Infraestructura, formalización y capacidades',
      fields: schemaColumns.filter((item) => /sede física|Conectividad|baños|registro mercantil|RNT|RUT|facturación|sostenibilidad/i.test(item)).slice(0, 8),
    },
  ];

  cursor = drawParagraph(cursor, 'El instrumento de caracterización consolida variables de identificación territorial, tipología empresarial, capacidades operativas, formalización, empleo, sostenibilidad, mercado y evidencia de soporte. Su diseño permite lecturas descriptivas del ecosistema, cruces operativos para priorización institucional y seguimiento periódico del avance del proyecto.', {
    size: 9.25,
    lineHeight: 13,
    font: fonts.regular,
    color: INK,
    justify: true,
  }, newPage);

  cursor = subTitle(cursor, 'Universo y muestra observada', fonts, newPage);
  cursor = drawTable(cursor, [
    { campo: 'Total encuestado', valor: `${stats.total || 0} registros consolidados` },
    { campo: 'Cobertura geográfica', valor: 'Localidad de Santa Fe, Bogotá D.C. (barrios y UPZ con presencia en la base)' },
    { campo: 'Periodo de recolección', valor: `${stats.fechaInicio || 'N/D'} - ${stats.fechaFin || 'N/D'}` },
    { campo: 'Interés en rutas turísticas', valor: `${stats.rutas || 0} emprendimientos` },
  ], createColumns([
    { label: 'Campo', width: 170, value: (row: any) => row.campo },
    { label: 'Valor', width: 290, value: (row: any) => row.valor },
  ]), fonts, newPage);

  cursor = subTitle(cursor, 'Variables y categorías empleadas', fonts, newPage);
  variableGroups.forEach((group) => {
    cursor = drawParagraph(cursor, `${group.title}: ${group.fields.join('; ') || 'variables presentes en el esquema, pendientes de listar automáticamente.'}`, {
      size: 8.75,
      lineHeight: 12,
      font: fonts.regular,
      color: INK,
      justify: true,
    }, newPage);
  });

  cursor = subTitle(cursor, 'Notas de calidad del dato', fonts, newPage);
  cursor = drawTable(cursor, [
    { criterio: 'Georreferenciación exacta', valor: `${stats.exactos || 0} registros`, pct: `${exactPct}%` },
    { criterio: 'Georreferenciación estimada por centroide', valor: `${stats.estimados || 0} registros`, pct: `${estimatedPct}%` },
    { criterio: 'Completitud declarada', valor: `${stats.tasaCompletitud ?? 0}%`, pct: 'Índice agregado' },
  ], createColumns([
    { label: 'Criterio', width: 240, value: (row: any) => row.criterio },
    { label: 'Valor', width: 120, value: (row: any) => row.valor, align: 'center' },
    { label: 'Participación', width: 100, value: (row: any) => row.pct, align: 'center' },
  ]), fonts, newPage);

  cursor = subTitle(cursor, 'Limitaciones reconocidas', fonts, newPage);
  cursor = drawBulletList(cursor, [
    'La base es autorreportada y algunas variables admiten selección múltiple, por lo que varias métricas expresan intensidad declarada y no exclusividad.',
    'La georreferenciación estimada mejora cobertura espacial, pero reduce precisión para análisis microterritoriales cuando no existe coordenada puntual.',
    'No todas las dimensiones están desagregadas por tipo de actor, por lo que algunos cruces solo pueden interpretarse a nivel agregado.',
  ], fonts, newPage);

  return cursor;
}

function buildTraceabilityRows(stats: StatsInput) {
  const total = Math.max(stats.total || 0, 1);
  const empleoTotal = (stats.empleo?.totalFormales ?? 0) + (stats.empleo?.totalInformales ?? 0);
  return [
    { indicador: 'Registros analizados', formula: 'Conteo total consolidado', variable: 'stats.total', validos: stats.total || 0 },
    { indicador: 'Interés en rutas turísticas', formula: 'stats.rutas / stats.total * 100', variable: 'stats.rutas, stats.total', validos: stats.total || 0 },
    { indicador: 'Georreferenciación exacta', formula: 'stats.exactos / stats.total * 100', variable: 'stats.exactos, stats.total', validos: stats.total || 0 },
    { indicador: 'Georreferenciación estimada', formula: 'stats.estimados / stats.total * 100', variable: 'stats.estimados, stats.total', validos: stats.total || 0 },
    { indicador: 'Registro mercantil', formula: 'stats.formalizacion.pctRegistroMercantil', variable: 'stats.formalizacion.pctRegistroMercantil', validos: stats.formalizacion ? total : 0 },
    { indicador: 'Registro Nacional de Turismo (RNT)', formula: 'stats.formalizacion.pctRNT', variable: 'stats.formalizacion.pctRNT', validos: stats.formalizacion ? total : 0 },
    { indicador: 'RUT', formula: 'stats.formalizacion.pctRUT', variable: 'stats.formalizacion.pctRUT', validos: stats.formalizacion ? total : 0 },
    { indicador: 'Facturación electrónica', formula: 'stats.formalizacion.pctFacturacionElectronica', variable: 'stats.formalizacion.pctFacturacionElectronica', validos: stats.formalizacion ? total : 0 },
    { indicador: 'Sede física', formula: 'stats.infraestructura.pctSedeFisica', variable: 'stats.infraestructura.pctSedeFisica', validos: stats.infraestructura ? total : 0 },
    { indicador: 'Conectividad a internet', formula: 'stats.infraestructura.pctConectividad', variable: 'stats.infraestructura.pctConectividad', validos: stats.infraestructura ? total : 0 },
    { indicador: 'Formalidad del empleo', formula: 'stats.empleo.totalFormales / (formales + informales) * 100', variable: 'stats.empleo.totalFormales, stats.empleo.totalInformales', validos: empleoTotal },
    { indicador: 'Tasa de completitud', formula: 'stats.tasaCompletitud', variable: 'stats.tasaCompletitud, stats.completitudDist', validos: stats.total || 0 },
  ].filter((row) => row.validos > 0 || row.indicador === 'Registros analizados').slice(0, 10);
}

function renderTraceabilitySection(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawParagraph(cursor, 'La siguiente matriz relaciona indicadores clave del informe con su fórmula de cálculo, la variable agregada de origen y el volumen de registros válidos utilizado en la síntesis estadística.', {
    size: 9.25,
    lineHeight: 13,
    font: fonts.regular,
    color: INK,
    justify: true,
  }, newPage);
  cursor = drawTable(cursor, buildTraceabilityRows(stats), createColumns([
    { label: 'Indicador', width: 140, value: (row: any) => row.indicador },
    { label: 'Fórmula', width: 160, value: (row: any) => row.formula },
    { label: 'Variable origen', width: 120, value: (row: any) => row.variable },
    { label: 'Registros válidos (n)', width: 80, value: (row: any) => String(row.validos), align: 'center' },
  ]), fonts, newPage);
  return cursor;
}

function parseSummary(summary: string) {
  return safe(summary).split('\n').map((line) => line.trimEnd());
}

function renderSummary(cursor: Cursor, lines: string[], fonts: Fonts, newPage: (title: string) => Cursor) {
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) {
      cursor.y -= spacingScale.sm;
      return;
    }
    if (/^#{1,3}\s+/.test(line)) {
      cursor = subTitle(cursor, line.replace(/^#{1,3}\s+/, ''), fonts, newPage);
      return;
    }
    if (line.startsWith('- ')) {
      cursor = drawBulletList(cursor, [line.slice(2)], fonts, newPage);
      return;
    }
    cursor = drawParagraph(cursor, line, {
      size: 9.25,
      lineHeight: 13,
      font: fonts.regular,
      color: INK,
      justify: true,
    }, newPage);
  });
  return cursor;
}

async function loadFonts(pdfDoc: PDFDocument, logs: string[]): Promise<Fonts> {
  try {
    pdfDoc.registerFontkit(fontkit);
    const [regularBytes, boldBytes] = await Promise.all([
      fs.readFile(path.join(process.cwd(), 'public', 'fonts', 'Lato-Regular.ttf')),
      fs.readFile(path.join(process.cwd(), 'public', 'fonts', 'Lato-Bold.ttf')),
    ]);
    logs.push('font ok: public/fonts/Lato-Regular.ttf');
    logs.push('font ok: public/fonts/Lato-Bold.ttf');
    return {
      regular: await pdfDoc.embedFont(regularBytes, { subset: true }),
      bold: await pdfDoc.embedFont(boldBytes, { subset: true }),
    };
  } catch (error) {
    logs.push(`font fallback: ${error instanceof Error ? error.message : 'unknown error'}`);
    return {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    };
  }
}

function createPageFactory(pdfDoc: PDFDocument, pageTitles: Map<PDFPage, string>, templatePages: { cover?: PDFEmbeddedPage; interior?: PDFEmbeddedPage }) {
  return (title: string): Cursor => {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pageTitles.set(page, title);
    // Stamp interior letterhead as background before any content
    if (templatePages.interior) {
      page.drawPage(templatePages.interior, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    }
    return { page, y: CONTENT_TOP, title };
  };
}

function drawCover(cover: PDFPage, fonts: Fonts, stats: StatsInput, updatedAt: string, summary: string) {
  // The letterhead is already stamped as background. Draw content within the safe area.
  const titleY = CONTENT_TOP;
  drawText(cover, 'Observatorio Turístico de Santa Fe', { x: PAGE_MARGIN_X, y: titleY, size: typeScale.xl, font: fonts.bold, color: FOREST });
  drawText(cover, 'Informe de caracterización territorial y madurez del ecosistema turístico', { x: PAGE_MARGIN_X, y: titleY - 22, size: typeScale.sm, font: fonts.regular, color: SLATE });
  drawText(cover, `Corte: ${updatedAt}`, { x: PAGE_MARGIN_X, y: titleY - 40, size: typeScale.xs, font: fonts.regular, color: MUTED });

  // Executive summary box
  const boxTop = titleY - 60;
  const boxH = 130;
  const boxBottom = boxTop - boxH;
  cover.drawRectangle({ x: PAGE_MARGIN_X, y: boxBottom, width: CONTENT_W, height: boxH, color: PAPER, borderColor: LINE, borderWidth: 1.2 });
  cover.drawRectangle({ x: PAGE_MARGIN_X, y: boxTop - 20, width: CONTENT_W, height: 20, color: GREEN });
  drawText(cover, 'Resumen ejecutivo del periodo', { x: PAGE_MARGIN_X + spacingScale.sm, y: boxTop - 15, size: 9.5, font: fonts.bold, color: PAPER });

  [
    ['Periodo de recolección', `${stats.fechaInicio || 'N/D'} - ${stats.fechaFin || 'N/D'}`],
    ['Registros analizados', String(stats.total ?? 0)],
    ['Interés en rutas', `${stats.rutas ?? 0} emprendimientos`],
    ['Georreferenciación exacta', `${stats.exactos ?? 0}`],
  ].forEach(([label, value], index) => {
    const y = boxTop - 38 - index * 18;
    if (y > boxBottom + 4) {
      drawText(cover, `${label}:`, { x: PAGE_MARGIN_X + spacingScale.sm, y, size: 9, font: fonts.bold, color: FOREST });
      drawText(cover, value, { x: PAGE_MARGIN_X + 190, y, size: 9, font: fonts.regular, color: INK });
    }
  });

  // Summary text below the box
  const summaryLines = wrapToWidth(summary.replace(/\n+/g, ' '), CONTENT_W, fonts.regular, 10).slice(0, 4);
  let y = boxBottom - 20;
  summaryLines.forEach((line) => {
    if (y > CONTENT_BOTTOM) {
      drawText(cover, line, { x: PAGE_MARGIN_X, y, size: 10, font: fonts.regular, color: SLATE });
      y -= 14;
    }
  });
}

async function drawMapBox(pdfDoc: PDFDocument, cursor: Cursor, stats: StatsInput, fonts: Fonts, logs: string[], newPage: (title: string) => Cursor) {
  cursor = ensureSpace(cursor, 400, newPage);
  const x = PAGE_MARGIN_X;
  const height = 360;
  const y = cursor.y - height;
  cursor.page.drawRectangle({ x, y, width: CONTENT_W, height, color: MIST, borderColor: LINE, borderWidth: 1 });

  try {
    const geoPath = path.join(process.cwd(), 'public', 'geo', 'santafe-barrios.geojson');
    const geoRaw = await fs.readFile(geoPath, 'utf-8');
    const geojson = JSON.parse(geoRaw);

    const barrioData: BarrioData[] = (stats.avanceBarrio ?? []).map((b: any) => ({
      nombre: b.nombre,
      cantidad: b.cantidad,
      pctRNT: b.pctRNT,
      pctRegistroMercantil: b.pctRegistroMercantil,
    }));

    const { svgString, labels } = buildMapSvgGeometry(geojson, {
      theme: 'light',
      width: CONTENT_W,
      height,
      barrios: barrioData,
    });

    let pngBytes: Uint8Array | null = null;
    try {
      const sharp = (await import('sharp')).default;
      const buf = await sharp(Buffer.from(svgString)).png({ quality: 100 }).toBuffer();
      pngBytes = new Uint8Array(buf);
    } catch {
      logs.push('map: sharp not available, using label-only fallback');
    }

    if (pngBytes) {
      const image = await pdfDoc.embedPng(pngBytes);
      drawImageCover(cursor.page, image, x, y, CONTENT_W, height);
      drawMapLabels(cursor.page, labels, fonts, { x, y, width: CONTENT_W, height, svgWidth: CONTENT_W, svgHeight: height });
      logs.push('map: SVG rasterised and embedded as PNG');
    } else {
      drawText(cursor.page, 'Mapa territorial de Santa Fe', { x: x + spacingScale.lg, y: y + height - 28, size: 14, font: fonts.bold, color: FOREST });
      drawText(cursor.page, `Barrios: ${geojson.features?.length ?? 0} · Encuestas: ${stats.total ?? 0}`, { x: x + spacingScale.lg, y: y + height - 50, size: 10, font: fonts.regular, color: SLATE });
      drawMapLabels(cursor.page, labels, fonts, { x, y, width: CONTENT_W, height, svgWidth: CONTENT_W, svgHeight: height });
    }
  } catch (error) {
    logs.push(`map embed failed: ${error instanceof Error ? error.message : 'unknown'}`);
    drawText(cursor.page, 'No fue posible incorporar el mapa en esta generación.', { x: x + spacingScale.lg, y: y + height - 28, size: 12, font: fonts.bold, color: FOREST });
  }

  cursor.y = y - spacingScale.md;
  cursor = drawParagraph(cursor, 'Distribución territorial de encuestas por barrio y UPZ de la Localidad de Santa Fe, Bogotá D.C. Los polígonos representan barrios según el GeoJSON oficial. La intensidad de color refleja el volumen de encuestas.', {
    size: 8,
    lineHeight: 11,
    font: fonts.regular,
    color: MUTED,
    gapAfter: spacingScale.md,
  }, newPage);
  return cursor;
}

// ─── Badge helpers for Informe 2 ─────────────────────────────────────────────
// Distinguishes three types of content within Informe 2:
//   [D] Dato derivado de la encuesta
//   [M] Criterio metodológico propuesto
//   [P] Pendiente de levantamiento en campo
function drawBadge(cursor: Cursor, type: 'dato' | 'metodologico' | 'pendiente', fonts: Fonts) {
  const configs = {
    dato: { label: '[D] Dato derivado', color: GREEN },
    metodologico: { label: '[M] Criterio metodológico', color: FOREST },
    pendiente: { label: '[P] Pendiente de levantamiento', color: WARNING },
  };
  const cfg = configs[type];
  const badgeW = fonts.bold.widthOfTextAtSize(cfg.label, 7.5) + 10;
  cursor.page.drawRectangle({ x: PAGE_MARGIN_X, y: cursor.y - 2, width: badgeW, height: 12, color: cfg.color, borderColor: cfg.color, borderWidth: 0 });
  drawText(cursor.page, cfg.label, { x: PAGE_MARGIN_X + 5, y: cursor.y + 1, size: 7.5, font: fonts.bold, color: PAPER });
  cursor.y -= 18;
  return cursor;
}

// ─── Cover for Informe 2 ─────────────────────────────────────────────────────
function drawPotencialesCover(cover: PDFPage, fonts: Fonts, stats: StatsInput, updatedAt: string) {
  const titleY = CONTENT_TOP;
  drawText(cover, 'Observatorio Turístico de Santa Fe', { x: PAGE_MARGIN_X, y: titleY, size: typeScale.xl, font: fonts.bold, color: FOREST });
  drawText(cover, 'Informe 2 — Potenciales turísticos, viabilidad y propuestas de ruta', { x: PAGE_MARGIN_X, y: titleY - 22, size: typeScale.sm, font: fonts.regular, color: SLATE });
  drawText(cover, `Corte: ${updatedAt}`, { x: PAGE_MARGIN_X, y: titleY - 40, size: typeScale.xs, font: fonts.regular, color: MUTED });

  const boxTop = titleY - 60;
  const boxH = 120;
  const boxBottom = boxTop - boxH;
  cover.drawRectangle({ x: PAGE_MARGIN_X, y: boxBottom, width: CONTENT_W, height: boxH, color: PAPER, borderColor: LINE, borderWidth: 1.2 });
  cover.drawRectangle({ x: PAGE_MARGIN_X, y: boxTop - 20, width: CONTENT_W, height: 20, color: GREEN });
  drawText(cover, 'Alcance del informe', { x: PAGE_MARGIN_X + spacingScale.sm, y: boxTop - 15, size: 9.5, font: fonts.bold, color: PAPER });

  [
    ['Base de análisis', `${stats.total ?? 0} emprendimientos encuestados, Localidad de Santa Fe`],
    ['Corte de datos', updatedAt],
    ['Barrios con registro', String((stats.byBarrio ?? stats.avanceBarrio ?? []).length)],
    ['Prácticas sostenibles documentadas', String((stats.topPracticasSostenibilidad ?? []).length)],
  ].forEach(([label, value], index) => {
    const y = boxTop - 38 - index * 18;
    if (y > boxBottom + 4) {
      drawText(cover, `${label}:`, { x: PAGE_MARGIN_X + spacingScale.sm, y, size: 9, font: fonts.bold, color: FOREST });
      drawText(cover, value, { x: PAGE_MARGIN_X + 210, y, size: 9, font: fonts.regular, color: INK });
    }
  });

  const noteY = boxBottom - 20;
  drawText(cover, 'Este informe integra hallazgos derivados de datos, criterios metodológicos propuestos y campos pendientes de levantamiento en campo.', { x: PAGE_MARGIN_X, y: noteY, size: 8.5, font: fonts.regular, color: SLATE });
  drawText(cover, 'Cada bloque de contenido lleva un indicador visual: [D] Dato derivado · [M] Criterio metodológico · [P] Pendiente de levantamiento.', { x: PAGE_MARGIN_X, y: noteY - 14, size: 8.5, font: fonts.regular, color: MUTED });
}

// ─── Informe 2 section renderers ─────────────────────────────────────────────

function renderPotNotaLector(cursor: Cursor, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawInfoBox(cursor, 'Naturaleza del documento', [
    'Este informe analiza el potencial turístico de la Localidad de Santa Fe a partir de los datos recolectados mediante encuestas a emprendimientos. No constituye un inventario de atractivos turísticos ni un censo de recursos patrimoniales.',
    'Los datos disponibles provienen de las encuestas a emprendimientos registrados en el Observatorio. No existe en el repositorio un inventario de atractivos ni un censo de recursos patrimoniales; por tanto, ningún dato de este informe ha sido inventado.',
  ], fonts, newPage);

  cursor = subTitle(cursor, 'Sistema de marcas', fonts, newPage);
  cursor = drawBadge(cursor, 'dato', fonts);
  cursor = drawParagraph(cursor, 'Hallazgo cuantificado y trazable a una variable de la encuesta.', { size: 9, lineHeight: 13, font: fonts.regular, color: INK }, newPage);
  cursor = drawBadge(cursor, 'metodologico', fonts);
  cursor = drawParagraph(cursor, 'Criterio, marco o propuesta metodológica que no proviene directamente de la encuesta, sino de la interpretación técnica del equipo.', { size: 9, lineHeight: 13, font: fonts.regular, color: INK }, newPage);
  cursor = drawBadge(cursor, 'pendiente', fonts);
  cursor = drawParagraph(cursor, 'Campo no cubierto por la encuesta actual. Se presenta como plantilla estructurada para levantamiento en campo por parte del Observatorio.', { size: 9, lineHeight: 13, font: fonts.regular, color: INK }, newPage);

  cursor = drawInfoBox(cursor, 'Restricción metodológica', [
    'Está terminantemente prohibido inventar datos en este informe. Todo indicador es derivado de variables existentes o se presenta como plantilla vacía. La fuente de cada dato se indica en el Anexo metodológico (Sección 10).',
  ], fonts, newPage);
  return cursor;
}

function renderPotMarcoConceptual(cursor: Cursor, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawBadge(cursor, 'metodologico', fonts);
  cursor = drawParagraph(cursor, 'El potencial turístico de un territorio se define como la capacidad de sus recursos, actores y condiciones estructurales para generar y sostener flujos turísticos de calidad (Ferrari, 2021; Menchero Sánchez, 2015). Esta capacidad no es inherente al recurso sino al sistema que lo articula: infraestructura, actores, gobernanza y demanda.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);

  cursor = drawParagraph(cursor, 'Para Santa Fe, el potencial turístico se evalúa a través de cuatro ejes de viabilidad que estructuran este informe:', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);

  cursor = drawTable(cursor, [
    { eje: 'Cultural', descripcion: 'Presencia de patrimonio tangible e intangible, expresiones artísticas, prácticas comunitarias y narrativas identitarias que pueden sostener experiencias turísticas con valor diferencial.', variable: 'tipo de actor, prácticas sostenibles, cuidado del patrimonio' },
    { eje: 'Social', descripcion: 'Capacidad organizativa de la comunidad local, inclusión de poblaciones diversas, empleo generado y nivel de cohesión territorial para desarrollar turismo con equidad.', variable: 'empleo (mujeres, jóvenes, diversidad), nivel de formalización, interés en rutas' },
    { eje: 'Económica', descripcion: 'Viabilidad financiera y de mercado de los emprendimientos, diversidad de segmentos atendidos, canales de comercialización y capacidad de absorción de visitantes.', variable: 'segmentos, canales, capacidad diaria, herramientas digitales' },
    { eje: 'Ambiental', descripcion: 'Adopción de prácticas de sostenibilidad, gestión de residuos, uso eficiente de recursos y protección del entorno como condición de competitividad a largo plazo.', variable: 'prácticas de sostenibilidad, reducción de plásticos, separación de residuos' },
  ], createColumns([
    { label: 'Eje', width: 68, value: (row: any) => row.eje },
    { label: 'Qué mide', width: 258, value: (row: any) => row.descripcion },
    { label: 'Variables de encuesta', width: 142, value: (row: any) => row.variable },
  ]), fonts, newPage);

  cursor = subTitle(cursor, 'Referente documentado: Barrio Egipto (Santa Fe)', fonts, newPage);
  cursor = drawBadge(cursor, 'metodologico', fonts);
  cursor = drawParagraph(cursor, 'El barrio Egipto, en la Localidad de Santa Fe, constituye un referente académicamente documentado de turismo comunitario urbano viable. El proyecto Breaking Borders demostró que comunidades en contextos de alta vulnerabilidad pueden transformar el patrimonio cultural y la identidad barrial en experiencias turísticas sostenibles (Ferrari, 2021; Pontificia Universidad Javeriana, 2022; Universidad La Gran Colombia, 2017). Este caso no implica vínculo operativo entre el Observatorio y la iniciativa, sino que constituye evidencia de viabilidad del modelo en la propia localidad.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);
  return cursor;
}

function renderPotZonasPotencial(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawBadge(cursor, 'dato', fonts);
  cursor = drawParagraph(cursor, 'A partir de la concentración territorial de encuestas, la composición por tipo de actor y las prácticas sostenibles registradas, es posible identificar zonas con mayor potencial turístico inferido. Se trata de potencial derivado de la oferta registrada, no de un inventario de atractivos turísticos.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);

  const avanceBarrio = stats.avanceBarrio ?? [];
  const byBarrio = stats.byBarrio ?? [];

  if (avanceBarrio.length > 0) {
    cursor = subTitle(cursor, 'Tabla comparativa de potencial por barrio (datos derivados)', fonts, newPage);
    cursor = drawBadge(cursor, 'dato', fonts);
    cursor = drawTable(cursor, avanceBarrio.slice(0, 10), createColumns([
      { label: 'Barrio', width: 130, value: (row: any) => row.nombre },
      { label: 'Encuestas', width: 62, value: (row: any) => String(row.cantidad), align: 'center' },
      { label: '% del total', width: 62, value: (row: any) => `${row.pctTotal}%`, align: 'center' },
      { label: '% RNT', width: 60, value: (row: any) => row.pctRNT !== undefined ? `${row.pctRNT}%` : '—', align: 'center' },
      { label: '% Reg. Merc.', width: 74, value: (row: any) => row.pctRegistroMercantil !== undefined ? `${row.pctRegistroMercantil}%` : '—', align: 'center' },
      { label: 'Madurez', width: 80, value: (row: any) => row.scorePromedio !== undefined ? `${row.scorePromedio}/100` : '—', align: 'center' },
    ]), fonts, newPage);
    cursor = drawParagraph(cursor, 'Nota: la columna "% del total" refleja la participación relativa en el levantamiento. No equivale a la importancia turística absoluta del barrio.', { size: 8, lineHeight: 11, font: fonts.regular, color: MUTED, gapAfter: spacingScale.sm }, newPage);
  } else if (byBarrio.length > 0) {
    cursor = subTitle(cursor, 'Distribución por barrio (datos derivados)', fonts, newPage);
    cursor = drawBadge(cursor, 'dato', fonts);
    const maxV = Math.max(...byBarrio.map((item) => item.value), 1);
    byBarrio.slice(0, 8).forEach((item) => { cursor = drawMiniBar(cursor, item.name, item.value, maxV, fonts, newPage); });
  } else {
    cursor = drawBadge(cursor, 'pendiente', fonts);
    cursor = drawParagraph(cursor, 'No hay datos desagregados por barrio en este corte. Para completar esta sección, el Observatorio debe registrar el barrio en cada encuesta y agregar la variable al procesamiento.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true }, newPage);
  }

  cursor = subTitle(cursor, 'Composición por tipo de actor turístico', fonts, newPage);
  const byTipo = stats.byTipo ?? [];
  if (byTipo.length > 0) {
    cursor = drawBadge(cursor, 'dato', fonts);
    const maxV = Math.max(...byTipo.map((item) => item.value), 1);
    byTipo.slice(0, 8).forEach((item) => { cursor = drawMiniBar(cursor, item.name, item.value, maxV, fonts, newPage); });
  } else {
    cursor = drawBadge(cursor, 'pendiente', fonts);
    cursor = drawParagraph(cursor, 'Dato no disponible en este corte.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK }, newPage);
  }

  cursor = subTitle(cursor, 'Prácticas sostenibles registradas (indicador de vocación ambiental)', fonts, newPage);
  const sostenibilidad = stats.topPracticasSostenibilidad ?? [];
  if (sostenibilidad.length > 0) {
    cursor = drawBadge(cursor, 'dato', fonts);
    const maxV = Math.max(...sostenibilidad.map((item) => item.value), 1);
    sostenibilidad.slice(0, 8).forEach((item) => { cursor = drawMiniBar(cursor, item.name, item.value, maxV, fonts, newPage); });
  } else {
    cursor = drawBadge(cursor, 'pendiente', fonts);
    cursor = drawParagraph(cursor, 'Dato no disponible en este corte.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK }, newPage);
  }
  return cursor;
}

function renderPotMatrizViabilidad(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawBadge(cursor, 'metodologico', fonts);
  cursor = drawParagraph(cursor, 'La matriz multicriterio aplica los cuatro ejes de viabilidad (cultural, social, económica y ambiental) a las zonas identificadas. Cada criterio se puntúa de 0 a 100 según la variable de encuesta que lo alimenta. Cuando el dato existe, se calcula; cuando no existe, la celda se marca como pendiente de levantamiento.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);

  cursor = subTitle(cursor, 'Criterios de puntuación por eje (definición operativa)', fonts, newPage);
  cursor = drawBadge(cursor, 'metodologico', fonts);
  cursor = drawTable(cursor, [
    { eje: 'Cultural', criterio: 'Diversidad de tipos de actor turístico', formula: '(tipos distintos / 8 tipos posibles) × 100', variable: 'byTipo' },
    { eje: 'Social', criterio: 'Nivel de inclusión laboral', formula: '(mujeres + jóvenes + diversidad) / total empleo × 100', variable: 'empleo.*' },
    { eje: 'Social', criterio: 'Formalización RNT', formula: 'pctRNT de la zona', variable: 'avanceBarrio.pctRNT' },
    { eje: 'Económica', criterio: 'Formalización mercantil', formula: 'pctRegistroMercantil de la zona', variable: 'avanceBarrio.pctRegistroMercantil' },
    { eje: 'Económica', criterio: 'Diversidad de segmentos', formula: '(segmentos atendidos / 6 posibles) × 100', variable: 'productoMercado.topSegmentos' },
    { eje: 'Ambiental', criterio: 'Adopción de prácticas sostenibles', formula: '(prácticas registradas / 5 prácticas clave) × 100', variable: 'topPracticasSostenibilidad' },
  ], createColumns([
    { label: 'Eje', width: 60, value: (row: any) => row.eje },
    { label: 'Criterio', width: 148, value: (row: any) => row.criterio },
    { label: 'Fórmula', width: 162, value: (row: any) => row.formula },
    { label: 'Variable encuesta', width: 98, value: (row: any) => row.variable },
  ]), fonts, newPage);

  cursor = subTitle(cursor, 'Fórmula de agregación y justificación', fonts, newPage);
  cursor = drawBadge(cursor, 'metodologico', fonts);
  cursor = drawParagraph(cursor, 'Puntaje compuesto = 0.25 × Cultural + 0.25 × Social + 0.30 × Económica + 0.20 × Ambiental. Los pesos reflejan la prioridad estratégica del Observatorio: mayor peso a la viabilidad económica por ser condición necesaria de sostenibilidad, y menor peso al eje ambiental por tratarse de una localidad predominantemente urbana donde la sostenibilidad se expresa principalmente en prácticas de gestión y no en ecosistemas naturales frágiles.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);

  // Calculate scores from available data
  const avanceBarrio = stats.avanceBarrio ?? [];
  const empleo = stats.empleo;
  const totalEmpleo = empleo ? (empleo.totalFormales + empleo.totalInformales) : 0;
  const inclusionScore = totalEmpleo > 0 && empleo
    ? Math.round(((empleo.totalMujeres + empleo.totalJovenes + empleo.totalDiversidad) / totalEmpleo) * 100)
    : null;
  const byTipo = stats.byTipo ?? [];
  const culturalScore = byTipo.length > 0 ? Math.min(100, Math.round((byTipo.length / 8) * 100)) : null;
  const segmentos = stats.productoMercado?.topSegmentos ?? [];
  const segmentoScore = segmentos.length > 0 ? Math.min(100, Math.round((segmentos.length / 6) * 100)) : null;
  const sostenibilidad = stats.topPracticasSostenibilidad ?? [];
  const ambientalScore = Math.min(100, Math.round((Math.min(sostenibilidad.length, 5) / 5) * 100));

  cursor = subTitle(cursor, 'Matriz de viabilidad aplicada (nivel localidad)', fonts, newPage);
  cursor = drawBadge(cursor, 'dato', fonts);
  cursor = drawTable(cursor, [
    {
      eje: 'Cultural',
      peso: '25%',
      score: culturalScore !== null ? String(culturalScore) : 'P',
      fuente: byTipo.length > 0 ? `${byTipo.length} tipos de actor` : 'Sin dato',
    },
    {
      eje: 'Social (inclusión)',
      peso: '12.5%',
      score: inclusionScore !== null ? String(inclusionScore) : 'P',
      fuente: totalEmpleo > 0 ? `${totalEmpleo} empleos registrados` : 'Sin dato',
    },
    {
      eje: 'Social (RNT)',
      peso: '12.5%',
      score: stats.formalizacion?.pctRNT !== undefined ? String(stats.formalizacion.pctRNT) : 'P',
      fuente: stats.formalizacion ? 'encuesta formalización' : 'Sin dato',
    },
    {
      eje: 'Económica (mercantil)',
      peso: '15%',
      score: stats.formalizacion?.pctRegistroMercantil !== undefined ? String(stats.formalizacion.pctRegistroMercantil) : 'P',
      fuente: stats.formalizacion ? 'encuesta formalización' : 'Sin dato',
    },
    {
      eje: 'Económica (segmentos)',
      peso: '15%',
      score: segmentoScore !== null ? String(segmentoScore) : 'P',
      fuente: segmentos.length > 0 ? `${segmentos.length} segmentos` : 'Sin dato',
    },
    {
      eje: 'Ambiental',
      peso: '20%',
      score: String(ambientalScore),
      fuente: `${sostenibilidad.length} prácticas registradas`,
    },
  ], createColumns([
    { label: 'Eje / Criterio', width: 160, value: (row: any) => row.eje },
    { label: 'Peso', width: 50, value: (row: any) => row.peso, align: 'center' },
    { label: 'Puntaje (0-100)', width: 90, value: (row: any) => row.score === 'P' ? '[P] Pendiente' : row.score, align: 'center' },
    { label: 'Fuente / trazabilidad', width: 168, value: (row: any) => row.fuente },
  ]), fonts, newPage);
  cursor = drawParagraph(cursor, 'P = Pendiente de levantamiento en campo. Los valores son del nivel de la localidad completa. Para desagregar por barrio se requiere que avanceBarrio incluya estas variables.', { size: 8, lineHeight: 11, font: fonts.regular, color: MUTED, gapAfter: spacingScale.sm }, newPage);

  if (avanceBarrio.length > 0 && avanceBarrio.some((b: any) => b.pctRNT !== undefined)) {
    cursor = subTitle(cursor, 'Matriz desagregada por barrio (datos disponibles)', fonts, newPage);
    cursor = drawBadge(cursor, 'dato', fonts);
    cursor = drawTable(cursor, avanceBarrio.slice(0, 8), createColumns([
      { label: 'Barrio', width: 130, value: (row: any) => row.nombre },
      { label: '% RNT', width: 70, value: (row: any) => row.pctRNT !== undefined ? `${row.pctRNT}` : '[P]', align: 'center' },
      { label: '% Reg. Merc.', width: 80, value: (row: any) => row.pctRegistroMercantil !== undefined ? `${row.pctRegistroMercantil}` : '[P]', align: 'center' },
      { label: 'Puntaje Econ.', width: 80, value: (row: any) => row.pctRegistroMercantil !== undefined && row.pctRNT !== undefined ? String(Math.round((row.pctRNT + row.pctRegistroMercantil) / 2)) : '[P]', align: 'center' },
      { label: '# Encuestas', width: 68, value: (row: any) => String(row.cantidad), align: 'center' },
									  ]), fonts, newPage);
  }
  return cursor;
}

function renderPotFichasRutas(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawBadge(cursor, 'metodologico', fonts);
  cursor = drawParagraph(cursor, 'Las rutas propuestas se derivan de los patrones observados en la base: concentración territorial, segmentos predominantes y vocación por barrio. No son rutas inventadas, sino hipótesis de articulación sustentadas en evidencia. Requieren verificación en campo antes de su implementación.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);

  const avanceBarrio = stats.avanceBarrio ?? [];
  const byBarrio = stats.byBarrio ?? [];
  const topBarrios = avanceBarrio.length > 0
    ? avanceBarrio.slice(0, 5).map((b: any) => b.nombre)
    : byBarrio.slice(0, 5).map((b: any) => b.name);

  const routes = [
    {
      name: 'Ruta Patrimonial Las Cruces – San Bernardo',
      description: 'Las Cruces concentra la mayor densidad de emprendimientos registrados. San Bernardo es barrio colindante con procesos de revitalización urbana documentados (Reina Pinzón et al.; Álvarez Caicedo). La ruta articula gastronomía, artesanías y expresión cultural.',
      barrios: 'Las Cruces, San Bernardo',
      tipoTurismo: 'Cultural, patrimonial, gastronómico',
      evidencia: topBarrios.includes('Las Cruces') ? '[D] Las Cruces es el barrio con mayor presencia en la base de datos.' : '[M] Derivada de concentración en zona central según literatura.',
      habilitacion: 'Señalización, articulación de actores, RNT de emprendimientos vinculables.',
      pendiente: 'Inventario de atractivos, capacidad de absorción, infraestructura peatonal.',
    },
    {
      name: 'Ruta Comunitaria Barrio Egipto',
      description: 'El barrio Egipto es referente documentado de turismo comunitario en la propia localidad (Ferrari, 2021; Breaking Borders, 2022). La ruta se sustenta en la existencia probada del modelo, no en el vínculo operativo del Observatorio con la iniciativa.',
      barrios: 'Egipto (Localidad de Santa Fe)',
      tipoTurismo: 'Comunitario, cultural, patrimonio vivo',
      evidencia: '[M] Referente bibliográfico verificado. Requiere articulación con actores locales.',
      habilitacion: 'Contacto con colectivos locales, protocolo de visita comunitaria, comunicación.',
      pendiente: 'Verificar vigencia de la iniciativa, acuerdo de articulación con el colectivo.',
    },
    {
      name: 'Ruta Monserrate – Centro Histórico',
      description: 'Monserrate es el atractivo de mayor visibilidad de la localidad. Su articulación con los barrios del pie de cerro (Egipto, Las Cruces) y el centro histórico contiguo a La Candelaria genera un corredor de alto flujo potencial (Hamón Ruiz; Menchero Sánchez, 2015).',
      barrios: 'Monserrate, Egipto, Las Cruces, conexión con La Candelaria',
      tipoTurismo: 'Turismo religioso, paisajístico, histórico',
      evidencia: '[M] Derivada de proximidad territorial y literatura. Requiere datos de flujo de visitantes.',
      habilitacion: 'Articulación con operadores existentes en Monserrate, señalización en barrios de acceso.',
      pendiente: 'Datos de flujo real de Monserrate, capacidad de carga, accesibilidad para personas con movilidad reducida.',
    },
  ];

  routes.forEach((route, index) => {
    cursor = ensureSpace(cursor, 180, newPage);
    cursor.page.drawRectangle({ x: PAGE_MARGIN_X, y: cursor.y - 175, width: CONTENT_W, height: 175, color: PAPER, borderColor: LINE, borderWidth: 1 });
    cursor.page.drawRectangle({ x: PAGE_MARGIN_X, y: cursor.y - 20, width: CONTENT_W, height: 20, color: FOREST });
    drawText(cursor.page, `Ficha ${index + 1}: ${route.name}`, { x: PAGE_MARGIN_X + spacingScale.sm, y: cursor.y - 15, size: 9.5, font: fonts.bold, color: PAPER });
    cursor.y -= 28;
    [
      ['Barrios articulados', route.barrios],
      ['Tipo de turismo', route.tipoTurismo],
      ['Evidencia base', route.evidencia],
      ['Requisitos de habilitación', route.habilitacion],
      ['Campos pendientes', route.pendiente],
    ].forEach(([label, value]) => {
      cursor = ensureSpace(cursor, 28, newPage);
      drawText(cursor.page, `${label}:`, { x: PAGE_MARGIN_X + spacingScale.sm, y: cursor.y, size: 8.5, font: fonts.bold, color: FOREST });
      cursor = drawParagraph(cursor, value, { x: PAGE_MARGIN_X + 148, width: CONTENT_W - 152, size: 8.5, lineHeight: 12, font: fonts.regular, color: INK, gapAfter: spacingScale.xs }, newPage);
    });
    cursor = drawParagraph(cursor, safe(route.description), { size: 8.5, lineHeight: 12, font: fonts.regular, color: SLATE, justify: true, gapAfter: spacingScale.md }, newPage);
  });

  cursor = drawBadge(cursor, 'pendiente', fonts);
  cursor = drawParagraph(cursor, 'Fichas adicionales quedan pendientes de levantamiento. El Observatorio debe verificar en campo la viabilidad de cada ruta, documentar los actores vinculables y estimar la capacidad de acogida antes de la implementación.', { size: 9, lineHeight: 13, font: fonts.regular, color: INK, justify: true }, newPage);
  return cursor;
}

function renderPotTipologias(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  const byTipo = stats.byTipo ?? [];
  const hasGastronomia = byTipo.some((t: any) => /gastronom/i.test(t.name));
  const hasCultural = byTipo.some((t: any) => /cultural/i.test(t.name));
  const sostenibilidad = stats.topPracticasSostenibilidad ?? [];
  const hasSostenibilidad = sostenibilidad.length > 0;

  const tipologias = [
    {
      nombre: 'Turismo cultural y patrimonial',
      evidencia: hasCultural
        ? `[D] ${byTipo.filter((t: any) => /cultural|artístic/i.test(t.name)).reduce((s: number, t: any) => s + t.value, 0)} emprendimientos de experiencia cultural registrados en la encuesta.`
        : '[M] La presencia de patrimonio urbano (Las Cruces, San Bernardo, Monserrate) sustenta esta tipología aunque la encuesta no la cuantifica directamente.',
      condiciones: 'Inventario de atractivos, articulación con entidades del patrimonio, capacitación de guías locales.',
      referencias: 'Ferrari (2021); Álvarez Caicedo; Reina Pinzón et al.; Sánchez Moreno (La Candelaria — contigüidad territorial).',
    },
    {
      nombre: 'Turismo comunitario',
      evidencia: '[M] Referente documentado: Barrio Egipto (Breaking Borders). El modelo es viable en Santa Fe según evidencia bibliográfica verificada (Ferrari, 2021; Javeriana, 2022; La Gran Colombia, 2017).',
      condiciones: 'Articulación con colectivos comunitarios, protocolo de visita, capacitación en hospitalidad, distribución equitativa de beneficios.',
      referencias: 'Ferrari (2021); Pontificia Universidad Javeriana (2022); Universidad La Gran Colombia (2017).',
    },
    {
      nombre: 'Turismo gastronómico',
      evidencia: hasGastronomia
        ? `[D] Gastronomía es el tipo de actor más frecuente: ${byTipo.find((t: any) => /gastronom/i.test(t.name))?.value ?? 0} emprendimientos registrados.`
        : '[M] Tipología propuesta con base en perfil probable de los emprendimientos.',
      condiciones: 'Diseño de rutas gastronómicas articuladas, identidad de marca, normativa sanitaria vigente.',
      referencias: 'Menchero Sánchez (2015) — aplicable por contigüidad territorial con La Candelaria.',
    },
    {
      nombre: 'Turismo sostenible',
      evidencia: hasSostenibilidad
        ? `[D] ${sostenibilidad.length} prácticas de sostenibilidad distintas registradas entre los emprendimientos encuestados (${sostenibilidad[0]?.name ?? ''}: ${sostenibilidad[0]?.value ?? 0} menciones).`
        : '[M] Tipología propuesta con base en potencial identificado.',
      condiciones: 'Certificaciones de sostenibilidad, articulación con programas de Bogotá Región Sostenible, medición de huella de carbono.',
      referencias: 'Hamón Ruiz (Monserrate); Guasca & Osorio — turismo accesible, La Candelaria (contigüidad territorial).',
    },
  ];

  tipologias.forEach((tipologia) => {
    cursor = subTitle(cursor, tipologia.nombre, fonts, newPage);
    cursor = drawParagraph(cursor, tipologia.evidencia, { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.xs }, newPage);
    drawText(cursor.page, 'Condiciones de desarrollo:', { x: PAGE_MARGIN_X, y: cursor.y, size: 8.5, font: fonts.bold, color: FOREST });
    cursor.y -= 14;
    cursor = drawParagraph(cursor, tipologia.condiciones, { x: PAGE_MARGIN_X + 8, width: CONTENT_W - 8, size: 8.5, lineHeight: 12, font: fonts.regular, color: INK, gapAfter: spacingScale.xs }, newPage);
    drawText(cursor.page, 'Referencias:', { x: PAGE_MARGIN_X, y: cursor.y, size: 8.5, font: fonts.bold, color: MUTED });
    cursor.y -= 14;
    cursor = drawParagraph(cursor, tipologia.referencias, { x: PAGE_MARGIN_X + 8, width: CONTENT_W - 8, size: 8, lineHeight: 11, font: fonts.regular, color: MUTED, gapAfter: spacingScale.md }, newPage);
  });
  return cursor;
}

function renderPotCondicionesBrechas(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawBadge(cursor, 'dato', fonts);
  cursor = drawParagraph(cursor, 'Las condiciones habilitantes se derivan de las brechas identificadas en los datos de formalización, infraestructura y capacidades de los emprendimientos encuestados.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);

  const formal = stats.formalizacion;
  if (formal) {
    cursor = subTitle(cursor, 'Brechas de formalización por zona', fonts, newPage);
    cursor = drawBadge(cursor, 'dato', fonts);
    [
      ['Registro Mercantil / Cámara de Comercio', formal.pctRegistroMercantil, 'Condición básica para acceder a financiación y contratos institucionales.'],
      ['Registro Nacional de Turismo (RNT)', formal.pctRNT, 'Obligatorio para operar como prestador turístico. Brecha crítica.'],
      ['RUT vigente', formal.pctRUT, 'Requisito para facturación y contratación con entes públicos.'],
      ['Facturación electrónica', formal.pctFacturacionElectronica, 'Condición para ventas en plataformas y turoperadoras.'],
    ].forEach(([label, value, note]) => {
      cursor = drawPercentBar(cursor, String(label), Number(value), fonts, newPage);
      cursor = drawParagraph(cursor, String(note), { x: PAGE_MARGIN_X + 8, width: CONTENT_W - 8, size: 8, lineHeight: 11, font: fonts.regular, color: MUTED, gapAfter: spacingScale.xs }, newPage);
    });
  }

  const infra = stats.infraestructura;
  if (infra) {
    cursor = subTitle(cursor, 'Brechas de infraestructura', fonts, newPage);
    cursor = drawBadge(cursor, 'dato', fonts);
    [
      ['Sede física propia', infra.pctSedeFisica],
      ['Señalización visible', infra.pctSeñalizacion],
      ['Baños disponibles para visitantes', infra.pctBanos],
      ['Botiquín / equipamiento de emergencias', infra.pctBotiquin],
      ['Conectividad a internet', infra.pctConectividad],
    ].forEach(([label, value]) => { cursor = drawPercentBar(cursor, String(label), Number(value), fonts, newPage); });
  }

  cursor = subTitle(cursor, 'Condiciones habilitantes por zona (resumen)', fonts, newPage);
  cursor = drawBadge(cursor, 'metodologico', fonts);
  cursor = drawTable(cursor, [
    { zona: 'Las Cruces', necesita: 'Señalización, articulación de actores, digitalización de oferta', prioridad: 'Alta' },
    { zona: 'San Bernardo', necesita: 'Formalización RNT, capacitación en hospitalidad, sede de acogida', prioridad: 'Alta' },
    { zona: 'Egipto', necesita: 'Articulación con colectivos comunitarios, protocolo de visita', prioridad: 'Media' },
    { zona: 'Monserrate / piedemonte', necesita: 'Rutas de acceso accesibles, info turística multilingüe', prioridad: 'Media' },
    { zona: 'Resto de la localidad', necesita: '[P] Requiere levantamiento específico por barrio', prioridad: '[P]' },
  ], createColumns([
    { label: 'Zona', width: 118, value: (row: any) => row.zona },
    { label: 'Condiciones necesarias', width: 278, value: (row: any) => row.necesita },
    { label: 'Prioridad', width: 72, value: (row: any) => row.prioridad, align: 'center' },
  ]), fonts, newPage);
  return cursor;
}

function renderPotRecomendaciones(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawBadge(cursor, 'metodologico', fonts);
  cursor = drawParagraph(cursor, 'Las recomendaciones están ordenadas por criterio explícito: impacto potencial alto con esfuerzo bajo o medio primero; acciones de largo plazo y alta complejidad al final. Cada recomendación está vinculada a la evidencia que la sustenta.', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);

  const formal = stats.formalizacion;
  const rntBrecha = formal ? (100 - formal.pctRNT) : null;
  const mercantilBrecha = formal ? (100 - formal.pctRegistroMercantil) : null;

  cursor = drawTable(cursor, [
    {
      rec: 'Campaña de regularización RNT: facilitar el trámite para los emprendimientos no registrados.',
      impacto: 'Alto',
      esfuerzo: 'Bajo',
      evidencia: rntBrecha !== null ? `[D] ${rntBrecha}% sin RNT` : '[M] Brecha de formalización identificada',
    },
    {
      rec: 'Diseño e implementación de la Ruta Patrimonial Las Cruces – San Bernardo con señalización y material digital.',
      impacto: 'Alto',
      esfuerzo: 'Medio',
      evidencia: '[D] Las Cruces: mayor concentración de emprendimientos. [M] Sustentado en literatura (Álvarez Caicedo; Reina Pinzón).',
    },
    {
      rec: 'Articulación con el colectivo Breaking Borders (Barrio Egipto) para incorporar el caso como referente de turismo comunitario en la oferta del Observatorio.',
      impacto: 'Alto',
      esfuerzo: 'Medio',
      evidencia: '[M] Referente documentado (Ferrari, 2021). Requiere acercamiento institucional.',
    },
    {
      rec: 'Programa de digitalización de la oferta: capacitar a los emprendimientos en herramientas de venta en línea y presencia en plataformas turísticas.',
      impacto: 'Alto',
      esfuerzo: 'Medio',
      evidencia: '[D] Brecha de herramientas digitales identificada en encuesta.',
    },
    {
      rec: 'Levantamiento de inventario de atractivos turísticos por barrio, como insumo para las rutas propuestas y la Matriz de Viabilidad.',
      impacto: 'Alto',
      esfuerzo: 'Alto',
      evidencia: '[P] Dato no existente en la base actual. Insumo indispensable para el Informe 3.',
    },
    {
      rec: 'Diseño de un sistema de monitoreo con indicadores de impacto (visitantes, ingresos, empleo generado) para el seguimiento periódico del Observatorio.',
      impacto: 'Alto',
      esfuerzo: 'Alto',
      evidencia: '[M] Criterio estratégico para la sostenibilidad del Observatorio.',
    },
  ], createColumns([
    { label: 'Recomendación', width: 240, value: (row: any) => row.rec },
    { label: 'Impacto', width: 56, value: (row: any) => row.impacto, align: 'center' },
    { label: 'Esfuerzo', width: 58, value: (row: any) => row.esfuerzo, align: 'center' },
    { label: 'Evidencia / trazabilidad', width: 114, value: (row: any) => row.evidencia },
  ]), fonts, newPage);
  return cursor;
}

function renderPotReferencias(cursor: Cursor, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawParagraph(cursor, 'Las siguientes referencias han sido verificadas previamente. Las referencias 7–9 corresponden a la localidad vecina de La Candelaria; se citan por contigüidad territorial y continuidad del centro histórico, pero esta distinción se señala explícitamente.', { size: 9, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.md }, newPage);

  const refs = [
    { num: '1', texto: 'Ferrari, S. (2021). El turismo comunitario urbano como forma de re-existencia cultural y laboral. El modelo de Barrio Egipto (Bogotá). Cuestiones de Sociología, (25). https://doi.org/10.24215/23468904e115 [Santa Fe — caso central]' },
    { num: '2', texto: 'Pontificia Universidad Javeriana (2022). Breaking Borders: la comunicación como herramienta para fortalecer el emprendimiento social en pro de la convivencia pacífica del barrio Egipto. Comunicación Social. http://hdl.handle.net/10554/64642 [Santa Fe]' },
    { num: '3', texto: 'Universidad La Gran Colombia (2017). Habitantes del barrio Egipto de Bogotá están cambiando armas por turistas como opción de vida. http://hdl.handle.net/11396/4467 [Santa Fe]' },
    { num: '4', texto: 'Álvarez Caicedo, J. La transformación del barrio Las Cruces y su consolidación como borde urbano durante el siglo XX. Universidad Nacional de Colombia, Maestría en Urbanismo. https://repositorio.unal.edu.co/handle/unal/58665 [Santa Fe]' },
    { num: '5', texto: 'Reina Pinzón, A. C. et al. San Bernardo, una alameda, ciudad y diversidad: plan de revitalización del sector compacto de San Bernardo y Las Cruces. Universidad Piloto de Colombia, Arquitectura. https://repository.unipiloto.edu.co/handle/20.500.12277/2144 [Santa Fe]' },
    { num: '6', texto: 'Hamón Ruiz, A. M. ¿Cómo llevar a cabo un turismo sostenible en Monserrate? Universidad Externado de Colombia. [Santa Fe — Monserrate]' },
    { num: '7', texto: 'Menchero Sánchez, M. (2015). Propuesta y diseño de un sistema de información turística para centros históricos: el caso de La Candelaria, Bogotá. [La Candelaria — citada por contigüidad territorial con Santa Fe]' },
    { num: '8', texto: 'Sánchez Moreno, F. La revitalización urbana como base de la planificación turística en el centro histórico de Bogotá, sector de La Candelaria. Universidad de Salamanca. https://gredos.usal.es/handle/10366/129705 [La Candelaria — citada por contigüidad territorial con Santa Fe]' },
    { num: '9', texto: 'Guasca Camacho, B. S. y Osorio Hernández, S. M. Evaluación de estrategias de implementación sobre turismo accesible en el centro histórico de La Candelaria para turistas con discapacidad auditiva. Universitaria Agustiniana. [La Candelaria — citada por contigüidad territorial con Santa Fe]' },
  ];

  refs.forEach((ref) => {
    cursor = ensureSpace(cursor, 36, newPage);
    drawText(cursor.page, ref.num + '.', { x: PAGE_MARGIN_X, y: cursor.y, size: 8.5, font: fonts.bold, color: FOREST });
    cursor = drawParagraph(cursor, ref.texto, { x: PAGE_MARGIN_X + 18, width: CONTENT_W - 18, size: 8.5, lineHeight: 12, font: fonts.regular, color: INK, gapAfter: spacingScale.sm }, newPage);
  });

  cursor = drawInfoBox(cursor, 'Nota sobre referencias 7, 8 y 9', [
    'Las referencias 7, 8 y 9 corresponden a la localidad de La Candelaria, localidad vecina de Santa Fe. Se incluyen por la continuidad del centro histórico y la contigüidad territorial, pero no deben interpretarse como estudios de Santa Fe. Las referencias 1–5 sí corresponden directamente a barrios de la Localidad de Santa Fe.',
  ], fonts, newPage);
  return cursor;
}

function renderPotAnexoMetodologico(cursor: Cursor, stats: StatsInput, fonts: Fonts, newPage: (title: string) => Cursor) {
  cursor = drawParagraph(cursor, 'Este anexo documenta la construcción de cada indicador del Informe 2, indicando su origen: dato derivado de la encuesta [D], criterio metodológico propuesto [M], o pendiente de levantamiento en campo [P].', { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true, gapAfter: spacingScale.sm }, newPage);

  const formal = stats.formalizacion;
  cursor = drawTable(cursor, [
    { indicador: 'Potencial por barrio', origen: '[D]', fuente: 'avanceBarrio (encuesta)', nota: 'Derivado de frecuencia y % de formalización por barrio. No es inventario de atractivos.' },
    { indicador: 'Tipo de actor turístico', origen: '[D]', fuente: 'byTipo (encuesta)', nota: 'Registro directo de la encuesta.' },
    { indicador: 'Prácticas sostenibles', origen: '[D]', fuente: 'topPracticasSostenibilidad (encuesta)', nota: 'Registro directo de la encuesta.' },
    { indicador: 'Puntaje eje cultural', origen: '[D]', fuente: 'byTipo', nota: '(tipos distintos / 8 posibles) × 100.' },
    { indicador: 'Puntaje eje social', origen: '[D/P]', fuente: 'empleo.*, formalizacion.pctRNT', nota: 'Parcialmente derivado. RNT por barrio pendiente.' },
    { indicador: 'Puntaje eje económico', origen: '[D]', fuente: 'formalizacion, productoMercado.topSegmentos', nota: 'Derivado de formalización y segmentos.' },
    { indicador: 'Puntaje eje ambiental', origen: '[D]', fuente: 'topPracticasSostenibilidad', nota: '(prácticas / 5 clave) × 100.' },
    { indicador: 'Fichas de rutas', origen: '[M]', fuente: 'avanceBarrio + literatura', nota: 'Hipótesis de articulación, no rutas implementadas.' },
    { indicador: 'Inventario de atractivos', origen: '[P]', fuente: 'No existe en la base', nota: 'Requiere levantamiento en campo.' },
    { indicador: 'Datos de flujo de visitantes', origen: '[P]', fuente: 'No existe en la base', nota: 'Requiere instrumento específico.' },
    { indicador: 'Capacidad de carga por ruta', origen: '[P]', fuente: 'No existe en la base', nota: 'Requiere aforo técnico.' },
    { indicador: 'Referencias bibliográficas', origen: '[M]', fuente: 'Verificadas por el equipo', nota: 'Refs. 1–5 Santa Fe; refs. 7–9 La Candelaria (contigüidad).' },
  ], createColumns([
    { label: 'Indicador', width: 148, value: (row: any) => row.indicador },
    { label: 'Origen', width: 44, value: (row: any) => row.origen, align: 'center' },
    { label: 'Fuente variable', width: 138, value: (row: any) => row.fuente },
    { label: 'Nota metodológica', width: 138, value: (row: any) => row.nota },
  ]), fonts, newPage);

  cursor = subTitle(cursor, 'Variables aún por incorporar a la encuesta', fonts, newPage);
  cursor = drawBadge(cursor, 'pendiente', fonts);
  cursor = drawBulletList(cursor, [
    'Barrio exacto del emprendimiento (cuando falta en avanceBarrio).',
    'Inventario de atractivos turísticos por zona (requiere instrumento de campo diferenciado).',
    'Número de visitantes atendidos por período (afluencia real, no solo capacidad declarada).',
    'Idiomas de atención declarados por el emprendimiento.',
    'Accesibilidad universal: adecuaciones para personas con discapacidad.',
    'Ingresos estimados por turismo (para calcular viabilidad económica real por barrio).',
  ], fonts, newPage);
  return cursor;
}

// ─── Informe 2 full generation ────────────────────────────────────────────────
async function generatePotencialesReport(stats: StatsInput, _summary: string, updatedAt: string, logs: string[]): Promise<PdfBuildResult> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await loadFonts(pdfDoc, logs);
  const pageTitles = new Map<PDFPage, string>();
  const tocItems: TocItem[] = [];

  const cover = pdfDoc.addPage([PAGE_W, PAGE_H]);
  pageTitles.set(cover, 'Portada');
  const tocPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  pageTitles.set(tocPage, 'Tabla de contenido');

  const templatePages: { cover?: PDFEmbeddedPage; interior?: PDFEmbeddedPage } = {};
  try {
    const templatePath = path.join(process.cwd(), 'public', 'brand', 'membrete-fundesco.pdf');
    const templateBytes = await fs.readFile(templatePath);
    const templateDoc = await PDFDocument.load(templateBytes);
    const pageCount = templateDoc.getPageCount();
    const [coverEmbedded] = await pdfDoc.embedPdf(templateDoc, [0]);
    templatePages.cover = coverEmbedded;
    const interiorIndex = pageCount >= 2 ? 1 : 0;
    const [interiorEmbedded] = await pdfDoc.embedPdf(templateDoc, [interiorIndex]);
    templatePages.interior = interiorEmbedded;
    cover.drawPage(coverEmbedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    tocPage.drawPage(interiorEmbedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    logs.push(`letterhead: loaded (${pageCount} page${pageCount > 1 ? 's' : ''})`);
  } catch (err) {
    logs.push(`letterhead: could not load — ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  drawPotencialesCover(cover, fonts, stats, updatedAt);

  const newPage = createPageFactory(pdfDoc, pageTitles, templatePages);
  const sectionDefs = getSectionsForReportType('potenciales');
  const labelFor = (id: string) => sectionDefs.find((s) => s.id === id)?.label ?? id;
  const startSection = (label: string) => {
    const cursor = newPage(label);
    tocItems.push({ label, pageNumber: pdfDoc.getPageCount() });
    return sectionTitle(cursor, label.toUpperCase(), fonts, newPage);
  };

  // Section 1 — Nota al lector
  let cursor = startSection(labelFor('pot-nota-lector'));
  cursor = renderPotNotaLector(cursor, fonts, newPage);

  // Section 2 — Marco conceptual
  cursor = startSection(labelFor('pot-marco-conceptual'));
  cursor = renderPotMarcoConceptual(cursor, fonts, newPage);

  // Section 3 — Zonas con potencial
  cursor = startSection(labelFor('pot-zonas-potencial'));
  cursor = renderPotZonasPotencial(cursor, stats, fonts, newPage);

  // Section 4 — Matriz de viabilidad
  cursor = startSection(labelFor('pot-matriz-viabilidad'));
  cursor = renderPotMatrizViabilidad(cursor, stats, fonts, newPage);

  // Section 5 — Fichas de rutas
  cursor = startSection(labelFor('pot-fichas-rutas'));
  cursor = renderPotFichasRutas(cursor, stats, fonts, newPage);

  // Section 6 — Tipologías de turismo
  cursor = startSection(labelFor('pot-tipologias'));
  cursor = renderPotTipologias(cursor, stats, fonts, newPage);

  // Section 7 — Condiciones habilitantes y brechas
  cursor = startSection(labelFor('pot-condiciones-brechas'));
  cursor = renderPotCondicionesBrechas(cursor, stats, fonts, newPage);

  // Section 8 — Recomendaciones estratégicas
  cursor = startSection(labelFor('pot-recomendaciones'));
  cursor = renderPotRecomendaciones(cursor, stats, fonts, newPage);

  // Section 9 — Referencias bibliográficas
  cursor = startSection(labelFor('pot-referencias'));
  cursor = renderPotReferencias(cursor, fonts, newPage);

  // Section 10 — Anexo metodológico
  cursor = startSection(labelFor('pot-anexo-metodologico'));
  cursor = renderPotAnexoMetodologico(cursor, stats, fonts, newPage);

  // Photos in relevant sections (use available real images)
  const totalPages = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    if (index === 0) return;
    const title = pageTitles.get(page) || 'Informe 2';
    drawPageNumber(page, fonts, index + 1, totalPages);
    drawSectionLabel(page, title, fonts);
  });

  // Draw TOC
  let tocCursor: Cursor = { page: tocPage, y: CONTENT_TOP, title: 'Tabla de contenido' };
  drawText(tocPage, 'Tabla de contenido — Informe 2', { x: PAGE_MARGIN_X, y: tocCursor.y, size: typeScale.lg, font: fonts.bold, color: FOREST });
  tocCursor.y -= 10;
  tocPage.drawRectangle({ x: PAGE_MARGIN_X, y: tocCursor.y, width: CONTENT_W, height: 2, color: LIME });
  tocCursor.y -= 22;
  tocItems.forEach((item, index) => {
    if (tocCursor.y - 24 < CONTENT_BOTTOM) return;
    const rowY = tocCursor.y - 4;
    tocPage.drawRectangle({ x: PAGE_MARGIN_X, y: rowY, width: CONTENT_W, height: 20, color: index % 2 === 0 ? STRIPE : PAPER, borderColor: LINE, borderWidth: 0.5 });
    const pageLabel = String(item.pageNumber);
    const pageWidth = fonts.bold.widthOfTextAtSize(pageLabel, 10);
    const pageX = PAGE_MARGIN_X + CONTENT_W - spacingScale.sm - pageWidth;
    drawText(tocPage, truncateToWidth(item.label, CONTENT_W - pageWidth - spacingScale.xxxl, fonts.bold, 9.5), { x: PAGE_MARGIN_X + spacingScale.sm, y: tocCursor.y, size: 9.5, font: fonts.bold, color: INK });
    drawText(tocPage, pageLabel, { x: pageX, y: tocCursor.y, size: 10, font: fonts.bold, color: FOREST });
    tocCursor.y -= 24;
  });
  drawPageNumber(tocPage, fonts, 2, totalPages);
  drawSectionLabel(tocPage, 'Tabla de contenido', fonts);

  logs.unshift(`pdf pages: ${totalPages} [Informe 2 — Potenciales]`);
  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, logs };
}


export async function generatePdfReport(payload: PdfReportPayload): Promise<PdfBuildResult> {
  const logs: string[] = [];
  const stats: StatsInput = payload.stats ?? { total: 0, rutas: 0, exactos: 0, estimados: 0 };
  const summary = payload.summary?.trim() ? payload.summary : buildFallbackSummary(stats);
  const updatedAt = payload.updatedAt ?? new Date().toLocaleString('es-CO');
  const reportType = payload.reportType ?? 'diagnostico';

  if (reportType === 'potenciales') {
    return generatePotencialesReport(stats, summary, updatedAt, logs);
  }

  const pdfDoc = await PDFDocument.create();
  const fonts = await loadFonts(pdfDoc, logs);
  const analysis = buildDeterministicAnalysis(stats);
  const pageTitles = new Map<PDFPage, string>();
  const tocItems: TocItem[] = [];

  const cover = pdfDoc.addPage([PAGE_W, PAGE_H]);
  pageTitles.set(cover, 'Portada');
  const tocPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  pageTitles.set(tocPage, 'Tabla de contenido');

  // ─── Load letterhead template ───────────────────────────────────────────
  // Stamp letterhead FIRST (as background), then draw content on top.
  const templatePages: { cover?: PDFEmbeddedPage; interior?: PDFEmbeddedPage } = {};
  try {
    const templatePath = path.join(process.cwd(), 'public', 'brand', 'membrete-fundesco.pdf');
    const templateBytes = await fs.readFile(templatePath);
    const templateDoc = await PDFDocument.load(templateBytes);
    const pageCount = templateDoc.getPageCount();
    const [coverEmbedded] = await pdfDoc.embedPdf(templateDoc, [0]);
    templatePages.cover = coverEmbedded;
    const interiorIndex = pageCount >= 2 ? 1 : 0;
    const [interiorEmbedded] = await pdfDoc.embedPdf(templateDoc, [interiorIndex]);
    templatePages.interior = interiorEmbedded;
    cover.drawPage(coverEmbedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    tocPage.drawPage(interiorEmbedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    logs.push(`letterhead: loaded (${pageCount} page${pageCount > 1 ? 's' : ''})`);
  } catch (err) {
    logs.push(`letterhead: could not load — ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  drawCover(cover, fonts, stats, updatedAt, summary);

  const newPage = createPageFactory(pdfDoc, pageTitles, templatePages);
  const sectionDefs = getSectionsForReportType(reportType);
  const labelFor = (id: string) => sectionDefs.find((section) => section.id === id)?.label ?? id;
  const startSection = (label: string) => {
    const cursor = newPage(label);
    tocItems.push({ label, pageNumber: pdfDoc.getPageCount() });
    return sectionTitle(cursor, label.toUpperCase(), fonts, newPage);
  };

  const contextImages = santafeImages.slice(0, 2);
  const section5Images = santafeImages.slice(2, 3);
  const section8Images = santafeImages.slice(3, 4);
  const creditImages = santafeImages.slice(4);

  let cursor = startSection(labelFor('resumen-ejecutivo'));
  cursor = renderSummary(cursor, parseSummary(summary), fonts, newPage);

  cursor = startSection(labelFor('contexto-territorial'));
  for (const image of contextImages) cursor = await drawContextImageCard(pdfDoc, cursor, image, fonts, logs, newPage);

  cursor = startSection(labelFor('mapa-territorial'));
  cursor = drawInfoBox(cursor, 'Interpretación del mapa', [
    `El mapa territorial combina ${stats.exactos || 0} puntos exactos y ${stats.estimados || 0} puntos estimados por centroide de barrio.`,
    analysis.concentration.paragraph,
  ], fonts, newPage);
  cursor = await drawMapBox(pdfDoc, cursor, stats, fonts, logs, newPage);

  cursor = startSection(labelFor('metodologia-hallazgos'));
  cursor = drawInfoBox(cursor, analysis.methodology.title, analysis.methodology.paragraphs, fonts, newPage);
  cursor = subTitle(cursor, 'Hallazgos clave cuantificados', fonts, newPage);
  cursor = drawBulletList(cursor, analysis.hallazgos.slice(0, 8), fonts, newPage);

  cursor = startSection(labelFor('concentracion-geografica'));
  analysis.narratives.geography.forEach((paragraph) => {
    cursor = drawParagraph(cursor, paragraph, { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true }, newPage);
  });
  if ((stats.avanceBarrio?.length ?? 0) > 0) {
    cursor = subTitle(cursor, 'Tabla de avance por barrio', fonts, newPage);
    cursor = drawTable(cursor, stats.avanceBarrio ?? [], createColumns([
      { label: 'Barrio', width: 152, value: (row: any) => row.nombre },
      { label: 'Encuestas', width: 64, value: (row: any) => String(row.cantidad), align: 'center' },
      { label: '% total', width: 60, value: (row: any) => `${row.pctTotal}%`, align: 'center' },
      { label: 'Madurez', width: 70, value: (row: any) => String(analysis.maturity.byBarrio.find((item) => item.barrio === row.nombre)?.score ?? 0), align: 'center' },
      { label: '% RNT', width: 60, value: (row: any) => row.pctRNT !== undefined ? `${row.pctRNT}%` : '—', align: 'center' },
      { label: '% Reg. M.', width: 82, value: (row: any) => row.pctRegistroMercantil !== undefined ? `${row.pctRegistroMercantil}%` : '—', align: 'center' },
    ]), fonts, newPage);
  }
  if ((stats.byUpz?.length ?? 0) > 0) {
    cursor = subTitle(cursor, 'Distribución por UPZ', fonts, newPage);
    cursor = drawTable(cursor, stats.byUpz ?? [], createColumns([
      { label: 'UPZ', width: 250, value: (row: any) => row.name },
      { label: 'Encuestas', width: 92, value: (row: any) => String(row.value), align: 'center' },
      { label: '% del total', width: 122, value: (row: any) => `${Math.round((row.value / Math.max(stats.total || 1, 1)) * 100)}%`, align: 'center' },
    ]), fonts, newPage);
  }
  for (const image of section5Images) cursor = await drawContextImageCard(pdfDoc, cursor, image, fonts, logs, newPage);

  cursor = startSection(labelFor('formalizacion-infraestructura'));
  [...analysis.narratives.formalization, ...analysis.narratives.infrastructure].forEach((paragraph) => {
    cursor = drawParagraph(cursor, paragraph, { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true }, newPage);
  });
  cursor = subTitle(cursor, 'Indicadores de formalización', fonts, newPage);
  const formal = stats.formalizacion;
  if (formal) {
    [
      ['Registro Mercantil / Cámara de Comercio', formal.pctRegistroMercantil],
      ['Registro Nacional de Turismo (RNT)', formal.pctRNT],
      ['RUT', formal.pctRUT],
      ['Facturación electrónica', formal.pctFacturacionElectronica],
      ['Afiliación a seguridad social', formal.pctAfiliacionSS ?? 0],
      ['Seguro de responsabilidad civil', formal.pctSeguro ?? 0],
    ].forEach(([label, value]) => { cursor = drawPercentBar(cursor, String(label), Number(value), fonts, newPage); });
  }
  cursor = subTitle(cursor, 'Indicadores de infraestructura', fonts, newPage);
  const infra = stats.infraestructura;
  if (infra) {
    [
      ['Sede física', infra.pctSedeFisica],
      ['Señalización visible', infra.pctSeñalizacion],
      ['Baños disponibles', infra.pctBanos],
      ['Botiquín / emergencias', infra.pctBotiquin],
      ['Conectividad a internet', infra.pctConectividad],
    ].forEach(([label, value]) => { cursor = drawPercentBar(cursor, String(label), Number(value), fonts, newPage); });
  }

  cursor = startSection(labelFor('empleo-madurez'));
  analysis.narratives.employment.forEach((paragraph) => {
    cursor = drawParagraph(cursor, paragraph, { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true }, newPage);
  });
  const empleo = stats.empleo;
  if (empleo) {
    cursor = subTitle(cursor, 'Indicadores agregados de empleo', fonts, newPage);
    cursor = drawTable(cursor, [
      { label: 'Empleos formales', value: empleo.validosFormales ? empleo.totalFormales : 'Sin dato' },
      { label: 'Empleos informales / familiares', value: empleo.validosInformales ? empleo.totalInformales : 'Sin dato' },
      { label: 'Mujeres vinculadas', value: empleo.validosMujeres ? empleo.totalMujeres : 'Sin dato' },
      { label: 'Jóvenes vinculados', value: empleo.validosJovenes ? empleo.totalJovenes : 'Sin dato' },
      { label: 'Adultos mayores (60+)', value: empleo.validosMayores60 ? empleo.totalMayores60 : 'Sin dato' },
      { label: 'Población diversa', value: empleo.validosDiversidad ? empleo.totalDiversidad : 'Sin dato' },
    ], createColumns([
      { label: 'Indicador', width: 340, value: (row: any) => row.label },
      { label: 'Total', width: 120, value: (row: any) => String(row.value), align: 'center' },
    ]), fonts, newPage);
  }
  cursor = drawInfoBox(cursor, 'Índice sintético de madurez', [analysis.maturity.paragraph, analysis.maturity.formula], fonts, newPage);
  cursor = subTitle(cursor, 'Componentes del índice', fonts, newPage);
  analysis.maturity.components.forEach((component) => {
    cursor = drawPercentBar(cursor, `${component.label} (peso ${component.weight}%)`, Math.round(component.score), fonts, newPage);
  });
  if (analysis.maturity.byBarrio.length) {
    cursor = subTitle(cursor, 'Madurez aproximada por barrio', fonts, newPage);
    cursor = drawTable(cursor, analysis.maturity.byBarrio.slice(0, 10), createColumns([
      { label: 'Barrio', width: 260, value: (row: any) => row.barrio },
      { label: 'Score', width: 70, value: (row: any) => String(row.score), align: 'center' },
      { label: 'Nivel', width: 130, value: (row: any) => row.level, align: 'center' },
    ]), fonts, newPage);
  }

  cursor = startSection(labelFor('mercado-capacidades'));
  [...analysis.narratives.market, ...analysis.narratives.sustainability, ...analysis.narratives.capacities].forEach((paragraph) => {
    cursor = drawParagraph(cursor, paragraph, { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true }, newPage);
  });
  const segmentList = stats.productoMercado?.topSegmentos ?? [];
  if (segmentList.length) {
    cursor = subTitle(cursor, 'Segmentos de mercado atendidos', fonts, newPage);
    const maxValue = Math.max(...segmentList.map((item) => item.value), 1);
    segmentList.slice(0, 8).forEach((item) => { cursor = drawMiniBar(cursor, item.name, item.value, maxValue, fonts, newPage); });
  }
  const channelList = stats.topCanales ?? [];
  if (channelList.length) {
    cursor = subTitle(cursor, 'Canales digitales activos', fonts, newPage);
    const maxValue = Math.max(...channelList.map((item) => item.value), 1);
    channelList.slice(0, 8).forEach((item) => { cursor = drawMiniBar(cursor, item.name, item.value, maxValue, fonts, newPage); });
  }
  const sustainabilityList = stats.topPracticasSostenibilidad ?? [];
  if (sustainabilityList.length) {
    cursor = subTitle(cursor, 'Prácticas de sostenibilidad reportadas', fonts, newPage);
    const maxValue = Math.max(...sustainabilityList.map((item) => item.value), 1);
    sustainabilityList.slice(0, 8).forEach((item) => { cursor = drawMiniBar(cursor, item.name, item.value, maxValue, fonts, newPage); });
  }
  for (const image of section8Images) cursor = await drawContextImageCard(pdfDoc, cursor, image, fonts, logs, newPage);

  cursor = startSection(labelFor('recoleccion-calidad'));
  if ((stats.topEncuestadores?.length ?? 0) > 0) {
    cursor = subTitle(cursor, 'Encuestas por encuestador/a', fonts, newPage);
    cursor = drawTable(cursor, stats.topEncuestadores ?? [], createColumns([
      { label: 'Encuestador/a', width: 250, value: (row: any) => row.name },
      { label: 'Encuestas', width: 90, value: (row: any) => String(row.value), align: 'center' },
      { label: '% del total', width: 120, value: (row: any) => `${Math.round((row.value / Math.max(stats.total || 1, 1)) * 100)}%`, align: 'center' },
    ]), fonts, newPage);
  }
  if ((stats.byFecha?.length ?? 0) > 0) {
    cursor = subTitle(cursor, 'Serie diaria de recolección', fonts, newPage);
    const maxValue = Math.max(...(stats.byFecha ?? []).map((item) => item.value), 1);
    (stats.byFecha ?? []).forEach((item) => { cursor = drawMiniBar(cursor, item.fecha, item.value, maxValue, fonts, newPage); });
  }
  if ((stats.completitudDist?.length ?? 0) > 0) {
    cursor = subTitle(cursor, 'Estados de completitud', fonts, newPage);
    cursor = drawTable(cursor, stats.completitudDist ?? [], createColumns([
      { label: 'Estado', width: 280, value: (row: any) => row.name },
      { label: 'Registros', width: 90, value: (row: any) => String(row.value), align: 'center' },
      { label: '% del total', width: 90, value: (row: any) => `${Math.round((row.value / Math.max(stats.total || 1, 1)) * 100)}%`, align: 'center' },
    ]), fonts, newPage);
  }
  if ((stats.byFecha?.length ?? 0) === 0 && (stats.topEncuestadores?.length ?? 0) === 0 && (stats.completitudDist?.length ?? 0) === 0) {
    cursor = drawParagraph(cursor, 'La base analizada no incluye desagregaciones suficientes de cronología de levantamiento, responsables de campo o estados de completitud para ampliar esta sección en la presente edición.', {
      size: 9.25,
      lineHeight: 13,
      font: fonts.regular,
      color: INK,
      justify: true,
    }, newPage);
  }

  cursor = startSection(labelFor('brechas-recomendaciones'));
  cursor = subTitle(cursor, 'Brechas y riesgos principales', fonts, newPage);
  cursor = drawBulletList(cursor, analysis.brechasYRiesgos, fonts, newPage);
  cursor = subTitle(cursor, 'Recomendaciones priorizadas', fonts, newPage);
  cursor = drawTable(cursor, analysis.recommendations, createColumns([
    { label: 'Acción', width: 270, value: (row: any) => row.action },
    { label: 'Prioridad', width: 80, value: (row: any) => row.priority, align: 'center' },
    { label: 'Indicador sugerido', width: 170, value: (row: any) => row.indicator },
  ]), fonts, newPage);

  cursor = startSection(labelFor('anexo-tecnico'));
  cursor = subTitle(cursor, 'Ficha técnica resumida', fonts, newPage);
  cursor = drawTable(cursor, analysis.methodology.technicalSheet, createColumns([
    { label: 'Campo', width: 180, value: (row: any) => row.label },
    { label: 'Valor', width: 280, value: (row: any) => row.value },
  ]), fonts, newPage);
  cursor = subTitle(cursor, 'Glosario', fonts, newPage);
  analysis.glossary.forEach((entry) => {
    cursor = ensureSpace(cursor, 28, newPage);
    drawText(cursor.page, `${entry.term}:`, { x: PAGE_MARGIN_X, y: cursor.y, size: 9, font: fonts.bold, color: FOREST });
    cursor = drawParagraph(cursor, entry.definition, {
      x: PAGE_MARGIN_X + 58,
      width: CONTENT_W - 58,
      size: 8.5,
      lineHeight: 12,
      font: fonts.regular,
      color: INK,
      justify: true,
    }, newPage);
  });

  cursor = startSection(labelFor('creditos-fotograficos'));
  const imageCredits = creditImages.length ? creditImages : santafeImages;
  for (const image of creditImages) cursor = await drawContextImageCard(pdfDoc, cursor, image, fonts, logs, newPage);
  cursor = drawTable(cursor, imageCredits, createColumns([
    { label: 'Tema', width: 118, value: (row: any) => row.title },
    { label: 'Autor / crédito', width: 148, value: (row: any) => row.credit },
    { label: 'Fuente', width: 112, value: (row: any) => row.source },
    { label: 'Licencia', width: 82, value: (row: any) => row.license },
  ]), fonts, newPage);

  cursor = startSection(labelFor('caracterizacion-actores'));
  cursor = renderActorCharacterizationSection(cursor, stats, fonts, newPage);

  cursor = startSection(labelFor('tendencias-oportunidades'));
  cursor = renderOpportunitiesSection(cursor, stats, analysis, fonts, newPage);

  cursor = startSection(labelFor('ficha-metodologica-ampliada'));
  cursor = renderExpandedMethodologySection(cursor, stats, fonts, newPage);

  cursor = startSection(labelFor('anexo-trazabilidad'));
  cursor = renderTraceabilitySection(cursor, stats, fonts, newPage);

  const totalPages = pdfDoc.getPageCount();
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    if (index === 0) return; // cover — no page number needed
    const title = pageTitles.get(page) || 'Informe';
    drawPageNumber(page, fonts, index + 1, totalPages);
    drawSectionLabel(page, title, fonts);
  });

  // Draw TOC content (letterhead already stamped during creation)
  let tocCursor: Cursor = { page: tocPage, y: CONTENT_TOP, title: 'Tabla de contenido' };
  drawText(tocPage, 'Tabla de contenido', { x: PAGE_MARGIN_X, y: tocCursor.y, size: typeScale.lg, font: fonts.bold, color: FOREST });
  tocCursor.y -= 10;
  tocPage.drawRectangle({ x: PAGE_MARGIN_X, y: tocCursor.y, width: CONTENT_W, height: 2, color: LIME });
  tocCursor.y -= 22;
  tocItems.forEach((item, index) => {
    if (tocCursor.y - 24 < CONTENT_BOTTOM) return;
    const rowY = tocCursor.y - 4;
    tocPage.drawRectangle({ x: PAGE_MARGIN_X, y: rowY, width: CONTENT_W, height: 20, color: index % 2 === 0 ? STRIPE : PAPER, borderColor: LINE, borderWidth: 0.5 });
    const pageLabel = String(item.pageNumber);
    const pageWidth = fonts.bold.widthOfTextAtSize(pageLabel, 10);
    const pageX = PAGE_MARGIN_X + CONTENT_W - spacingScale.sm - pageWidth;
    drawText(tocPage, truncateToWidth(item.label, CONTENT_W - pageWidth - spacingScale.xxxl, fonts.bold, 9.5), { x: PAGE_MARGIN_X + spacingScale.sm, y: tocCursor.y, size: 9.5, font: fonts.bold, color: INK });
    drawText(tocPage, pageLabel, { x: pageX, y: tocCursor.y, size: 10, font: fonts.bold, color: FOREST });
    tocCursor.y -= 24;
  });
  drawPageNumber(tocPage, fonts, 2, totalPages);
  drawSectionLabel(tocPage, 'Tabla de contenido', fonts);

  logs.unshift(`pdf pages: ${totalPages}`);
  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, logs };
}
