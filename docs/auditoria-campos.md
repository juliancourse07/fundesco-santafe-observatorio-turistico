# Auditoría de campos de encuesta

`GET /api/debug/fields` compara en tiempo real las columnas recibidas con las 127 columnas de `schema-formulario.json`, informa columnas ausentes o no documentadas y el porcentaje no nulo por columna. Es la fuente de trazabilidad para resolver variaciones de exportación de SharePoint o Google Sheets.

La normalización compara nombres sin acentos, espacios ni puntuación; por ello acepta las variantes de encabezado `OData_` habituales. Valores multiselección de SharePoint (`results`), lookups/personas (`Value` o `Title`), respuestas Sí/No y números con coma o separadores de miles se convierten antes de agregar.

Los porcentajes de formalización e infraestructura se calculan exclusivamente sobre respuestas reconocidas. Cuando no hay respuestas válidas la API entrega `null`, que debe presentarse como **Sin dato**, no como 0. En empleo se incluyen `validos*` por indicador: un total de cero con válidos es un cero real; sin válidos no permite afirmar que no hay personas vinculadas.
