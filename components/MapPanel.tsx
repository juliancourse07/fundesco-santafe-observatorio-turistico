'use client';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Tooltip, LayersControl } from 'react-leaflet';
import type { Layer, PathOptions } from 'leaflet';

type SurveyRecord = { id: string; nombre: string; barrio: string; upz: string; tipo: string; lat: number; lng: number; geoPrecision: string; scores?: Record<string, number>; };
type GeoFeature = { type: string; properties: { nombre: string; upz: string }; geometry: object };
type GeoData = { type: string; features: GeoFeature[] };

function choroplethColor(count: number, max: number): string {
  if (max === 0 || count === 0) return '#d1fae5';
  const t = count / max;
  if (t < 0.25) return '#a7f3d0';
  if (t < 0.5) return '#6ee7b7';
  if (t < 0.75) return '#178C72';
  return '#0f5c4b';
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
  const maxCount = Math.max(...Object.values(barrioCount), 1);

  const legendItems = [
    { color: '#d1fae5', label: '0' },
    { color: '#a7f3d0', label: '1-25%' },
    { color: '#6ee7b7', label: '26-50%' },
    { color: '#178C72', label: '51-75%' },
    { color: '#0f5c4b', label: '76-100%' },
  ];

  return (
    <div className="relative">
      <MapContainer center={[4.596, -74.073]} zoom={13} scrollWheelZoom className="h-[520px] w-full rounded-3xl">
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
                    fillColor: choroplethColor(count, maxCount),
                    fillOpacity: 0.7,
                    color: '#178C72',
                    weight: 2,
                  } as PathOptions;
                }}
                onEachFeature={(feature: any, layer: Layer) => {
                  const nombre = feature.properties.nombre as string;
                  const upz = feature.properties.upz as string;
                  const count = barrioCount[nombre] || 0;
                  const topTipos = Object.entries(barrioTipos[nombre] || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ') || 'N/A';
                  const scores = barrioScores[nombre] || [];
                  const avgScore = scores.length ? (scores.reduce((a, v) => a + v, 0) / scores.length).toFixed(1) : 'N/A';
                  (layer as any).bindTooltip(`<b>${nombre}</b><br/>${count} encuestas`, {
                    permanent: true,
                    direction: 'center',
                    className: 'choropleth-label',
                  });
                  (layer as any).bindPopup(
                    `<div style="min-width:180px"><b>${nombre}</b><br/><span style="color:#555">UPZ: ${upz}</span><hr style="margin:4px 0"/>` +
                    `<b>Encuestas:</b> ${count}<br/>` +
                    `<b>Tipos:</b> ${topTipos}<br/>` +
                    `<b>Score promedio:</b> ${avgScore}</div>`
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
                  radius={r.geoPrecision === 'exacto' ? 8 : 6}
                  pathOptions={{ color: r.geoPrecision === 'exacto' ? '#178C72' : '#F2B705', fillOpacity: 0.75 }}
                >
                  <Popup>
                    <b>{r.nombre || 'Emprendimiento'}</b><br />
                    {r.barrio} - {r.upz}<br />
                    {r.tipo}<br />
                    Geo: {r.geoPrecision}
                  </Popup>
                </CircleMarker>
              ))}
            </>
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>

      {/* Leyenda */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-xl shadow-lg px-3 py-2 text-xs space-y-1">
        <p className="font-bold text-fundesco-forest mb-1">Encuestas por zona</p>
        {legendItems.map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-fundesco-forest/40" style={{ background: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
        <hr className="my-1" />
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-fundesco-forest bg-fundesco-forest/40" /><span>Exacto</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-yellow-500 bg-yellow-400/40" /><span>Estimado</span></div>
      </div>

      <style>{`.choropleth-label { background:rgba(255,255,255,0.85); border:none; box-shadow:none; font-size:11px; font-weight:600; color:#0f5c4b; text-align:center; }`}</style>
    </div>
  );
}
