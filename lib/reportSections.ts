export type ReportType = 'diagnostico' | 'potenciales' | 'monitoreo';

export type SectionDef = {
  id: string;
  label: string;
  reportTypes: ReportType[];
};

const allSectionDefs: SectionDef[] = [
  { id: 'resumen-ejecutivo', label: '1. Resumen ejecutivo', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'contexto-territorial', label: '2. Contexto territorial', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'mapa-territorial', label: '3. Mapa territorial', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'metodologia-hallazgos', label: '4. Metodología y hallazgos clave', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'concentracion-geografica', label: '5. Concentración y lectura geográfica', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'formalizacion-infraestructura', label: '6. Formalización e infraestructura', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'empleo-madurez', label: '7. Empleo e índice de madurez', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'mercado-capacidades', label: '8. Mercado, capacidades y sostenibilidad', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'recoleccion-calidad', label: '9. Recolección y calidad de datos', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'brechas-recomendaciones', label: '10. Brechas y recomendaciones', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'anexo-tecnico', label: '11. Anexo técnico y glosario', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'creditos-fotograficos', label: '12. Créditos fotográficos', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'caracterizacion-actores', label: '13. Caracterización de actores turísticos', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'tendencias-oportunidades', label: '14. Tendencias, patrones y oportunidades', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'ficha-metodologica-ampliada', label: '15. Ficha metodológica ampliada', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
  { id: 'anexo-trazabilidad', label: '16. Anexo de trazabilidad del dato', reportTypes: ['diagnostico', 'potenciales', 'monitoreo'] },
];

export const diagnosticoSections: SectionDef[] = allSectionDefs.filter((section) => section.reportTypes.includes('diagnostico'));

export function getSectionsForReportType(reportType: string): SectionDef[] {
  if (reportType !== 'diagnostico' && reportType !== 'potenciales' && reportType !== 'monitoreo') {
    return diagnosticoSections;
  }
  return allSectionDefs.filter((section) => section.reportTypes.includes(reportType));
}
