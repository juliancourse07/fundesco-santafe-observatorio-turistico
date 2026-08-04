import { centroidForBarrio } from './geo';
export type RawRecord = Record<string, any>;
export type SurveyRecord = {
  id: string; fecha: string; upz: string; barrio: string; zona: string; tipo: string;
  nombre: string; estado: string; lat: number; lng: number;
  geoPrecision: 'exacto' | 'estimado' | 'sin dato';
  quiereRuta: boolean; necesidades: string[]; herramientas: string[]; scores: Record<string, number>;
  // formalización
  tieneRegistroMercantil: boolean; tieneRNT: boolean; tieneRUT: boolean; facturacionElectronica: boolean;
  // infraestructura
  tieneSedeFisica: boolean; tieneSeñalizacion: boolean; tieneBanos: boolean; tieneBotiquin: boolean;
  conectividad: string;
  // empleo
  empleadosFormales: number; empleadosInformales: number; mujeres: number; jovenes: number;
  mayores60: number; diversidad: number;
  // capacitación y sostenibilidad
  capacitacionPrevia: boolean; practicasSostenibilidad: string[]; necesidadesCapacitacion: string[];
  // preparación turística
  nivelInteresFortalecer: number; nivelPreparacionTuristas: number; nivelAporteTurismo: number;
  // oportunidades y riesgos
  oportunidades: string; riesgos: string;
  // canales digitales
  canalesDigitales: string[];
};

const clean = (v: any) => String(v ?? '').trim();
const split = (v: any) => clean(v).split(/,|;|\n/).map(s => s.trim()).filter(Boolean);
const num = (v: any) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : undefined; };
const numOrZero = (v: any) => { const n = num(v); return n !== undefined ? n : 0; };
const yesNo = (v: any) => /^s[ií]/i.test(clean(v));

export function normaliseRecord(r: RawRecord, idx: number): SurveyRecord {
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
    upz, barrio, zona: clean(r['Zona turística asociada']),
    tipo: clean(r['Tipo principal de emprendimiento']),
    nombre: clean(r['Nombre comercial'] || r['Nombre del emprendimiento']),
    estado: clean(r['Estado de completitud del registro']),
    lat: lat!, lng: lng!, geoPrecision,
    quiereRuta: yesNo(r['¿El emprendimiento quiere hacer parte de rutas turísticas de Santa Fe?']),
    necesidades: split(r['Áreas donde requiere mayor apoyo']),
    herramientas: split(r['Herramientas digitales que usa actualmente']),
    scores,
    tieneRegistroMercantil: yesNo(r['¿Cuenta con registro mercantil / Cámara de Comercio?']),
    tieneRNT: yesNo(r['¿Cuenta con Registro Nacional de Turismo - RNT?']),
    tieneRUT: yesNo(r['¿Cuenta con RUT?']),
    facturacionElectronica: yesNo(r['¿Usa facturación electrónica o documento equivalente?']),
    tieneSedeFisica: yesNo(r['¿Cuenta con sede física?']),
    tieneSeñalizacion: yesNo(r['¿Cuenta con señalización visible?']),
    tieneBanos: yesNo(r['¿Cuenta con baños disponibles para usuarios?']),
    tieneBotiquin: yesNo(r['¿Cuenta con botiquín y elementos de emergencia?']),
    conectividad: clean(r['Conectividad a internet']),
    empleadosFormales: numOrZero(r['Número de empleados formales']),
    empleadosInformales: numOrZero(r['Número de empleados informales o familiares sin contrato']),
    mujeres: numOrZero(r['Número de mujeres vinculadas']),
    jovenes: numOrZero(r['Número de jóvenes vinculados']),
    mayores60: numOrZero(r['Número de personas mayores de 60 años vinculadas']),
    diversidad: numOrZero(r['Número de personas de población diversa o enfoque diferencial vinculadas']),
    capacitacionPrevia: yesNo(r['Ha recibido capacitaciones relacionadas con turismo, servicio, sostenibilidad, marketing, finanzas o tecnología']),
    practicasSostenibilidad: split(r['Prácticas de sostenibilidad implementadas']),
    necesidadesCapacitacion: split(r['Necesidades de capacitación del equipo']),
    nivelInteresFortalecer: numOrZero(r['Nivel de interés en fortalecer el emprendimiento con el proyecto']),
    nivelPreparacionTuristas: numOrZero(r['Nivel de preparación actual para recibir turistas o visitantes']),
    nivelAporteTurismo: numOrZero(r['Nivel de aporte del emprendimiento al turismo cultural, patrimonial, comunitario o sostenible']),
    oportunidades: clean(r['Oportunidades de crecimiento identificadas']).slice(0, 200),
    riesgos: clean(r['Riesgos o amenazas para el desarrollo turístico']).slice(0, 200),
    canalesDigitales: split(r['Canales digitales activos']),
  };
}

export function buildStats(records: SurveyRecord[]) {
  const n = records.length || 1;
  const pct = (count: number) => Math.round((count / n) * 100);
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
    pctRegistroMercantil: pct(records.filter(r => r.tieneRegistroMercantil).length),
    pctRNT: pct(records.filter(r => r.tieneRNT).length),
    pctRUT: pct(records.filter(r => r.tieneRUT).length),
    pctFacturacionElectronica: pct(records.filter(r => r.facturacionElectronica).length),
  };

  // infraestructura
  const infraestructura = {
    pctSedeFisica: pct(records.filter(r => r.tieneSedeFisica).length),
    pctSeñalizacion: pct(records.filter(r => r.tieneSeñalizacion).length),
    pctBanos: pct(records.filter(r => r.tieneBanos).length),
    pctBotiquin: pct(records.filter(r => r.tieneBotiquin).length),
    pctConectividad: pct(records.filter(r => r.conectividad && r.conectividad.toLowerCase() !== 'no' && r.conectividad !== '').length),
  };

  // empleo
  const empleo = {
    totalFormales: records.reduce((a, r) => a + r.empleadosFormales, 0),
    totalInformales: records.reduce((a, r) => a + r.empleadosInformales, 0),
    totalMujeres: records.reduce((a, r) => a + r.mujeres, 0),
    totalJovenes: records.reduce((a, r) => a + r.jovenes, 0),
    totalMayores60: records.reduce((a, r) => a + r.mayores60, 0),
    totalDiversidad: records.reduce((a, r) => a + r.diversidad, 0),
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

  // avance por barrio para el PDF/análisis territorial
  const avanceBarrio = Object.entries(byBarrio).sort((a, b) => b[1] - a[1]).map(([nombre, cantidad]) => ({
    nombre,
    cantidad,
    pctTotal: Math.round((cantidad / n) * 100),
    scorePromedio: avg(records.filter(r => r.barrio === nombre).flatMap(r => Object.values(r.scores)).filter(v => typeof v === 'number')),
  }));

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
    topCanales,
    pctCapacitacionPrevia,
    topNecesidadesCapacitacion,
    topPracticasSostenibilidad,
    preparacion,
    avanceBarrio,
  };
}
