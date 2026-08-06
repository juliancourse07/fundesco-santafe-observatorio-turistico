'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Cell, Pie, PieChart, Legend } from 'recharts';
const MapPanel = dynamic(()=>import('./MapPanel'),{ssr:false});

const COLORES = ['#178C72','#B5D334','#10483D','#F2B705','#4ade80','#60a5fa','#f87171','#a78bfa'];

export default function Dashboard(){
 const [data,setData]=useState<any>(null);
 const [summary,setSummary]=useState('');
 const [loading,setLoading]=useState(true);
 const [pdfLoading,setPdfLoading]=useState(false);
 const [pdfStep,setPdfStep]=useState('');
 const mapRef=useRef<HTMLDivElement>(null);

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
  let mapImageBase64='';
  try {
   setPdfStep('Capturando mapa…');
   if(mapRef.current){
    const html2canvas=(await import('html2canvas')).default;
    const canvas=await html2canvas(mapRef.current,{useCORS:true,allowTaint:false,scale:1.5,logging:false});
    mapImageBase64=canvas.toDataURL('image/jpeg',0.82);
   }
  } catch {
   mapImageBase64='';
  }
  try {
   setPdfStep('Generando PDF…');
   const res=await fetch('/api/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stats,summary,updatedAt:data.updatedAt,mapImageBase64})});
   const blob=await res.blob();
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a'); a.href=url; a.download='informe-fundesco-santa-fe.pdf'; a.click();
   URL.revokeObjectURL(url);
  } finally { setPdfLoading(false); setPdfStep(''); }
 }

 if(loading) return (
  <main className="p-8 min-h-screen flex items-center justify-center">
   <div className="text-center">
    <div className="w-12 h-12 border-4 border-fundesco-green border-t-transparent rounded-full animate-spin mx-auto mb-4" role="status" aria-label="Cargando"/>
    <p className="text-fundesco-forest font-semibold">Cargando tablero Fundesco…</p>
   </div>
  </main>
 );
 if(data?.error) return (
  <main className="p-8 min-h-screen">
   <div className="max-w-xl mx-auto card p-8 text-center">
    <h1 className="text-2xl font-bold text-fundesco-forest mb-3">Configura la fuente de datos</h1>
    <p className="text-slate-600">{data.error}</p>
    <p className="mt-4 text-sm text-slate-400">Define <code className="bg-slate-100 px-1 rounded">GOOGLE_SHEETS_CSV_URL</code> o <code className="bg-slate-100 px-1 rounded">GOOGLE_APPS_SCRIPT_URL</code> en las variables de entorno.</p>
   </div>
  </main>
 );

 return <main className="min-h-screen">
  {/* Header */}
  <section className="fundesco-gradient text-white px-6 py-10 md:px-12">
   <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end gap-6">
    <div className="flex-1">
     <p className="uppercase tracking-[.35em] text-sm text-fundesco-lime">Fundesco | Santa Fe</p>
     <h1 className="text-4xl md:text-6xl font-black mt-3">Observatorio Turístico</h1>
     <p className="mt-2 text-xl font-light opacity-80">Mapa vivo de caracterización turística</p>
     <p className="mt-3 max-w-3xl text-white/85 text-sm">Actualización automática desde Google Sheets · Visual territorial por barrio/UPZ · Análisis integral con IA.</p>
     <p className="mt-2 text-xs text-white/60">Última lectura: {data.updatedAt} {stats.fechaInicio && stats.fechaFin && `· Período: ${stats.fechaInicio} – ${stats.fechaFin}`}</p>
    </div>
    <div className="shrink-0 flex flex-col gap-2 items-end">
     <button onClick={handleDownloadPdf} disabled={pdfLoading} aria-label="Descargar informe en PDF"
      className="bg-fundesco-lime text-fundesco-forest font-bold px-6 py-3 rounded-2xl hover:bg-lime-400 disabled:opacity-60 transition-colors">
      {pdfLoading ? (pdfStep || 'Procesando…') : '⬇ Descargar informe PDF'}
     </button>
     {pdfLoading && <div className="w-40 h-1.5 bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-fundesco-lime rounded-full animate-pulse w-3/4"/></div>}
    </div>
   </div>
  </section>

  {/* KPIs */}
  <section className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4" aria-label="Indicadores clave">
   <Kpi label="Registros" value={stats.total}/>
   <Kpi label="Interés en rutas" value={stats.rutas}/>
   <Kpi label="Puntos exactos" value={stats.exactos}/>
   <Kpi label="Puntos estimados" value={stats.estimados}/>
   <Kpi label="Tasa completitud" value={`${stats.tasaCompletitud??0}%`}/>
   <Kpi label="Empleo total" value={(stats.empleo?.totalFormales??0)+(stats.empleo?.totalInformales??0)}/>
  </section>

  {/* Mapa + IA */}
  <section className="max-w-7xl mx-auto px-6 grid lg:grid-cols-3 gap-6 items-start">
   <div className="card p-6 lg:col-span-2" style={{position:'relative',zIndex:0}}>
    <h2 className="text-2xl font-bold text-fundesco-forest mb-4">Mapa interactivo de avance</h2>
    <div ref={mapRef} style={{borderRadius:'1.5rem',overflow:'hidden'}}>
     <MapPanel records={data.records}/>
    </div>
   </div>
   <div className="card p-6 overflow-auto" style={{maxHeight:'620px'}}>
    <h2 className="text-2xl font-bold text-fundesco-forest">Análisis IA</h2>
    {!summary && <div className="mt-4 flex items-center gap-2 text-slate-400 text-sm"><div className="w-4 h-4 border-2 border-fundesco-green border-t-transparent rounded-full animate-spin"/><span>Generando análisis…</span></div>}
    <SummaryText text={summary}/>
   </div>
  </section>

  {/* Formalización, Infraestructura, Empleo */}
  {stats.formalizacion && (
  <section className="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-3 gap-6" aria-label="Formalización, infraestructura y empleo">
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-4">Formalización</h2>
    <StatBar label="Registro Mercantil" pct={stats.formalizacion.pctRegistroMercantil}/>
    <StatBar label="RNT" pct={stats.formalizacion.pctRNT}/>
    <StatBar label="RUT" pct={stats.formalizacion.pctRUT}/>
    <StatBar label="Facturación electrónica" pct={stats.formalizacion.pctFacturacionElectronica}/>
    <StatBar label="Afiliación SS" pct={stats.formalizacion.pctAfiliacionSS}/>
    <StatBar label="Seguro RC" pct={stats.formalizacion.pctSeguro}/>
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
     <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Adultos mayores</span><span className="font-bold">{stats.empleo.totalMayores60}</span></div>
     <div className="flex justify-between py-1"><span className="text-sm text-slate-600">Población diversa</span><span className="font-bold">{stats.empleo.totalDiversidad}</span></div>
    </>)}
   </div>
  </section>
  )}

  {/* Gráficos principales */}
  <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6" aria-label="Distribuciones principales">
   <Chart title="Top barrios" data={stats.byBarrio} nota={`n=${stats.total}`}/>
   <Chart title="Tipos de emprendimiento" data={stats.byTipo} nota={`n=${stats.total}`}/>
   <Chart title="Necesidades de apoyo" data={stats.necesidades} nota={`n=${stats.total}`}/>
   <div className="card p-6">
    <h2 className="text-xl font-bold mb-1">Capacidades promedio</h2>
    <p className="text-xs text-slate-400 mb-3">Escala 1–5 · n={stats.total}</p>
    <ResponsiveContainer width="100%" height={330}>
     <RadarChart data={stats.scores}>
      <PolarGrid/><PolarAngleAxis dataKey="name"/><PolarRadiusAxis domain={[0,5]}/>
      <Radar dataKey="value" stroke="#178C72" fill="#178C72" fillOpacity={0.35}/><Tooltip/>
     </RadarChart>
    </ResponsiveContainer>
   </div>
  </section>

  {/* Series temporales */}
  {stats.byFecha && stats.byFecha.length > 1 && (
  <section className="max-w-7xl mx-auto px-6 py-4">
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-1">Evolución de recolección</h2>
    <p className="text-xs text-slate-400 mb-3">Encuestas por día · n={stats.total}</p>
    <ResponsiveContainer width="100%" height={220}>
     <LineChart data={stats.byFecha} margin={{left:0,right:20}}>
      <CartesianGrid strokeDasharray="3 3"/>
      <XAxis dataKey="fecha" tick={{fontSize:10}} interval="preserveStartEnd"/>
      <YAxis allowDecimals={false}/>
      <Tooltip/>
      <Line dataKey="value" stroke="#178C72" dot={false} strokeWidth={2} name="Encuestas"/>
     </LineChart>
    </ResponsiveContainer>
   </div>
  </section>
  )}

  {/* Perfil, Mercado */}
  <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6" aria-label="Perfil y mercado">
   {stats.perfilEmprendedores?.topGenero?.length > 0 && (
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-1">Género de representantes</h2>
    <p className="text-xs text-slate-400 mb-3">n={stats.total}</p>
    <ResponsiveContainer width="100%" height={220}>
     <PieChart>
      <Pie data={stats.perfilEmprendedores.topGenero} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent}:any)=>`${name??''} ${((percent??0)*100).toFixed(0)}%`}>
       {stats.perfilEmprendedores.topGenero.map((_:any,i:number)=><Cell key={i} fill={COLORES[i%COLORES.length]}/>)}
      </Pie>
      <Tooltip/><Legend/>
     </PieChart>
    </ResponsiveContainer>
   </div>
   )}
   {stats.perfilEmprendedores?.topEducacion?.length > 0 && (
    <Chart title="Nivel educativo representantes" data={stats.perfilEmprendedores.topEducacion} nota={`n=${stats.total}`}/>
   )}
   {stats.productoMercado?.topSegmentos?.length > 0 && (
    <Chart title="Segmentos de mercado" data={stats.productoMercado.topSegmentos} nota={`n=${stats.total}`}/>
   )}
   {stats.productoMercado?.topIdiomas?.length > 0 && (
    <Chart title="Idiomas de atención" data={stats.productoMercado.topIdiomas} nota={`n=${stats.total}`}/>
   )}
  </section>

  {/* Canales digitales, Sostenibilidad */}
  <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6">
   {stats.topCanales?.length > 0 && <Chart title="Canales digitales" data={stats.topCanales} nota={`n=${stats.total}`}/>}
   {stats.topPracticasSostenibilidad?.length > 0 && <Chart title="Prácticas de sostenibilidad" data={stats.topPracticasSostenibilidad} nota={`n=${stats.total}`}/>}
   {stats.topNecesidadesCapacitacion?.length > 0 && <Chart title="Necesidades de capacitación" data={stats.topNecesidadesCapacitacion} nota={`n=${stats.total}`}/>}
   {stats.topEncuestadores?.length > 0 && <Chart title="Encuestas por encuestador/a" data={stats.topEncuestadores} nota={`n=${stats.total}`}/>}
  </section>

  {/* Completitud */}
  {stats.completitudDist?.length > 0 && (
  <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6">
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-1">Completitud de registros</h2>
    <p className="text-xs text-slate-400 mb-3">Tasa de completitud: {stats.tasaCompletitud}% · n={stats.total}</p>
    <ResponsiveContainer width="100%" height={220}>
     <PieChart>
      <Pie data={stats.completitudDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent}:any)=>`${name??''} ${((percent??0)*100).toFixed(0)}%`}>
       {stats.completitudDist.map((_:any,i:number)=><Cell key={i} fill={COLORES[i%COLORES.length]}/>)}
      </Pie>
      <Tooltip/><Legend/>
     </PieChart>
    </ResponsiveContainer>
   </div>
  </section>
  )}

  {/* Preparación */}
  {stats.preparacion && (
  <section className="max-w-7xl mx-auto px-6 py-4">
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-4">Niveles de preparación turística (promedio /5)</h2>
    <div className="grid md:grid-cols-3 gap-4">
     <NivelCard label="Interés en fortalecer" value={stats.preparacion.promedioInteresFortalecer}/>
     <NivelCard label="Preparación para turistas" value={stats.preparacion.promedioPreparacionTuristas}/>
     <NivelCard label="Aporte al turismo" value={stats.preparacion.promedioAporteTurismo}/>
    </div>
   </div>
  </section>
  )}

  {/* Tabla por barrio */}
  {stats.avanceBarrio && stats.avanceBarrio.length > 0 && (
  <section className="max-w-7xl mx-auto px-6 py-4 mb-8">
   <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-4">Detalle por barrio</h2>
    <div className="overflow-x-auto">
     <table className="w-full text-sm" aria-label="Encuestas por barrio">
      <thead>
       <tr className="bg-fundesco-forest text-white">
        <th className="px-3 py-2 text-left rounded-tl-lg">Barrio</th>
        <th className="px-3 py-2 text-center">Encuestas</th>
        <th className="px-3 py-2 text-center">% del total</th>
        <th className="px-3 py-2 text-center">Score prom.</th>
        <th className="px-3 py-2 text-center">% RNT</th>
        <th className="px-3 py-2 text-center rounded-tr-lg">% Reg. Merc.</th>
       </tr>
      </thead>
      <tbody>
       {stats.avanceBarrio.map((b:any,i:number)=>(
        <tr key={b.nombre} className={i%2===0?'bg-white':'bg-slate-50'}>
         <td className="px-3 py-2 font-medium text-fundesco-forest">{b.nombre}</td>
         <td className="px-3 py-2 text-center font-bold">{b.cantidad}</td>
         <td className="px-3 py-2 text-center">{b.pctTotal}%</td>
         <td className="px-3 py-2 text-center"><span className={`font-bold ${b.scorePromedio>=3.5?'text-green-700':b.scorePromedio>=2.5?'text-yellow-600':'text-red-600'}`}>{b.scorePromedio>0?b.scorePromedio.toFixed(1):'—'}/5</span></td>
         <td className="px-3 py-2 text-center">{b.pctRNT!==undefined?`${b.pctRNT}%`:'—'}</td>
         <td className="px-3 py-2 text-center">{b.pctRegistroMercantil!==undefined?`${b.pctRegistroMercantil}%`:'—'}</td>
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
 if(!text) return null;
 const lines=text.split('\n');
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
  <div className="h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
   <div className="h-full bg-fundesco-forest rounded-full transition-all" style={{width:`${v}%`}}/>
  </div>
 </div>;
}

function Kpi({label,value}:{label:string;value:any}){
 return <div className="card p-5"><p className="text-sm text-slate-500">{label}</p><p className="text-4xl font-black text-fundesco-forest mt-2">{value}</p></div>;
}

function NivelCard({label,value}:{label:string;value:number}){
 const color=value>=4?'text-green-700':value>=3?'text-yellow-600':'text-red-600';
 return <div className="bg-slate-50 rounded-xl p-4 text-center">
  <p className="text-sm text-slate-500 mb-1">{label}</p>
  <p className={`text-3xl font-black ${color}`}>{value>0?value.toFixed(1):'—'}</p>
  <p className="text-xs text-slate-400">/ 5</p>
 </div>;
}

function Chart({title,data,nota}:{title:string;data:any[];nota?:string}){
 return <div className="card p-6">
  <h2 className="text-xl font-bold mb-1">{title}</h2>
  {nota && <p className="text-xs text-slate-400 mb-3">{nota}</p>}
  <ResponsiveContainer width="100%" height={330}>
   <BarChart data={data} layout="vertical" margin={{left:20,right:20}}>
    <CartesianGrid strokeDasharray="3 3"/>
    <XAxis type="number" allowDecimals={false}/>
    <YAxis type="category" dataKey="name" width={140} tick={{fontSize:11}}/>
    <Tooltip/>
    <Bar dataKey="value" fill="#178C72" radius={[0,8,8,0]}/>
   </BarChart>
  </ResponsiveContainer>
 </div>;
}
