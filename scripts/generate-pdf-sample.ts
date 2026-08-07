import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFallbackSummary } from '../lib/analysis';
import { generatePdfReport } from '../lib/pdfReport';
import { sampleStatsFromCurrentSummary } from '../lib/sampleStats';

async function main() {
  const repoRoot = process.cwd();
  const summaryPath = path.join(repoRoot, 'data-current-summary.json');
  const outputDir = path.join(repoRoot, 'docs', 'samples');
  const outputPdf = path.join(outputDir, 'informe-fundesco-santa-fe.pdf');
  const outputLog = path.join(outputDir, 'pdf-generation.txt');

  const raw = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  const stats = sampleStatsFromCurrentSummary(raw);
  const summary = buildFallbackSummary(stats);
  const { pdfBytes, logs } = await generatePdfReport({
    stats,
    summary,
    updatedAt: raw.generado || new Date().toISOString(),
  });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPdf, Buffer.from(pdfBytes));
  const logLines = [
    `[sample] source=${path.relative(repoRoot, summaryPath)}`,
    `[sample] output=${path.relative(repoRoot, outputPdf)}`,
    `[sample] total_registros=${stats.total}`,
    ...logs.map((entry) => `[sample] ${entry}`),
  ];
  await fs.writeFile(outputLog, `${logLines.join('\n')}\n`, 'utf8');
  console.log(logLines.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
