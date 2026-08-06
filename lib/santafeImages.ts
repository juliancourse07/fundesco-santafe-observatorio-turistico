export type SantafeImage = {
  key: string;
  src: string;
  title: string;
  caption: string;
  credit: string;
  source: string;
  license: string;
};

export const santafeImages: SantafeImage[] = [
  {
    key: 'monserrate',
    src: '/images/santafe/monserrate.jpg',
    title: 'Cerro de Monserrate',
    caption: 'Monserrate como hito paisajistico y de orientacion del centro-oriente bogotano.',
    credit: 'Referencia para descarga y acreditacion: Wikimedia Commons.',
    source: 'https://commons.wikimedia.org/wiki/Category:Monserrate_(Bogot%C3%A1)',
    license: 'Licencia libre a confirmar en archivo final descargado.',
  },
  {
    key: 'candelaria',
    src: '/images/santafe/la-candelaria.jpg',
    title: 'La Candelaria y centro historico',
    caption: 'Tejido patrimonial, cultural y peatonal que conecta flujos de visitantes en Santa Fe.',
    credit: 'Referencia para descarga y acreditacion: Wikimedia Commons.',
    source: 'https://commons.wikimedia.org/wiki/Category:La_Candelaria_(Bogot%C3%A1)',
    license: 'Licencia libre a confirmar en archivo final descargado.',
  },
  {
    key: 'plaza-bolivar',
    src: '/images/santafe/plaza-bolivar.jpg',
    title: 'Plaza de Bolivar',
    caption: 'Nodo civico de alta visibilidad para relatos de patrimonio, memoria y turismo cultural.',
    credit: 'Referencia para descarga y acreditacion: Wikimedia Commons.',
    source: 'https://commons.wikimedia.org/wiki/Category:Plaza_de_Bol%C3%ADvar_(Bogot%C3%A1)',
    license: 'Licencia libre a confirmar en archivo final descargado.',
  },
  {
    key: 'parque-nacional',
    src: '/images/santafe/parque-nacional.jpg',
    title: 'Parque Nacional Enrique Olaya Herrera',
    caption: 'Escenario ambiental y recreativo clave para complementar experiencias urbanas y culturales.',
    credit: 'Referencia para descarga y acreditacion: Wikimedia Commons.',
    source: 'https://commons.wikimedia.org/wiki/Category:Parque_nacional_Enrique_Olaya_Herrera',
    license: 'Licencia libre a confirmar en archivo final descargado.',
  },
];
