export type ReportType = 'diagnostico' | 'potenciales' | 'monitoreo';

export type SectionDef = {
  id: string;
  label: string;
  reportTypes: ReportType[];
};

const allSectionDefs: SectionDef[] = [
  // ── Informe 1 – Diagnóstico ───────────────────────────────────────────────
  { id: 'resumen-ejecutivo', label: '1. Resumen ejecutivo', reportTypes: ['diagnostico'] },
  { id: 'contexto-territorial', label: '2. Contexto territorial', reportTypes: ['diagnostico'] },
  { id: 'mapa-territorial', label: '3. Mapa territorial', reportTypes: ['diagnostico'] },
  { id: 'metodologia-hallazgos', label: '4. Metodología y hallazgos clave', reportTypes: ['diagnostico'] },
  { id: 'concentracion-geografica', label: '5. Concentración y lectura geográfica', reportTypes: ['diagnostico'] },
  { id: 'formalizacion-infraestructura', label: '6. Formalización e infraestructura', reportTypes: ['diagnostico'] },
  { id: 'empleo-madurez', label: '7. Empleo e índice de madurez', reportTypes: ['diagnostico'] },
  { id: 'mercado-capacidades', label: '8. Mercado, capacidades y sostenibilidad', reportTypes: ['diagnostico'] },
  { id: 'recoleccion-calidad', label: '9. Recolección y calidad de datos', reportTypes: ['diagnostico'] },
  { id: 'brechas-recomendaciones', label: '10. Brechas y recomendaciones', reportTypes: ['diagnostico'] },
  { id: 'anexo-tecnico', label: '11. Anexo técnico y glosario', reportTypes: ['diagnostico'] },
  { id: 'creditos-fotograficos', label: '12. Créditos fotográficos', reportTypes: ['diagnostico'] },
  { id: 'caracterizacion-actores', label: '13. Caracterización de actores turísticos', reportTypes: ['diagnostico'] },
  { id: 'tendencias-oportunidades', label: '14. Tendencias, patrones y oportunidades', reportTypes: ['diagnostico'] },
  { id: 'ficha-metodologica-ampliada', label: '15. Ficha metodológica ampliada', reportTypes: ['diagnostico'] },
  { id: 'anexo-trazabilidad', label: '16. Anexo de trazabilidad del dato', reportTypes: ['diagnostico'] },
  // ── Informe 2 – Potenciales y estrategia ─────────────────────────────────
  { id: 'pot-nota-lector', label: '1. Nota al lector', reportTypes: ['potenciales'] },
  { id: 'pot-marco-conceptual', label: '2. Marco conceptual de potencial turístico', reportTypes: ['potenciales'] },
  { id: 'pot-zonas-potencial', label: '3. Identificación de zonas con potencial', reportTypes: ['potenciales'] },
  { id: 'pot-matriz-viabilidad', label: '4. Matriz de viabilidad multicriterio', reportTypes: ['potenciales'] },
  { id: 'pot-fichas-rutas', label: '5. Fichas de rutas propuestas', reportTypes: ['potenciales'] },
  { id: 'pot-tipologias', label: '6. Tipologías de turismo aplicables', reportTypes: ['potenciales'] },
  { id: 'pot-condiciones-brechas', label: '7. Condiciones habilitantes y brechas', reportTypes: ['potenciales'] },
  { id: 'pot-recomendaciones', label: '8. Recomendaciones estratégicas', reportTypes: ['potenciales'] },
  { id: 'pot-referencias', label: '9. Referencias bibliográficas', reportTypes: ['potenciales'] },
  { id: 'pot-anexo-metodologico', label: '10. Anexo metodológico', reportTypes: ['potenciales'] },
];

export const diagnosticoSections: SectionDef[] = allSectionDefs.filter((section) => section.reportTypes.includes('diagnostico'));
export const potencialesSections: SectionDef[] = allSectionDefs.filter((section) => section.reportTypes.includes('potenciales'));

export function getSectionsForReportType(reportType: string): SectionDef[] {
  if (reportType === 'potenciales') return potencialesSections;
  if (reportType === 'monitoreo') return allSectionDefs.filter((section) => section.reportTypes.includes('monitoreo'));
  return diagnosticoSections;
}
