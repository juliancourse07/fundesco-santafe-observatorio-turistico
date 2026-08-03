type SummaryStats = {
  total: number;
  rutas: number;
  exactos: number;
  estimados: number;
  byBarrio?: Array<{ name: string; value: number }>;
  byUpz?: Array<{ name: string; value: number }>;
  byTipo?: Array<{ name: string; value: number }>;
  necesidades?: Array<{ name: string; value: number }>;
};

const DEFAULT_MODEL = 'mistralai/Mixtral-8x7B-Instruct-v0.1';

function fallbackSummary(stats: SummaryStats) {
  const topBarrio = stats.byBarrio?.[0];
  const topUpz = stats.byUpz?.[0];
  const topTipo = stats.byTipo?.[0];
  const topNeed = stats.necesidades?.[0];

  return [
    `Se han consolidado ${stats.total} registros de la encuesta turística en Santa Fe.`,
    `${stats.rutas} emprendimientos manifiestan interés en integrarse a rutas turísticas.`,
    `La georreferenciación cuenta con ${stats.exactos} puntos exactos y ${stats.estimados} estimados para mantener la visualización activa.`,
    topBarrio ? `El barrio con mayor concentración reportada es ${topBarrio.name} (${topBarrio.value}).` : null,
    topUpz ? `La UPZ con más actividad visible es ${topUpz.name} (${topUpz.value}).` : null,
    topTipo ? `El tipo de emprendimiento predominante es ${topTipo.name}.` : null,
    topNeed ? `La necesidad de apoyo más frecuente es ${topNeed.name}.` : null,
    'No se requiere redeploy para ver nuevas respuestas: el cliente refresca periódicamente y el servidor consulta la fuente sin caché.',
  ].filter(Boolean).join(' ');
}

export async function generateSummary(stats: SummaryStats) {
  const token = process.env.HF_TOKEN?.trim();
  const model = process.env.HF_MODEL?.trim() || DEFAULT_MODEL;
  const fallback = fallbackSummary(stats);

  if (!token) {
    return { summary: fallback, source: 'local-fallback' as const, model };
  }

  const prompt = `Redacta un resumen ejecutivo breve en español para un tablero territorial de turismo en Santa Fe, Bogotá. Datos: ${JSON.stringify(stats)}.`;

  try {
    const authValue = ['Bearer', token].join(' ');
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: authValue,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 220,
          return_full_text: false,
          temperature: 0.3,
        },
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return { summary: fallback, source: 'local-fallback' as const, model };
    }

    const data = await response.json();
    const text = Array.isArray(data)
      ? data[0]?.generated_text
      : data?.generated_text || data?.[0]?.summary_text;

    return {
      summary: typeof text === 'string' && text.trim() ? text.trim() : fallback,
      source: typeof text === 'string' && text.trim() ? ('hugging-face' as const) : ('local-fallback' as const),
      model,
    };
  } catch {
    return { summary: fallback, source: 'local-fallback' as const, model };
  }
}
