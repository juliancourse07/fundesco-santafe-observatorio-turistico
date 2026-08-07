import type { StatsInput } from './analysis';

type SummaryJson = {
  total_registros?: number;
  fechas?: Record<string, number>;
  upz_top?: Array<[string, number]>;
  barrios_top?: Array<[string, number]>;
  tipos_top?: Array<[string, number]>;
  estado?: Array<[string, number]>;
  calidad_geografica?: Array<[string, number]>;
  quiere_rutas?: Array<[string, number]>;
  necesidades_top?: Array<[string, number]>;
  herramientas_top?: Array<[string, number]>;
  sostenibilidad_top?: Array<[string, number]>;
  segmentos_top?: Array<[string, number]>;
  score_avgs?: Record<string, number>;
  generado?: string;
};

const asDatum = (entries: Array<[string, number]> | undefined) => (entries ?? []).map(([name, value]) => ({ name, value }));

export function sampleStatsFromCurrentSummary(input: SummaryJson): StatsInput {
  const total = input.total_registros ?? 0;
  const quality = input.calidad_geografica ?? [];
  const exactos = quality.find(([label]) => /exacto/i.test(label))?.[1] ?? 0;
  const estimados = quality.filter(([label]) => !/exacto/i.test(label)).reduce((sum, [, value]) => sum + value, 0);
  const fechas = Object.entries(input.fechas ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const fechaInicio = fechas[0]?.[0];
  const fechaFin = fechas[fechas.length - 1]?.[0];
  const avgScore = Math.round(Object.values(input.score_avgs ?? {}).reduce((sum, value) => sum + value, 0) / Math.max(Object.keys(input.score_avgs ?? {}).length, 1));

  return {
    total,
    rutas: input.quiere_rutas?.reduce((sum, [, value]) => sum + value, 0) ?? 0,
    exactos,
    estimados,
    byBarrio: asDatum(input.barrios_top),
    byUpz: asDatum(input.upz_top),
    byTipo: asDatum(input.tipos_top),
    necesidades: asDatum(input.necesidades_top),
    herramientas: asDatum(input.herramientas_top),
    scores: Object.entries(input.score_avgs ?? {}).map(([name, value]) => ({ name, value })),
    formalizacion: {
      pctRegistroMercantil: 0,
      pctRNT: 0,
      pctRUT: 0,
      pctFacturacionElectronica: 0,
      pctAfiliacionSS: 0,
      pctSeguro: 0,
    },
    infraestructura: {
      pctSedeFisica: 0,
      pctSeñalizacion: 0,
      pctBanos: 0,
      pctBotiquin: 0,
      pctConectividad: 0,
    },
    empleo: {
      totalFormales: 0,
      totalInformales: 0,
      totalMujeres: 0,
      totalJovenes: 0,
      totalMayores60: 0,
      totalDiversidad: 0,
    },
    productoMercado: {
      topSegmentos: asDatum(input.segmentos_top),
      topIdiomas: [],
      topPublico: [],
      capacidadDiariaTotal: 0,
      capacidadVisitantesTotal: 0,
      topCertificaciones: [],
      topNormativa: [],
    },
    topCanales: asDatum(input.herramientas_top),
    pctCapacitacionPrevia: 0,
    topNecesidadesCapacitacion: asDatum(input.necesidades_top),
    topPracticasSostenibilidad: asDatum(input.sostenibilidad_top),
    preparacion: {
      promedioInteresFortalecer: avgScore,
      promedioPreparacionTuristas: avgScore,
      promedioAporteTurismo: avgScore,
    },
    avanceBarrio: (input.barrios_top ?? []).map(([nombre, cantidad]) => ({
      nombre,
      cantidad,
      pctTotal: total > 0 ? Math.round((cantidad / total) * 100) : 0,
      scorePromedio: avgScore,
      pctRNT: 0,
      pctRegistroMercantil: 0,
    })),
    topEncuestadores: [],
    completitudDist: asDatum(input.estado),
    tasaCompletitud: total > 0 ? Math.round(((input.estado?.reduce((sum, [, value]) => sum + value, 0) ?? total) / total) * 100) : 0,
    byFecha: fechas.map(([fecha, value]) => ({ fecha, value })),
    fechaInicio,
    fechaFin,
  };
}
