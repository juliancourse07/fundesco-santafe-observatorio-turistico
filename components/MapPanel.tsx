'use client';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, LayersControl, useMap } from 'react-leaflet';
import type { Layer, PathOptions, LatLngBoundsExpression } from 'leaflet';

type SurveyRecord = { id: string; nombre: string; barrio: string; upz: string; tipo: string; lat: number; lng: number; geoPrecision: string; scores?: Record<string, number>; };
type GeoFeature = { type: string; properties: { nombre: string; upz: string }; geometry: object };
type GeoData = { type: string; features: GeoFeature[] };

// Santa Fe bounding box
const SANTA_FE_BOUNDS: LatLngBoundsExpression = [[4.570, -74.095], [4.622, -74.055]];

// 6-step choropleth scale from light to dark green
const CHOROPLETH_STEPS = [
  { color: '#f0fdf4', label: '0' },
  { color: '#bbf7d0', label: '1–2' },
  { color: '#4ade80', label: '3–5' },
  { color: '#16a34a', label: '6–9' },
  { color: '#166534', label: '10–14' },
  { color: '#052e16', label: '15+' },
];

function choroplethColor(count: number): string {
  if (count === 0) return CHOROPLETH_STEPS[0].color;
  if (count <= 2) return CHOROPLETH_STEPS[1].color;
  if (count <= 5) return CHOROPLETH_STEPS[2].color;
  if (count <= 9) return CHOROPLETH_STEPS[3].color;
  if (count <= 14) return CHOROPLETH_STEPS[4].color;
  return CHOROPLETH_STEPS[5].color;
}

function FitBounds({ geoData }: { geoData: GeoData | null }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (geoData && !fitted.current) {
      map.fitBounds(SANTA_FE_BOUNDS, { padding: [10, 10] });
      fitted.current = true;
    }
  }, [geoData, map]);
  return null;
}

export default function MapPanel({ records }: { records: SurveyRecord[] }) {
  const [geoData, setGeoData] = useState<GeoData | null>(null);

  useEffect(() => {
    fetch('/geo/santafe-barrios.geojson').then(r => r.json()).then(setGeoData).catch(() => null);
  }, []);

  const barrioCount: Record<string, number> = {};
  const barrioTipos: Record<string, Record<string, number>> = {};
  const barrioScores: Record<string, number[]> = {};
  for (const r of records) {
    const b = r.barrio || 'Otro';
    barrioCount[b] = (barrioCount[b] || 0) + 1;
    if (!barrioTipos[b]) barrioTipos[b] = {};
    barrioTipos[b][r.tipo] = (barrioTipos[b][r.tipo] || 0) + 1;
    const avg = r.scores ? Object.values(r.scores).reduce((a, v) => a + v, 0) / Math.max(Object.values(r.scores).length, 1) : 0;
    if (!barrioScores[b]) barrioScores[b] = [];
    if (avg > 0) barrioScores[b].push(avg);
  }

  return (
    <div style={{ position: 'relative', height: '520px', width: '100%', borderRadius: '1.5rem', overflow: 'hidden' }}>
      <MapContainer
        center={[4.596, -74.075]}
        zoom={14}
        minZoom={13}
        maxZoom={17}
        maxBounds={SANTA_FE_BOUNDS}
        maxBoundsViscosity={1.0}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <FitBounds geoData={geoData} />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>

          <LayersControl.Overlay checked name="Vista por zonas (choropleth)">
            {geoData && (
              <GeoJSON
                key={JSON.stringify(barrioCount)}
                data={geoData as any}
                style={(feature: any) => {
                  const nombre = feature?.properties?.nombre as string;
                  const count = barrioCount[nombre] || 0;
                  return {
                    fillColor: choroplethColor(count),
                    fillOpacity: 0.75,
                    color: '#052e16',
                    weight: 2.5,
                  } as PathOptions;
                }}
                onEachFeature={(feature: any, layer: Layer) => {
                  const nombre = feature.properties.nombre as string;
                  const upz = feature.properties.upz as string;
                  const count = barrioCount[nombre] || 0;
                  const topTipos = Object.entries(barrioTipos[nombre] || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ') || 'N/A';
                  const scores = barrioScores[nombre] || [];
                  const avgScore = scores.length ? (scores.reduce((a, v) => a + v, 0) / scores.length).toFixed(1) : 'N/A';
                  (layer as any).bindTooltip(
                    `<div style="text-align:center;line-height:1.3"><b style="font-size:12px">${nombre}</b><br/><span style="font-size:13px;font-weight:700;color:#052e16">${count}</span></div>`,
                    { permanent: true, direction: 'center', className: 'choropleth-label' }
                  );
                  (layer as any).bindPopup(
                    `<div style="min-width:190px"><b>${nombre}</b><br/><span style="color:#555;font-size:11px">UPZ: ${upz}</span><hr style="margin:5px 0"/>` +
                    `<b>Encuestas:</b> ${count}<br/>` +
                    `<b>Tipos principales:</b> ${topTipos}<br/>` +
                    `<b>Score promedio:</b> ${avgScore}/5</div>`
                  );
                }}
              />
            )}
          </LayersControl.Overlay>

          <LayersControl.Overlay checked name="Puntos individuales">
            <>
              {records.map(r => (
                <CircleMarker
                  key={r.id}
                  center={[r.lat, r.lng]}
                  radius={r.geoPrecision === 'exacto' ? 7 : 5}
                  pathOptions={{ color: r.geoPrecision === 'exacto' ? '#166534' : '#ca8a04', fillColor: r.geoPrecision === 'exacto' ? '#4ade80' : '#fde047', fillOpacity: 0.85, weight: 1.5 }}
                >
                  <Popup>
                    <b>{r.nombre || 'Emprendimiento'}</b><br />
                    {r.barrio} — {r.upz}<br />
                    {r.tipo}<br />
                    <span style={{ color: '#666', fontSize: '11px' }}>Geo: {r.geoPrecision}</span>
                  </Popup>
                </CircleMarker>
              ))}
            </>
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>

      {/* Leyenda — dentro del contenedor con position relative, z-index alto */}
      <div style={{ position: 'absolute', bottom: '16px', left: '16px', zIndex: 1000, background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', padding: '10px 12px', fontSize: '11px', minWidth: '130px', pointerEvents: 'none' }}>
        <p style={{ fontWeight: 700, color: '#052e16', marginBottom: '6px', fontSize: '11px' }}>Encuestas por zona</p>
        {CHOROPLETH_STEPS.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: '1px solid #16653455', background: item.color, flexShrink: 0 }} />
            <span>{item.label}</span>
          </div>
        ))}
        <hr style={{ margin: '5px 0', borderColor: '#e2e8f0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}><div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #166534', background: '#4ade8066', flexShrink: 0 }} /><span>Exacto</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #ca8a04', background: '#fde04766', flexShrink: 0 }} /><span>Estimado</span></div>
      </div>

      <style>{`.choropleth-label { background: rgba(255,255,255,0.88) !important; border: none !important; box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important; font-size: 11px !important; font-weight: 600 !important; color: #052e16 !important; text-align: center !important; padding: 3px 6px !important; border-radius: 6px !important; }`}</style>
    </div>
  );
}
