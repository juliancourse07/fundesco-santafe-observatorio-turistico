type StatsInput = {
  total: number; rutas: number; exactos: number; estimados: number;
  byBarrio?: Array<{ name: string; value: number }>;
  byUpz?: Array<{ name: string; value: number }>;
  byTipo?: Array<{ name: string; value: number }>;
  necesidades?: Array<{ name: string; value: number }>;
  herramientas?: Array<{ name: string; value: number }>;
  scores?: Array<{ name: string; value: number }>;
  formalizacion?: { pctRegistroMercantil: number; pctRNT: number; pctRUT: number; pctFacturacionElectronica: number };
  infraestructura?: { pctSedeFisica: number; pctSeñalizacion: number; pctBanos: number; pctBotiquin: number; pctConectividad: number };
  empleo?: { totalFormales: number; totalInformales: number; totalMujeres: number; totalJovenes: number; totalMayores60: number; totalDiversidad: number };
  topCanales?: Array<{ name: string; value: number }>;
  pctCapacitacionPrevia?: number;
  topNecesidadesCapacitacion?: Array<{ name: string; value: number }>;
  topPracticasSostenibilidad?: Array<{ name: string; value: number }>;
  preparacion?: { promedioInteresFortalecer: number; promedioPreparacionTuristas: number; promedioAporteTurismo: number };
  avanceBarrio?: Array<{ nombre: string; cantidad: number; pctTotal: number; scorePromedio: number }>;
};

const DEFAULT_MODEL = 'mistralai/Mixtral-8x7B-Instruct-v0.1';

function buildFallbackSummary(s: StatsInput): string {
  const f = s.formalizacion;
  const i = s.infraestructura;
  const e = s.empleo;
  const p = s.preparacion;
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

  const lines: string[] = [];

  lines.push('## Diagnóstico general');
  lines.push(`Se han consolidado ${s.total} registros del Observatorio Turístico de Santa Fe. ${s.rutas} emprendimientos (${Math.round(s.rutas / Math.max(s.total, 1) * 100)}%) manifiestan interés en integrarse a rutas turísticas. El score promedio de fortalecimiento es ${scorePromedio}/5. La georreferenciación cuenta con ${s.exactos} puntos exactos y ${s.estimados} estimados.`);
  if (topTipo) lines.push(`El tipo de emprendimiento predominante es ${topTipo.name} (${topTipo.value} registros).`);

  lines.push('\n## Avance territorial');
  if (topBarrio) lines.push(`El barrio con mayor concentración es ${topBarrio.name} (${topBarrio.value} encuestas).`);
  if (zonaAvanzada && zonaAvanzada.scorePromedio > 0) lines.push(`La zona más avanzada en fortalecimiento es ${zonaAvanzada.nombre} (score: ${zonaAvanzada.scorePromedio}/5).`);
  if (zonaRezagada && zonaRezagada.scorePromedio > 0 && zonaRezagada.nombre !== zonaAvanzada?.nombre) lines.push(`La zona más rezagada es ${zonaRezagada.nombre} (score: ${zonaRezagada.scorePromedio}/5), que requiere atención prioritaria.`);
  if (highScore) lines.push(`La dimensión más fortalecida es ${highScore.name} (${highScore.value}/5).`);
  if (lowScore) lines.push(`La dimensión más débil es ${lowScore.name} (${lowScore.value}/5).`);

  lines.push('\n## Formalización y empleo');
  if (f) {
    lines.push(`Formalización: ${f.pctRegistroMercantil}% tiene Registro Mercantil, ${f.pctRNT}% tiene RNT, ${f.pctRUT}% tiene RUT y ${f.pctFacturacionElectronica}% usa facturación electrónica. Existe una brecha significativa en registro formal que limita el acceso a programas de apoyo institucional.`);
  }
  if (e) {
    const totalEmp = e.totalFormales + e.totalInformales;
    lines.push(`En empleo, se registran ${totalEmp} personas vinculadas en total: ${e.totalFormales} formales y ${e.totalInformales} informales. Participan ${e.totalMujeres} mujeres, ${e.totalJovenes} jóvenes y ${e.totalMayores60} adultos mayores.`);
  }

  lines.push('\n## Tecnología y sostenibilidad');
  if (i) {
    lines.push(`Infraestructura: ${i.pctSedeFisica}% tiene sede física, ${i.pctSeñalizacion}% tiene señalización visible y ${i.pctConectividad}% cuenta con conectividad a internet.`);
  }
  if (topCanal) lines.push(`El canal digital más usado es ${topCanal.name}.`);
  if (topSost) lines.push(`La práctica de sostenibilidad más reportada es: ${topSost.name}.`);
  if (s.pctCapacitacionPrevia !== undefined) lines.push(`El ${s.pctCapacitacionPrevia}% de los emprendedores ha recibido capacitaciones previas.`);
  if (topNeedCap) lines.push(`La principal necesidad de capacitación es ${topNeedCap.name}.`);

  lines.push('\n## Recomendaciones');
  if (topNeed) lines.push(`1. Priorizar apoyo en ${topNeed.name} — la necesidad de apoyo más frecuente.`);
  if (f && f.pctRegistroMercantil < 50) lines.push(`2. Activar ruta de formalización: solo ${f.pctRegistroMercantil}% tiene Registro Mercantil. Jornadas de Cámara de Comercio en barrios rezagados.`);
  if (i && i.pctConectividad < 60) lines.push(`3. Brechas de conectividad críticas (${i.pctConectividad}% con internet): gestionar alianzas con MinTIC o programas de acceso digital.`);
  if (p && p.promedioPreparacionTuristas < 3) lines.push(`4. Nivel de preparación para recibir turistas es bajo (${p.promedioPreparacionTuristas}/5): fortalecer talleres de servicio al cliente y estándares turísticos.`);
  lines.push(`5. Fortalecer la dimensión ${lowScore?.name || 'más débil'} mediante talleres especializados y acompañamiento técnico continuo.`);

  return lines.join('\n');
}

export async function generateSummary(stats: StatsInput) {
  const token = process.env.HF_TOKEN?.trim();
  const model = process.env.HF_MODEL?.trim() || DEFAULT_MODEL;
  const fallback = buildFallbackSummary(stats);

  if (!token) {
    return { summary: fallback, source: 'local-fallback' as const, model };
  }

  const prompt = `Eres un consultor experto en turismo y desarrollo territorial. Redacta en español un informe de consultoría estructurado para Fundesco sobre el Observatorio Turístico de la localidad de Santa Fe, Bogotá. Usa estos datos reales de la encuesta: ${JSON.stringify(stats)}

El informe debe tener estas secciones con sus títulos en markdown:
## Diagnóstico general
## Avance territorial
## Formalización y empleo
## Tecnología y sostenibilidad
## Recomendaciones

Sé específico, usa los datos, identifica fortalezas y brechas críticas. Las recomendaciones deben ser accionables y priorizadas para Fundesco.`;

  try {
    const authValue = ['Bearer', token].join(' ');
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: { Authorization: authValue, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 900, return_full_text: false, temperature: 0.3 },
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
