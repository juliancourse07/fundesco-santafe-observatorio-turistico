'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
const MapPanel = dynamic(()=>import('./MapPanel'),{ssr:false});

export default function Dashboard(){
 const [data,setData]=useState<any>(null);
 const [summary,setSummary]=useState('');
 const [loading,setLoading]=useState(true);
 const [pdfLoading,setPdfLoading]=useState(false);

 useEffect(()=>{
  fetch('/api/respuestas',{cache:'no-store'}).then(r=>r.json()).then(async d=>{
   setData(d); setLoading(false);
   const ai=await fetch('/api/ai-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stats:d.stats})}).then(r=>r.json());
   setSummary(ai.summary);
  }).catch(e=>{setData({error:String(e)});setLoading(false)});
 },[]);

 const stats=data?.stats;

 async function handleDownloadPdf(){
  if(!data) return;
  setPdfLoading(true);
  try {
   const res=await fetch('/api/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stats,summary,updatedAt:data.updatedAt})});
   const blob=await res.blob();
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a'); a.href=url; a.download='informe-fundesco-santa-fe.pdf'; a.click();
   URL.revokeObjectURL(url);
  } finally { setPdfLoading(false); }
 }

 if(loading) return <main className="p-8">Cargando tablero Fundesco...</main>;
 if(data?.error) return <main className="p-8"><h1 className="text-2xl font-bold">Configura la fuente de datos</h1><p>{data.error}</p></main>;

 return <main className="min-h-screen">
  <section className="fundesco-gradient text-white px-6 py-10 md:px-12">
   <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end gap-6">
    <div className="flex-1">
     <p className="uppercase tracking-[.35em] text-sm text-fundesco-lime">Fundesco | Santa Fe</p>
     <h1 className="text-4xl md:text-6xl font-black mt-3">Mapa vivo de caracterización turística</h1>
     <p className="mt-4 max-w-3xl text-white/85">Actualización automática desde Google Sheets · Visual territorial por barrio/UPZ · Análisis integral con IA.</p>
     <p className="mt-3 text-sm text-white/70">Última lectura: {data.updatedAt}</p>
    </div>
    <button onClick={handleDownloadPdf} disabled={pdfLoading} className="shrink-0 bg-fundesco-lime text-fundesco-forest font-bold px-6 py-3 rounded-2xl hover:bg-lime-400 disabled:opacity-60 transition-colors">
     {pdfLoading ? 'Generando PDF…' : '⬇ Descargar informe PDF'}
    </button>
   </div>
  </section>

  <section className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-4">
   <Kpi label="Registros" value={stats.total}/>
   <Kpi label="Interés en rutas" value={stats.rutas}/>
   <Kpi label="Puntos exactos" value={stats.exactos}/>
   <Kpi label="Puntos estimados" value={stats.estimados}/>
  </section>

  <section className="max-w-7xl mx-auto px-6 grid lg:grid-cols-3 gap-6 items-start">
   <div className="card p-6 lg:col-span-2" style={{ position: 'relative', zIndex: 0 }}>
    <h2 className="text-2xl font-bold text-fundesco-forest mb-4">Mapa interactivo de avance</h2>
    <MapPanel records={data.records}/>
   </div>
   <div className="card p-6 overflow-auto" style={{ maxHeight: '620px' }}>
    <h2 className="text-2xl font-bold text-fundesco-forest">Análisis IA</h2>
    <SummaryText text={summary}/>
   </div>
  </section>

  {stats.formalizacion && (
  <section className="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-3 gap-6">
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-4">Formalización</h2>
    <StatBar label="Registro Mercantil" pct={stats.formalizacion.pctRegistroMercantil}/>
    <StatBar label="RNT" pct={stats.formalizacion.pctRNT}/>
    <StatBar label="RUT" pct={stats.formalizacion.pctRUT}/>
    <StatBar label="Facturación electrónica" pct={stats.formalizacion.pctFacturacionElectronica}/>
   </div>
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-4">Infraestructura</h2>
    <StatBar label="Sede física" pct={stats.infraestructura?.pctSedeFisica}/>
    <StatBar label="Señalización" pct={stats.infraestructura?.pctSeñalizacion}/>
    <StatBar label="Baños disponibles" pct={stats.infraestructura?.pctBanos}/>
    <StatBar label="Botiquín" pct={stats.infraestructura?.pctBotiquin}/>
    <StatBar label="Conectividad" pct={stats.infraestructura?.pctConectividad}/>
   </div>
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-4">Empleo</h2>
    {stats.empleo && (<>
     <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Empleos formales</span><span className="font-bold text-fundesco-forest">{stats.empleo.totalFormales}</span></div>
     <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Empleos informales</span><span className="font-bold">{stats.empleo.totalInformales}</span></div>
     <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Mujeres vinculadas</span><span className="font-bold">{stats.empleo.totalMujeres}</span></div>
     <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Jóvenes</span><span className="font-bold">{stats.empleo.totalJovenes}</span></div>
     <div className="flex justify-between py-1"><span className="text-sm text-slate-600">Adultos mayores</span><span className="font-bold">{stats.empleo.totalMayores60}</span></div>
    </>)}
   </div>
  </section>
  )}

  <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6">
   <Chart title="Top barrios" data={stats.byBarrio}/>
   <Chart title="Tipos de emprendimiento" data={stats.byTipo}/>
   <Chart title="Necesidades de apoyo" data={stats.necesidades}/>
   <div className="card p-6">
    <h2 className="text-xl font-bold mb-4">Capacidades promedio</h2>
    <ResponsiveContainer width="100%" height={330}>
     <RadarChart data={stats.scores}>
      <PolarGrid/><PolarAngleAxis dataKey="name"/><PolarRadiusAxis domain={[0,5]}/>
      <Radar dataKey="value" stroke="#178C72" fill="#178C72" fillOpacity={0.35}/><Tooltip/>
     </RadarChart>
    </ResponsiveContainer>
   </div>
  </section>

  {stats.avanceBarrio && stats.avanceBarrio.length > 0 && (
  <section className="max-w-7xl mx-auto px-6 py-4 mb-8">
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-4">Detalle por barrio</h2>
    <div className="overflow-x-auto">
     <table className="w-full text-sm">
      <thead>
       <tr className="bg-fundesco-forest text-white">
        <th className="px-3 py-2 text-left rounded-tl-lg">Barrio</th>
        <th className="px-3 py-2 text-center">Encuestas</th>
        <th className="px-3 py-2 text-center">% del total</th>
        <th className="px-3 py-2 text-center">Score prom.</th>
        <th className="px-3 py-2 text-center rounded-tr-lg">% con RNT</th>
       </tr>
      </thead>
      <tbody>
       {stats.avanceBarrio.map((b: any, i: number) => (
        <tr key={b.nombre} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
         <td className="px-3 py-2 font-medium text-fundesco-forest">{b.nombre}</td>
         <td className="px-3 py-2 text-center font-bold">{b.cantidad}</td>
         <td className="px-3 py-2 text-center">{b.pctTotal}%</td>
         <td className="px-3 py-2 text-center">
          <span className={`font-bold ${b.scorePromedio >= 3.5 ? 'text-green-700' : b.scorePromedio >= 2.5 ? 'text-yellow-600' : 'text-red-600'}`}>
           {b.scorePromedio > 0 ? b.scorePromedio.toFixed(1) : '—'}/5
          </span>
         </td>
         <td className="px-3 py-2 text-center">{b.pctRNT !== undefined ? `${b.pctRNT}%` : '—'}</td>
        </tr>
       ))}
      </tbody>
     </table>
    </div>
   </div>
  </section>
  )}
 </main>;
}

function SummaryText({text}:{text:string}){
 if(!text) return <p className="mt-4 text-slate-500 text-sm">Generando análisis…</p>;
 const lines = text.split('\n');
 return <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
  {lines.map((line,i)=>{
   const h2=line.startsWith('## ');
   const h3=line.startsWith('### ');
   const clean=line.replace(/^#{1,3}\s+/,'');
   if(h2) return <h3 key={i} className="font-bold text-fundesco-forest border-b border-fundesco-lime pb-1 mt-4">{clean}</h3>;
   if(h3) return <h4 key={i} className="font-semibold text-fundesco-forest mt-3">{clean}</h4>;
   if(line.trim()==='') return <div key={i} className="h-2"/>;
   return <p key={i}>{line}</p>;
  })}
 </div>;
}

function StatBar({label,pct}:{label:string;pct:number|undefined}){
 const v=pct??0;
 return <div className="mb-3">
  <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">{label}</span><span className="font-bold text-fundesco-forest">{v}%</span></div>
  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
   <div className="h-full bg-fundesco-forest rounded-full" style={{width:`${v}%`}}/>
  </div>
 </div>;
}

function Kpi({label,value}:{label:string;value:any}){
 return <div className="card p-5"><p className="text-sm text-slate-500">{label}</p><p className="text-4xl font-black text-fundesco-forest mt-2">{value}</p></div>;
}

function Chart({title,data}:{title:string;data:any[]}){
 return <div className="card p-6"><h2 className="text-xl font-bold mb-4">{title}</h2>
  <ResponsiveContainer width="100%" height={330}>
   <BarChart data={data} layout="vertical" margin={{left:20,right:20}}>
    <CartesianGrid strokeDasharray="3 3"/>
    <XAxis type="number" allowDecimals={false}/>
    <YAxis type="category" dataKey="name" width={140}/>
    <Tooltip/>
    <Bar dataKey="value" fill="#178C72" radius={[0,8,8,0]}/>
   </BarChart>
  </ResponsiveContainer>
 </div>;
}
