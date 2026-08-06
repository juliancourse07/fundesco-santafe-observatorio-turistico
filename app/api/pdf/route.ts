import { NextRequest } from 'next/server';
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FOREST = rgb(0.063, 0.282, 0.239);
const GREEN  = rgb(0.09, 0.55, 0.45);
const LIME   = rgb(0.71, 0.827, 0.204);
const CREAM  = rgb(0.97, 0.95, 0.91);
const DARK   = rgb(0.1, 0.1, 0.1);
const MID    = rgb(0.35, 0.35, 0.35);
const WHITE  = rgb(1, 1, 1);
const LIGHT  = rgb(0.95, 0.99, 0.97);
const STRIP  = rgb(0.93, 0.97, 0.95);

const PW = 612, PH = 792;
const ML = 48, MR = 564, MT = 756, MB = 44;

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? cur + ' ' + w : w;
    if (candidate.length > maxChars) {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? w.slice(0, maxChars - 1) + '…' : w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function drawHeader(page: PDFPage, title: string, bold: any, pageN: number, totalPages: number) {
  page.drawRectangle({ x: 0, y: PH - 36, width: PW, height: 36, color: FOREST });
  page.drawText('FUNDESCO · Observatorio Turístico Santa Fe', { x: ML, y: PH - 23, size: 9, font: bold, color: LIME });
  page.drawText(title, { x: ML, y: PH - 23, size: 10, font: bold, color: WHITE, opacity: 0 }); // unused but keep slot
  page.drawText(title, { x: 200, y: PH - 23, size: 10, font: bold, color: WHITE });
  page.drawText(`Pág. ${pageN} / ${totalPages}`, { x: 505, y: PH - 23, size: 9, font: bold, color: LIME });
}

function drawFooter(page: PDFPage, reg: any) {
  page.drawRectangle({ x: 0, y: 0, width: PW, height: MB, color: FOREST });
  page.drawText('Fundesco Santa Fe | Observatorio Turístico | Documento de trabajo', { x: ML, y: 14, size: 8, font: reg, color: WHITE });
}

function sectionTitle(page: PDFPage, text: string, y: number, bold: any): number {
  page.drawRectangle({ x: ML - 8, y: y - 3, width: MR - ML + 16, height: 20, color: FOREST });
  page.drawText(text, { x: ML, y: y + 2, size: 11, font: bold, color: WHITE });
  return y - 26;
}

function subTitle(page: PDFPage, text: string, y: number, bold: any): number {
  page.drawText(text, { x: ML, y, size: 10, font: bold, color: FOREST });
  return y - 16;
}

function tableHeader(page: PDFPage, cols: Array<{label:string;x:number}>, y: number, bold: any): number {
  page.drawRectangle({ x: ML - 4, y: y - 4, width: MR - ML + 8, height: 16, color: GREEN });
  cols.forEach(c => page.drawText(c.label, { x: c.x, y, size: 8.5, font: bold, color: WHITE }));
  return y - 18;
}

function tableRow(page: PDFPage, cells: Array<{val:string;x:number}>, y: number, even: boolean, reg: any): number {
  page.drawRectangle({ x: ML - 4, y: y - 4, width: MR - ML + 8, height: 14, color: even ? STRIP : WHITE });
  cells.forEach(c => page.drawText(c.val.slice(0, 55), { x: c.x, y, size: 8.5, font: reg, color: DARK }));
  return y - 14;
}

function miniBar(page: PDFPage, label: string, value: number, maxValue: number, y: number, bold: any, reg: any): number {
  const bw = 200;
  const fill = maxValue > 0 ? Math.max(4, Math.round((value / maxValue) * bw)) : 4;
  page.drawText(label.slice(0, 44), { x: ML, y, size: 8.5, font: reg, color: DARK });
  page.drawRectangle({ x: ML + 230, y: y - 2, width: bw, height: 10, color: LIGHT });
  page.drawRectangle({ x: ML + 230, y: y - 2, width: fill, height: 10, color: GREEN });
  page.drawText(String(value), { x: ML + 235 + bw, y, size: 8.5, font: bold, color: FOREST });
  return y - 16;
}

function pctBar(page: PDFPage, label: string, pct: number, y: number, bold: any, reg: any): number {
  const bw = 160;
  const fill = Math.max(4, Math.round((pct / 100) * bw));
  page.drawText(label.slice(0, 36), { x: ML, y, size: 8.5, font: reg, color: DARK });
  page.drawRectangle({ x: ML + 190, y: y - 2, width: bw, height: 10, color: LIGHT });
  page.drawRectangle({ x: ML + 190, y: y - 2, width: fill, height: 10, color: GREEN });
  page.drawText(`${pct}%`, { x: ML + 195 + bw, y, size: 8.5, font: bold, color: FOREST });
  return y - 16;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const stats = payload?.stats ?? {};
  const summary: string = payload?.summary ?? '';
  const updatedAt: string = payload?.updatedAt ?? new Date().toLocaleString('es-CO');
  const mapImageBase64: string = payload?.mapImageBase64 ?? '';

  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // ─── Count total pages upfront ───────────────────────────────────────────
  // We'll do a two-pass approach: first add all pages, then draw headers/footers
  // For simplicity, pre-estimate total pages:
  const hasMap = !!mapImageBase64;
  const hasSummary = !!summary;
  const hasBarrio = (stats.avanceBarrio?.length ?? 0) > 0;
  const hasUpz = (stats.byUpz?.length ?? 0) > 0;
  const hasTipo = (stats.byTipo?.length ?? 0) > 0;
  const hasPerfil = !!(stats.perfilEmprendedores);
  const hasMercado = !!(stats.productoMercado);
  const hasEncuestadores = (stats.topEncuestadores?.length ?? 0) > 0;
  const hasFecha = (stats.byFecha?.length ?? 0) > 1;

  // Estimate page count
  let totalPages = 2; // cover + TOC
  if (hasSummary) totalPages++;
  if (hasMap) totalPages++;
  totalPages++; // geo analysis (always)
  totalPages++; // formalizacion + infraestructura
  totalPages++; // empleo + perfil
  if (hasMercado) totalPages++;
  if (hasEncuestadores || hasFecha) totalPages++;
  totalPages++; // scores + necesidades

  // ─── PAGE 1: Cover ───────────────────────────────────────────────────────
  const cover = pdfDoc.addPage([PW, PH]);
  // Background
  cover.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: rgb(0.975, 0.96, 0.93) });
  // Header band
  cover.drawRectangle({ x: 0, y: PH - 200, width: PW, height: 200, color: FOREST });
  cover.drawRectangle({ x: 0, y: PH - 208, width: PW, height: 8, color: LIME });
  cover.drawText('FUNDESCO', { x: ML, y: PH - 50, size: 13, font: fontBold, color: LIME });
  cover.drawText('Observatorio Turístico de Santa Fe', { x: ML, y: PH - 78, size: 22, font: fontBold, color: WHITE });
  cover.drawText('Informe de Avance — Caracterización Territorial del Ecosistema Turístico', { x: ML, y: PH - 106, size: 11, font: fontReg, color: rgb(0.85, 0.95, 0.9) });
  cover.drawText('Bogotá D.C. | Localidad Santa Fe', { x: ML, y: PH - 128, size: 10, font: fontReg, color: rgb(0.75, 0.88, 0.82) });

  // Meta box
  cover.drawRectangle({ x: ML, y: PH - 330, width: MR - ML, height: 110, color: WHITE, borderColor: LIME, borderWidth: 1.5 });
  cover.drawRectangle({ x: ML, y: PH - 245, width: MR - ML, height: 26, color: GREEN });
  cover.drawText('Resumen ejecutivo del período', { x: ML + 8, y: PH - 237, size: 10, font: fontBold, color: WHITE });

  const periodo = (stats.fechaInicio && stats.fechaFin) ? `${stats.fechaInicio} – ${stats.fechaFin}` : 'N/D';
  const metaRows = [
    { label: 'Período de recolección:', val: periodo },
    { label: 'Total de registros analizados:', val: String(stats.total ?? 0) },
    { label: 'Interés en rutas turísticas:', val: `${stats.rutas ?? 0} emprendimientos` },
    { label: 'Tasa de completitud:', val: `${stats.tasaCompletitud ?? 0}%` },
  ];
  metaRows.forEach((row, i) => {
    const y = PH - 264 - i * 18;
    cover.drawText(row.label, { x: ML + 8, y, size: 9, font: fontBold, color: FOREST });
    cover.drawText(row.val, { x: ML + 190, y, size: 9, font: fontReg, color: DARK });
  });

  // KPI cards
  cover.drawText('Indicadores clave', { x: ML, y: PH - 352, size: 12, font: fontBold, color: FOREST });
  const kpis = [
    { l: 'Total registros',    v: String(stats.total ?? 0) },
    { l: 'Interés en rutas',   v: String(stats.rutas ?? 0) },
    { l: 'Puntos exactos',     v: String(stats.exactos ?? 0) },
    { l: 'Tasa completitud',   v: `${stats.tasaCompletitud ?? 0}%` },
  ];
  kpis.forEach((k, i) => {
    const x = ML + i * 130;
    cover.drawRectangle({ x, y: PH - 420, width: 122, height: 58, color: WHITE, borderColor: GREEN, borderWidth: 1.5 });
    cover.drawText(k.v, { x: x + 8, y: PH - 388, size: 20, font: fontBold, color: FOREST });
    cover.drawText(k.l, { x: x + 8, y: PH - 408, size: 8.5, font: fontReg, color: MID });
  });

  // Scores bar chart on cover
  const scores: Array<{name:string;value:number}> = stats.scores ?? [];
  if (scores.length) {
    cover.drawText('Scores de fortalecimiento por dimensión (escala 1–5)', { x: ML, y: PH - 442, size: 10, font: fontBold, color: FOREST });
    const maxSc = 5;
    scores.forEach((sc, i) => {
      const y = PH - 462 - i * 20;
      const bw = Math.max(4, Math.round((sc.value / maxSc) * 200));
      cover.drawRectangle({ x: ML, y: y - 3, width: 200, height: 13, color: LIGHT });
      cover.drawRectangle({ x: ML, y: y - 3, width: bw, height: 13, color: GREEN });
      cover.drawText(sc.name, { x: ML + 208, y, size: 9, font: fontReg, color: DARK });
      cover.drawText(String(sc.value), { x: MR - 18, y, size: 9, font: fontBold, color: FOREST });
    });
  }

  // Cover footer
  cover.drawRectangle({ x: 0, y: 0, width: PW, height: 44, color: FOREST });
  cover.drawText('Documento generado automáticamente por el sistema de monitoreo Fundesco', { x: ML, y: 26, size: 8.5, font: fontReg, color: rgb(0.7, 0.85, 0.8) });
  cover.drawText(`Generado: ${updatedAt}`, { x: ML, y: 12, size: 8, font: fontReg, color: rgb(0.6, 0.75, 0.7) });

  // ─── PAGE 2: Table of Contents ────────────────────────────────────────────
  const tocPage = pdfDoc.addPage([PW, PH]);
  drawHeader(tocPage, 'Tabla de contenido', fontBold, 2, totalPages);
  drawFooter(tocPage, fontReg);

  let ty = MT - 10;
  tocPage.drawText('Tabla de contenido', { x: ML, y: ty, size: 16, font: fontBold, color: FOREST });
  ty -= 8;
  tocPage.drawRectangle({ x: ML, y: ty, width: MR - ML, height: 2, color: LIME });
  ty -= 20;

  let tocPageNum = 3;
  const tocItems: Array<{label:string; pg:number}> = [];
  tocItems.push({ label: '1. Resumen ejecutivo', pg: tocPageNum++ });
  if (hasMap) tocItems.push({ label: '2. Mapa territorial', pg: tocPageNum++ });
  tocItems.push({ label: (hasMap ? '3' : '2') + '. Análisis geográfico por barrio', pg: tocPageNum++ });
  tocItems.push({ label: (hasMap ? '4' : '3') + '. Formalización e infraestructura', pg: tocPageNum++ });
  tocItems.push({ label: (hasMap ? '5' : '4') + '. Empleo y perfil del emprendedor', pg: tocPageNum++ });
  if (hasMercado) tocItems.push({ label: (hasMap ? '6' : '5') + '. Producto turístico y mercado', pg: tocPageNum++ });
  if (hasEncuestadores || hasFecha) tocItems.push({ label: (hasMap ? '7' : '6') + '. Recolección y encuestadores', pg: tocPageNum++ });
  tocItems.push({ label: (hasMap ? '8' : '7') + '. Capacidades, necesidades y sostenibilidad', pg: tocPageNum++ });

  tocItems.forEach((item, i) => {
    const y = ty - i * 26;
    const dots = '.'.repeat(Math.max(2, 80 - item.label.length));
    tocPage.drawRectangle({ x: ML - 4, y: y - 5, width: MR - ML + 8, height: 22, color: i % 2 === 0 ? STRIP : WHITE });
    tocPage.drawText(item.label, { x: ML + 4, y: y + 3, size: 10, font: fontBold, color: FOREST });
    tocPage.drawText(dots, { x: ML + 4 + item.label.length * 5.5, y: y + 3, size: 9, font: fontReg, color: rgb(0.7, 0.7, 0.7) });
    tocPage.drawText(String(item.pg), { x: MR - 16, y: y + 3, size: 10, font: fontBold, color: FOREST });
  });

  let currentPageNum = 3;

  // ─── PAGE 3: Executive Summary (AI) ──────────────────────────────────────
  if (hasSummary) {
    const aiPage = pdfDoc.addPage([PW, PH]);
    drawHeader(aiPage, '1. Resumen ejecutivo', fontBold, currentPageNum++, totalPages);
    drawFooter(aiPage, fontReg);
    let ay = MT - 10;
    ay = sectionTitle(aiPage, '1. RESUMEN EJECUTIVO', ay, fontBold);
    const summaryLines = summary.split('\n');
    for (const raw of summaryLines) {
      if (ay < MB + 20) break;
      const isH = /^#{1,3}\s+/.test(raw);
      const line = raw.replace(/^#{1,3}\s+/, '');
      if (isH) {
        ay -= 4;
        ay = subTitle(aiPage, line, ay, fontBold);
      } else if (line.trim() === '') {
        ay -= 6;
      } else {
        for (const wl of wrap(line, 93)) {
          if (ay < MB + 20) break;
          aiPage.drawText(wl, { x: ML, y: ay, size: 9, font: fontReg, color: DARK });
          ay -= 13;
        }
      }
    }
  }

  // ─── PAGE: Map ────────────────────────────────────────────────────────────
  if (hasMap) {
    const mapPage = pdfDoc.addPage([PW, PH]);
    drawHeader(mapPage, '2. Mapa territorial', fontBold, currentPageNum++, totalPages);
    drawFooter(mapPage, fontReg);
    let my = MT - 10;
    my = sectionTitle(mapPage, '2. MAPA TERRITORIAL — LOCALIDAD SANTA FE', my, fontBold);
    try {
      const imgBytes = Buffer.from(mapImageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      let img;
      if (mapImageBase64.startsWith('data:image/jpeg') || mapImageBase64.startsWith('data:image/jpg')) {
        img = await pdfDoc.embedJpg(imgBytes);
      } else {
        img = await pdfDoc.embedPng(imgBytes);
      }
      const imgDims = img.scaleToFit(MR - ML, 340);
      mapPage.drawImage(img, { x: ML, y: my - imgDims.height, width: imgDims.width, height: imgDims.height });
      my -= imgDims.height + 10;
    } catch {
      mapPage.drawText('[No fue posible embeber el mapa en esta versión del informe]', { x: ML, y: my, size: 9, font: fontReg, color: MID });
      my -= 20;
    }
    // Map legend
    mapPage.drawText('Leyenda del mapa:', { x: ML, y: my, size: 9, font: fontBold, color: FOREST });
    my -= 14;
    const legendItems = [
      { color: GREEN, label: 'Punto exacto (coordenadas GPS del emprendimiento)' },
      { color: rgb(0.79, 0.55, 0.02), label: 'Punto estimado (centroide del barrio)' },
      { color: rgb(0.07, 0.39, 0.2), label: 'Alta concentración (choropleth oscuro)' },
    ];
    legendItems.forEach(li => {
      mapPage.drawRectangle({ x: ML, y: my - 2, width: 12, height: 10, color: li.color });
      mapPage.drawText(li.label, { x: ML + 18, y: my, size: 8.5, font: fontReg, color: DARK });
      my -= 15;
    });
  }

  // ─── PAGE: Geographic analysis ────────────────────────────────────────────
  const geoPage = pdfDoc.addPage([PW, PH]);
  const geoSec = hasMap ? '3' : '2';
  drawHeader(geoPage, `${geoSec}. Análisis geográfico`, fontBold, currentPageNum++, totalPages);
  drawFooter(geoPage, fontReg);
  let gy = MT - 10;
  gy = sectionTitle(geoPage, `${geoSec}. ANÁLISIS GEOGRÁFICO POR BARRIO / UPZ`, gy, fontBold);

  if (hasBarrio) {
    gy = subTitle(geoPage, `Tabla ${geoSec}.1 — Distribución por barrio (n=${stats.total})`, gy, fontBold);
    const cols1 = [
      { label: 'Barrio', x: ML },
      { label: 'Encuestas', x: ML + 175 },
      { label: '% total', x: ML + 255 },
      { label: 'Score prom.', x: ML + 320 },
      { label: '% RNT', x: ML + 410 },
      { label: '% Reg.Merc.', x: ML + 460 },
    ];
    gy = tableHeader(geoPage, cols1, gy, fontBold);
    (stats.avanceBarrio ?? []).forEach((b: any, i: number) => {
      if (gy < MB + 20) return;
      gy = tableRow(geoPage, [
        { val: b.nombre, x: ML },
        { val: String(b.cantidad), x: ML + 185 },
        { val: `${b.pctTotal}%`, x: ML + 258 },
        { val: b.scorePromedio > 0 ? `${b.scorePromedio.toFixed(1)}/5` : '—', x: ML + 323 },
        { val: b.pctRNT !== undefined ? `${b.pctRNT}%` : '—', x: ML + 413 },
        { val: b.pctRegistroMercantil !== undefined ? `${b.pctRegistroMercantil}%` : '—', x: ML + 463 },
      ], gy, i % 2 === 0, fontReg);
    });
    gy -= 6;
  }

  if (hasUpz && gy > MB + 80) {
    gy = subTitle(geoPage, `Tabla ${geoSec}.2 — Distribución por UPZ (n=${stats.total})`, gy, fontBold);
    const cols2 = [{ label: 'UPZ', x: ML }, { label: 'Encuestas', x: ML + 250 }, { label: '% total', x: ML + 340 }];
    gy = tableHeader(geoPage, cols2, gy, fontBold);
    const upzTotal = stats.total || 1;
    (stats.byUpz ?? []).forEach((u: any, i: number) => {
      if (gy < MB + 20) return;
      gy = tableRow(geoPage, [
        { val: u.name, x: ML },
        { val: String(u.value), x: ML + 260 },
        { val: `${Math.round(u.value / upzTotal * 100)}%`, x: ML + 343 },
      ], gy, i % 2 === 0, fontReg);
    });
  }

  // ─── PAGE: Formalización + Infraestructura ────────────────────────────────
  const fPage = pdfDoc.addPage([PW, PH]);
  const fSec = hasMap ? '4' : '3';
  drawHeader(fPage, `${fSec}. Formalización e infraestructura`, fontBold, currentPageNum++, totalPages);
  drawFooter(fPage, fontReg);
  let fy = MT - 10;
  gy = sectionTitle(fPage, `${fSec}. FORMALIZACIÓN E INFRAESTRUCTURA`, fy, fontBold);
  fy = gy;

  const fz = stats.formalizacion;
  const inf = stats.infraestructura;

  if (fz) {
    fy = subTitle(fPage, `Gráfico ${fSec}.1 — Indicadores de formalización (n=${stats.total})`, fy, fontBold);
    const fzRows = [
      { label: 'Registro Mercantil / Cámara de Comercio', pct: fz.pctRegistroMercantil },
      { label: 'Registro Nacional de Turismo (RNT)', pct: fz.pctRNT },
      { label: 'RUT', pct: fz.pctRUT },
      { label: 'Facturación electrónica', pct: fz.pctFacturacionElectronica },
      { label: 'Afiliación a seguridad social', pct: fz.pctAfiliacionSS ?? 0 },
      { label: 'Seguro de responsabilidad civil', pct: fz.pctSeguro ?? 0 },
    ];
    fzRows.forEach(row => { fy = pctBar(fPage, row.label, row.pct, fy, fontBold, fontReg); });
    fy -= 8;
    fPage.drawText('Nota: Valores sobre total de registros. Nulos/no respuesta excluidos del numerador.', { x: ML, y: fy, size: 7.5, font: fontReg, color: MID });
    fy -= 20;
  }

  if (inf) {
    fy = subTitle(fPage, `Gráfico ${fSec}.2 — Indicadores de infraestructura (n=${stats.total})`, fy, fontBold);
    const infRows = [
      { label: 'Sede física', pct: inf.pctSedeFisica },
      { label: 'Señalización visible', pct: inf.pctSeñalizacion },
      { label: 'Baños disponibles', pct: inf.pctBanos },
      { label: 'Botiquín / emergencias', pct: inf.pctBotiquin },
      { label: 'Conectividad a internet', pct: inf.pctConectividad },
    ];
    infRows.forEach(row => { fy = pctBar(fPage, row.label, row.pct, fy, fontBold, fontReg); });
    fy -= 6;
    fPage.drawText('Nota: Valores sobre total de registros. Conectividad = cualquier respuesta distinta de "No".', { x: ML, y: fy, size: 7.5, font: fontReg, color: MID });
  }

  // ─── PAGE: Empleo + Perfil ────────────────────────────────────────────────
  const ePage = pdfDoc.addPage([PW, PH]);
  const eSec = hasMap ? '5' : '4';
  drawHeader(ePage, `${eSec}. Empleo y perfil`, fontBold, currentPageNum++, totalPages);
  drawFooter(ePage, fontReg);
  let ey = MT - 10;
  ey = sectionTitle(ePage, `${eSec}. EMPLEO Y PERFIL DEL EMPRENDEDOR`, ey, fontBold);

  const emp = stats.empleo;
  if (emp) {
    ey = subTitle(ePage, `Tabla ${eSec}.1 — Indicadores de empleo (n=${stats.total})`, ey, fontBold);
    const empRows = [
      ['Empleos formales', String(emp.totalFormales)],
      ['Empleos informales / familiares', String(emp.totalInformales)],
      ['Mujeres vinculadas', String(emp.totalMujeres)],
      ['Jóvenes vinculados', String(emp.totalJovenes)],
      ['Adultos mayores (60+)', String(emp.totalMayores60)],
      ['Población diversa / diferencial', String(emp.totalDiversidad)],
      ['Total personas vinculadas', String(emp.totalFormales + emp.totalInformales)],
    ];
    ey = tableHeader(ePage, [{label:'Indicador',x:ML},{label:'Total',x:ML+340}], ey, fontBold);
    empRows.forEach((r, i) => { ey = tableRow(ePage, [{val:r[0],x:ML},{val:r[1],x:ML+342}], ey, i%2===0, fontReg); });
    ey -= 10;
  }

  const pe = stats.perfilEmprendedores;
  if (pe) {
    if (pe.promedioEdad > 0) {
      ey = subTitle(ePage, `Estadísticos del representante — edad promedio: ${pe.promedioEdad} años`, ey, fontBold);
    }
    if (pe.topGenero?.length) {
      ey = subTitle(ePage, `Gráfico ${eSec}.2 — Género del representante (n=${stats.total})`, ey, fontBold);
      const maxG = pe.topGenero[0]?.value ?? 1;
      pe.topGenero.forEach((g: any) => { ey = miniBar(ePage, g.name, g.value, maxG, ey, fontBold, fontReg); });
      ey -= 6;
    }
    if (pe.topEducacion?.length) {
      ey = subTitle(ePage, `Gráfico ${eSec}.3 — Nivel educativo del representante (n=${stats.total})`, ey, fontBold);
      const maxE = pe.topEducacion[0]?.value ?? 1;
      pe.topEducacion.slice(0,6).forEach((g: any) => { ey = miniBar(ePage, g.name, g.value, maxE, ey, fontBold, fontReg); });
    }
  }

  // ─── PAGE: Producto y mercado ─────────────────────────────────────────────
  if (hasMercado) {
    const mPage = pdfDoc.addPage([PW, PH]);
    const mSec = hasMap ? '6' : '5';
    drawHeader(mPage, `${mSec}. Producto turístico y mercado`, fontBold, currentPageNum++, totalPages);
    drawFooter(mPage, fontReg);
    let my2 = MT - 10;
    my2 = sectionTitle(mPage, `${mSec}. PRODUCTO TURÍSTICO Y MERCADO`, my2, fontBold);

    const pm = stats.productoMercado;
    if (pm) {
      if (pm.topSegmentos?.length) {
        my2 = subTitle(mPage, `Gráfico ${mSec}.1 — Segmentos de mercado atendidos (n=${stats.total})`, my2, fontBold);
        const maxS = pm.topSegmentos[0]?.value ?? 1;
        pm.topSegmentos.forEach((s: any) => { my2 = miniBar(mPage, s.name, s.value, maxS, my2, fontBold, fontReg); });
        my2 -= 6;
      }
      if (pm.topIdiomas?.length) {
        my2 = subTitle(mPage, `Gráfico ${mSec}.2 — Idiomas disponibles (n=${stats.total})`, my2, fontBold);
        const maxI = pm.topIdiomas[0]?.value ?? 1;
        pm.topIdiomas.forEach((s: any) => { my2 = miniBar(mPage, s.name, s.value, maxI, my2, fontBold, fontReg); });
        my2 -= 6;
      }
      if (pm.capacidadDiariaTotal > 0) {
        my2 = subTitle(mPage, 'Capacidad operacional del ecosistema', my2, fontBold);
        mPage.drawText(`Capacidad total de atención diaria: ${pm.capacidadDiariaTotal} personas/día`, { x: ML, y: my2, size: 9, font: fontReg, color: DARK });
        my2 -= 14;
        mPage.drawText(`Capacidad máxima simultánea de visitantes: ${pm.capacidadVisitantesTotal} personas`, { x: ML, y: my2, size: 9, font: fontReg, color: DARK });
        my2 -= 14;
      }
      if (pm.topCertificaciones?.length) {
        my2 -= 4;
        my2 = subTitle(mPage, `Tabla ${mSec}.3 — Certificaciones y sellos de calidad (n=${stats.total})`, my2, fontBold);
        const maxC = pm.topCertificaciones[0]?.value ?? 1;
        pm.topCertificaciones.forEach((s: any) => { my2 = miniBar(mPage, s.name, s.value, maxC, my2, fontBold, fontReg); });
      }
      if (stats.topCanales?.length) {
        my2 -= 4;
        my2 = subTitle(mPage, `Gráfico ${mSec}.4 — Canales digitales activos (n=${stats.total})`, my2, fontBold);
        const maxCh = stats.topCanales[0]?.value ?? 1;
        stats.topCanales.forEach((s: any) => { my2 = miniBar(mPage, s.name, s.value, maxCh, my2, fontBold, fontReg); });
      }
    }
  }

  // ─── PAGE: Recolección / encuestadores / fechas ───────────────────────────
  if (hasEncuestadores || hasFecha) {
    const rPage = pdfDoc.addPage([PW, PH]);
    const rSec = hasMap ? '7' : '6';
    drawHeader(rPage, `${rSec}. Recolección y encuestadores`, fontBold, currentPageNum++, totalPages);
    drawFooter(rPage, fontReg);
    let ry = MT - 10;
    ry = sectionTitle(rPage, `${rSec}. RECOLECCIÓN DE DATOS Y ENCUESTADORES`, ry, fontBold);

    if (hasEncuestadores) {
      ry = subTitle(rPage, `Tabla ${rSec}.1 — Encuestas por encuestador/a (n=${stats.total})`, ry, fontBold);
      ry = tableHeader(rPage, [{label:'Encuestador/a',x:ML},{label:'Encuestas',x:ML+300},{label:'% del total',x:ML+380}], ry, fontBold);
      (stats.topEncuestadores ?? []).forEach((e: any, i: number) => {
        if (ry < MB + 20) return;
        ry = tableRow(rPage, [
          { val: e.name, x: ML },
          { val: String(e.value), x: ML + 308 },
          { val: `${Math.round(e.value / (stats.total || 1) * 100)}%`, x: ML + 383 },
        ], ry, i % 2 === 0, fontReg);
      });
      ry -= 10;
    }

    if (hasFecha) {
      ry = subTitle(rPage, `Gráfico ${rSec}.2 — Evolución diaria de recolección (n=${stats.total})`, ry, fontBold);
      rPage.drawText(`Período: ${stats.fechaInicio || 'N/D'} – ${stats.fechaFin || 'N/D'}`, { x: ML, y: ry, size: 8.5, font: fontReg, color: MID });
      ry -= 14;
      // Simple sparkline
      const series: Array<{fecha:string;value:number}> = stats.byFecha ?? [];
      if (series.length > 1) {
        const maxV = Math.max(...series.map((s: any) => s.value), 1);
        const totalW = MR - ML;
        const barW = Math.max(3, Math.floor(totalW / series.length) - 1);
        const chartH = 80;
        rPage.drawRectangle({ x: ML, y: ry - chartH, width: totalW, height: chartH, color: LIGHT });
        series.forEach((s: any, i: number) => {
          const bh = Math.max(2, Math.round((s.value / maxV) * (chartH - 4)));
          rPage.drawRectangle({ x: ML + i * (barW + 1), y: ry - chartH + 2, width: barW, height: bh, color: GREEN });
        });
        ry -= chartH + 6;
        if (series.length > 0) {
          rPage.drawText(series[0].fecha, { x: ML, y: ry, size: 7, font: fontReg, color: MID });
          rPage.drawText(series[series.length - 1].fecha, { x: MR - 60, y: ry, size: 7, font: fontReg, color: MID });
        }
        ry -= 14;
      }
    }

    if (stats.completitudDist?.length) {
      ry -= 4;
      ry = subTitle(rPage, `Tabla ${rSec}.3 — Estado de completitud de registros (tasa: ${stats.tasaCompletitud}%)`, ry, fontBold);
      ry = tableHeader(rPage, [{label:'Estado',x:ML},{label:'Registros',x:ML+280},{label:'% del total',x:ML+360}], ry, fontBold);
      (stats.completitudDist ?? []).forEach((c: any, i: number) => {
        if (ry < MB + 20) return;
        ry = tableRow(rPage, [
          { val: c.name, x: ML },
          { val: String(c.value), x: ML + 288 },
          { val: `${Math.round(c.value / (stats.total || 1) * 100)}%`, x: ML + 363 },
        ], ry, i % 2 === 0, fontReg);
      });
    }
  }

  // ─── PAGE: Scores + Necesidades + Sostenibilidad ──────────────────────────
  const sPage = pdfDoc.addPage([PW, PH]);
  const sSec = hasMap ? '8' : '7';
  drawHeader(sPage, `${sSec}. Capacidades y necesidades`, fontBold, currentPageNum++, totalPages);
  drawFooter(sPage, fontReg);
  let sy = MT - 10;
  sy = sectionTitle(sPage, `${sSec}. CAPACIDADES, NECESIDADES Y SOSTENIBILIDAD`, sy, fontBold);

  if (scores.length) {
    sy = subTitle(sPage, `Tabla ${sSec}.1 — Scores de fortalecimiento por dimensión (escala 1–5, n=${stats.total})`, sy, fontBold);
    sy = tableHeader(sPage, [{label:'Dimensión',x:ML},{label:'Score prom.',x:ML+290},{label:'Interpretación',x:ML+370}], sy, fontBold);
    scores.forEach((sc: any, i: number) => {
      const interp = sc.value >= 4 ? 'Fortaleza' : sc.value >= 3 ? 'En desarrollo' : sc.value >= 2 ? 'Brecha media' : 'Brecha crítica';
      sy = tableRow(sPage, [
        { val: sc.name, x: ML },
        { val: String(sc.value), x: ML + 300 },
        { val: interp, x: ML + 373 },
      ], sy, i % 2 === 0, fontReg);
    });
    sy -= 6;
    sPage.drawText('Nota: Escala 1–5 obtenida de los campos de autoevaluación de cada emprendimiento.', { x: ML, y: sy, size: 7.5, font: fontReg, color: MID });
    sy -= 20;
  }

  const nec: Array<{name:string;value:number}> = stats.necesidades ?? [];
  if (nec.length) {
    sy = subTitle(sPage, `Gráfico ${sSec}.2 — Áreas donde se requiere mayor apoyo (n=${stats.total})`, sy, fontBold);
    const maxN = nec[0]?.value ?? 1;
    nec.slice(0, 10).forEach((n: any) => { sy = miniBar(sPage, n.name, n.value, maxN, sy, fontBold, fontReg); });
    sy -= 10;
  }

  const sost: Array<{name:string;value:number}> = stats.topPracticasSostenibilidad ?? [];
  if (sost.length && sy > MB + 60) {
    sy = subTitle(sPage, `Gráfico ${sSec}.3 — Prácticas de sostenibilidad implementadas (n=${stats.total})`, sy, fontBold);
    const maxSt = sost[0]?.value ?? 1;
    sost.slice(0, 6).forEach((s: any) => { sy = miniBar(sPage, s.name, s.value, maxSt, sy, fontBold, fontReg); });
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
