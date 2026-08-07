import localFont from 'next/font/local';

export const lato = localFont({
  src: [
    { path: '../public/fonts/Lato-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../public/fonts/Lato-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['Arial', 'Helvetica', 'sans-serif'],
});
