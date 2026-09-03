import Papa from "papaparse";

export async function fetchSheetRows() {
  const sharePointUrl = process.env.SHAREPOINT_LIST_URL?.trim();
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL?.trim();
  const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();

  if (!sharePointUrl && !csvUrl && !scriptUrl) {
    throw new Error('Configura SHAREPOINT_LIST_URL, GOOGLE_SHEETS_CSV_URL o GOOGLE_APPS_SCRIPT_URL para leer la encuesta.');
  }

  if (sharePointUrl) {
    const response = await fetch(sharePointUrl, { cache: 'no-store', headers: { Accept: 'application/json' }, next: { revalidate: 0 } }).catch(() => null);
    if (!response?.ok) throw new Error(`No fue posible consultar la lista SharePoint (${response?.status ?? 'sin conexión'}).`);
    const payload = await response.json();
    if (Array.isArray(payload?.value)) return payload.value;
    if (Array.isArray(payload?.d?.results)) return payload.d.results;
    if (Array.isArray(payload)) return payload;
    throw new Error('La respuesta de SharePoint debe contener value, d.results o un arreglo de filas.');
  }

  if (csvUrl) {
    let response: Response;
    try {
      response = await fetch(csvUrl, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        next: { revalidate: 0 },
      });
    } catch {
      throw new Error('No fue posible conectar con Google Sheets. Verifica que la hoja esté publicada como CSV y accesible públicamente.');
    }

    if (!response.ok) {
      throw new Error(`No fue posible descargar el CSV de Google Sheets (${response.status}).`);
    }

    const csvText = await response.text();
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    if (parsed.errors.length) {
      throw new Error(`Error procesando el CSV: ${parsed.errors[0].message}`);
    }

    return parsed.data;
  }

  let response: Response;
  try {
    response = await fetch(scriptUrl!, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      next: { revalidate: 0 },
    });
  } catch {
    throw new Error('No fue posible conectar con Google Apps Script. Verifica que la URL sea pública y esté respondiendo.');
  }

  if (!response.ok) {
    throw new Error(`No fue posible consultar el Apps Script (${response.status}).`);
  }

  const payload = await response.json();

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.records)) return payload.records;

  throw new Error('La respuesta del Apps Script debe ser un arreglo de filas o { records }.');
}
