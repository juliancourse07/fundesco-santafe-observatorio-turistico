type StatsInput = {
  total: number; rutas: number; exactos: number; estimados: number;
  byBarrio?: Array<{ name: string; value: number }>;
  byUpz?: Array<{ name: string; value: number }>;
  byTipo?: Array<{ name: string; value: number }>;
  necesidades?: Array<{ name: string; value: number }>;
  herramientas?: Array<{ name: string; value: number }>;
  scores?: Array<{ name: string; value: number }>;
  formalizacion?: { pctRegistroMercantil: number; pctRNT: number; pctRUT: number; pctFacturacionElectronica: number; pctAfiliacionSS?: number; pctSeguro?: number };
  infraestructura?: { pctSedeFisica: number; pctSeñalizacion: number; pctBanos: number; pctBotiquin: number; pctConectividad: number };
  empleo?: { totalFormales: number; totalInformales: number; totalMujeres: number; totalJovenes: number; totalMayores60: number; totalDiversidad: number };
  perfilEmprendedores?: { topGenero: Array<{name:string;value:number}>; topEducacion: Array<{name:string;value:number}>; topEnfoque: Array<{name:string;value:number}>; promedioEdad: number };
  productoMercado?: { topSegmentos: Array<{name:string;value:number}>; topIdiomas: Array<{name:string;value:number}>; topPublico: Array<{name:string;value:number}>; capacidadDiariaTotal: number; capacidadVisitantesTotal: number; topCertificaciones: Array<{name:string;value:number}>; topNormativa: Array<{name:string;value:number}> };
  topCanales?: Array<{ name: string; value: number }>;
  pctCapacitacionPrevia?: number;
  topNecesidadesCapacitacion?: Array<{ name: string; value: number }>;
  topPracticasSostenibilidad?: Array<{ name: string; value: number }>;
  preparacion?: { promedioInteresFortalecer: number; promedioPreparacionTuristas: number; promedioAporteTurismo: number };
  avanceBarrio?: Array<{ nombre: string; cantidad: number; pctTotal: number; scorePromedio: number; pctRNT?: number; pctRegistroMercantil?: number }>;
  atractivos?: Array<{ name: string; value: number }>;
  articulacion?: Array<{ name: string; value: number }>;
};

const DEFAULT_MODEL = 'mistralai/Mixtral-8x7B-Instruct-v0.1';

function fmt(arr?: Array<{name:string;value:number}>, maxItems = 4): string {
  if (!arr || arr.length === 0) return 'N/D';
  return arr.slice(0, maxItems).map(x => `${x.name} (${x.value})`).join(', ');
}

function buildFallbackSummary(s: StatsInput): string {
  const f = s.formalizacion;
  const i = s.infraestructura;
  const e = s.empleo;
  const p = s.preparacion;
  const pe = s.perfilEmprendedores;
  const pm = s.productoMercado;
  const topBarrio = s.byBarrio?.[0];
  const topTipo = s.byTipo?.[0];
  const topNeed = s.necesidades?.[0];
  const topNeedCap = s.topNecesidadesCapacitacion?.[0];
  const topSost = s.topPracticasSostenibilidad?.[0];
  const topCanal = s.topCanales?.[0];
  const scorePromedio = s.scores?.length
    ? (s.scores.reduce((a, sc) => a + sc.value, 0) / s.scores.length).toFixed(1)
    : 'N/A';
  const lowScore = s.scores?.slice().sort((a, b) => a.value - b.value)[0];
  const highScore = s.scores?.slice().sort((a, b) => b.value - a.value)[0];
  const zonaRezagada = s.avanceBarrio?.slice().sort((a, b) => a.scorePromedio - b.scorePromedio)[0];
  const zonaAvanzada = s.avanceBarrio?.slice().sort((a, b) => b.scorePromedio - a.scorePromedio)[0];
  const totalEmp = (e?.totalFormales ?? 0) + (e?.totalInformales ?? 0);

  const lines: string[] = [];

  lines.push('## Diagnóstico general');
  lines.push(`El Observatorio Turístico de Santa Fe registra ${s.total} emprendimientos caracterizados. El ${Math.round(s.rutas / Math.max(s.total, 1) * 100)}% (${s.rutas} emprendimientos) manifiesta interés en integrarse a rutas turísticas. El score promedio de fortalecimiento institucional es ${scorePromedio}/5. La georreferenciación cuenta con ${s.exactos} puntos exactos y ${s.estimados} estimados.`);
  if (topTipo) lines.push(`El tipo de emprendimiento predominante es "${topTipo.name}" con ${topTipo.value} registros. Tipos presentes: ${fmt(s.byTipo, 5)}.`);
  if (p) lines.push(`Los emprendedores muestran un alto interés en fortalecer su negocio (promedio ${p.promedioInteresFortalecer}/5), pero la preparación para recibir turistas es media (${p.promedioPreparacionTuristas}/5) y el aporte al turismo es valorado en ${p.promedioAporteTurismo}/5.`);

  lines.push('\n## Perfil de los emprendedores');
  if (pe) {
    if (pe.topGenero.length) lines.push(`Género de representantes: ${fmt(pe.topGenero, 4)}.`);
    if (pe.topEducacion.length) lines.push(`Nivel educativo: ${fmt(pe.topEducacion, 5)}.`);
    if (pe.promedioEdad > 0) lines.push(`Edad promedio de los representantes: ${pe.promedioEdad} años.`);
    if (pe.topEnfoque.length) lines.push(`Enfoques diferenciales reportados: ${fmt(pe.topEnfoque, 4)}.`);
  }
  lines.push(`El ${s.pctCapacitacionPrevia ?? 0}% de los emprendedores ha recibido capacitaciones previas en turismo, marketing, finanzas o tecnología.`);
  if (topNeedCap) lines.push(`Las principales necesidades de capacitación son: ${fmt(s.topNecesidadesCapacitacion, 4)}.`);

  lines.push('\n## Producto turístico y mercado');
  if (pm) {
    if (pm.topSegmentos.length) lines.push(`Segmentos de mercado atendidos: ${fmt(pm.topSegmentos, 5)}.`);
    if (pm.topPublico.length) lines.push(`Público objetivo principal: ${fmt(pm.topPublico, 4)}.`);
    if (pm.topIdiomas.length) lines.push(`Idiomas disponibles para atención: ${fmt(pm.topIdiomas, 5)}.`);
    if (pm.capacidadDiariaTotal > 0) lines.push(`Capacidad total de atención diaria de todos los emprendimientos: ${pm.capacidadDiariaTotal} personas/día; capacidad máxima simultánea de visitantes: ${pm.capacidadVisitantesTotal}.`);
    if (pm.topCertificaciones.length) lines.push(`Certificaciones y sellos de calidad turística: ${fmt(pm.topCertificaciones, 4)}.`);
    if (pm.topNormativa.length) lines.push(`Nivel de conocimiento de normatividad turística: ${fmt(pm.topNormativa, 3)}.`);
  }
  if (s.atractivos?.length) lines.push(`Atractivos cercanos más mencionados: ${fmt(s.atractivos, 4)}.`);
  if (s.articulacion?.length) lines.push(`Propuestas de articulación en rutas turísticas más frecuentes: ${fmt(s.articulacion, 4)}.`);

  lines.push('\n## Avance territorial');
  if (topBarrio) lines.push(`El barrio con mayor concentración de emprendimientos es ${topBarrio.name} (${topBarrio.value} encuestas, ${s.byBarrio?.[0] ? Math.round(topBarrio.value / Math.max(s.total, 1) * 100) : '?'}% del total).`);
  if (s.avanceBarrio && s.avanceBarrio.length > 1) {
    lines.push(`Distribución por barrio: ${s.avanceBarrio.map(b => `${b.nombre}: ${b.cantidad} (score ${b.scorePromedio > 0 ? b.scorePromedio.toFixed(1) : 'N/D'}/5)`).join('; ')}.`);
  }
  if (zonaAvanzada && zonaAvanzada.scorePromedio > 0) lines.push(`La zona más avanzada en fortalecimiento es ${zonaAvanzada.nombre} (score: ${zonaAvanzada.scorePromedio}/5).`);
  if (zonaRezagada && zonaRezagada.scorePromedio > 0 && zonaRezagada.nombre !== zonaAvanzada?.nombre) lines.push(`La zona más rezagada es ${zonaRezagada.nombre} (score: ${zonaRezagada.scorePromedio}/5), requiriendo atención prioritaria.`);
  if (highScore) lines.push(`Dimensión más fortalecida del ecosistema: ${highScore.name} (${highScore.value}/5).`);
  if (lowScore) lines.push(`Dimensión más débil: ${lowScore.name} (${lowScore.value}/5) — brecha crítica a intervenir.`);

  lines.push('\n## Formalización y empleo');
  if (f) {
    lines.push(`Estado de formalización: ${f.pctRegistroMercantil}% tiene Registro Mercantil, ${f.pctRNT}% tiene RNT (Registro Nacional de Turismo), ${f.pctRUT}% tiene RUT y ${f.pctFacturacionElectronica}% usa facturación electrónica.`);
    if (f.pctAfiliacionSS !== undefined) lines.push(`Afiliación a seguridad social: ${f.pctAfiliacionSS}%. Seguro de responsabilidad civil: ${f.pctSeguro ?? 0}%.`);
    if (f.pctRNT < 50) lines.push(`La baja adopción del RNT (${f.pctRNT}%) es una brecha crítica que limita la visibilidad oficial del sector turístico.`);
  }
  if (e && totalEmp > 0) {
    lines.push(`Empleo: ${totalEmp} personas vinculadas en total — ${e.totalFormales} empleos formales (${Math.round(e.totalFormales / Math.max(totalEmp, 1) * 100)}%) y ${e.totalInformales} informales (${Math.round(e.totalInformales / Math.max(totalEmp, 1) * 100)}%). Participan ${e.totalMujeres} mujeres, ${e.totalJovenes} jóvenes, ${e.totalMayores60} adultos mayores y ${e.totalDiversidad} personas de población diversa.`);
  }

  lines.push('\n## Tecnología y sostenibilidad');
  if (i) {
    lines.push(`Infraestructura: ${i.pctSedeFisica}% tiene sede física, ${i.pctSeñalizacion}% señalización visible, ${i.pctBanos}% baños disponibles, ${i.pctBotiquin}% botiquín y ${i.pctConectividad}% conectividad a internet.`);
  }
  if (topCanal) lines.push(`Canales digitales más usados: ${fmt(s.topCanales, 4)}.`);
  if (topSost) lines.push(`Prácticas de sostenibilidad más reportadas: ${fmt(s.topPracticasSostenibilidad, 4)}.`);

  lines.push('\n## Recomendaciones');
  const recs: string[] = [];
  if (topNeed) recs.push(`Priorizar apoyo integral en "${topNeed.name}" — la necesidad más frecuente del ecosistema.`);
  if (f && f.pctRNT < 50) recs.push(`Activar campaña de RNT: solo ${f.pctRNT}% tiene Registro Nacional de Turismo. Jornadas de registro en barrios rezagados con Cámara de Comercio e IDT.`);
  if (f && f.pctRegistroMercantil < 60) recs.push(`Formalizar Registro Mercantil (${f.pctRegistroMercantil}%): organizar jornadas gratuitas con Cámara de Comercio.`);
  if (i && i.pctConectividad < 60) recs.push(`Brechas de conectividad críticas (${i.pctConectividad}% con internet): gestionar alianzas con MinTIC para acceso digital.`);
  if (p && p.promedioPreparacionTuristas < 3) recs.push(`Preparación para recibir turistas baja (${p.promedioPreparacionTuristas}/5): fortalecer talleres de servicio al cliente y estándares turísticos.`);
  if (lowScore) recs.push(`Fortalecer la dimensión "${lowScore.name}" (${lowScore.value}/5) con talleres especializados y acompañamiento técnico.`);
  if (s.rutas < s.total * 0.7) recs.push(`Ampliar la vinculación a rutas turísticas: el ${Math.round(s.rutas / Math.max(s.total, 1) * 100)}% quiere participar — diseñar paquetes de ruta articulados con los atractivos del barrio.`);
  recs.forEach((r, idx) => lines.push(`${idx + 1}. ${r}`));

  return lines.join('\n');
}

export async function generateSummary(stats: StatsInput) {
  const token = process.env.HF_TOKEN?.trim();
  const model = process.env.HF_MODEL?.trim() || DEFAULT_MODEL;
  const fallback = buildFallbackSummary(stats);

  if (!token) {
    return { summary: fallback, source: 'local-fallback' as const, model };
  }

  const statsStr = JSON.stringify({
    total: stats.total, rutas: stats.rutas, exactos: stats.exactos, estimados: stats.estimados,
    byTipo: stats.byTipo?.slice(0, 6),
    byBarrio: stats.byBarrio?.slice(0, 8),
    formalizacion: stats.formalizacion,
    infraestructura: stats.infraestructura,
    empleo: stats.empleo,
    perfilEmprendedores: stats.perfilEmprendedores,
    productoMercado: stats.productoMercado,
    scores: stats.scores,
    preparacion: stats.preparacion,
    pctCapacitacionPrevia: stats.pctCapacitacionPrevia,
    topNecesidadesCapacitacion: stats.topNecesidadesCapacitacion?.slice(0, 5),
    topPracticasSostenibilidad: stats.topPracticasSostenibilidad?.slice(0, 5),
    topCanales: stats.topCanales?.slice(0, 5),
    necesidades: stats.necesidades?.slice(0, 6),
    avanceBarrio: stats.avanceBarrio?.slice(0, 8),
    atractivos: stats.atractivos?.slice(0, 4),
    articulacion: stats.articulacion?.slice(0, 4),
  });

  const prompt = `Eres un consultor experto en turismo y desarrollo territorial. Redacta en español un informe de consultoría estructurado y detallado para Fundesco sobre el Observatorio Turístico de la localidad de Santa Fe, Bogotá. Usa estos datos reales de la encuesta: ${statsStr}

El informe debe tener estas secciones con sus títulos en markdown (sé sustancial y específico en cada sección, citando cifras concretas):
## Diagnóstico general
## Perfil de los emprendedores
## Producto turístico y mercado
## Avance territorial
## Formalización y empleo
## Tecnología y sostenibilidad
## Recomendaciones

Incluye cifras concretas, identifica fortalezas y brechas críticas. Las recomendaciones deben ser accionables, priorizadas y dirigidas a Fundesco.`;

  try {
    const authValue = ['Bearer', token].join(' ');
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: { Authorization: authValue, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 1400, return_full_text: false, temperature: 0.3 },
      }),
      cache: 'no-store',
    });

    if (!response.ok) return { summary: fallback, source: 'local-fallback' as const, model };

    const data = await response.json();
    const text = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text || data?.[0]?.summary_text;

    return {
      summary: typeof text === 'string' && text.trim() ? text.trim() : fallback,
      source: typeof text === 'string' && text.trim() ? ('hugging-face' as const) : ('local-fallback' as const),
      model,
    };
  } catch {
    return { summary: fallback, source: 'local-fallback' as const, model };
  }
}
