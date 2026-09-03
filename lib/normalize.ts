import { centroidForBarrio } from './geo';
export type RawRecord = Record<string, any>;
export type SurveyRecord = {
  id: string; fecha: string; encuestador: string; upz: string; barrio: string; zona: string; tipo: string;
  nombre: string; estado: string; lat: number; lng: number;
  geoPrecision: 'exacto' | 'estimado' | 'sin dato';
  quiereRuta: boolean | null; necesidades: string[]; herramientas: string[]; scores: Record<string, number>;
  // formalización
  tieneRegistroMercantil: boolean | null; tieneRNT: boolean | null; tieneRUT: boolean | null; facturacionElectronica: boolean | null;
  tieneAfiliacionSS: boolean | null; tieneSeguro: boolean | null;
  conocimientoNormatividad: string; certificaciones: string[];
  // infraestructura
  tieneSedeFisica: boolean | null; tieneSeñalizacion: boolean | null; tieneBanos: boolean | null; tieneBotiquin: boolean | null;
  conectividad: string;
  // empleo
  empleadosFormales: number | null; empleadosInformales: number | null; mujeres: number | null; jovenes: number | null;
  mayores60: number | null; diversidad: number | null; totalPersonasVinculadas: number | null;
  // perfil representante
  generoRepresentante: string; nivelEducativo: string; enfoqueAlta: string; edadRepresentante: number;
  // producto turístico y mercado
  segmentosMercado: string[]; publicoObjetivo: string;
  capacidadDiaria: number; capacidadVisitantes: number;
  idiomas: string[];
  // capacitación y sostenibilidad
  capacitacionPrevia: boolean | null; practicasSostenibilidad: string[]; necesidadesCapacitacion: string[];
  // preparación turística
  nivelInteresFortalecer: number; nivelPreparacionTuristas: number; nivelAporteTurismo: number;
  // oportunidades y riesgos
  oportunidades: string; riesgos: string;
  // canales digitales
  canalesDigitales: string[];
  // articulación
  atractivosCercanos: string; propuestaArticulacion: string;
};

const clean = (v: any) => String(v?.Value ?? v?.Title ?? v ?? '').trim();
const key = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^OData_/, '').replace(/^field_\d+_?/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
export function toNumber(v: any): number | null {
  if (v === null || v === undefined || clean(v) === '' || /^(n\/?a|na|null|sin dato)$/i.test(clean(v))) return null;
  const raw = clean(v).replace(/\s/g, '');
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : /^[+-]?\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, '')
      : raw.replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
export function toBool(v: any): boolean | null {
  if (typeof v === 'boolean') return v;
  const value = clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^(si|s|yes|true|1|x)$/.test(value)) return true;
  if (/^(no|n|false|0)$/.test(value)) return false;
  return null;
}
export function toChoices(v: any): string[] {
  const values = Array.isArray(v) ? v : Array.isArray(v?.results) ? v.results : [v];
  return values.flatMap(value => clean(value).split(/,|;|\n/)).map(value => value.trim()).filter(Boolean);
}
const split = toChoices;
const num = toNumber;
const numOrZero = (v: any) => num(v) ?? 0;
const yesNo = (v: any) => toBool(v) === true;
function field(record: RawRecord, label: string, ...aliases: string[]) {
  const targets = [label, ...aliases].map(key);
  const found = Object.keys(record).find(name => targets.includes(key(name)));
  return found === undefined ? undefined : record[found];
}

export function normaliseRecord(r: RawRecord, idx: number): SurveyRecord {
  r = new Proxy(r, {
    get(target, property) {
      if (typeof property !== 'string' || Object.prototype.hasOwnProperty.call(target, property)) return (target as any)[property];
      return field(target, property);
    },
  });
  const barrio = clean(r['Barrio donde opera el emprendimiento'] || r['Barrio / sector de aplicación'] || 'Otro');
  const upz = clean(r['UPZ donde opera el emprendimiento'] || r['UPZ de aplicación'] || 'Sin clasificar');
  const latRaw = num(r['Latitud decimal capturada manualmente']);
  const lngRaw = num(r['Longitud decimal capturada manualmente']);
  let lat = latRaw, lng = lngRaw, geoPrecision: 'exacto' | 'estimado' | 'sin dato' = 'exacto';
  if (lat === undefined || lng === undefined) { const c = centroidForBarrio(barrio); lat = c.lat; lng = c.lng; geoPrecision = 'estimado'; }

  const scoreCols: [string, string][] = [
    ['Gobernanza', 'Gobernanza: articulación con instituciones, redes o actores locales'],
    ['Tecnología', 'Tecnología: uso de herramientas digitales para vender, promocionar o gestionar clientes'],
    ['Innovación', 'Innovación: desarrollo de productos, experiencias o mejoras nuevas'],
    ['Sostenibilidad', 'Sostenibilidad ambiental: manejo de residuos, agua, energía y cuidado del entorno'],
    ['Accesibilidad', 'Accesibilidad: facilidad de acceso para personas con discapacidad o movilidad reducida'],
    ['Comercio', 'Comercio: capacidad de venta, precios, promociones, canales y medios de pago'],
    ['Tejido empresarial', 'Tejido empresarial: alianzas con otros emprendimientos, rutas o redes turísticas'],
  ];
  const scores: Record<string, number> = {};
  scoreCols.forEach(([k, c]) => { const n = num(r[c]); if (n !== undefined) scores[k] = n; });

  return {
    id: String(idx + 1), fecha: clean(r['Fecha de aplicación'] || r['Marca temporal']),
    encuestador: clean(r['Nombre del encuestador/a']),
    upz, barrio, zona: clean(r['Zona turística asociada']),
    tipo: clean(r['Tipo principal de emprendimiento']),
    nombre: clean(r['Nombre comercial'] || r['Nombre del emprendimiento']),
    estado: clean(r['Estado de completitud del registro']),
    lat: lat!, lng: lng!, geoPrecision,
    quiereRuta: toBool(r['¿El emprendimiento quiere hacer parte de rutas turísticas de Santa Fe?']),
    necesidades: split(r['Áreas donde requiere mayor apoyo']),
    herramientas: split(r['Herramientas digitales que usa actualmente']),
    scores,
    tieneRegistroMercantil: toBool(r['¿Cuenta con registro mercantil / Cámara de Comercio?']),
    tieneRNT: toBool(r['¿Cuenta con Registro Nacional de Turismo - RNT?']),
    tieneRUT: toBool(r['¿Cuenta con RUT?']),
    facturacionElectronica: toBool(r['¿Usa facturación electrónica o documento equivalente?']),
    tieneAfiliacionSS: toBool(r['¿Tiene afiliación a seguridad social?']),
    tieneSeguro: toBool(r['¿Cuenta con seguro para actividades o responsabilidad civil?']),
    conocimientoNormatividad: clean(r['Conocimiento de normatividad turística']),
    certificaciones: split(r['Certificaciones de calidad turística, sostenibilidad, sellos o reconocimientos']),
    tieneSedeFisica: toBool(r['¿Cuenta con sede física?']),
    tieneSeñalizacion: toBool(r['¿Cuenta con señalización visible?']),
    tieneBanos: toBool(r['¿Cuenta con baños disponibles para usuarios?']),
    tieneBotiquin: toBool(r['¿Cuenta con botiquín y elementos de emergencia?']),
    conectividad: clean(r['Conectividad a internet']),
    empleadosFormales: num(r['Número de empleados formales']),
    empleadosInformales: num(r['Número de empleados informales o familiares sin contrato']),
    mujeres: num(r['Número de mujeres vinculadas']),
    jovenes: num(r['Número de jóvenes vinculados']),
    mayores60: num(r['Número de personas mayores de 60 años vinculadas']),
    diversidad: num(r['Número de personas de población diversa o enfoque diferencial vinculadas']),
    totalPersonasVinculadas: num(r['Número total de empleados o personas vinculadas']),
    generoRepresentante: clean(r['Género del representante']),
    nivelEducativo: clean(r['Nivel educativo del representante']),
    enfoqueAlta: clean(r['Enfoque diferencial del representante']),
    edadRepresentante: numOrZero(r['Edad del representante']),
    segmentosMercado: split(r['Segmentos de mercado atendidos']),
    publicoObjetivo: clean(r['Público objetivo principal']),
    capacidadDiaria: numOrZero(r['Capacidad máxima de atención diaria']),
    capacidadVisitantes: numOrZero(r['Capacidad máxima de visitantes al mismo tiempo']),
    idiomas: split(r['Idiomas disponibles para atención']),
    capacitacionPrevia: toBool(r['Ha recibido capacitaciones relacionadas con turismo, servicio, sostenibilidad, marketing, finanzas o tecnología']),
    practicasSostenibilidad: split(r['Prácticas de sostenibilidad implementadas']),
    necesidadesCapacitacion: split(r['Necesidades de capacitación del equipo']),
    nivelInteresFortalecer: numOrZero(r['Nivel de interés en fortalecer el emprendimiento con el proyecto']),
    nivelPreparacionTuristas: numOrZero(r['Nivel de preparación actual para recibir turistas o visitantes']),
    nivelAporteTurismo: numOrZero(r['Nivel de aporte del emprendimiento al turismo cultural, patrimonial, comunitario o sostenible']),
    oportunidades: clean(r['Oportunidades de crecimiento identificadas']).slice(0, 200),
    riesgos: clean(r['Riesgos o amenazas para el desarrollo turístico']).slice(0, 200),
    canalesDigitales: split(r['Canales digitales activos']),
    atractivosCercanos: clean(r['Atractivos cercanos relacionados']).slice(0, 150),
    propuestaArticulacion: clean(r['Propuesta de articulación con rutas turísticas']).slice(0, 150),
  };
}

export function buildStats(records: SurveyRecord[]) {
  const n = records.length || 1;
  const pct = (count: number) => Math.round((count / n) * 100);
  const pctAnswered = (values: Array<boolean | null>) => {
    const answered = values.filter((value): value is boolean => value !== null);
    return answered.length ? Math.round((answered.filter(Boolean).length / answered.length) * 100) : null;
  };
  const sumAnswered = (values: Array<number | null>) => {
    const answered = values.filter((value): value is number => value !== null);
    return { value: answered.reduce((sum, value) => sum + value, 0), validos: answered.length };
  };
  const count = (arr: string[]) => arr.reduce((a, v) => { if (v) a[v] = (a[v] || 0) + 1; return a; }, {} as Record<string, number>);
  const top = (obj: Record<string, number>, k = 8) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, value]) => ({ name, value }));
  const avg = (vals: number[]) => vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;

  const byBarrio = count(records.map(r => r.barrio));
  const byUpz = count(records.map(r => r.upz));
  const byTipo = count(records.map(r => r.tipo));
  const necesidades = count(records.flatMap(r => r.necesidades));
  const herramientas = count(records.flatMap(r => r.herramientas));
  const dims = ['Gobernanza', 'Tecnología', 'Innovación', 'Sostenibilidad', 'Accesibilidad', 'Comercio', 'Tejido empresarial'];
  const scores = dims.map(d => {
    const vals = records.map(r => r.scores[d]).filter(v => typeof v === 'number');
    return { name: d, value: vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0 };
  });

  // formalización
  const formalizacion = {
    pctRegistroMercantil: pctAnswered(records.map(r => r.tieneRegistroMercantil)),
    pctRNT: pctAnswered(records.map(r => r.tieneRNT)),
    pctRUT: pctAnswered(records.map(r => r.tieneRUT)),
    pctFacturacionElectronica: pctAnswered(records.map(r => r.facturacionElectronica)),
    pctAfiliacionSS: pctAnswered(records.map(r => r.tieneAfiliacionSS)),
    pctSeguro: pctAnswered(records.map(r => r.tieneSeguro)),
  };

  // infraestructura
  const infraestructura = {
    pctSedeFisica: pctAnswered(records.map(r => r.tieneSedeFisica)),
    pctSeñalizacion: pctAnswered(records.map(r => r.tieneSeñalizacion)),
    pctBanos: pctAnswered(records.map(r => r.tieneBanos)),
    pctBotiquin: pctAnswered(records.map(r => r.tieneBotiquin)),
    pctConectividad: pctAnswered(records.map(r => r.conectividad ? !/^(no|ninguna|sin)$/i.test(r.conectividad) : null)),
  };

  // empleo
  const formal = sumAnswered(records.map(r => r.empleadosFormales));
  const informal = sumAnswered(records.map(r => r.empleadosInformales));
  const mujeres = sumAnswered(records.map(r => r.mujeres));
  const jovenes = sumAnswered(records.map(r => r.jovenes));
  const mayores60 = sumAnswered(records.map(r => r.mayores60));
  const diversidad = sumAnswered(records.map(r => r.diversidad));
  const totalVinculados = sumAnswered(records.map(r => r.totalPersonasVinculadas));
  const empleo = {
    totalFormales: formal.value, totalInformales: informal.value, totalMujeres: mujeres.value,
    totalJovenes: jovenes.value, totalMayores60: mayores60.value, totalDiversidad: diversidad.value,
    totalPersonasVinculadas: totalVinculados.value,
    validosFormales: formal.validos, validosInformales: informal.validos, validosMujeres: mujeres.validos,
    validosJovenes: jovenes.validos, validosMayores60: mayores60.validos, validosDiversidad: diversidad.validos,
    validosPersonasVinculadas: totalVinculados.validos,
  };

  // perfil de emprendedores
  const generoCount = count(records.map(r => r.generoRepresentante).filter(Boolean));
  const educacionCount = count(records.map(r => r.nivelEducativo).filter(Boolean));
  const enfoqueCount = count(records.map(r => r.enfoqueAlta).filter(Boolean));
  const edades = records.map(r => r.edadRepresentante).filter(v => v > 0);
  const perfilEmprendedores = {
    topGenero: top(generoCount, 5),
    topEducacion: top(educacionCount, 6),
    topEnfoque: top(enfoqueCount, 5),
    promedioEdad: avg(edades),
  };

  // producto turístico y mercado
  const segmentosCount = count(records.flatMap(r => r.segmentosMercado));
  const idiomasCount = count(records.flatMap(r => r.idiomas));
  const publicoCount = count(records.map(r => r.publicoObjetivo).filter(Boolean));
  const capacidadTotal = records.reduce((a, r) => a + r.capacidadDiaria, 0);
  const capacidadVisitantesTotal = records.reduce((a, r) => a + r.capacidadVisitantes, 0);
  const certificacionesCount = count(records.flatMap(r => r.certificaciones));
  const normativaCount = count(records.map(r => r.conocimientoNormatividad).filter(Boolean));
  const productoMercado = {
    topSegmentos: top(segmentosCount, 8),
    topIdiomas: top(idiomasCount, 6),
    topPublico: top(publicoCount, 5),
    capacidadDiariaTotal: capacidadTotal,
    capacidadVisitantesTotal,
    topCertificaciones: top(certificacionesCount, 5),
    topNormativa: top(normativaCount, 4),
  };

  // tecnología
  const topCanales = top(count(records.flatMap(r => r.canalesDigitales)), 8);

  // capacitación
  const pctCapacitacionPrevia = pct(records.filter(r => r.capacitacionPrevia).length);
  const topNecesidadesCapacitacion = top(count(records.flatMap(r => r.necesidadesCapacitacion)), 8);

  // sostenibilidad
  const topPracticasSostenibilidad = top(count(records.flatMap(r => r.practicasSostenibilidad)), 8);

  // preparación turística
  const preparacion = {
    promedioInteresFortalecer: avg(records.map(r => r.nivelInteresFortalecer).filter(v => v > 0)),
    promedioPreparacionTuristas: avg(records.map(r => r.nivelPreparacionTuristas).filter(v => v > 0)),
    promedioAporteTurismo: avg(records.map(r => r.nivelAporteTurismo).filter(v => v > 0)),
  };

  // articulación y atractivos
  const atractivos = top(count(records.map(r => r.atractivosCercanos).filter(Boolean)), 6);
  const articulacion = top(count(records.map(r => r.propuestaArticulacion).filter(Boolean)), 6);

  // encuestadores
  const topEncuestadores = top(count(records.map(r => r.encuestador).filter(Boolean)), 10);

  // completitud
  const completitudDist = top(count(records.map(r => r.estado).filter(Boolean)), 6);
  const completosN = records.filter(r => /completo|completa/i.test(r.estado)).length;
  const tasaCompletitud = pct(completosN);

  // series temporales diarias
  const byFecha: Array<{ fecha: string; value: number }> = (() => {
    const raw: Record<string, number> = {};
    for (const r of records) {
      if (!r.fecha) continue;
      // Accept DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY or just keep first 10 chars
      let key = r.fecha.trim().slice(0, 10);
      // Try to normalise to YYYY-MM-DD for sorting
      const ddmm = key.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
      if (ddmm) {
        const [, d, m, y] = ddmm;
        const year = y.length === 2 ? `20${y}` : y;
        key = `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      }
      if (key) raw[key] = (raw[key] || 0) + 1;
    }
    return Object.entries(raw).sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, value]) => ({ fecha, value }));
  })();

  // fechas de inicio y fin del periodo
  const fechaInicio = byFecha.length ? byFecha[0].fecha : '';
  const fechaFin = byFecha.length ? byFecha[byFecha.length - 1].fecha : '';

  // avance por barrio para el PDF/análisis territorial
  const avanceBarrio = Object.entries(byBarrio).sort((a, b) => b[1] - a[1]).map(([nombre, cantidad]) => {
    const barrioRecs = records.filter(r => r.barrio === nombre);
    return {
      nombre,
      cantidad,
      pctTotal: Math.round((cantidad / n) * 100),
      scorePromedio: avg(barrioRecs.flatMap(r => Object.values(r.scores)).filter(v => typeof v === 'number')),
      pctRNT: Math.round((barrioRecs.filter(r => r.tieneRNT).length / Math.max(barrioRecs.length, 1)) * 100),
      pctRegistroMercantil: Math.round((barrioRecs.filter(r => r.tieneRegistroMercantil).length / Math.max(barrioRecs.length, 1)) * 100),
    };
  });

  return {
    total: records.length,
    rutas: records.filter(r => r.quiereRuta).length,
    exactos: records.filter(r => r.geoPrecision === 'exacto').length,
    estimados: records.filter(r => r.geoPrecision === 'estimado').length,
    byBarrio: top(byBarrio),
    byUpz: top(byUpz),
    byTipo: top(byTipo),
    necesidades: top(necesidades, 12),
    herramientas: top(herramientas, 10),
    scores,
    formalizacion,
    infraestructura,
    empleo,
    perfilEmprendedores,
    productoMercado,
    topCanales,
    pctCapacitacionPrevia,
    topNecesidadesCapacitacion,
    topPracticasSostenibilidad,
    preparacion,
    atractivos,
    articulacion,
    avanceBarrio,
    topEncuestadores,
    completitudDist,
    tasaCompletitud,
    byFecha,
    fechaInicio,
    fechaFin,
  };
}
