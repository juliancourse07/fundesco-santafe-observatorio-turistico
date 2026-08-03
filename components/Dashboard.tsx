 'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
const MapPanel = dynamic(()=>import('./MapPanel'),{ssr:false});
export default function Dashboard(){
 const [data,setData]=useState<any>(null); const [summary,setSummary]=useState(''); const [loading,setLoading]=useState(true);
 useEffect(()=>{ fetch('/api/respuestas',{cache:'no-store'}).then(r=>r.json()).then(async d=>{ setData(d); setLoading(false); const ai=await fetch('/api/ai-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stats:d.stats})}).then(r=>r.json()); setSummary(ai.summary); }).catch(e=>{setData({error:String(e)});setLoading(false)}); },[]);
 const stats=data?.stats;
 if(loading) return <main className="p-8">Cargando tablero Fundesco...</main>;
 if(data?.error) return <main className="p-8"><h1 className="text-2xl font-bold">Configura la fuente de datos</h1><p>{data.error}</p></main>;
 return <main className="min-h-screen">
  <section className="fundesco-gradient text-white px-6 py-10 md:px-12">
   <div className="max-w-7xl mx-auto"><p className="uppercase tracking-[.35em] text-sm text-fundesco-lime">Fundesco | Santa Fe</p><h1 className="text-4xl md:text-6xl font-black mt-3">Mapa vivo de caracterizacion turistica</h1><p className="mt-4 max-w-3xl text-white/85">Actualizacion automatica desde Google Sheets, visual territorial por barrio/UPZ y resumen inteligente con IA.</p><p className="mt-3 text-sm text-white/70">Ultima lectura: {data.updatedAt}</p></div>
  </section>
  <section className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-4">
   <Kpi label="Registros" value={stats.total}/><Kpi label="Interes en rutas" value={stats.rutas}/><Kpi label="Puntos exactos" value={stats.exactos}/><Kpi label="Puntos estimados" value={stats.estimados}/>
  </section>
  <section className="max-w-7xl mx-auto px-6 grid lg:grid-cols-3 gap-6">
   <div className="card p-6 lg:col-span-2"><h2 className="text-2xl font-bold text-fundesco-forest mb-4">Mapa interactivo de avance</h2><MapPanel records={data.records}/></div>
   <div className="card p-6"><h2 className="text-2xl font-bold text-fundesco-forest">Resumen IA</h2><p className="mt-4 leading-7 text-slate-700">{summary}</p><div className="mt-6 rounded-2xl bg-fundesco-cream p-4 text-sm">Sugerencia: filtra registros estimados y exige latitud/longitud para aumentar precision cartografica.</div></div>
  </section>
  <section className="max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-2 gap-6">
   <Chart title="Top barrios" data={stats.byBarrio}/><Chart title="Tipos de emprendimiento" data={stats.byTipo}/><Chart title="Necesidades de apoyo" data={stats.necesidades}/><div className="card p-6"><h2 className="text-xl font-bold mb-4">Capacidades promedio</h2><ResponsiveContainer width="100%" height={330}><RadarChart data={stats.scores}><PolarGrid/><PolarAngleAxis dataKey="name"/><PolarRadiusAxis domain={[0,5]}/><Radar dataKey="value" stroke="#178C72" fill="#178C72" fillOpacity={0.35}/><Tooltip/></RadarChart></ResponsiveContainer></div>
  </section>
 </main>
}
function Kpi({label,value}:{label:string;value:any}){ return <div className="card p-5"><p className="text-sm text-slate-500">{label}</p><p className="text-4xl font-black text-fundesco-forest mt-2">{value}</p></div> }
function Chart({title,data}:{title:string;data:any[]}){ return <div className="card p-6"><h2 className="text-xl font-bold mb-4">{title}</h2><ResponsiveContainer width="100%" height={330}><BarChart data={data} layout="vertical" margin={{left:20,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={140}/><Tooltip/><Bar dataKey="value" fill="#178C72" radius={[0,8,8,0]}/></BarChart></ResponsiveContainer></div> }
