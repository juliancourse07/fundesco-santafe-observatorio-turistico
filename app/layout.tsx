import './globals.css';
import { lato } from './fonts';

export const metadata = {
  title: 'Fundesco Santa Fe | Encuesta turística',
  description: 'Mapa interactivo y resumen inteligente de caracterización turística Santa Fe',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={lato.variable}>
      <body>{children}</body>
    </html>
  );
}
