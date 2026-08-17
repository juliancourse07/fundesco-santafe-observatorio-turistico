import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFallbackSummary } from '../lib/analysis';
import { generatePdfReport } from '../lib/pdfReport';
import { sampleStatsFromCurrentSummary } from '../lib/sampleStats';

async function generateSample(repoRoot: string, summaryPath: string, outputDir: string, reportType: 'diagnostico' | 'potenciales') {
  const raw = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  const stats = sampleStatsFromCurrentSummary(raw);
  const summary = buildFallbackSummary(stats);
  const { pdfBytes, logs } = await generatePdfReport({
    stats,
    summary,
    updatedAt: raw.generado || new Date().toISOString(),
    reportType,
  });

  const filename = reportType === 'potenciales'
    ? 'informe-2-potenciales-fundesco-santa-fe.pdf'
    : 'informe-1-diagnostico-fundesco-santa-fe.pdf';
  const outputPdf = path.join(outputDir, filename);
  const outputLog = path.join(outputDir, `pdf-generation-${reportType}.txt`);

  await fs.writeFile(outputPdf, Buffer.from(pdfBytes));
  const logLines = [
    `[sample] reportType=${reportType}`,
    `[sample] source=${path.relative(repoRoot, summaryPath)}`,
    `[sample] output=${path.relative(repoRoot, outputPdf)}`,
    `[sample] total_registros=${stats.total}`,
    ...logs.map((entry) => `[sample] ${entry}`),
  ];
  await fs.writeFile(outputLog, `${logLines.join('\n')}\n`, 'utf8');
  console.log(logLines.join('\n'));
  return logLines;
}

async function main() {
  const repoRoot = process.cwd();
  const summaryPath = path.join(repoRoot, 'data-current-summary.json');
  const outputDir = path.join(repoRoot, 'docs', 'samples');

  await fs.mkdir(outputDir, { recursive: true });

  console.log('\n=== Generando Informe 1 — Diagnóstico ===');
  await generateSample(repoRoot, summaryPath, outputDir, 'diagnostico');

  console.log('\n=== Generando Informe 2 — Potenciales y estrategia ===');
  await generateSample(repoRoot, summaryPath, outputDir, 'potenciales');

  // Keep legacy filename for backwards-compat (symlink-like copy of informe 1)
  const legacyPdf = path.join(outputDir, 'informe-fundesco-santa-fe.pdf');
  const informe1Pdf = path.join(outputDir, 'informe-1-diagnostico-fundesco-santa-fe.pdf');
  await fs.copyFile(informe1Pdf, legacyPdf);
  console.log(`\n[sample] legacy copy: docs/samples/informe-fundesco-santa-fe.pdf`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
