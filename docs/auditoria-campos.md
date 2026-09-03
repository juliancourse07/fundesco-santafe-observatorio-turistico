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

Además hay una coincidencia parcial de respaldo (subcadena) que solo se acepta si es **única**, para no mezclar columnas. Valores multiselección de SharePoint (`results`), lookups/personas (`Value` o `Title`), respuestas Sí/No y números con coma o separadores de miles se convierten antes de agregar.

Los porcentajes de formalización e infraestructura se calculan exclusivamente sobre respuestas reconocidas. Cuando no hay respuestas válidas la API entrega `null`, que debe presentarse como **Sin dato**, no como 0. En empleo se incluyen `validos*` por indicador: un total de cero con válidos es un cero real; sin válidos no permite afirmar que no hay personas vinculadas.

## Tabla de verificación encabezado → campo interno

Para obtener el **% de registros no nulos real** de cada columna contra la fuente activa, ejecuta:

```bash
npm run verify-mapping            # contra la fuente configurada (env)
npm run verify-mapping <archivo>  # contra un CSV local exportado de la fuente
```

El script **falla (exit 1)** si un campo obligatorio queda 100% nulo. Tabla de correspondencia (el % no nulo se reporta en tiempo de ejecución según la fuente):

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
