export type SantafeImage = {
  key: string;
  src: string;
  title: string;
  alt: string;
  caption: string;
  credit: string;
  source: string;
  license: string;
  licenseUrl: string;
};

export const santafeImages: SantafeImage[] = [
  {
    key: 'monserrate',
    src: '/images/santafe/monserrate.jpg',
    title: 'Cerro de Monserrate',
    alt: 'Vista del Cerro de Monserrate y su santuario sobre el oriente de Bogotá',
    caption: 'Hito paisajístico, religioso y turístico que estructura la lectura territorial de Santa Fe desde los Cerros Orientales.',
    credit: 'Wikipedia / Wikimedia Commons (archivo: Monserrate_Sanctuary.JPG; autor pendiente de verificación local)',
    source: 'https://commons.wikimedia.org/wiki/File:Monserrate_Sanctuary.JPG',
    license: 'Licencia en Wikimedia Commons pendiente de verificación local',
    licenseUrl: 'https://commons.wikimedia.org/wiki/File:Monserrate_Sanctuary.JPG',
  },
  {
    key: 'centro-internacional',
    src: '/images/santafe/centro-internacional.jpg',
    title: 'Centro Internacional',
    alt: 'Vista urbana del sector Centro Internacional en la localidad de Santa Fe',
    caption: 'Corredor institucional, empresarial y hotelero que articula flujos de trabajo, eventos y servicios en la localidad.',
    credit: 'Alcaldía Local de Santa Fe',
    source: 'https://www.santafe.gov.co/content/upz-barrios-y-veredas',
    license: 'Uso institucional',
    licenseUrl: 'https://www.santafe.gov.co/content/upz-barrios-y-veredas',
  },
  {
    key: 'santa-fe-panoramica',
    src: '/images/santafe/santa-fe-panoramica.jpg',
    title: 'Localidad de Santa Fe - vista panorámica',
    alt: 'Vista panorámica de la localidad de Santa Fe en Bogotá',
    caption: 'Panorámica general del territorio para contextualizar la relación entre centralidades históricas, ejes viales y borde oriental.',
    credit: 'Bogotá Travel Guide (crédito específico no identificado en el sitio)',
    source: 'http://www.bogotatravelguide.com/Santa-fe-localidades-bogota.php',
    license: 'Uso pendiente de confirmación de derechos - sitio comercial',
    licenseUrl: 'http://www.bogotatravelguide.com/Santa-fe-localidades-bogota.php',
  },
];
