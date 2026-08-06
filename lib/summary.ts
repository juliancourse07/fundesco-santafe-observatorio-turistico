import { buildDeterministicAnalysis, buildFallbackSummary, sanitizePdfText, type StatsInput } from './analysis';

const DEFAULT_MODEL = 'mistralai/Mixtral-8x7B-Instruct-v0.1';

export async function generateSummary(stats: StatsInput) {
  const token = process.env.HF_TOKEN?.trim();
  const model = process.env.HF_MODEL?.trim() || DEFAULT_MODEL;
  const fallback = buildFallbackSummary(stats);
  const deterministic = buildDeterministicAnalysis(stats);

  if (!token) {
    return { summary: fallback, source: 'local-fallback' as const, model };
  }

  const statsStr = JSON.stringify({
    total: stats.total,
    rutas: stats.rutas,
    exactos: stats.exactos,
    estimados: stats.estimados,
    fechaInicio: stats.fechaInicio,
    fechaFin: stats.fechaFin,
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
    analisisDeterminista: {
      hallazgos: deterministic.hallazgos,
      brechasYRiesgos: deterministic.brechasYRiesgos,
      recomendaciones: deterministic.recommendations,
      concentration: deterministic.concentration,
      maturity: deterministic.maturity,
    },
  });

  const prompt = `Eres un consultor experto en turismo, desarrollo territorial y fortalecimiento empresarial. Redacta en espanol un informe de consultoria para Fundesco usando exclusivamente estos datos: ${statsStr}

Entrega texto plano en markdown simple con estas secciones y sin emojis, sin comillas tipograficas, sin guiones largos unicode y sin caracteres decorativos:
## Diagnostico general
## Hallazgos clave
## Lectura territorial
## Formalizacion e infraestructura
## Empleo, mercado y sostenibilidad
## Brechas y riesgos
## Recomendaciones priorizadas

Instrucciones obligatorias:
- Usa solo texto plano legible por PDF.
- Cada afirmacion debe apoyarse en cifras concretas.
- Incluye entre 5 y 8 hallazgos cuantificados en lista con guion simple.
- Incluye brechas, riesgos y recomendaciones accionables para Fundesco.
- En recomendaciones, menciona prioridad (Alta, Media o Baja) y un indicador sugerido de seguimiento.
- No inventes fuentes ni datos no presentes.`;

  try {
    const authValue = ['Bearer', token].join(' ');
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: { Authorization: authValue, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 1600, return_full_text: false, temperature: 0.2 },
      }),
      cache: 'no-store',
    });

    if (!response.ok) return { summary: fallback, source: 'local-fallback' as const, model };

    const data = await response.json();
    const text = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text || data?.[0]?.summary_text;
    const cleaned = typeof text === 'string' ? sanitizePdfText(text).trim() : '';

    return {
      summary: cleaned || fallback,
      source: cleaned ? ('hugging-face' as const) : ('local-fallback' as const),
      model,
    };
  } catch {
    return { summary: fallback, source: 'local-fallback' as const, model };
  }
}
