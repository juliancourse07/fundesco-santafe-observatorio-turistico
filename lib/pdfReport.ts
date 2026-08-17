import fs from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
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
import { santafeImages, type SantafeImage } from './santafeImages';
import { buildSantaFeSvgMap, type BarrioData } from './mapSvg';

export type PdfReportPayload = {
  stats?: StatsInput;
  summary?: string;
  updatedAt?: string;
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
  cursor = ensureSpace(cursor, 320, newPage);
  const x = PAGE_MARGIN_X;
  const height = 280;
  const y = cursor.y - height;
  cursor.page.drawRectangle({ x, y, width: CONTENT_W, height, color: MIST, borderColor: LINE, borderWidth: 1 });

  try {
    // Load GeoJSON
    const geoPath = path.join(process.cwd(), 'public', 'geo', 'santafe-barrios.geojson');
    const geoRaw = await fs.readFile(geoPath, 'utf-8');
    const geojson = JSON.parse(geoRaw);

    // Build barrio data from stats
    const barrioData: BarrioData[] = (stats.avanceBarrio ?? []).map((b: any) => ({
      nombre: b.nombre,
      cantidad: b.cantidad,
      pctRNT: b.pctRNT,
      pctRegistroMercantil: b.pctRegistroMercantil,
    }));

    // Build SVG using light theme for print
    const svgString = buildSantaFeSvgMap(geojson, {
      theme: 'light',
      width: CONTENT_W,
      height,
      barrios: barrioData,
    });

    // Rasterise SVG to PNG using sharp if available, otherwise embed as placeholder
    let pngBytes: Uint8Array | null = null;
    try {
      const sharp = (await import('sharp')).default;
      const buf = await sharp(Buffer.from(svgString)).png({ quality: 100 }).toBuffer();
      pngBytes = new Uint8Array(buf);
    } catch {
      logs.push('map: sharp not available, embedding SVG as placeholder text');
    }

    if (pngBytes) {
      const image = await pdfDoc.embedPng(pngBytes);
      drawImageCover(cursor.page, image, x, y, CONTENT_W, height);
      logs.push('map: SVG rasterised and embedded as PNG');
    } else {
      // Fallback: draw a styled placeholder
      drawText(cursor.page, 'Mapa territorial de Santa Fe', { x: x + spacingScale.lg, y: y + height - 28, size: 14, font: fonts.bold, color: FOREST });
      drawText(cursor.page, `Barrios: ${geojson.features?.length ?? 0} · Encuestas: ${stats.total ?? 0}`, { x: x + spacingScale.lg, y: y + height - 50, size: 10, font: fonts.regular, color: SLATE });
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

export async function generatePdfReport(payload: PdfReportPayload): Promise<PdfBuildResult> {
  const logs: string[] = [];
  const stats: StatsInput = payload.stats ?? { total: 0, rutas: 0, exactos: 0, estimados: 0 };
  const summary = payload.summary?.trim() ? payload.summary : buildFallbackSummary(stats);
  const updatedAt = payload.updatedAt ?? new Date().toLocaleString('es-CO');
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
    // Stamp letterhead as background on cover and toc pages
    cover.drawPage(coverEmbedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    tocPage.drawPage(interiorEmbedded, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    logs.push(`letterhead: loaded (${pageCount} page${pageCount > 1 ? 's' : ''})`);
  } catch (err) {
    logs.push(`letterhead: could not load — ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  // Draw cover content AFTER the letterhead is stamped so content appears on top
  drawCover(cover, fonts, stats, updatedAt, summary);

  const newPage = createPageFactory(pdfDoc, pageTitles, templatePages);
  const startSection = (label: string) => {
    const cursor = newPage(label);
    tocItems.push({ label, pageNumber: pdfDoc.getPageCount() });
    return sectionTitle(cursor, label.toUpperCase(), fonts, newPage);
  };

  const sectionLabels = [
    '1. Resumen ejecutivo',
    '2. Contexto territorial',
    '3. Mapa territorial',
    '4. Metodología y hallazgos clave',
    '5. Concentración y lectura geográfica',
    '6. Formalización e infraestructura',
    '7. Empleo e índice de madurez',
    '8. Mercado, capacidades y sostenibilidad',
    (stats.byFecha?.length || stats.topEncuestadores?.length || stats.completitudDist?.length) ? '9. Recolección y calidad de datos' : null,
    '10. Brechas y recomendaciones',
    '11. Anexo técnico y glosario',
    '12. Créditos fotográficos',
  ].filter(Boolean) as string[];

  let sectionIndex = 0;
  let cursor = startSection(sectionLabels[sectionIndex++]);
  cursor = renderSummary(cursor, parseSummary(summary), fonts, newPage);

  // 2. Contexto territorial — real images embedded in their thematic section
  cursor = startSection(sectionLabels[sectionIndex++]);
  for (const image of santafeImages) cursor = await drawContextImageCard(pdfDoc, cursor, image, fonts, logs, newPage);

  // 3. Mapa territorial — SVG map generated server-side (no html2canvas)
  cursor = startSection(sectionLabels[sectionIndex++]);
  cursor = drawInfoBox(cursor, 'Interpretación del mapa', [
    `El mapa territorial combina ${stats.exactos || 0} puntos exactos y ${stats.estimados || 0} puntos estimados por centroide de barrio.`,
    analysis.concentration.paragraph,
  ], fonts, newPage);
  cursor = await drawMapBox(pdfDoc, cursor, stats, fonts, logs, newPage);

  cursor = startSection(sectionLabels[sectionIndex++]);
  cursor = drawInfoBox(cursor, analysis.methodology.title, analysis.methodology.paragraphs, fonts, newPage);
  cursor = subTitle(cursor, 'Hallazgos clave cuantificados', fonts, newPage);
  cursor = drawBulletList(cursor, analysis.hallazgos.slice(0, 8), fonts, newPage);

  cursor = startSection(sectionLabels[sectionIndex++]);
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

  cursor = startSection(sectionLabels[sectionIndex++]);
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

  cursor = startSection(sectionLabels[sectionIndex++]);
  analysis.narratives.employment.forEach((paragraph) => {
    cursor = drawParagraph(cursor, paragraph, { size: 9.25, lineHeight: 13, font: fonts.regular, color: INK, justify: true }, newPage);
  });
  const empleo = stats.empleo;
  if (empleo) {
    cursor = subTitle(cursor, 'Indicadores agregados de empleo', fonts, newPage);
    cursor = drawTable(cursor, [
      { label: 'Empleos formales', value: empleo.totalFormales },
      { label: 'Empleos informales / familiares', value: empleo.totalInformales },
      { label: 'Mujeres vinculadas', value: empleo.totalMujeres },
      { label: 'Jóvenes vinculados', value: empleo.totalJovenes },
      { label: 'Adultos mayores (60+)', value: empleo.totalMayores60 },
      { label: 'Población diversa', value: empleo.totalDiversidad },
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

  cursor = startSection(sectionLabels[sectionIndex++]);
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

  if ((stats.byFecha?.length ?? 0) > 0 || (stats.topEncuestadores?.length ?? 0) > 0 || (stats.completitudDist?.length ?? 0) > 0) {
    cursor = startSection(sectionLabels[sectionIndex++]);
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
  }

  cursor = startSection(sectionLabels[sectionIndex++]);
  cursor = subTitle(cursor, 'Brechas y riesgos principales', fonts, newPage);
  cursor = drawBulletList(cursor, analysis.brechasYRiesgos, fonts, newPage);
  cursor = subTitle(cursor, 'Recomendaciones priorizadas', fonts, newPage);
  cursor = drawTable(cursor, analysis.recommendations, createColumns([
    { label: 'Acción', width: 270, value: (row: any) => row.action },
    { label: 'Prioridad', width: 80, value: (row: any) => row.priority, align: 'center' },
    { label: 'Indicador sugerido', width: 170, value: (row: any) => row.indicator },
  ]), fonts, newPage);

  cursor = startSection(sectionLabels[sectionIndex++]);
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

  cursor = startSection(sectionLabels[sectionIndex++]);
  cursor = drawTable(cursor, santafeImages, createColumns([
    { label: 'Tema', width: 118, value: (row: any) => row.title },
    { label: 'Autor / crédito', width: 148, value: (row: any) => row.credit },
    { label: 'Fuente', width: 112, value: (row: any) => row.source },
    { label: 'Licencia', width: 82, value: (row: any) => row.license },
  ]), fonts, newPage);

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
