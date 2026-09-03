'use client';
import { Component, type ReactNode } from 'react';

type Props = {
  /** Nombre de la sección para identificar el error en consola. */
  name: string;
  /** Si es true, muestra un fallback de página completa en vez de una tarjeta. */
  fullPage?: boolean;
  children: ReactNode;
};

type State = { hasError: boolean };

/**
 * Error Boundary por sección. Evita que un fallo en una tarjeta/mapa/gráfico
 * tumbe toda la página (pantalla negra) y registra el error real en consola.
 */
export default class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    // Logging del error real para diagnóstico en consola del navegador.
    console.error(`[observatorio] Error en sección "${this.props.name}":`, error, info?.componentStack ?? '');
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fullPage) {
        return (
          <main className="flex min-h-screen items-center justify-center p-8" lang="es">
            <div className="card max-w-xl p-8 text-center">
              <h1 className="text-2xl font-bold text-fundesco-forest mb-3">El tablero no pudo cargarse por completo</h1>
              <p className="text-slate-600">Ocurrió un error inesperado al renderizar una sección. El error quedó registrado en la consola del navegador.</p>
              <button onClick={() => window.location.reload()} className="mt-4 bg-fundesco-lime text-fundesco-forest font-bold px-6 py-3 rounded-2xl hover:bg-lime-400 transition-colors text-sm">Recargar</button>
            </div>
          </main>
        );
      }
      return (
        <div className="card p-6 border border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">Esta sección no pudo cargarse.</p>
          <p className="mt-1 text-xs text-amber-700">El resto del tablero sigue disponible. Revisa la consola para más detalle.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
