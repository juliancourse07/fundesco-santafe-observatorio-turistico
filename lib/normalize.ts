import { centroidForBarrio } from './geo';
export type RawRecord = Record<string, any>;
export type RangoPersonas = { min: number; max: number; punto: number; esCero: boolean };
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
  empleadosFormalesRango: RangoPersonas | null; empleadosInformalesRango: RangoPersonas | null; mujeresRango: RangoPersonas | null; jovenesRango: RangoPersonas | null;
  mayores60Rango: RangoPersonas | null; diversidadRango: RangoPersonas | null; totalPersonasVinculadasRango: RangoPersonas | null;
  // perfil representante
  generoRepresentante: string; nivelEducativo: string; enfoqueAlta: string; edadRepresentante: number | null;
  anosExperienciaTurismo: number | null;
  // producto turístico y mercado
  segmentosMercado: string[]; publicoObjetivo: string;
  capacidadDiaria: number | null; capacidadVisitantes: number | null;
  numeroEspaciosAtencion: number | null;
  idiomas: string[];
  // capacitación y sostenibilidad
  capacitacionPrevia: boolean | null; practicasSostenibilidad: string[]; necesidadesCapacitacion: string[];
  // preparación turística
  nivelInteresFortalecer: number | null; nivelPreparacionTuristas: number | null; nivelAporteTurismo: number | null;
  // oportunidades y riesgos
  oportunidades: string; riesgos: string;
  // canales digitales
  canalesDigitales: string[];
  // articulación
  atractivosCercanos: string; propuestaArticulacion: string;
};

const clean = (v: any) => String(v?.Value ?? v?.Title ?? v ?? '').trim();
/**
 * Normaliza un encabezado de columna a una clave comparable sin tildes, sin
 * mayúsculas, sin espacios/puntuación y sin los prefijos/sufijos que agregan las
 * exportaciones de SharePoint o las columnas duplicadas de Google Sheets.
 * Así "N° de empleados formales", "Número de empleados formales_1" y
 * "field_88_NumeroDeEmpleadosFormales" resuelven a la misma clave.
 */
const key = (v: string) => v
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/^OData_/, '')
  .replace(/^field_\d+_?/i, '')
  .replace(/^column_?\d+_?/i, '')
  .replace(/\bN[°ºo]\.?\b/gi, 'numero')
  .replace(/[^a-z0-9]/gi, '')
  .replace(/\d+$/, '')
  .toLowerCase();
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
const yesNo = (v: any) => toBool(v) === true;
export function findFieldName(record: RawRecord, label: string, ...aliases: string[]) {
  const targets = [label, ...aliases].map(key);
  // Preferir coincidencia exacta de clave para evitar falsos positivos.
  const exact = Object.keys(record).find(name => targets.includes(key(name)));
  if (exact !== undefined) return exact;
  // Tolerancia a prefijos/sufijos extra en el encabezado (p. ej. "Campo: Número de
  // empleados formales" o marcas de sección). Solo se acepta si es la ÚNICA
  // coincidencia parcial para no mezclar columnas.
  const partial = Object.keys(record).filter(name => {
    const k = key(name);
    return targets.some(t => t.length >= 8 && (k.includes(t) || t.includes(k)));
  });
  return partial.length === 1 ? partial[0] : undefined;
}

export function field(record: RawRecord, label: string, ...aliases: string[]) {
  const name = findFieldName(record, label, ...aliases);
  return name !== undefined ? record[name] : undefined;
}

const rango = (min: number, max = min): RangoPersonas => ({
  min,
  max,
  punto: (min + max) / 2,
  esCero: min === 0 && max === 0,
});

const normalizeRangoText = (value: any) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

function parseRangoSimple(value: string): RangoPersonas | null {
  if (!value || /^(n\/?a|na|null|sin dato)$/.test(value)) return null;
  if (/^(0|ningun[ao]?\b)/.test(value)) return rango(0);
  if (/^solo el propietario/.test(value)) return rango(1);

  const interval = value.match(/\b(\d+)\s*(?:a|o|-)\s*(\d+)\b/);
  if (interval) {
    const min = Number(interval[1]);
    const max = Number(interval[2]);
    return Number.isFinite(min) && Number.isFinite(max) ? rango(Math.min(min, max), Math.max(min, max)) : null;
  }

  const open = value.match(/\bmas\s+de\s+(\d+)\b/);
  if (open) {
    const min = Number(open[1]) + 1;
    return Number.isFinite(min) ? rango(min) : null;
  }

  const exact = value.match(/\b(\d+)\b/);
  if (exact) {
    const n = Number(exact[1]);
    return Number.isFinite(n) ? rango(n) : null;
  }

  return null;
}

export function parseRangoPersonas(valor: any): RangoPersonas | null {
  const value = normalizeRangoText(valor);
  if (!value) return null;
  const opciones = value.split(',').map(part => parseRangoSimple(part.trim())).filter((part): part is RangoPersonas => part !== null);
  if (!opciones.length) return null;
  return opciones.sort((a, b) => (b.max - a.max) || (b.min - a.min) || (b.punto - a.punto))[0];
}

const rangoPunto = (valor: any) => parseRangoPersonas(valor)?.punto ?? null;

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
  scoreCols.forEach(([k, c]) => { const n = num(r[c]); if (n !== null) scores[k] = n; });
  const empleadosFormalesRango = parseRangoPersonas(r['Número de empleados formales']);
  const empleadosInformalesRango = parseRangoPersonas(r['Número de empleados informales o familiares sin contrato']);
  const mujeresRango = parseRangoPersonas(r['Número de mujeres vinculadas']);
  const jovenesRango = parseRangoPersonas(r['Número de jóvenes vinculados']);
  const mayores60Rango = parseRangoPersonas(r['Número de personas mayores de 60 años vinculadas']);
  const diversidadRango = parseRangoPersonas(r['Número de personas de población diversa o enfoque diferencial vinculadas']);
  const totalPersonasVinculadasRango = parseRangoPersonas(r['Número total de empleados o personas vinculadas']);

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
    empleadosFormales: empleadosFormalesRango?.punto ?? null,
    empleadosInformales: empleadosInformalesRango?.punto ?? null,
    mujeres: mujeresRango?.punto ?? null,
    jovenes: jovenesRango?.punto ?? null,
    mayores60: mayores60Rango?.punto ?? null,
    diversidad: diversidadRango?.punto ?? null,
    totalPersonasVinculadas: totalPersonasVinculadasRango?.punto ?? null,
    empleadosFormalesRango,
    empleadosInformalesRango,
    mujeresRango,
    jovenesRango,
    mayores60Rango,
    diversidadRango,
    totalPersonasVinculadasRango,
    generoRepresentante: clean(r['Género del representante']),
    nivelEducativo: clean(r['Nivel educativo del representante']),
    enfoqueAlta: clean(r['Enfoque diferencial del representante']),
    edadRepresentante: num(r['Edad del representante']),
    anosExperienciaTurismo: rangoPunto(r['Años de experiencia en turismo o actividad relacionada']),
    segmentosMercado: split(r['Segmentos de mercado atendidos']),
    publicoObjetivo: clean(r['Público objetivo principal']),
    capacidadDiaria: rangoPunto(r['Capacidad máxima de atención diaria']),
    capacidadVisitantes: rangoPunto(r['Capacidad máxima de visitantes al mismo tiempo']),
    numeroEspaciosAtencion: rangoPunto(r['Número de espacios de atención']),
    idiomas: split(r['Idiomas disponibles para atención']),
    capacitacionPrevia: toBool(r['Ha recibido capacitaciones relacionadas con turismo, servicio, sostenibilidad, marketing, finanzas o tecnología']),
    practicasSostenibilidad: split(r['Prácticas de sostenibilidad implementadas']),
    necesidadesCapacitacion: split(r['Necesidades de capacitación del equipo']),
    nivelInteresFortalecer: num(r['Nivel de interés en fortalecer el emprendimiento con el proyecto']),
    nivelPreparacionTuristas: num(r['Nivel de preparación actual para recibir turistas o visitantes']),
    nivelAporteTurismo: num(r['Nivel de aporte del emprendimiento al turismo cultural, patrimonial, comunitario o sostenible']),
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
  const sumRangos = (values: Array<RangoPersonas | null>) => {
    const answered = values.filter((value): value is RangoPersonas => value !== null);
    return {
      min: Math.round(answered.reduce((sum, value) => sum + value.min, 0)),
      max: Math.round(answered.reduce((sum, value) => sum + value.max, 0)),
      punto: Math.round(answered.reduce((sum, value) => sum + value.punto, 0)),
      validos: answered.length,
    };
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
  const formalRango = sumRangos(records.map(r => r.empleadosFormalesRango));
  const informalRango = sumRangos(records.map(r => r.empleadosInformalesRango));
  const mujeresRango = sumRangos(records.map(r => r.mujeresRango));
  const jovenesRango = sumRangos(records.map(r => r.jovenesRango));
  const mayores60Rango = sumRangos(records.map(r => r.mayores60Rango));
  const diversidadRango = sumRangos(records.map(r => r.diversidadRango));
  const totalVinculadosRango = sumRangos(records.map(r => r.totalPersonasVinculadasRango));
  const empleo = {
    totalFormales: formal.value, totalInformales: informal.value, totalMujeres: mujeres.value,
    totalJovenes: jovenes.value, totalMayores60: mayores60.value, totalDiversidad: diversidad.value,
    totalPersonasVinculadas: totalVinculados.value,
    totalFormalesMin: formalRango.min, totalFormalesMax: formalRango.max, totalFormalesPunto: formalRango.punto,
    totalInformalesMin: informalRango.min, totalInformalesMax: informalRango.max, totalInformalesPunto: informalRango.punto,
    totalMujeresMin: mujeresRango.min, totalMujeresMax: mujeresRango.max, totalMujeresPunto: mujeresRango.punto,
    totalJovenesMin: jovenesRango.min, totalJovenesMax: jovenesRango.max, totalJovenesPunto: jovenesRango.punto,
    totalMayores60Min: mayores60Rango.min, totalMayores60Max: mayores60Rango.max, totalMayores60Punto: mayores60Rango.punto,
    totalDiversidadMin: diversidadRango.min, totalDiversidadMax: diversidadRango.max, totalDiversidadPunto: diversidadRango.punto,
    totalPersonasVinculadasMin: totalVinculadosRango.min, totalPersonasVinculadasMax: totalVinculadosRango.max, totalPersonasVinculadasPunto: totalVinculadosRango.punto,
    validosFormales: formal.validos, validosInformales: informal.validos, validosMujeres: mujeres.validos,
    validosJovenes: jovenes.validos, validosMayores60: mayores60.validos, validosDiversidad: diversidad.validos,
    validosPersonasVinculadas: totalVinculados.validos,
  };

  // perfil de emprendedores
  const generoCount = count(records.map(r => r.generoRepresentante).filter(Boolean));
  const educacionCount = count(records.map(r => r.nivelEducativo).filter(Boolean));
  const enfoqueCount = count(records.map(r => r.enfoqueAlta).filter(Boolean));
  const edades = records.map(r => r.edadRepresentante).filter((v): v is number => v !== null && v > 0);
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
  const capacidadTotal = records.reduce((a, r) => a + (r.capacidadDiaria ?? 0), 0);
  const capacidadVisitantesTotal = records.reduce((a, r) => a + (r.capacidadVisitantes ?? 0), 0);
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
    promedioInteresFortalecer: avg(records.map(r => r.nivelInteresFortalecer).filter((v): v is number => v !== null && v > 0)),
    promedioPreparacionTuristas: avg(records.map(r => r.nivelPreparacionTuristas).filter((v): v is number => v !== null && v > 0)),
    promedioAporteTurismo: avg(records.map(r => r.nivelAporteTurismo).filter((v): v is number => v !== null && v > 0)),
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

  // Cobertura de campos críticos: % de registros con valor reconocido (no nulo).
  // Permite auditar el mapeo fuente→campo y detectar columnas que quedaron 100% nulas.
  const coverage = {
    empleadosFormales: pctAnswered(records.map(r => r.empleadosFormales === null ? null : true)) ?? 0,
    empleadosInformales: pctAnswered(records.map(r => r.empleadosInformales === null ? null : true)) ?? 0,
    mujeres: pctAnswered(records.map(r => r.mujeres === null ? null : true)) ?? 0,
    jovenes: pctAnswered(records.map(r => r.jovenes === null ? null : true)) ?? 0,
    mayores60: pctAnswered(records.map(r => r.mayores60 === null ? null : true)) ?? 0,
    diversidad: pctAnswered(records.map(r => r.diversidad === null ? null : true)) ?? 0,
    totalPersonasVinculadas: pctAnswered(records.map(r => r.totalPersonasVinculadas === null ? null : true)) ?? 0,
  };

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
    coverage,
  };
}
