export type Datum = { name: string; value: number };
export type BarrioProgress = {
  nombre: string;
  cantidad: number;
  pctTotal: number;
  scorePromedio: number;
  pctRNT?: number;
  pctRegistroMercantil?: number;
};

export type StatsInput = {
  total: number;
  rutas: number;
  exactos: number;
  estimados: number;
  byBarrio?: Datum[];
  byUpz?: Datum[];
  byTipo?: Datum[];
  necesidades?: Datum[];
  herramientas?: Datum[];
  scores?: Datum[];
  formalizacion?: {
    pctRegistroMercantil: number;
    pctRNT: number;
    pctRUT: number;
    pctFacturacionElectronica: number;
    pctAfiliacionSS?: number;
    pctSeguro?: number;
  };
  infraestructura?: {
    pctSedeFisica: number;
    pctSeñalizacion: number;
    pctBanos: number;
    pctBotiquin: number;
    pctConectividad: number;
  };
  empleo?: {
    totalFormales: number;
    totalInformales: number;
    totalMujeres: number;
    totalJovenes: number;
    totalMayores60: number;
    totalDiversidad: number;
    totalPersonasVinculadas?: number;
    validosFormales?: number;
    validosInformales?: number;
    validosMujeres?: number;
    validosJovenes?: number;
    validosMayores60?: number;
    validosDiversidad?: number;
  };
  perfilEmprendedores?: {
    topGenero: Datum[];
    topEducacion: Datum[];
    topEnfoque: Datum[];
    promedioEdad: number;
  };
  productoMercado?: {
    topSegmentos: Datum[];
    topIdiomas: Datum[];
    topPublico: Datum[];
    capacidadDiariaTotal: number;
    capacidadVisitantesTotal: number;
    topCertificaciones: Datum[];
    topNormativa: Datum[];
  };
  topCanales?: Datum[];
  pctCapacitacionPrevia?: number;
  topNecesidadesCapacitacion?: Datum[];
  topPracticasSostenibilidad?: Datum[];
  preparacion?: {
    promedioInteresFortalecer: number;
    promedioPreparacionTuristas: number;
    promedioAporteTurismo: number;
  };
  avanceBarrio?: BarrioProgress[];
  atractivos?: Datum[];
  articulacion?: Datum[];
  topEncuestadores?: Datum[];
  completitudDist?: Datum[];
  tasaCompletitud?: number;
  byFecha?: Array<{ fecha: string; value: number }>;
  fechaInicio?: string;
  fechaFin?: string;
};

export type Priority = 'Alta' | 'Media' | 'Baja';
export type Recommendation = { action: string; priority: Priority; indicator: string };

export type DeterministicAnalysis = {
  methodology: { title: string; paragraphs: string[]; technicalSheet: Array<{ label: string; value: string }> };
  hallazgos: string[];
  brechasYRiesgos: string[];
  recommendations: Recommendation[];
  concentration: {
    topBarrio: string;
    topShare: number;
    top3Share: number;
    hhi: number;
    level: string;
    paragraph: string;
  };
  maturity: {
    score: number;
    level: string;
    formula: string;
    components: Array<{ label: string; score: number; weight: number }>;
    byBarrio: Array<{ barrio: string; score: number; level: string }>;
    paragraph: string;
  };
  narratives: {
    general: string[];
    geography: string[];
    formalization: string[];
    infrastructure: string[];
    employment: string[];
    market: string[];
    sustainability: string[];
    capacities: string[];
  };
  glossary: Array<{ term: string; definition: string }>;
};

const pct = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;
const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const valueOrZero = (value?: number) => Number.isFinite(value) ? Number(value) : 0;
// Garantiza un arreglo aunque la fuente entregue un valor malformado (evita que
// un campo corrupto rompa el análisis completo y tumbe el tablero).
const asArray = <T,>(value: unknown): T[] => Array.isArray(value) ? (value as T[]) : [];
const labelLevel = (score: number, high = 70, medium = 45) => score >= high ? 'alto' : score >= medium ? 'medio' : 'bajo';
const maturityLevel = (score: number) => score >= 75 ? 'Alta' : score >= 55 ? 'Media' : 'Baja';
const topLabel = (items?: Datum[], fallback = 'Sin dato') => items?.[0]?.name || fallback;
const topValue = (items?: Datum[]) => items?.[0]?.value || 0;
const fmtList = (items?: Datum[], maxItems = 4) => items && items.length ? items.slice(0, maxItems).map((item) => `${item.name} (${item.value})`).join(', ') : 'sin registros suficientes';
const plural = (value: number, singular: string, pluralWord = singular + 's') => `${value} ${value === 1 ? singular : pluralWord}`;

export function sanitizePdfText(input: string): string {
  return String(input || '')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, '');
}

function concentrationFromStats(stats: StatsInput) {
  const barrios = stats.avanceBarrio ?? [];
  const total = Math.max(stats.total || 0, 1);
  const sorted = barrios.slice().sort((a, b) => b.cantidad - a.cantidad);
  const topBarrio = sorted[0]?.nombre || 'Sin dato';
  const topShare = round(((sorted[0]?.cantidad || 0) / total) * 100);
  const top3Share = round((sorted.slice(0, 3).reduce((sum, item) => sum + item.cantidad, 0) / total) * 100);
  const hhi = Math.round(sorted.reduce((sum, item) => {
    const share = (item.cantidad / total) * 100;
    return sum + share * share;
  }, 0));
  const level = hhi >= 2500 ? 'alta concentración' : hhi >= 1500 ? 'concentración media' : 'dispersión relativa';
  const paragraph = stats.total
    ? `La concentración territorial muestra que ${topBarrio} reúne el ${topShare}% de los registros y los tres barrios con mayor presencia concentran el ${top3Share}% del universo. El índice HHI estimado es ${hhi}, valor que se interpreta como ${level}; esto sugiere ${hhi >= 2500 ? 'una dependencia fuerte de pocos nodos territoriales' : hhi >= 1500 ? 'un patrón territorial mixto con polos dominantes' : 'una base territorial relativamente distribuida'}.`
    : 'No hay registros suficientes para estimar la concentración territorial.';
  return { topBarrio, topShare, top3Share, hhi, level, paragraph };
}

function maturityFromStats(stats: StatsInput) {
  const formal = stats.formalizacion;
  const infra = stats.infraestructura;
  const empleo = stats.empleo;
  const total = Math.max(stats.total || 0, 1);
  const totalEmpleo = empleo?.totalPersonasVinculadas ?? ((empleo?.totalFormales ?? 0) + (empleo?.totalInformales ?? 0));
  const formalEmploymentShare = pct(empleo?.totalFormales ?? 0, Math.max(totalEmpleo, 1));
  const employmentIntensity = clamp((totalEmpleo / total) * 20);
  const digitalMentions = (stats.topCanales ?? []).reduce((sum, item) => sum + item.value, 0);
  const digitalCoverage = clamp((digitalMentions / total) * 25);
  const sustainabilityMentions = (stats.topPracticasSostenibilidad ?? []).reduce((sum, item) => sum + item.value, 0);
  const sustainabilityCoverage = clamp((sustainabilityMentions / total) * 18);
  const sustainabilityScore = clamp(average([
    sustainabilityCoverage,
    valueOrZero(stats.scores?.find((item) => item.name.toLowerCase().includes('sostenibilidad'))?.value) * 20,
  ]));
  const components = [
    {
      label: 'Formalización',
      score: clamp(average([
        valueOrZero(formal?.pctRegistroMercantil),
        valueOrZero(formal?.pctRNT),
        valueOrZero(formal?.pctRUT),
        valueOrZero(formal?.pctFacturacionElectronica),
      ])),
      weight: 30,
    },
    {
      label: 'Infraestructura y conectividad',
      score: clamp(average([
        valueOrZero(infra?.pctSedeFisica),
        valueOrZero(infra?.pctSeñalizacion),
        valueOrZero(infra?.pctBanos),
        valueOrZero(infra?.pctBotiquin),
        valueOrZero(infra?.pctConectividad),
      ])),
      weight: 20,
    },
    {
      label: 'Empleo',
      score: clamp(average([formalEmploymentShare, employmentIntensity])),
      weight: 15,
    },
    {
      label: 'Presencia digital',
      score: clamp(average([
        digitalCoverage,
        valueOrZero(infra?.pctConectividad),
        valueOrZero(formal?.pctFacturacionElectronica),
        valueOrZero(stats.pctCapacitacionPrevia),
      ])),
      weight: 20,
    },
    {
      label: 'Sostenibilidad',
      score: sustainabilityScore,
      weight: 15,
    },
  ];
  const score = Math.round(components.reduce((sum, component) => sum + (component.score * component.weight) / 100, 0));
  const byBarrio = (stats.avanceBarrio ?? []).map((item) => {
    const barrioScore = Math.round(clamp(
      (valueOrZero(item.pctRegistroMercantil) * 0.35) +
      (valueOrZero(item.pctRNT) * 0.25) +
      (valueOrZero(item.scorePromedio) * 20 * 0.4)
    ));
    return { barrio: item.nombre, score: barrioScore, level: maturityLevel(barrioScore) };
  }).sort((a, b) => b.score - a.score);
  const level = maturityLevel(score);
  const formula = 'Indice 0-100 = 30% formalizacion + 20% infraestructura/conectividad + 15% empleo + 20% presencia digital + 15% sostenibilidad.';
  const paragraph = `El indice sintetico de madurez del emprendimiento se ubica en ${score}/100, nivel ${level.toLowerCase()}. La formula pondera formalizacion (${components[0].weight}%), infraestructura y conectividad (${components[1].weight}%), empleo (${components[2].weight}%), presencia digital (${components[3].weight}%) y sostenibilidad (${components[4].weight}%). Los componentes mas rezagados son ${components.slice().sort((a, b) => a.score - b.score).slice(0, 2).map((component) => `${component.label.toLowerCase()} (${component.score.toFixed(0)}/100)`).join(' y ')}.`;
  return { score, level, formula, components, byBarrio, paragraph };
}

function methodologyFromStats(stats: StatsInput) {
  const total = stats.total || 0;
  const exactPct = pct(stats.exactos || 0, Math.max(total, 1));
  const estimatedPct = pct(stats.estimados || 0, Math.max(total, 1));
  const completion = valueOrZero(stats.tasaCompletitud);
  const source = 'Base de respuestas consolidada en Google Sheets y consultada por el observatorio en tiempo real.';
  const paragraphs = [
    `El universo analizado corresponde a ${plural(total, 'emprendimiento')} caracterizados en la localidad de Santa Fe. La fuente primaria es ${source.toLowerCase()} El periodo observado cubre ${stats.fechaInicio || 'sin fecha de inicio disponible'} a ${stats.fechaFin || 'sin fecha de cierre disponible'}.`,
    `La geolocalizacion combina ${stats.exactos || 0} puntos exactos (${exactPct}%) capturados con coordenadas del establecimiento y ${stats.estimados || 0} puntos aproximados (${estimatedPct}%) imputados al centroide del barrio cuando no hubo coordenada valida. Esto mejora la cobertura espacial, pero reduce la precision en analisis de micro-localizacion.`,
    `La tasa de completitud estimada es ${completion}%. El estudio debe leerse como una caracterizacion operativa del ecosistema: los datos son autorreportados, pueden existir respuestas parciales y varias variables admiten seleccion multiple, por lo que algunos indicadores reflejan intensidad declarada mas que adopcion exclusiva.`,
  ];
  const technicalSheet = [
    { label: 'Universo observado', value: `${total} registros` },
    { label: 'Fuente', value: 'Google Sheets / formulario de caracterizacion' },
    { label: 'Periodo', value: `${stats.fechaInicio || 'N/D'} - ${stats.fechaFin || 'N/D'}` },
    { label: 'Geolocalizacion exacta', value: `${stats.exactos || 0} registros (${exactPct}%)` },
    { label: 'Geolocalizacion por centroide', value: `${stats.estimados || 0} registros (${estimatedPct}%)` },
    { label: 'Completitud', value: `${completion}%` },
  ];
  return { title: 'Nota metodologica', paragraphs, technicalSheet };
}

function recommendationMatrix(stats: StatsInput, maturityScore: number, concentration: ReturnType<typeof concentrationFromStats>): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const formal = stats.formalizacion;
  const infra = stats.infraestructura;
  const prep = stats.preparacion;
  if (formal && formal.pctRNT < formal.pctRUT) {
    recommendations.push({
      action: `Cerrar la brecha entre RUT (${formal.pctRUT}%) y RNT (${formal.pctRNT}%) con jornadas de formalizacion turistica focalizadas en barrios de menor madurez.`,
      priority: 'Alta',
      indicator: 'Porcentaje de emprendimientos con RNT vigente',
    });
  }
  if (infra && infra.pctConectividad < 70) {
    recommendations.push({
      action: `Fortalecer conectividad, medios de pago y visibilidad digital en establecimientos con infraestructura basica pero baja conexion (${infra.pctConectividad}%).`,
      priority: 'Alta',
      indicator: 'Porcentaje con conectividad estable y canal digital activo',
    });
  }
  if (prep && prep.promedioPreparacionTuristas < 3.5) {
    recommendations.push({
      action: `Implementar ruta de asistencia tecnica en servicio, hospitalidad y experiencia de visitante para elevar la preparacion actual (${prep.promedioPreparacionTuristas}/5).`,
      priority: 'Media',
      indicator: 'Promedio de preparacion para turistas sobre 5',
    });
  }
  if (concentration.top3Share > 60) {
    recommendations.push({
      action: `Diversificar la base territorial del observatorio con barridos adicionales en barrios de baja presencia para reducir concentracion de muestra y ampliar cobertura programatica.`,
      priority: 'Media',
      indicator: 'Participacion del top 3 de barrios sobre el total',
    });
  }
  if (maturityScore < 60) {
    recommendations.push({
      action: 'Crear un tablero de seguimiento trimestral del indice de madurez y activar acompanamiento diferenciado por componente rezagado.',
      priority: 'Alta',
      indicator: 'Indice sintetico de madurez promedio',
    });
  }
  recommendations.push({
    action: `Consolidar una oferta territorial articulada alrededor de ${topLabel(stats.atractivos)} y los segmentos con mayor traccion: ${fmtList(stats.productoMercado?.topSegmentos, 3)}.`,
    priority: 'Baja',
    indicator: 'Numero de productos/rutas integradas activas',
  });
  return recommendations.slice(0, 6);
}

export function buildDeterministicAnalysis(input: StatsInput): DeterministicAnalysis {
  // Defensa ante datos malformados: normaliza los arreglos que se recorren para
  // que un campo corrupto no rompa el análisis ni tumbe la página.
  const stats: StatsInput = {
    ...input,
    scores: asArray<Datum>(input.scores),
    byBarrio: asArray<Datum>(input.byBarrio),
    byUpz: asArray<Datum>(input.byUpz),
    byTipo: asArray<Datum>(input.byTipo),
    necesidades: asArray<Datum>(input.necesidades),
    herramientas: asArray<Datum>(input.herramientas),
    topCanales: asArray<Datum>(input.topCanales),
    topPracticasSostenibilidad: asArray<Datum>(input.topPracticasSostenibilidad),
    topNecesidadesCapacitacion: asArray<Datum>(input.topNecesidadesCapacitacion),
    avanceBarrio: asArray<BarrioProgress>(input.avanceBarrio),
    byFecha: asArray<{ fecha: string; value: number }>(input.byFecha),
    atractivos: asArray<Datum>(input.atractivos),
    articulacion: asArray<Datum>(input.articulacion),
    topEncuestadores: asArray<Datum>(input.topEncuestadores),
    completitudDist: asArray<Datum>(input.completitudDist),
    // Subobjetos: si llegan como escalar u otro tipo, se descartan para no romper.
    productoMercado: input.productoMercado && typeof input.productoMercado === 'object' ? input.productoMercado : undefined,
    perfilEmprendedores: input.perfilEmprendedores && typeof input.perfilEmprendedores === 'object' ? input.perfilEmprendedores : undefined,
    formalizacion: input.formalizacion && typeof input.formalizacion === 'object' ? input.formalizacion : undefined,
    infraestructura: input.infraestructura && typeof input.infraestructura === 'object' ? input.infraestructura : undefined,
    empleo: input.empleo && typeof input.empleo === 'object' ? input.empleo : undefined,
    preparacion: input.preparacion && typeof input.preparacion === 'object' ? input.preparacion : undefined,
  };
  const concentration = concentrationFromStats(stats);
  const maturity = maturityFromStats(stats);
  const methodology = methodologyFromStats(stats);
  const formal = stats.formalizacion;
  const infra = stats.infraestructura;
  const empleo = stats.empleo;
  const prep = stats.preparacion;
  const totalEmployment = empleo?.totalPersonasVinculadas ?? ((empleo?.totalFormales ?? 0) + (empleo?.totalInformales ?? 0));
  const employmentKnown = !!empleo && ((empleo.validosFormales ?? 1) + (empleo.validosInformales ?? 1) > 0);
  const formalEmploymentShare = pct(empleo?.totalFormales ?? 0, Math.max(totalEmployment, 1));
  const topBarrio = stats.avanceBarrio?.[0];
  const topTipo = stats.byTipo?.[0];
  const weakestScore = stats.scores?.slice().sort((a, b) => a.value - b.value)[0];
  const strongestScore = stats.scores?.slice().sort((a, b) => b.value - a.value)[0];
  const hallazgos = [
    `Se caracterizaron ${stats.total || 0} emprendimientos y el ${pct(stats.rutas || 0, Math.max(stats.total || 0, 1))}% manifiesta interes en integrarse a rutas turisticas.`,
    topTipo ? `${topTipo.name} es el tipo de emprendimiento con mayor presencia, con ${topTipo.value} registros.` : 'No hay informacion suficiente para tipificar la oferta dominante.',
    formal ? `El ${formal.pctRUT}% cuenta con RUT y el ${formal.pctRNT}% con RNT, lo que deja una brecha de ${Math.max(0, formal.pctRUT - formal.pctRNT)} puntos entre formalizacion tributaria y turistica.` : 'No hay informacion suficiente sobre formalizacion.',
    infra ? `La conectividad alcanza ${infra.pctConectividad}% y la sede fisica ${infra.pctSedeFisica}%, lo que describe una base operativa de nivel ${labelLevel(average([infra.pctConectividad, infra.pctSedeFisica]))}.` : 'No hay informacion suficiente sobre infraestructura.',
    employmentKnown ? `El ecosistema reporta ${totalEmployment} personas vinculadas; el ${formalEmploymentShare}% corresponde a empleo formal.` : 'Sin dato suficiente para afirmar cuántas personas están vinculadas.',
    strongestScore ? `La dimension mejor valorada es ${strongestScore.name} (${strongestScore.value}/5), mientras que ${weakestScore?.name || 'la dimension mas debil'} requiere seguimiento prioritario.` : 'No hay autoevaluaciones suficientes para comparar dimensiones.',
    concentration.paragraph,
    maturity.paragraph,
  ].slice(0, 8);

  const brechasYRiesgos = [
    formal && formal.pctRNT < 50 ? `La baja adopcion del RNT (${formal.pctRNT}%) limita la formalizacion turistica y la insercion en circuitos promocionales institucionales.` : '',
    infra && infra.pctConectividad < 70 ? `La conectividad (${infra.pctConectividad}%) puede frenar reservas, pagos digitales y difusion comercial.` : '',
    weakestScore ? `La dimension ${weakestScore.name.toLowerCase()} presenta el promedio mas bajo (${weakestScore.value}/5) y expone una brecha de capacidades.` : '',
    stats.tasaCompletitud !== undefined && stats.tasaCompletitud < 80 ? `La completitud del formulario (${stats.tasaCompletitud}%) sugiere cautela para indicadores que dependen de respuesta plena.` : '',
    concentration.top3Share > 60 ? `El ${concentration.top3Share}% de los registros se concentra en los tres barrios principales, lo que puede sesgar la lectura territorial del universo si no se amplian barridos.` : '',
    prep && prep.promedioPreparacionTuristas < 3.5 ? `La preparacion para recibir turistas (${prep.promedioPreparacionTuristas}/5) aun no acompasa el alto interes en fortalecer el negocio.` : '',
  ].filter(Boolean);

  const recommendations = recommendationMatrix(stats, maturity.score, concentration);

  const narratives = {
    general: [
      `El observatorio registra ${stats.total || 0} emprendimientos en Santa Fe. ${pct(stats.rutas || 0, Math.max(stats.total || 0, 1))}% manifiesta interes en rutas turisticas, señal de una disposicion favorable para estrategias de articulacion territorial.`,
      `La fotografia actual muestra una oferta dominada por ${topLabel(stats.byTipo)} y con una tasa de completitud del ${valueOrZero(stats.tasaCompletitud)}%, suficiente para orientar decisiones operativas pero con limitaciones para inferencias causales.`,
    ],
    geography: [
      concentration.paragraph,
      topBarrio ? `${topBarrio.nombre} lidera con ${topBarrio.cantidad} registros y un score promedio de ${topBarrio.scorePromedio ? topBarrio.scorePromedio.toFixed(1) : '0.0'}/5. ${topBarrio.pctRNT !== undefined ? `En ese barrio, ${topBarrio.pctRNT}% reporta RNT.` : ''}`.trim() : 'No hay detalle barrial suficiente para una lectura geográfica fina.',
    ],
    formalization: formal ? [
      `El ${formal.pctRegistroMercantil}% de los emprendimientos reporta registro mercantil, el ${formal.pctRUT}% RUT y el ${formal.pctRNT}% RNT. La brecha entre RUT y RNT es de ${Math.max(0, formal.pctRUT - formal.pctRNT)} puntos, indicio de mayor avance tributario que turistico.`,
      `La facturacion electronica alcanza ${formal.pctFacturacionElectronica}% y la afiliacion a seguridad social ${valueOrZero(formal.pctAfiliacionSS)}%, niveles que ayudan a estimar la robustez operativa y laboral del ecosistema.`,
    ] : ['No hay datos de formalizacion suficientes para una lectura interpretativa.'],
    infrastructure: infra ? [
      `La infraestructura basica muestra ${infra.pctSedeFisica}% con sede fisica, ${infra.pctSeñalizacion}% con señalizacion visible y ${infra.pctConectividad}% con conectividad. El perfil general es ${labelLevel(average([infra.pctSedeFisica, infra.pctConectividad]))}, con mayor rezago en ${( [
        ['sede fisica', infra.pctSedeFisica],
        ['señalizacion', infra.pctSeñalizacion],
        ['baños', infra.pctBanos],
        ['botiquin', infra.pctBotiquin],
        ['conectividad', infra.pctConectividad],
      ] as Array<[string, number]>).sort((a, b) => a[1] - b[1])[0][0]}.`,
    ] : ['No hay datos de infraestructura suficientes para construir un analisis.'],
    employment: employmentKnown ? [
      `Se reportan ${totalEmployment} personas vinculadas, de las cuales ${empleo.totalFormales} son formales y ${empleo.totalInformales} informales o familiares. El peso del empleo formal es ${formalEmploymentShare}%, señal de la necesidad de consolidar estabilidad laboral si el objetivo es escalar oferta turistica.`,
      `El empleo con enfoque inclusivo registra ${empleo.totalMujeres} mujeres, ${empleo.totalJovenes} jovenes, ${empleo.totalMayores60} personas mayores de 60 años y ${empleo.totalDiversidad} personas de poblacion diversa vinculadas.`,
    ] : ['Sin dato suficiente para una lectura interpretativa de empleo.'],
    market: [
      stats.productoMercado?.topSegmentos?.length ? `Los segmentos con mayor presencia son ${fmtList(stats.productoMercado.topSegmentos, 4)}. Esto indica una vocacion relevante hacia ${topLabel(stats.productoMercado.topSegmentos).toLowerCase()} como mercado prioritario.` : 'No hay datos de segmentos de mercado suficientes.',
      stats.topCanales?.length ? `En presencia digital predominan ${fmtList(stats.topCanales, 4)}. La intensidad de uso de canales digitales sugiere una base comercial activa, aunque no necesariamente diversificada.` : 'No hay datos de canales digitales suficientes.',
    ],
    sustainability: [
      stats.topPracticasSostenibilidad?.length ? `Las practicas de sostenibilidad mas frecuentes son ${fmtList(stats.topPracticasSostenibilidad, 4)}. El componente obtiene ${maturity.components.find((component) => component.label === 'Sostenibilidad')?.score.toFixed(0) || 0}/100 dentro del indice de madurez.` : 'No hay datos de sostenibilidad suficientes.',
    ],
    capacities: [
      strongestScore ? `La autoevaluacion del ecosistema ubica como fortaleza principal a ${strongestScore.name} (${strongestScore.value}/5).` : 'No hay scores suficientes para identificar fortalezas.',
      weakestScore ? `La dimension con mayor necesidad de fortalecimiento es ${weakestScore.name} (${weakestScore.value}/5), coherente con las necesidades mas repetidas: ${fmtList(stats.necesidades, 3)}.` : 'No hay scores suficientes para identificar brechas de capacidad.',
    ],
  };

  const glossary = [
    { term: 'RNT', definition: 'Registro Nacional de Turismo, requisito habilitante para diversos prestadores de servicios turisticos en Colombia.' },
    { term: 'RUT', definition: 'Registro Unico Tributario administrado por la DIAN para identificacion fiscal.' },
    { term: 'UPZ', definition: 'Unidad de Planeamiento Zonal; subdivision urbana utilizada para gestion y analisis territorial en Bogota.' },
    { term: 'HHI', definition: 'Indice Herfindahl-Hirschman, usado para medir concentracion; valores mas altos indican mayor dependencia de pocos territorios o actores.' },
    { term: 'Emprendimiento turistico', definition: 'Unidad economica o iniciativa que ofrece bienes, servicios o experiencias con potencial de atencion a visitantes.' },
    { term: 'Geolocalizacion por centroide', definition: 'Ubicacion aproximada asignada al centro geografico del barrio cuando no se dispone del punto exacto del emprendimiento.' },
  ];

  return {
    methodology,
    hallazgos,
    brechasYRiesgos,
    recommendations,
    concentration,
    maturity,
    narratives,
    glossary,
  };
}

export function buildFallbackSummary(stats: StatsInput): string {
  const analysis = buildDeterministicAnalysis(stats);
  const lines: string[] = [];
  lines.push('## Diagnostico general');
  analysis.narratives.general.forEach((line) => lines.push(line));
  lines.push('');
  lines.push('## Hallazgos clave');
  analysis.hallazgos.slice(0, 8).forEach((item) => lines.push(`- ${item}`));
  lines.push('');
  lines.push('## Lectura territorial');
  analysis.narratives.geography.forEach((line) => lines.push(line));
  lines.push('');
  lines.push('## Formalizacion e infraestructura');
  [...analysis.narratives.formalization, ...analysis.narratives.infrastructure].forEach((line) => lines.push(line));
  lines.push('');
  lines.push('## Empleo, mercado y sostenibilidad');
  [...analysis.narratives.employment, ...analysis.narratives.market, ...analysis.narratives.sustainability].forEach((line) => lines.push(line));
  lines.push('');
  lines.push('## Brechas y riesgos');
  analysis.brechasYRiesgos.forEach((item) => lines.push(`- ${item}`));
  lines.push('');
  lines.push('## Recomendaciones priorizadas');
  analysis.recommendations.forEach((item, index) => lines.push(`${index + 1}. [${item.priority}] ${item.action} Indicador sugerido: ${item.indicator}.`));
  return lines.join('\n');
}
