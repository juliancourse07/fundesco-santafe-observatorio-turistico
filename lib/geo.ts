export const barrioCentroids: Record<string,{lat:number;lng:number}> = {
  'Las Cruces': {lat:4.5906,lng:-74.0805},
  'Veracruz': {lat:4.6038,lng:-74.0711},
  'La Macarena': {lat:4.6136,lng:-74.0661},
  'Los Laches': {lat:4.5847,lng:-74.0648},
  'La Peña': {lat:4.5858,lng:-74.0660},
  'El Consuelo': {lat:4.5826,lng:-74.0712},
  'El Rocío': {lat:4.5796,lng:-74.0738},
  'San Diego': {lat:4.6117,lng:-74.0693},
  'Otro': {lat:4.6031,lng:-74.0711}
};
export function centroidForBarrio(barrio?: string){ return barrioCentroids[(barrio || '').trim()] || barrioCentroids['Otro']; }
