# Dashboard Fundesco Santa Fe - Encuesta turistica

Este proyecto es un tablero Next.js listo para Vercel. Consume la hoja de respuestas en linea, normaliza la encuesta, pinta un mapa interactivo por barrio/UPZ y genera resumen inteligente con Hugging Face o, si no hay token, con un motor local de reglas.

## 1. Preparar Google Sheets

Opcion rapida gratuita:
1. Abre la hoja de respuestas.
2. Ve a Archivo > Compartir > Publicar en la web.
3. Selecciona la pestaña de respuestas y formato CSV.
4. Copia la URL CSV y pegala en `GOOGLE_SHEETS_CSV_URL` dentro de Vercel.

Opcion mas controlada:
- Crear un Google Apps Script que lea la hoja y retorne JSON. Pega la URL en `GOOGLE_APPS_SCRIPT_URL`.

## 2. Despliegue gratuito recomendado

- **Vercel**: ideal para Next.js, facil y gratis para este caso.
- Alternativas: Netlify o Cloudflare Pages. Para este tablero recomiendo Vercel porque las API routes funcionan directo.

## 3. Ejecutar local

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 4. Variables en Vercel

Configura en Project Settings > Environment Variables:

- `GOOGLE_SHEETS_CSV_URL`
- `HF_TOKEN` opcional
- `HF_MODEL` opcional

## 5. Calidad geográfica

El mapa usa latitud/longitud si vienen en la hoja. Si faltan, usa coordenadas aproximadas por barrio y marca `geoPrecision = estimado`. Para un mapa preciso, haz obligatorias las columnas `Latitud decimal capturada manualmente` y `Longitud decimal capturada manualmente`.

## 6. Privacidad

El tablero no muestra documentos, telefonos ni correos por defecto. Si necesitas fichas internas, crea una vista privada con autenticacion.
