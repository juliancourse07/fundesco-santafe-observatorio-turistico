#!/usr/bin/env npx tsx
/**
 * scripts/verify-assets.ts
 * Verifies that every image declared in public/images/santafe/CREDITS.md
 * actually exists on disk with a non-zero size.
 * Exits with code 1 if any file is missing or empty.
 */

import fs from 'node:fs';
import path from 'node:path';

const CREDITS_PATH = path.join(process.cwd(), 'public', 'images', 'santafe', 'CREDITS.md');
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images', 'santafe');

function parseCredits(content: string): string[] {
  const files: string[] = [];
  // Match backtick-quoted filenames like `monserrate.jpg` inside table rows
  const regex = /\|\s*`([^`]+\.(jpg|jpeg|png|webp))`/gi;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: loop pattern
  while ((match = regex.exec(content)) !== null) {
    files.push(match[1]);
  }
  return [...new Set(files)];
}

async function main() {
  if (!fs.existsSync(CREDITS_PATH)) {
    console.error(`ERROR: CREDITS.md not found at ${CREDITS_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(CREDITS_PATH, 'utf-8');
  const declared = parseCredits(content);

  if (declared.length === 0) {
    console.warn('WARN: No image files found declared in CREDITS.md');
    process.exit(0);
  }

  console.log(`Checking ${declared.length} declared image(s) in ${IMAGES_DIR}:\n`);

  let missing = 0;
  for (const filename of declared) {
    const fullPath = path.join(IMAGES_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      console.error(`  MISSING: ${filename}`);
      missing++;
    } else {
      const stat = fs.statSync(fullPath);
      if (stat.size === 0) {
        console.error(`  EMPTY:   ${filename} (0 bytes)`);
        missing++;
      } else {
        console.log(`  OK:      ${filename} (${(stat.size / 1024).toFixed(1)} KB)`);
      }
    }
  }

  if (missing > 0) {
    console.error(`\n${missing} asset(s) missing or empty. Add the files to public/images/santafe/ and update CREDITS.md.`);
    process.exit(1);
  } else {
    console.log(`\nAll ${declared.length} assets verified successfully.`);
  }
}

main();
