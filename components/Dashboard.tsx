'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildDeterministicAnalysis } from '@/lib/analysis';
import SantafeContextGallery from './SantafeContextGallery';

const MapPanel = dynamic(() => import('./MapPanel'), { ssr: false });
const COLORES = ['#178C72', '#B5D334', '#10483D', '#F2B705', '#4ade80', '#60a5fa', '#f87171', '#a78bfa'];

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfStep, setPdfStep] = useState('');

  useEffect(() => {
    fetch('/api/respuestas', { cache: 'no-store' }).then(r => r.json()).then(async d => {
      setData(d);
      setLoading(false);
      const ai = await fetch('/api/ai-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stats: d.stats }) }).then(r => r.json());
      setSummary(ai.summary);
    }).catch(e => {
      setData({ error: String(e) });
      setLoading(false);
    });
  }, []);

  const stats = data?.stats;
  const analysis = useMemo(() => stats ? buildDeterministicAnalysis(stats) : null, [stats]);

  async function handleDownloadPdf() {
    if (!data) return;
    setPdfLoading(true);
    try {
      setPdfStep('Generando PDF...');
      const res = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stats, summary, updatedAt: data.updatedAt }) });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'informe-fundesco-santa-fe.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
      setPdfStep('');
    }
  }

  if (loading) return (
    <main className="p-8 min-h-screen flex items-center justify-center" lang="es">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-fundesco-green border-t-transparent rounded-full animate-spin mx-auto mb-4" role="status" aria-label="Cargando" />
        <p className="text-fundesco-forest font-semibold">Cargando tablero Fundesco...</p>
      </div>
    </main>
  );

  if (data?.error) return (
    <main className="p-8 min-h-screen" lang="es">
      <div className="max-w-xl mx-auto card p-8 text-center">
        <h1 className="text-2xl font-bold text-fundesco-forest mb-3">Configura la fuente de datos</h1>
        <p className="text-slate-600">{data.error}</p>
        <p className="mt-4 text-sm text-slate-400">Define <code className="bg-slate-100 px-1 rounded">GOOGLE_SHEETS_CSV_URL</code> o <code className="bg-slate-100 px-1 rounded">GOOGLE_APPS_SCRIPT_URL</code> en las variables de entorno.</p>
      </div>
    </main>
  );

  return <main className="min-h-screen" lang="es">
    <section className="fundesco-gradient text-white px-6 py-10 md:px-12">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end gap-6">
        <div className="flex-1">
          <p className="uppercase tracking-[.35em] text-sm text-fundesco-lime">Fundesco | Santa Fe</p>
          <h1 className="text-4xl md:text-6xl font-black mt-3">Observatorio Turístico</h1>
          <p className="mt-2 text-xl font-light opacity-80">Mapa vivo de caracterización turística</p>
          <p className="mt-3 max-w-3xl text-white/85 text-sm text-justify [hyphens:auto]">Actualización automática desde Google Sheets, lectura territorial por barrio/UPZ, índice sintético de madurez e interpretación compartida entre tablero y PDF.</p>
          <p className="mt-2 text-xs text-white/60">Última lectura: {data.updatedAt} {stats.fechaInicio && stats.fechaFin && `· Período: ${stats.fechaInicio} - ${stats.fechaFin}`}</p>
        </div>
        <div className="shrink-0 flex flex-col gap-2 items-end">
          <button onClick={handleDownloadPdf} disabled={pdfLoading} aria-label="Descargar informe en PDF"
            className="bg-fundesco-lime text-fundesco-forest font-bold px-6 py-3 rounded-2xl hover:bg-lime-400 disabled:opacity-60 transition-colors">
            {pdfLoading ? (pdfStep || 'Procesando...') : '⬇ Descargar informe PDF'}
          </button>
          {pdfLoading && <div className="w-40 h-1.5 bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-fundesco-lime rounded-full animate-pulse w-3/4" /></div>}
        </div>
      </div>
    </section>

    <section className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4" aria-label="Indicadores clave">
      <Kpi label="Registros" value={stats.total} />
      <Kpi label="Interés en rutas" value={stats.rutas} />
      <Kpi label="Puntos exactos" value={stats.exactos} />
      <Kpi label="Puntos estimados" value={stats.estimados} />
      <Kpi label="Tasa completitud" value={`${stats.tasaCompletitud ?? 0}%`} />
      <Kpi label="Empleo total" value={(stats.empleo?.totalFormales ?? 0) + (stats.empleo?.totalInformales ?? 0)} />
    </section>

    {analysis && (
      <section className="max-w-7xl mx-auto px-6 pb-6 grid xl:grid-cols-4 gap-6 items-start">
        <div className="card p-6 xl:col-span-2">
          <h2 className="text-2xl font-bold text-fundesco-forest mb-4">Hallazgos clave</h2>
          <ul className="space-y-3 text-sm text-slate-700 list-disc pl-5">
            {analysis.hallazgos.slice(0, 6).map((item) => <li key={item} className="text-justify [hyphens:auto]">{item}</li>)}
          </ul>
        </div>
        <div className="card p-6">
          <h2 className="text-2xl font-bold text-fundesco-forest mb-4">Brechas críticas</h2>
          <ul className="space-y-3 text-sm text-slate-700 list-disc pl-5">
            {analysis.brechasYRiesgos.slice(0, 5).map((item) => <li key={item} className="text-justify [hyphens:auto]">{item}</li>)}
          </ul>
        </div>
        <div className="space-y-6">
          <div className="card p-6">
            <p className="text-sm text-slate-500">Índice de madurez</p>
            <p className="text-5xl font-black text-fundesco-forest mt-2">{analysis.maturity.score}</p>
            <p className="text-sm font-semibold text-fundesco-green mt-2">Nivel {analysis.maturity.level}</p>
            <p className="text-xs text-slate-500 mt-3 text-justify [hyphens:auto]">{analysis.maturity.formula}</p>
          </div>
          <div className="card p-6">
            <p className="text-sm text-slate-500">Concentración territorial</p>
            <p className="text-2xl font-black text-fundesco-forest mt-2">HHI {analysis.concentration.hhi}</p>
            <p className="text-sm text-slate-600 mt-2">Top barrio: <span className="font-bold text-fundesco-forest">{analysis.concentration.topBarrio}</span> ({analysis.concentration.topShare}%)</p>
            <p className="text-sm text-slate-600">Top 3 barrios: {analysis.concentration.top3Share}%</p>
          </div>
        </div>
      </section>
    )}

    <section className="max-w-7xl mx-auto px-6 grid lg:grid-cols-3 gap-6 items-start">
      <div className="card p-6 lg:col-span-2" style={{ position: 'relative', zIndex: 0 }}>
        <h2 className="text-2xl font-bold text-fundesco-forest mb-4">Mapa interactivo de avance</h2>
        <div style={{ borderRadius: '1.5rem', overflow: 'hidden' }}>
          <MapPanel records={data.records} />
        </div>
      </div>
      <div className="space-y-6">
        <div className="card p-6 overflow-auto" style={{ maxHeight: '620px' }}>
          <h2 className="text-2xl font-bold text-fundesco-forest">Análisis IA</h2>
          {!summary && <div className="mt-4 flex items-center gap-2 text-slate-400 text-sm"><div className="w-4 h-4 border-2 border-fundesco-green border-t-transparent rounded-full animate-spin" /><span>Generando análisis...</span></div>}
          <SummaryText text={summary} />
        </div>
        {analysis && <div className="card p-6">
          <h2 className="text-2xl font-bold text-fundesco-forest mb-3">Nota metodológica</h2>
          <div className="space-y-3 text-sm text-slate-700">
            {analysis.methodology.paragraphs.map((item) => <p key={item} className="text-justify [hyphens:auto]">{item}</p>)}
          </div>
        </div>}
      </div>
    </section>

    <SantafeContextGallery />

    {analysis && (
      <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fundesco-forest mb-4">Desagregación del índice de madurez</h2>
          <div className="space-y-4">
            {analysis.maturity.components.map((component) => <div key={component.label}>
              <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">{component.label}</span><span className="font-bold text-fundesco-forest">{component.score.toFixed(0)}/100 · peso {component.weight}%</span></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-fundesco-forest rounded-full" style={{ width: `${component.score}%` }} /></div>
            </div>)}
          </div>
        </div>
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fundesco-forest mb-4">Madurez por barrio</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-fundesco-forest text-white">
                  <th className="px-3 py-2 text-left rounded-tl-lg">Barrio</th>
                  <th className="px-3 py-2 text-center">Score</th>
                  <th className="px-3 py-2 text-center rounded-tr-lg">Nivel</th>
                </tr>
              </thead>
              <tbody>
                {analysis.maturity.byBarrio.slice(0, 8).map((item, i) => (
                  <tr key={item.barrio} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-3 py-2 font-medium text-fundesco-forest">{item.barrio}</td>
                    <td className="px-3 py-2 text-center font-bold">{item.score}</td>
                    <td className="px-3 py-2 text-center">{item.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    )}

    {stats.formalizacion && (
      <section className="max-w-7xl mx-auto px-6 py-8 grid md:grid-cols-3 gap-6" aria-label="Formalización, infraestructura y empleo">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fundesco-forest mb-4">Formalización</h2>
          <StatBar label="Registro Mercantil" pct={stats.formalizacion.pctRegistroMercantil} />
          <StatBar label="RNT" pct={stats.formalizacion.pctRNT} />
          <StatBar label="RUT" pct={stats.formalizacion.pctRUT} />
          <StatBar label="Facturación electrónica" pct={stats.formalizacion.pctFacturacionElectronica} />
          <StatBar label="Afiliación SS" pct={stats.formalizacion.pctAfiliacionSS} />
          <StatBar label="Seguro RC" pct={stats.formalizacion.pctSeguro} />
        </div>
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fundesco-forest mb-4">Infraestructura</h2>
          <StatBar label="Sede física" pct={stats.infraestructura?.pctSedeFisica} />
          <StatBar label="Señalización" pct={stats.infraestructura?.pctSeñalizacion} />
          <StatBar label="Baños disponibles" pct={stats.infraestructura?.pctBanos} />
          <StatBar label="Botiquín" pct={stats.infraestructura?.pctBotiquin} />
          <StatBar label="Conectividad" pct={stats.infraestructura?.pctConectividad} />
        </div>
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fundesco-forest mb-4">Empleo</h2>
          {stats.empleo && <>
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Empleos formales</span><span className="font-bold text-fundesco-forest">{stats.empleo.totalFormales}</span></div>
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Empleos informales</span><span className="font-bold">{stats.empleo.totalInformales}</span></div>
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Mujeres vinculadas</span><span className="font-bold">{stats.empleo.totalMujeres}</span></div>
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Jóvenes</span><span className="font-bold">{stats.empleo.totalJovenes}</span></div>
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-sm text-slate-600">Adultos mayores</span><span className="font-bold">{stats.empleo.totalMayores60}</span></div>
            <div className="flex justify-between py-1"><span className="text-sm text-slate-600">Población diversa</span><span className="font-bold">{stats.empleo.totalDiversidad}</span></div>
          </>}
        </div>
      </section>
    )}

    {analysis && (
      <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6">
        <TextCard title="Lectura territorial" paragraphs={analysis.narratives.geography} />
        <TextCard title="Formalización e infraestructura" paragraphs={[...analysis.narratives.formalization, ...analysis.narratives.infrastructure]} />
        <TextCard title="Empleo, mercado y sostenibilidad" paragraphs={[...analysis.narratives.employment, ...analysis.narratives.market, ...analysis.narratives.sustainability]} />
        <div className="card p-6 overflow-x-auto">
          <h2 className="text-xl font-bold text-fundesco-forest mb-4">Recomendaciones priorizadas</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-fundesco-forest text-white">
                <th className="px-3 py-2 text-left rounded-tl-lg">Acción</th>
                <th className="px-3 py-2 text-center">Prioridad</th>
                <th className="px-3 py-2 text-left rounded-tr-lg">Indicador</th>
              </tr>
            </thead>
            <tbody>
              {analysis.recommendations.map((item, i) => (
                <tr key={`${item.action}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-3 py-2 text-justify [hyphens:auto]">{item.action}</td>
                  <td className="px-3 py-2 text-center font-bold text-fundesco-forest">{item.priority}</td>
                  <td className="px-3 py-2">{item.indicator}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )}

    <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6" aria-label="Distribuciones principales">
      <Chart title="Top barrios" data={stats.byBarrio} nota={`n=${stats.total}`} />
      <Chart title="Tipos de emprendimiento" data={stats.byTipo} nota={`n=${stats.total}`} />
      <Chart title="Necesidades de apoyo" data={stats.necesidades} nota={`n=${stats.total}`} />
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-1">Capacidades promedio</h2>
        <p className="text-xs text-slate-400 mb-3">Escala 1-5 · n={stats.total}</p>
        <ResponsiveContainer width="100%" height={330}>
          <RadarChart data={stats.scores}>
            <PolarGrid /><PolarAngleAxis dataKey="name" /><PolarRadiusAxis domain={[0, 5]} />
            <Radar dataKey="value" stroke="#178C72" fill="#178C72" fillOpacity={0.35} /><Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>

    {stats.byFecha && stats.byFecha.length > 1 && (
      <section className="max-w-7xl mx-auto px-6 py-4">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fundesco-forest mb-1">Evolución de recolección</h2>
          <p className="text-xs text-slate-400 mb-3">Encuestas por día · n={stats.total}</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.byFecha} margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line dataKey="value" stroke="#178C72" dot={false} strokeWidth={2} name="Encuestas" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    )}

    <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6" aria-label="Perfil y mercado">
      {stats.perfilEmprendedores?.topGenero?.length > 0 && (
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fundesco-forest mb-1">Género de representantes</h2>
          <p className="text-xs text-slate-400 mb-3">n={stats.total}</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={stats.perfilEmprendedores.topGenero} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {stats.perfilEmprendedores.topGenero.map((_: any, i: number) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {stats.perfilEmprendedores?.topEducacion?.length > 0 && <Chart title="Nivel educativo representantes" data={stats.perfilEmprendedores.topEducacion} nota={`n=${stats.total}`} />}
      {stats.productoMercado?.topSegmentos?.length > 0 && <Chart title="Segmentos de mercado" data={stats.productoMercado.topSegmentos} nota={`n=${stats.total}`} />}
      {stats.productoMercado?.topIdiomas?.length > 0 && <Chart title="Idiomas de atención" data={stats.productoMercado.topIdiomas} nota={`n=${stats.total}`} />}
    </section>

    <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6">
      {stats.topCanales?.length > 0 && <Chart title="Canales digitales" data={stats.topCanales} nota={`n=${stats.total}`} />}
      {stats.topPracticasSostenibilidad?.length > 0 && <Chart title="Prácticas de sostenibilidad" data={stats.topPracticasSostenibilidad} nota={`n=${stats.total}`} />}
      {stats.topNecesidadesCapacitacion?.length > 0 && <Chart title="Necesidades de capacitación" data={stats.topNecesidadesCapacitacion} nota={`n=${stats.total}`} />}
      {stats.topEncuestadores?.length > 0 && <Chart title="Encuestas por encuestador/a" data={stats.topEncuestadores} nota={`n=${stats.total}`} />}
    </section>

    {stats.completitudDist?.length > 0 && (
      <section className="max-w-7xl mx-auto px-6 py-4 grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fundesco-forest mb-1">Completitud de registros</h2>
          <p className="text-xs text-slate-400 mb-3">Tasa de completitud: {stats.tasaCompletitud}% · n={stats.total}</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={stats.completitudDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {stats.completitudDist.map((_: any, i: number) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    )}

    {stats.preparacion && (
      <section className="max-w-7xl mx-auto px-6 py-4">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-fundesco-forest mb-4">Niveles de preparación turística (promedio /5)</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <NivelCard label="Interés en fortalecer" value={stats.preparacion.promedioInteresFortalecer} />
            <NivelCard label="Preparación para turistas" value={stats.preparacion.promedioPreparacionTuristas} />
            <NivelCard label="Aporte al turismo" value={stats.preparacion.promedioAporteTurismo} />
          </div>
        </div>
      </section>
    )}

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
                {stats.avanceBarrio.map((b: any, i: number) => (
                  <tr key={b.nombre} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-3 py-2 font-medium text-fundesco-forest">{b.nombre}</td>
                    <td className="px-3 py-2 text-center font-bold">{b.cantidad}</td>
                    <td className="px-3 py-2 text-center">{b.pctTotal}%</td>
                    <td className="px-3 py-2 text-center"><span className={`font-bold ${b.scorePromedio >= 3.5 ? 'text-green-700' : b.scorePromedio >= 2.5 ? 'text-yellow-600' : 'text-red-600'}`}>{b.scorePromedio > 0 ? b.scorePromedio.toFixed(1) : '—'}/5</span></td>
                    <td className="px-3 py-2 text-center">{b.pctRNT !== undefined ? `${b.pctRNT}%` : '—'}</td>
                    <td className="px-3 py-2 text-center">{b.pctRegistroMercantil !== undefined ? `${b.pctRegistroMercantil}%` : '—'}</td>
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

function SummaryText({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');
  return <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
    {lines.map((line, i) => {
      const h2 = line.startsWith('## ');
      const h3 = line.startsWith('### ');
      const clean = line.replace(/^#{1,3}\s+/, '');
      if (h2) return <h3 key={i} className="font-bold text-fundesco-forest border-b border-fundesco-lime pb-1 mt-4">{clean}</h3>;
      if (h3) return <h4 key={i} className="font-semibold text-fundesco-forest mt-3">{clean}</h4>;
      if (line.trim() === '') return <div key={i} className="h-2" />;
      if (line.trim().startsWith('- ')) return <p key={i} className="pl-5 -indent-5 text-justify [hyphens:auto]">• {line.trim().slice(2)}</p>;
      return <p key={i} className="text-justify [hyphens:auto]">{line}</p>;
    })}
  </div>;
}

function TextCard({ title, paragraphs }: { title: string; paragraphs: string[] }) {
  return <div className="card p-6">
    <h2 className="text-xl font-bold text-fundesco-forest mb-4">{title}</h2>
    <div className="space-y-3 text-sm text-slate-700">
      {paragraphs.map((paragraph) => <p key={paragraph} className="text-justify [hyphens:auto]">{paragraph}</p>)}
    </div>
  </div>;
}

function StatBar({ label, pct }: { label: string; pct: number | undefined }) {
  const v = pct ?? 0;
  return <div className="mb-3">
    <div className="flex justify-between text-sm mb-1"><span className="text-slate-600">{label}</span><span className="font-bold text-fundesco-forest">{v}%</span></div>
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-fundesco-forest rounded-full transition-all" style={{ width: `${v}%` }} />
    </div>
  </div>;
}

function Kpi({ label, value }: { label: string; value: any }) {
  return <div className="card p-5"><p className="text-sm text-slate-500">{label}</p><p className="text-4xl font-black text-fundesco-forest mt-2">{value}</p></div>;
}

function NivelCard({ label, value }: { label: string; value: number }) {
  const color = value >= 4 ? 'text-green-700' : value >= 3 ? 'text-yellow-600' : 'text-red-600';
  return <div className="bg-slate-50 rounded-xl p-4 text-center">
    <p className="text-sm text-slate-500 mb-1">{label}</p>
    <p className={`text-3xl font-black ${color}`}>{value > 0 ? value.toFixed(1) : '—'}</p>
    <p className="text-xs text-slate-400">/ 5</p>
  </div>;
}

function Chart({ title, data, nota }: { title: string; data: any[]; nota?: string }) {
  return <div className="card p-6">
    <h2 className="text-xl font-bold mb-1">{title}</h2>
    {nota && <p className="text-xs text-slate-400 mb-3">{nota}</p>}
    <ResponsiveContainer width="100%" height={330}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" fill="#178C72" radius={[0, 8, 8, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
