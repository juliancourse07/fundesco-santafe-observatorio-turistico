import Papa from "papaparse";

export async function fetchSheetRows() {
  const csvUrl = process.env.GOOGLE_SHEETS_CSV_URL?.trim();
  const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();

  if (!csvUrl && !scriptUrl) {
    throw new Error('Configura GOOGLE_SHEETS_CSV_URL o GOOGLE_APPS_SCRIPT_URL para leer la encuesta.');
  }

  if (csvUrl) {
    const response = await fetch(csvUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      next: { revalidate: 0 },
    });

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

  const response = await fetch(scriptUrl!, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`No fue posible consultar el Apps Script (${response.status}).`);
  }

  const payload = await response.json();

  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.records)) return payload.records;

  throw new Error('La respuesta del Apps Script debe ser un arreglo de filas o { records }.');
}
