/**
 * lib/mapSvg.ts
 * Pure-function SVG map generator for the Santa Fe locality barrios.
 * The same function is used on the server (PDF embed) and on the client (React component).
 * Themes: 'dark' (web) | 'light' (PDF/print).
 */

import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';

export type MapTheme = 'dark' | 'light';

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

// ─── Projection helpers ────────────────────────────────────────────────────

function mercatorX(lon: number): number {
  return (lon + 180) / 360;
}

function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  return (1 - Math.log((1 + sin) / (1 - sin)) / (2 * Math.PI)) / 2;
}

function bboxOf(features: Feature[]): BBox {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const f of features) {
    const coords = flatCoords(f);
    for (const [lon, lat] of coords) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

function flatCoords(f: Feature): [number, number][] {
  const g = f.geometry as Polygon | MultiPolygon;
  if (!g) return [];
  if (g.type === 'Polygon') return g.coordinates.flat() as [number, number][];
  if (g.type === 'MultiPolygon') return g.coordinates.flat(2) as [number, number][];
  return [];
}

function makeProjection(bbox: BBox, paddedW: number, paddedH: number, ox: number, oy: number) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const mxMin = mercatorX(minLon), mxMax = mercatorX(maxLon);
  const myMin = mercatorY(maxLat), myMax = mercatorY(minLat); // y inverted
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

// ─── Centroid helpers ──────────────────────────────────────────────────────

function centroidOf(f: Feature): [number, number] {
  const coords = flatCoords(f);
  if (!coords.length) return [0, 0];
  const n = coords.length;
  return [coords.reduce((s, c) => s + c[0], 0) / n, coords.reduce((s, c) => s + c[1], 0) / n];
}

// ─── Colour palette ────────────────────────────────────────────────────────

const DARK_PALETTE = [
  '#178C72', '#B5D334', '#F2B705', '#10483D', '#4ade80',
  '#60a5fa', '#f87171', '#a78bfa', '#fb923c', '#34d399',
];

const LIGHT_PALETTE = [
  '#2A7C5F', '#7DA82A', '#C8960A', '#0D3228', '#22A86A',
  '#3B7FCC', '#D95A5A', '#7C60C4', '#D4711A', '#1A8F6A',
];

// ─── SVG path builder ─────────────────────────────────────────────────────

function featureToPath(f: Feature, proj: (lon: number, lat: number) => [number, number]): string {
  const g = f.geometry as Polygon | MultiPolygon;
  if (!g) return '';
  const rings: [number, number][][] =
    g.type === 'Polygon' ? g.coordinates as [number, number][][] :
    g.type === 'MultiPolygon' ? (g.coordinates as [number, number][][][]).flat() : [];
  return rings.map(ring =>
    ring.map((c, i) => {
      const [x, y] = proj(c[0], c[1]);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ') + ' Z'
  ).join(' ');
}

// ─── Main export ──────────────────────────────────────────────────────────

/**
 * Builds a self-contained SVG string for the Santa Fe locality map.
 * @param geojson  The FeatureCollection (barrios/UPZ polygons).
 * @param options  Theme, dimensions and optional survey data.
 * @returns        An SVG string ready to be inlined or serialised to PNG.
 */
export function buildSantaFeSvgMap(
  geojson: FeatureCollection,
  options: MapOptions,
): string {
  const { theme, width, height, barrios = [] } = options;
  const isDark = theme === 'dark';

  const bg = isDark ? '#0f1f1a' : '#f8f9fa';
  const panelBg = isDark ? '#162118' : '#ffffff';
  const textMain = isDark ? '#f0f9f0' : '#1a2e1a';
  const textMuted = isDark ? '#8bb88b' : '#4a6a4a';
  const borderColor = isDark ? '#2a3d2a' : '#ccddcc';
  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const strokeColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const accentColor = isDark ? '#B5D334' : '#2A7C5F';

  const features = geojson.features;
  const numBarrios = features.length;

  // Layout panels
  const PANEL_W = 200;   // left info panel
  const LEG_W = 170;     // right legend panel
  const MAP_X = PANEL_W + 8;
  const MAP_W = width - PANEL_W - LEG_W - 24;
  const MAP_H = height - 20;
  const MAP_Y = 10;

  const bbox = bboxOf(features);
  const proj = makeProjection(bbox, MAP_W - 20, MAP_H - 20, MAP_X + 10, MAP_Y + 10);

  // Survey data lookup
  const barrioMap = new Map(barrios.map(b => [b.nombre, b]));
  const maxCantidad = Math.max(...barrios.map(b => b.cantidad), 1);

  // Build polygon paths
  const polygons = features.map((f, i) => {
    const d = featureToPath(f, proj);
    const nombre = (f.properties as any)?.nombre ?? `Barrio ${i + 1}`;
    const data = barrioMap.get(nombre);
    const intensity = data ? data.cantidad / maxCantidad : 0;
    const baseColor = palette[i % palette.length];
    const [cx, cy] = centroidOf(f).map((v, j) => proj(j === 0 ? v : 0, j === 1 ? v : 0)) as unknown as [number, number];
    // actual centroid in screen coords
    const centGeo = centroidOf(f);
    const [scx, scy] = proj(centGeo[0], centGeo[1]);
    return { d, nombre, data, baseColor, intensity, scx, scy, index: i + 1 };
  });

  // Callouts: top 3 barrios by cantidad
  const topBarrios = [...barrios].sort((a, b) => b.cantidad - a.cantidad).slice(0, 3);
  const callouts = topBarrios.map(b => {
    const feat = features.find(f => (f.properties as any)?.nombre === b.nombre);
    if (!feat) return null;
    const geo = centroidOf(feat);
    const [sx, sy] = proj(geo[0], geo[1]);
    return { ...b, sx, sy };
  }).filter(Boolean) as Array<BarrioData & { sx: number; sy: number }>;

  // ─── SVG construction ─────────────────────────────────────────────────

  const polygonsSvg = polygons.map(p => `
    <path d="${p.d}"
      fill="${p.baseColor}"
      fill-opacity="${0.55 + p.intensity * 0.4}"
      stroke="${strokeColor}"
      stroke-width="1.2"
      stroke-linejoin="round">
      <title>${p.nombre}${p.data ? ` — ${p.data.cantidad} encuestas` : ''}</title>
    </path>`).join('');

  const labelsSvg = polygons.map(p => `
    <g>
      <circle cx="${p.scx.toFixed(1)}" cy="${p.scy.toFixed(1)}" r="8"
        fill="${isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.70)'}"
        stroke="${p.baseColor}" stroke-width="1.5"/>
      <text x="${p.scx.toFixed(1)}" y="${(p.scy + 3.5).toFixed(1)}"
        text-anchor="middle" font-size="7.5" font-weight="bold"
        fill="${isDark ? '#f0f9f0' : '#1a2e1a'}" font-family="Arial,sans-serif">${p.index}</text>
    </g>`).join('');

  // Callout bubbles
  const calloutRadius = 28;
  const calloutPositions: [number, number][] = [
    [MAP_X + MAP_W - 85, MAP_Y + 55],
    [MAP_X + MAP_W - 85, MAP_Y + 125],
    [MAP_X + MAP_W - 85, MAP_Y + 195],
  ];
  const calloutsSvg = callouts.map((c, i) => {
    const [bx, by] = calloutPositions[i] ?? [0, 0];
    const pct = c.pctRNT !== undefined ? `${c.pctRNT}% RNT` :
                c.pctRegistroMercantil !== undefined ? `${c.pctRegistroMercantil}% Reg` :
                `${c.cantidad} enc.`;
    const clampedSx = Math.max(MAP_X + 10, Math.min(MAP_X + MAP_W - 10, c.sx));
    const clampedSy = Math.max(MAP_Y + 10, Math.min(MAP_Y + MAP_H - 10, c.sy));
    return `
    <line x1="${clampedSx.toFixed(1)}" y1="${clampedSy.toFixed(1)}" x2="${bx}" y2="${by}"
      stroke="${accentColor}" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/>
    <circle cx="${bx}" cy="${by}" r="${calloutRadius}"
      fill="${panelBg}" stroke="${accentColor}" stroke-width="2"/>
    <text x="${bx}" y="${by - 5}" text-anchor="middle" font-size="8" font-weight="bold"
      fill="${accentColor}" font-family="Arial,sans-serif">${pct}</text>
    <text x="${bx}" y="${by + 9}" text-anchor="middle" font-size="6.5"
      fill="${textMuted}" font-family="Arial,sans-serif">${c.nombre.substring(0,10)}</text>`;
  }).join('');

  // Legend items (two-column)
  const colBreak = Math.ceil(polygons.length / 2);
  const legendItems = polygons.map((p, i) => {
    const col = i < colBreak ? 0 : 1;
    const row = i < colBreak ? i : i - colBreak;
    const lx = (width - LEG_W + 10) + col * (LEG_W / 2 - 5);
    const ly = 60 + row * 17;
    const label = p.nombre.length > 12 ? p.nombre.substring(0, 12) + '…' : p.nombre;
    return `
    <rect x="${lx}" y="${ly - 8}" width="8" height="8" rx="1" fill="${p.baseColor}" opacity="0.85"/>
    <text x="${lx + 11}" y="${ly}" font-size="7" fill="${textMain}" font-family="Arial,sans-serif">
      <tspan font-weight="bold">${p.index}.</tspan> ${label}
    </text>`;
  }).join('');

  // Mini-map (simplified bounding box indicator in corner)
  const miniSize = 60;
  const miniX = MAP_X + 10;
  const miniY = MAP_Y + MAP_H - miniSize - 10;
  const miniPolygons = polygons.map(p => {
    const geo = centroidOf(features[p.index - 1]);
    const mx = miniX + ((geo[0] - bbox[0]) / (bbox[2] - bbox[0])) * miniSize;
    const my = miniY + miniSize - ((geo[1] - bbox[1]) / (bbox[3] - bbox[1])) * miniSize;
    return `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="3" fill="${p.baseColor}" opacity="0.8"/>`;
  }).join('');

  // Total encuestas
  const totalEncuestas = barrios.reduce((s, b) => s + b.cantidad, 0);

  return `<svg xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"
  role="img" aria-labelledby="map-title map-desc">
  <title id="map-title">Mapa de barrios - Localidad Santa Fe, Bogotá D.C.</title>
  <desc id="map-desc">Distribución territorial de encuestas turísticas por barrio en la Localidad de Santa Fe.</desc>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${bg}"/>

  <!-- Left info panel -->
  <rect x="0" y="0" width="${PANEL_W}" height="${height}" fill="${panelBg}" rx="0"/>
  <rect x="${PANEL_W - 2}" y="0" width="2" height="${height}" fill="${borderColor}"/>
  <text x="16" y="36" font-size="22" font-weight="900" fill="${accentColor}" font-family="Arial,sans-serif">SANTA FE</text>
  <text x="16" y="52" font-size="10" fill="${textMuted}" font-family="Arial,sans-serif">Localidad 17 · Bogotá D.C.</text>
  <rect x="16" y="60" width="${PANEL_W - 32}" height="1.5" fill="${accentColor}" opacity="0.4"/>
  <text x="16" y="78" font-size="9" fill="${textMuted}" font-family="Arial,sans-serif">Total encuestas:</text>
  <text x="16" y="92" font-size="18" font-weight="bold" fill="${textMain}" font-family="Arial,sans-serif">${totalEncuestas}</text>
  <text x="16" y="110" font-size="9" fill="${textMuted}" font-family="Arial,sans-serif">Barrios mapeados: ${numBarrios}</text>
  <rect x="16" y="120" width="${PANEL_W - 32}" height="1" fill="${borderColor}"/>

  <!-- Color scale legend -->
  <text x="16" y="137" font-size="8" fill="${textMuted}" font-family="Arial,sans-serif">Intensidad de encuestas:</text>
  <defs>
    <linearGradient id="scaleGrad" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="${isDark ? '#162118' : '#e8f5e9'}"/>
      <stop offset="100%" stop-color="${accentColor}"/>
    </linearGradient>
  </defs>
  <rect x="16" y="142" width="${PANEL_W - 32}" height="8" rx="4" fill="url(#scaleGrad)"/>
  <text x="16" y="162" font-size="7" fill="${textMuted}" font-family="Arial,sans-serif">Menor</text>
  <text x="${PANEL_W - 16}" y="162" text-anchor="end" font-size="7" fill="${textMuted}" font-family="Arial,sans-serif">Mayor</text>

  <!-- North arrow -->
  <g transform="translate(${PANEL_W / 2}, ${height - 60})">
    <polygon points="0,-18 6,4 0,0 -6,4" fill="${accentColor}"/>
    <polygon points="0,-18 0,0 -6,4" fill="${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}"/>
    <text y="20" text-anchor="middle" font-size="9" font-weight="bold" fill="${textMuted}" font-family="Arial,sans-serif">N</text>
  </g>

  <!-- Map area -->
  <rect x="${MAP_X}" y="${MAP_Y}" width="${MAP_W}" height="${MAP_H}"
    fill="${isDark ? '#0d1a0d' : '#eef4ee'}" rx="6" stroke="${borderColor}" stroke-width="1"/>

  <!-- Polygons -->
  ${polygonsSvg}

  <!-- Centroid labels -->
  ${labelsSvg}

  <!-- Callout bubbles -->
  ${calloutsSvg}

  <!-- Mini-map inset -->
  <rect x="${miniX - 4}" y="${miniY - 4}" width="${miniSize + 8}" height="${miniSize + 8}"
    fill="${panelBg}" stroke="${borderColor}" stroke-width="1" rx="3" opacity="0.85"/>
  <text x="${miniX + miniSize / 2}" y="${miniY - 8}" text-anchor="middle" font-size="6"
    fill="${textMuted}" font-family="Arial,sans-serif">Ubicación</text>
  ${miniPolygons}

  <!-- Right legend panel -->
  <rect x="${width - LEG_W}" y="0" width="${LEG_W}" height="${height}" fill="${panelBg}" rx="0"/>
  <rect x="${width - LEG_W}" y="0" width="2" height="${height}" fill="${borderColor}"/>
  <text x="${width - LEG_W + 10}" y="22" font-size="9" font-weight="bold" fill="${textMain}" font-family="Arial,sans-serif">Barrios</text>
  <rect x="${width - LEG_W + 10}" y="28" width="${LEG_W - 20}" height="1" fill="${borderColor}"/>
  ${legendItems}
</svg>`;
}
