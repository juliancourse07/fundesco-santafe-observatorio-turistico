import { centroidForBarrio } from './geo';
export type RawRecord = Record<string, any>;
export type SurveyRecord = { id:string; fecha:string; upz:string; barrio:string; zona:string; tipo:string; nombre:string; estado:string; lat:number; lng:number; geoPrecision:'exacto'|'estimado'|'sin dato'; quiereRuta:boolean; necesidades:string[]; herramientas:string[]; scores:Record<string,number>; };
const clean=(v:any)=>String(v ?? '').trim();
const split=(v:any)=>clean(v).split(/,|;|\n/).map(s=>s.trim()).filter(Boolean);
const num=(v:any)=>{ const n=Number(String(v ?? '').replace(',','.')); return Number.isFinite(n) ? n : undefined; };
export function normaliseRecord(r:RawRecord, idx:number):SurveyRecord{
  const barrio=clean(r['Barrio donde opera el emprendimiento'] || r['Barrio / sector de aplicación'] || 'Otro');
  const upz=clean(r['UPZ donde opera el emprendimiento'] || r['UPZ de aplicación'] || 'Sin clasificar');
  const latRaw=num(r['Latitud decimal capturada manualmente']);
  const lngRaw=num(r['Longitud decimal capturada manualmente']);
  let lat=latRaw, lng=lngRaw, geoPrecision:'exacto'|'estimado'|'sin dato'='exacto';
  if(lat===undefined || lng===undefined){ const c=centroidForBarrio(barrio); lat=c.lat; lng=c.lng; geoPrecision='estimado'; }
  const scoreCols: [string,string][] = [
    ['Gobernanza','Gobernanza: articulación con instituciones, redes o actores locales'],
    ['Tecnología','Tecnología: uso de herramientas digitales para vender, promocionar o gestionar clientes'],
    ['Innovación','Innovación: desarrollo de productos, experiencias o mejoras nuevas'],
    ['Sostenibilidad','Sostenibilidad ambiental: manejo de residuos, agua, energía y cuidado del entorno'],
    ['Accesibilidad','Accesibilidad: facilidad de acceso para personas con discapacidad o movilidad reducida'],
    ['Comercio','Comercio: capacidad de venta, precios, promociones, canales y medios de pago'],
    ['Tejido empresarial','Tejido empresarial: alianzas con otros emprendimientos, rutas o redes turísticas']
  ];
  const scores:Record<string,number>={}; scoreCols.forEach(([k,c])=>{ const n=num(r[c]); if(n!==undefined) scores[k]=n; });
  return { id:String(idx+1), fecha:clean(r['Fecha de aplicación'] || r['Marca temporal']), upz, barrio, zona:clean(r['Zona turística asociada']), tipo:clean(r['Tipo principal de emprendimiento']), nombre:clean(r['Nombre comercial'] || r['Nombre del emprendimiento']), estado:clean(r['Estado de completitud del registro']), lat:lat!, lng:lng!, geoPrecision, quiereRuta:/^s[ií]/i.test(clean(r['¿El emprendimiento quiere hacer parte de rutas turísticas de Santa Fe?'])), necesidades:split(r['Áreas donde requiere mayor apoyo']), herramientas:split(r['Herramientas digitales que usa actualmente']), scores };
}
export function buildStats(records:SurveyRecord[]){
 const count=(arr:string[])=>arr.reduce((a,v)=>{ if(v) a[v]=(a[v]||0)+1; return a; },{} as Record<string,number>);
 const top=(obj:Record<string,number>,n=8)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([name,value])=>({name,value}));
 const byBarrio=count(records.map(r=>r.barrio)); const byUpz=count(records.map(r=>r.upz)); const byTipo=count(records.map(r=>r.tipo));
 const necesidades=count(records.flatMap(r=>r.necesidades)); const herramientas=count(records.flatMap(r=>r.herramientas));
 const dims=['Gobernanza','Tecnología','Innovación','Sostenibilidad','Accesibilidad','Comercio','Tejido empresarial'];
 const scores=dims.map(d=>{ const vals=records.map(r=>r.scores[d]).filter(v=>typeof v==='number'); return { name:d, value: vals.length ? Number((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2)) : 0 }; });
 return { total:records.length, rutas: records.filter(r=>r.quiereRuta).length, exactos:records.filter(r=>r.geoPrecision==='exacto').length, estimados:records.filter(r=>r.geoPrecision==='estimado').length, byBarrio:top(byBarrio), byUpz:top(byUpz), byTipo:top(byTipo), necesidades:top(necesidades,12), herramientas:top(herramientas,10), scores };
}
