# Auditoría de campos de encuesta

`GET /api/debug/fields` compara en tiempo real las columnas recibidas con las 127 columnas de `schema-formulario.json`, informa columnas ausentes o no documentadas y el porcentaje no nulo por columna. Es la fuente de trazabilidad para resolver variaciones de exportación de SharePoint o Google Sheets.

## Fuente de datos activa en producción

El conector se resuelve por orden de prioridad en `lib/csv.ts` (`fetchSheetRows`). Solo se usa **una** fuente: la primera variable de entorno definida.

| Prioridad | Variable de entorno | Conector | ¿En uso? |
|---|---|---|---|
| 1 | `SHAREPOINT_LIST_URL` | Lista SharePoint (JSON) | Solo si está definida |
| 2 | `GOOGLE_SHEETS_CSV_URL` | Google Sheets publicado como CSV | **Es la que aparece precargada en `.env.example`** |
| 3 | `GOOGLE_APPS_SCRIPT_URL` | Apps Script (JSON/CSV) | Solo si está definida |

La cabecera del sitio dice *"Actualización automática desde Google Sheets"* y `.env.example` trae `GOOGLE_SHEETS_CSV_URL` precargada con una hoja pública, por lo que **el conector efectivamente en uso es Google Sheets (CSV)**. Toda corrección de mapeo debe validarse contra los encabezados reales que devuelve esa hoja (ver `GET /api/debug/fields`).

## Tolerancia del mapeo

La normalización (`lib/normalize.ts`, función `key`) compara encabezados **sin tildes, sin mayúsculas, sin espacios/puntuación** y elimina los prefijos/sufijos que agregan las exportaciones:

- `N°` / `Nº` / `No.` → `numero`
- Prefijos SharePoint: `field_N_`, `OData_`, `column_N_`
- Sufijos de columnas duplicadas: `_1`, `_2`, …
- Saltos de línea y dobles espacios en el encabezado

Además hay una coincidencia parcial de respaldo (subcadena) que solo se acepta si es **única**, para no mezclar columnas. Valores multiselección de SharePoint (`results`), lookups/personas (`Value` o `Title`), respuestas Sí/No y números con coma o separadores de miles se convierten antes de agregar. La normalización recorta espacios al inicio y al final del encabezado; por eso `Número de mujeres vinculadas ` (con espacio final) debe resolver al mismo campo interno que `Número de mujeres vinculadas`.

Los porcentajes de formalización e infraestructura se calculan exclusivamente sobre respuestas reconocidas. Cuando no hay respuestas válidas la API entrega `null`, que debe presentarse como **Sin dato**, no como 0. En empleo se incluyen `validos*` por indicador: un total de cero con válidos es un cero real; sin válidos no permite afirmar que no hay personas vinculadas.

## Conversión de rangos categóricos de empleo

El formulario de empleo no captura conteos exactos sino rangos textuales. Por transparencia, el tablero y el PDF presentan una **estimación** compuesta por cota mínima, cota máxima y punto medio agregado. Reglas aplicadas por `parseRangoPersonas`:

- Se normaliza a minúsculas, sin tildes y con espacios colapsados.
- `Ninguna`, `Ninguno`, `Ninguna todos son formales` y `0` se interpretan como rango `0–0`.
- `Solo el propietario/a o responsable`, `1 persona` y `1 mujer` se interpretan como `1–1`.
- `N a M`, `N o M`, `N-M` y `N–M` se interpretan como intervalo `N–M`, sin depender del sustantivo (`personas`, `mujeres`, `mujerres`, etc.).
- `Más de N` / `Mas de N` se interpreta de forma conservadora como `N+1–N+1`, documentado como cota inferior de una categoría abierta.
- Si una celda trae varias opciones separadas por coma, se parsean todas y se conserva el rango con mayor cota superior.
- Si no hay coincidencia, el valor queda `null` (**Sin dato**), nunca `0`.

| Columna real auditada | Muestras reales observadas | Regla |
|---|---|---|
| `Número total de empleados o personas vinculadas` | `Solo el propietario/a o responsable`, `2 a 3 personas vinculadas`, `4 a 6 personas vinculadas`, `7 a 10 personas vinculadas`, `Más de 10 personas vinculadas` | rango/punto medio |
| `Número de empleados formales` | `Solo el propietario/a o responsable`, `2 a 3 personas`, `4 a 6 personas`, `7 a 10 personas`, `Mas de 10 Personas` | rango/punto medio |
| `Número de empleados informales o familiares sin contrato` | `Ninguna todos son formales`, `1 a 3 personas`, `4 a 6 personas`, `1 a 3 personas, 4 a 6 personas` | cero real o mayor rango seleccionado |
| `Número de mujeres vinculadas ` | `Ninguna`, `1 mujer`, `2 o 3 mujeres`, `7 a 10 mujerres`, `mas de 10 mujeres` | encabezado normalizado + rango/punto medio |
| `Número de jóvenes vinculados` | `Ninguna`, `1 persona`, `2 o 3 personas`, `4 a 6 personas` | rango/punto medio |
| `Número de personas mayores de 60 años vinculadas` | `Ninguna` y rangos análogos | cero real o rango |
| `Número de personas de población diversa o enfoque diferencial vinculadas` | `Ninguna`, `4 o 6 Personas` y rangos análogos | cero real o rango |

## Tabla de verificación encabezado → campo interno

Para obtener el **% de registros no nulos real** de cada columna contra la fuente activa, ejecuta:

```bash
npm run verify-mapping            # contra la fuente configurada (env)
npm run verify-mapping <archivo>  # contra un CSV local exportado de la fuente
```

El script **falla (exit 1)** si un campo obligatorio queda 100% nulo o si más del 20% de sus valores no vacíos no se pueden parsear. Tabla de correspondencia (el % reconocido y no parseable se reporta en tiempo de ejecución según la fuente):

### Empleo (el bloque que quedó en 0)

| Encabezado esperado en la fuente | Campo interno | % no nulo |
|---|---|---|
| `Número total de empleados o personas vinculadas` | `totalPersonasVinculadas` | ver `verify-mapping` |
| `Número de empleados formales` | `empleadosFormales` | ver `verify-mapping` |
| `Número de empleados informales o familiares sin contrato` | `empleadosInformales` | ver `verify-mapping` |
| `Número de mujeres vinculadas` | `mujeres` | ver `verify-mapping` |
| `Número de jóvenes vinculados` | `jovenes` | ver `verify-mapping` |
| `Número de personas mayores de 60 años vinculadas` | `mayores60` | ver `verify-mapping` |
| `Número de personas de población diversa o enfoque diferencial vinculadas` | `diversidad` | ver `verify-mapping` |

### Formalización

| Encabezado esperado | Campo interno |
|---|---|
| `¿Cuenta con registro mercantil / Cámara de Comercio?` | `tieneRegistroMercantil` |
| `¿Cuenta con Registro Nacional de Turismo - RNT?` | `tieneRNT` |
| `¿Cuenta con RUT?` | `tieneRUT` |
| `¿Usa facturación electrónica o documento equivalente?` | `facturacionElectronica` |
| `¿Tiene afiliación a seguridad social?` | `tieneAfiliacionSS` |
| `¿Cuenta con seguro para actividades o responsabilidad civil?` | `tieneSeguro` |

### Infraestructura

| Encabezado esperado | Campo interno |
|---|---|
| `¿Cuenta con sede física?` | `tieneSedeFisica` |
| `¿Cuenta con señalización visible?` | `tieneSeñalizacion` |
| `¿Cuenta con baños disponibles para usuarios?` | `tieneBanos` |
| `¿Cuenta con botiquín y elementos de emergencia?` | `tieneBotiquin` |
| `Conectividad a internet` | `conectividad` |
| `Capacidad máxima de atención diaria` | `capacidadDiaria` |
| `Capacidad máxima de visitantes al mismo tiempo` | `capacidadVisitantes` |
| `Número de espacios de atención` | `numeroEspaciosAtencion` |

### Experiencia

| Encabezado esperado | Campo interno |
|---|---|
| `Años de experiencia en turismo o actividad relacionada` | `anosExperienciaTurismo` |

### Territorio / tipo (estructural)

| Encabezado esperado | Campo interno |
|---|---|
| `Barrio donde opera el emprendimiento` / `Barrio / sector de aplicación` | `barrio` |
| `UPZ donde opera el emprendimiento` / `UPZ de aplicación` | `upz` |
| `Tipo principal de emprendimiento` | `tipo` |

### Digital / sostenibilidad / mercado

| Encabezado esperado | Campo interno |
|---|---|
| `Canales digitales activos` | `canalesDigitales` |
| `Prácticas de sostenibilidad implementadas` | `practicasSostenibilidad` |
| `Necesidades de capacitación del equipo` | `necesidadesCapacitacion` |
| `Segmentos de mercado atendidos` | `segmentosMercado` |
| `Idiomas disponibles para atención` | `idiomas` |

> Para el % no nulo por columna en vivo y la lista de columnas huérfanas/ausentes, usa `GET /api/debug/fields`.
