/**
 * lib/mapSvg.ts
 * Pure-function SVG map generator for the Santa Fe locality barrios.
 * The same function is used on the server (PDF embed) and on the client (React component).
 * Themes: 'dark' (web) | 'light' (PDF/print).
 */

import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';

export type MapTheme = 'dark' | 'light';
export type MapLabel = {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  color: string;
  anchor: 'left' | 'center' | 'right';
};

export type BarrioData = {
  nombre: string;
  cantidad: number;
  pctRNT?: number;
  pctRegistroMercantil?: number;
  pctSedeFisica?: number;
};

export type MapOptions = {
  theme: MapTheme;
  width: number;
  height: number;
  barrios?: BarrioData[];
};

type BBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

function mercatorX(lon: number): number {
  return (lon + 180) / 360;
}

function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return (1 - Math.log((1 + sin) / (1 - sin)) / (2 * Math.PI)) / 2;
}

function bboxOf(features: Feature[]): BBox {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const feature of features) {
    const coords = flatCoords(feature);
    for (const [lon, lat] of coords) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

function flatCoords(feature: Feature): [number, number][] {
  const geometry = feature.geometry as Polygon | MultiPolygon;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates.flat() as [number, number][];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2) as [number, number][];
  return [];
}

function makeProjection(bbox: BBox, paddedW: number, paddedH: number, ox: number, oy: number) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const mxMin = mercatorX(minLon);
  const mxMax = mercatorX(maxLon);
  const myMin = mercatorY(maxLat);
  const myMax = mercatorY(minLat);
  const scaleX = paddedW / (mxMax - mxMin);
  const scaleY = paddedH / (myMax - myMin);
  const scale = Math.min(scaleX, scaleY);
  const offX = ox + (paddedW - (mxMax - mxMin) * scale) / 2;
  const offY = oy + (paddedH - (myMax - myMin) * scale) / 2;

  return (lon: number, lat: number): [number, number] => [
    offX + (mercatorX(lon) - mxMin) * scale,
    offY + (mercatorY(lat) - myMin) * scale,
  ];
}

function centroidOf(feature: Feature): [number, number] {
  const coords = flatCoords(feature);
  if (!coords.length) return [0, 0];
  const total = coords.length;
  return [
    coords.reduce((sum, current) => sum + current[0], 0) / total,
    coords.reduce((sum, current) => sum + current[1], 0) / total,
  ];
}

const DARK_PALETTE = [
  '#178C72', '#B5D334', '#F2B705', '#10483D', '#4ade80',
  '#60a5fa', '#f87171', '#a78bfa', '#fb923c', '#34d399',
];

const LIGHT_PALETTE = [
  '#2A7C5F', '#7DA82A', '#C8960A', '#0D3228', '#22A86A',
  '#3B7FCC', '#D95A5A', '#7C60C4', '#D4711A', '#1A8F6A',
];

function featureToPath(feature: Feature, project: (lon: number, lat: number) => [number, number]): string {
  const geometry = feature.geometry as Polygon | MultiPolygon;
  if (!geometry) return '';
  const rings: [number, number][][] =
    geometry.type === 'Polygon'
      ? geometry.coordinates as [number, number][][]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as [number, number][][][]).flat()
        : [];

  return rings.map((ring) => `${ring.map((coord, index) => {
    const [x, y] = project(coord[0], coord[1]);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ')} Z`).join(' ');
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function labelToSvgText(label: MapLabel) {
  const anchor = label.anchor === 'center' ? 'middle' : label.anchor === 'right' ? 'end' : 'start';
  return `<text x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" text-anchor="${anchor}" font-size="${label.size}"${label.bold ? ' font-weight="700"' : ''} fill="${label.color}" font-family="Arial,sans-serif">${escapeXml(label.text)}</text>`;
}

export function buildMapSvgGeometry(
  geojson: FeatureCollection,
  options: MapOptions,
): { svgString: string; labels: MapLabel[] } {
  const { theme, width, height, barrios = [] } = options;
  const isDark = theme === 'dark';

  const bg = isDark ? '#0f1f1a' : '#f8f9fa';
  const panelBg = isDark ? '#162118' : '#ffffff';
  const mapBg = isDark ? '#0d1a0d' : '#eef4ee';
  const textMain = isDark ? '#f0f9f0' : '#1a2e1a';
  const textMuted = isDark ? '#8bb88b' : '#4a6a4a';
  const borderColor = isDark ? '#2a3d2a' : '#ccddcc';
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const strokeColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const accentColor = isDark ? '#B5D334' : '#2A7C5F';
  const labelBubbleFill = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.70)';
  const northShade = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';

  const features = geojson.features;
  const numBarrios = features.length;

  const PANEL_W = 140;
  const LEG_W = 140;
  const MAP_X = PANEL_W + 6;
  const MAP_W = width - PANEL_W - LEG_W - 12;
  const MAP_H = height - 20;
  const MAP_Y = 10;

  const bbox = bboxOf(features);
  const project = makeProjection(bbox, MAP_W - 20, MAP_H - 20, MAP_X + 10, MAP_Y + 10);

  const barrioMap = new Map(barrios.map((item) => [item.nombre, item]));
  const maxCantidad = Math.max(...barrios.map((item) => item.cantidad), 1);
  const totalEncuestas = barrios.reduce((sum, item) => sum + item.cantidad, 0);

  const polygons = features.map((feature, index) => {
    const path = featureToPath(feature, project);
    const nombre = (feature.properties as { nombre?: string } | undefined)?.nombre ?? `Barrio ${index + 1}`;
    const data = barrioMap.get(nombre);
    const intensity = data ? data.cantidad / maxCantidad : 0;
    const baseColor = palette[index % palette.length];
    const [centroidLon, centroidLat] = centroidOf(feature);
    const [screenX, screenY] = project(centroidLon, centroidLat);
    return {
      d: path,
      nombre,
      data,
      intensity,
      baseColor,
      screenX,
      screenY,
      index: index + 1,
    };
  });

  const topBarrios = [...barrios]
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 3)
    .map((barrio) => {
      const feature = features.find((candidate) => (candidate.properties as { nombre?: string } | undefined)?.nombre === barrio.nombre);
      if (!feature) return null;
      const [centroidLon, centroidLat] = centroidOf(feature);
      const [screenX, screenY] = project(centroidLon, centroidLat);
      return { ...barrio, screenX, screenY };
    })
    .filter(Boolean) as Array<BarrioData & { screenX: number; screenY: number }>;

  const legendStartX = width - LEG_W + 12;
  const legendCountX = width - 12;
  const legendStartY = 56;
  const legendRowH = 17;
  const legendEndY = legendStartY + Math.max(polygons.length - 1, 0) * legendRowH;

  const calloutRadius = 18;
  const calloutGap = 42;
  const calloutX = width - LEG_W / 2;
  const maxCalloutStart = height - 26 - calloutGap * Math.max(topBarrios.length - 1, 0);
  const calloutStartY = Math.min(Math.max(210, legendEndY + 22), maxCalloutStart);
  const calloutPositions = topBarrios.map((_, index) => [calloutX, calloutStartY + index * calloutGap] as const);

  const miniSize = 56;
  const miniX = MAP_X + 10;
  const miniY = MAP_Y + MAP_H - miniSize - 10;

  const labels: MapLabel[] = [];
  const addLabel = (label: MapLabel) => labels.push(label);

  addLabel({ text: 'SANTA FE', x: 16, y: 34, size: 18, bold: true, color: accentColor, anchor: 'left' });
  addLabel({ text: 'Localidad 03 · Bogotá D.C.', x: 16, y: 49, size: 9.5, bold: false, color: textMuted, anchor: 'left' });
  addLabel({ text: 'Total encuestas:', x: 16, y: 74, size: 8.75, bold: false, color: textMuted, anchor: 'left' });
  addLabel({ text: String(totalEncuestas), x: 16, y: 89, size: 16, bold: true, color: textMain, anchor: 'left' });
  addLabel({ text: `Barrios mapeados: ${numBarrios}`, x: 16, y: 105, size: 8.25, bold: false, color: textMuted, anchor: 'left' });
  addLabel({ text: 'Intensidad de encuestas:', x: 16, y: 130, size: 7.5, bold: false, color: textMuted, anchor: 'left' });
  addLabel({ text: 'Menor', x: 16, y: 154, size: 7, bold: false, color: textMuted, anchor: 'left' });
  addLabel({ text: 'Mayor', x: PANEL_W - 16, y: 154, size: 7, bold: false, color: textMuted, anchor: 'right' });
  addLabel({ text: 'N', x: PANEL_W / 2, y: height - 38, size: 9, bold: true, color: textMuted, anchor: 'center' });
  addLabel({ text: 'Ubicación', x: miniX + miniSize / 2, y: miniY - 8, size: 6, bold: false, color: textMuted, anchor: 'center' });
  addLabel({ text: 'Barrios', x: width - LEG_W + 12, y: 22, size: 9, bold: true, color: textMain, anchor: 'left' });

  const polygonsSvg = polygons.map((polygon) => `
    <path d="${polygon.d}"
      fill="${polygon.baseColor}"
      fill-opacity="${(0.55 + polygon.intensity * 0.4).toFixed(3)}"
      stroke="${strokeColor}"
      stroke-width="1.2"
      stroke-linejoin="round">
      <title>${escapeXml(`${polygon.nombre}${polygon.data ? ` — ${polygon.data.cantidad} encuestas` : ''}`)}</title>
    </path>`).join('');

  const labelBubblesSvg = polygons.map((polygon) => {
    addLabel({
      text: String(polygon.index),
      x: polygon.screenX,
      y: polygon.screenY + 3.5,
      size: 7.5,
      bold: true,
      color: textMain,
      anchor: 'center',
    });
    return `
    <circle cx="${polygon.screenX.toFixed(1)}" cy="${polygon.screenY.toFixed(1)}" r="8"
      fill="${labelBubbleFill}"
      stroke="${polygon.baseColor}" stroke-width="1.5"/>`;
  }).join('');

  const calloutsSvg = topBarrios.map((callout, index) => {
    const [bubbleX, bubbleY] = calloutPositions[index] ?? [calloutX, calloutStartY];
    const headline = callout.pctRNT !== undefined
      ? `${callout.pctRNT}% RNT`
      : callout.pctRegistroMercantil !== undefined
        ? `${callout.pctRegistroMercantil}% Reg.`
        : `${callout.cantidad} enc.`;
    const shortName = callout.nombre.length > 12 ? `${callout.nombre.slice(0, 11)}…` : callout.nombre;
    const anchorX = Math.max(MAP_X + 10, Math.min(MAP_X + MAP_W - 10, callout.screenX));
    const anchorY = Math.max(MAP_Y + 10, Math.min(MAP_Y + MAP_H - 10, callout.screenY));

    addLabel({ text: headline, x: bubbleX, y: bubbleY - 4, size: 7.3, bold: true, color: accentColor, anchor: 'center' });
    addLabel({ text: shortName, x: bubbleX, y: bubbleY + 8, size: 6.2, bold: false, color: textMuted, anchor: 'center' });

    return `
    <line x1="${anchorX.toFixed(1)}" y1="${anchorY.toFixed(1)}" x2="${bubbleX.toFixed(1)}" y2="${bubbleY.toFixed(1)}"
      stroke="${accentColor}" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/>
    <circle cx="${bubbleX.toFixed(1)}" cy="${bubbleY.toFixed(1)}" r="${calloutRadius}"
      fill="${panelBg}" stroke="${accentColor}" stroke-width="2"/>`;
  }).join('');

  const legendItemsSvg = polygons.map((polygon, index) => {
    const labelY = legendStartY + index * legendRowH;
    const shortName = polygon.nombre.length > 14 ? `${polygon.nombre.slice(0, 13)}…` : polygon.nombre;
    addLabel({ text: `${polygon.index}. ${shortName}`, x: legendStartX + 11, y: labelY, size: 7, bold: false, color: textMain, anchor: 'left' });
    addLabel({ text: polygon.data ? String(polygon.data.cantidad) : '—', x: legendCountX, y: labelY, size: 7, bold: true, color: textMuted, anchor: 'right' });
    return `
    <rect x="${legendStartX}" y="${(labelY - 8).toFixed(1)}" width="8" height="8" rx="1" fill="${polygon.baseColor}" opacity="0.85"/>`;
  }).join('');

  const miniPolygons = polygons.map((polygon) => {
    const [lon, lat] = centroidOf(features[polygon.index - 1]);
    const x = miniX + ((lon - bbox[0]) / (bbox[2] - bbox[0] || 1)) * miniSize;
    const y = miniY + miniSize - ((lat - bbox[1]) / (bbox[3] - bbox[1] || 1)) * miniSize;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${polygon.baseColor}" opacity="0.8"/>`;
  }).join('');

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"
  role="img" aria-labelledby="map-title map-desc">
  <title id="map-title">Mapa de barrios - Localidad Santa Fe, Bogotá D.C.</title>
  <desc id="map-desc">Distribución territorial de encuestas turísticas por barrio en la Localidad de Santa Fe.</desc>

  <defs>
    <linearGradient id="scaleGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="${isDark ? '#162118' : '#e8f5e9'}"/>
      <stop offset="100%" stop-color="${accentColor}"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="${bg}"/>

  <rect x="0" y="0" width="${PANEL_W}" height="${height}" fill="${panelBg}"/>
  <rect x="${PANEL_W - 2}" y="0" width="2" height="${height}" fill="${borderColor}"/>
  <rect x="16" y="57" width="${PANEL_W - 32}" height="1.5" fill="${accentColor}" opacity="0.4"/>
  <rect x="16" y="114" width="${PANEL_W - 32}" height="1" fill="${borderColor}"/>
  <rect x="16" y="136" width="${PANEL_W - 32}" height="8" rx="4" fill="url(#scaleGrad)"/>

  <g transform="translate(${PANEL_W / 2}, ${height - 58})">
    <polygon points="0,-18 6,4 0,0 -6,4" fill="${accentColor}"/>
    <polygon points="0,-18 0,0 -6,4" fill="${northShade}"/>
  </g>

  <rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_W}" height="${MAP_H}" fill="${mapBg}" rx="6" stroke="${borderColor}" stroke-width="1"/>
  ${polygonsSvg}
  ${labelBubblesSvg}
  ${calloutsSvg}

  <rect x="${miniX - 4}" y="${miniY - 4}" width="${miniSize + 8}" height="${miniSize + 8}"
    fill="${panelBg}" stroke="${borderColor}" stroke-width="1" rx="3" opacity="0.85"/>
  ${miniPolygons}

  <rect x="${width - LEG_W}" y="0" width="${LEG_W}" height="${height}" fill="${panelBg}"/>
  <rect x="${width - LEG_W}" y="0" width="2" height="${height}" fill="${borderColor}"/>
  <rect x="${width - LEG_W + 12}" y="28" width="${LEG_W - 24}" height="1" fill="${borderColor}"/>
  ${legendItemsSvg}
</svg>`;

  return { svgString, labels };
}

export function buildSantaFeSvgMap(
  geojson: FeatureCollection,
  options: MapOptions,
): string {
  const { svgString, labels } = buildMapSvgGeometry(geojson, options);
  return svgString.replace('</svg>', `${labels.map(labelToSvgText).join('')}</svg>`);
}
