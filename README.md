# Dashboard Fundesco Santa Fe - Encuesta turistica

Este proyecto es un tablero Next.js listo para Vercel. Consume la hoja de respuestas en linea, normaliza la encuesta, pinta un mapa interactivo por barrio/UPZ y genera resumen inteligente con Hugging Face o, si no hay token, con un motor local de reglas.

## 1. Publicar Google Sheets como CSV

Usa esta hoja de trabajo:

`https://docs.google.com/spreadsheets/d/1kFZ0PfbuTnY4N8DAX4BVDUQ-Xeh5bYZWCWTeaXsQaig/edit?resourcekey=&gid=1217701982#gid=1217701982`

Pasos:
1. Abre la hoja y entra a **Archivo > Compartir > Publicar en la web**.
2. Selecciona la pestaña de respuestas correcta (`gid=1217701982`) y el formato **CSV**.
3. Copia la URL publicada. Una forma habitual queda así: `https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=1217701982`.
4. Pega esa URL en `GOOGLE_SHEETS_CSV_URL`.
5. Si prefieres una integración controlada, puedes usar `GOOGLE_APPS_SCRIPT_URL` con un Apps Script público que retorne JSON o CSV.

## 2. Token gratis de Hugging Face

1. Crea una cuenta gratuita en [Hugging Face](https://huggingface.co/).
2. Ve a **Settings > Access Tokens**.
3. Genera un **User Access Token** con permisos de lectura.
4. Guarda el valor en `HF_TOKEN`.
5. Si quieres cambiar de modelo, configura `HF_MODEL`; si no, el proyecto usa `mistralai/Mixtral-8x7B-Instruct-v0.1`.

Si `HF_TOKEN` no está configurado, el resumen sigue funcionando con un fallback local en español.

## 3. Variables de entorno en Vercel

En **Project Settings > Environment Variables** agrega:

- `GOOGLE_SHEETS_CSV_URL`
- `GOOGLE_APPS_SCRIPT_URL` (opcional)
- `HF_TOKEN` (opcional)
- `HF_MODEL` (opcional)

Luego despliega normalmente. No hace falta redeploy por cada nueva respuesta del formulario.

## 4. Actualización automática

El tablero se mantiene actualizado con dos mecanismos combinados:

- El cliente consulta `/api/respuestas` con `cache: 'no-store'`.
- La ruta del servidor consulta Google Sheets o Apps Script con `Cache-Control: no-cache` y `revalidate = 0`.

Esto permite que nuevas respuestas publicadas en la hoja aparezcan sin necesidad de reconstruir la aplicación.

## 5. Ejecutar local

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 6. Despliegue gratuito recomendado

- **Vercel**: ideal para Next.js y suficiente para este caso.
- Alternativas: Netlify o Cloudflare Pages.

## 7. Calidad geográfica

El mapa usa latitud/longitud si vienen en la hoja. Si faltan, usa coordenadas aproximadas por barrio y marca `geoPrecision = estimado`. Para un mapa preciso, haz obligatorias las columnas `Latitud decimal capturada manualmente` y `Longitud decimal capturada manualmente`.

## 8. Privacidad

El tablero no muestra documentos, telefonos ni correos por defecto. Si necesitas fichas internas, crea una vista privada con autenticacion.

## 9. Galería e imágenes de Santa Fe

El proyecto deja preparada la carpeta `public/images/santafe/` para almacenar únicamente imágenes de dominio público o con licencia libre.

- La referencia de cada imagen y su crédito viven en `public/images/santafe/CREDITS.md` y `lib/santafeImages.ts`.
- Si el archivo físico no existe, tanto la web como el PDF degradan de forma elegante con un placeholder gráfico; la generación del informe no falla.
- Antes de agregar binarios finales, verifica autor, fuente y licencia específica del archivo elegido en Wikimedia Commons u otra fuente libre compatible.

