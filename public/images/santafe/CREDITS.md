# Creditos de imagenes - Santa Fe

## Estado en este repositorio

La version de este commit deja preparada la carpeta `public/images/santafe/` y el mecanismo de carga tolerante a fallos en web/PDF. Durante el trabajo en sandbox no fue posible resolver `commons.wikimedia.org`, por lo que no se pudieron descargar los binarios JPEG finales. Mientras los archivos no existan, la aplicacion usa placeholders graficos y mantiene visibles la fuente y el estado de credito.

## Referencias curadas para descarga posterior

| Archivo esperado | Tema | Fuente sugerida | Autor | Licencia |
| --- | --- | --- | --- | --- |
| `monserrate.jpg` | Cerro de Monserrate | https://commons.wikimedia.org/wiki/Category:Monserrate_(Bogot%C3%A1) | Pendiente de fijar al elegir el archivo | Verificar en el archivo final (solo usar dominio publico o licencia libre) |
| `la-candelaria.jpg` | La Candelaria / centro historico | https://commons.wikimedia.org/wiki/Category:La_Candelaria_(Bogot%C3%A1) | Pendiente de fijar al elegir el archivo | Verificar en el archivo final (solo usar dominio publico o licencia libre) |
| `plaza-bolivar.jpg` | Plaza de Bolivar | https://commons.wikimedia.org/wiki/Category:Plaza_de_Bol%C3%ADvar_(Bogot%C3%A1) | Pendiente de fijar al elegir el archivo | Verificar en el archivo final (solo usar dominio publico o licencia libre) |
| `parque-nacional.jpg` | Parque Nacional Enrique Olaya Herrera | https://commons.wikimedia.org/wiki/Category:Parque_nacional_Enrique_Olaya_Herrera | Pendiente de fijar al elegir el archivo | Verificar en el archivo final (solo usar dominio publico o licencia libre) |

## Instruccion de curaduria

1. Elegir un archivo JPEG o derivado en Wikimedia Commons para cada tema.
2. Registrar aqui el nombre exacto del archivo, autor, URL del archivo y licencia final.
3. Mantener `credit`, `source` y `license` sincronizados con `lib/santafeImages.ts`.
4. Optimizar cada imagen a un ancho maximo de 1600 px y peso razonable antes de agregarla al repositorio.
