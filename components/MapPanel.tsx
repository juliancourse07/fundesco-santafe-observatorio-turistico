 'use client';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
export default function MapPanel({records}:{records:any[]}){
  return <MapContainer center={[4.596,-74.073]} zoom={13} scrollWheelZoom className="h-[520px] w-full rounded-3xl">
    <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    {records.map(r=><CircleMarker key={r.id} center={[r.lat,r.lng]} radius={r.geoPrecision==='exacto'?8:6} pathOptions={{color:r.geoPrecision==='exacto'?'#178C72':'#F2B705', fillOpacity:.75}}>
      <Popup><b>{r.nombre || 'Emprendimiento'}</b><br/>{r.barrio} - {r.upz}<br/>{r.tipo}<br/>Geo: {r.geoPrecision}</Popup>
    </CircleMarker>)}
  </MapContainer>
}
