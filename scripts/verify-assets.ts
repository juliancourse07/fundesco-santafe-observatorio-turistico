#!/usr/bin/env npx tsx
/**
 * scripts/verify-assets.ts
 * Validates the credited Santa Fe image assets and flags probable placeholders.
 */

import fs from 'node:fs';
import path from 'node:path';

const CREDITS_PATH = path.join(process.cwd(), 'public', 'images', 'santafe', 'CREDITS.md');
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images', 'santafe');
const SMALL_FILE_BYTES = 50 * 1024;

type ParsedImage = {
  format: 'jpeg' | 'png';
  width: number;
  height: number;
};

type SharpModule = {
  default: (input: string | Buffer) => {
    stats: () => Promise<{ channels: Array<{ stdev: number }> }>;
  };
};

function parseCredits(content: string): string[] {
  const files: string[] = [];
  const regex = /\|\s*`([^`]+\.(jpg|jpeg|png|webp))`/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) files.push(match[1]);
  return [...new Set(files)];
}

function parsePng(buffer: Buffer): ParsedImage {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) throw new Error('firma PNG inválida');
  return {
    format: 'png',
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function parseJpeg(buffer: Buffer): ParsedImage {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('firma JPEG inválida');
  let offset = 2;
  while (offset < buffer.length) {
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset);
    if (Number.isNaN(length) || length < 2) throw new Error('segmento JPEG inválido');
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        format: 'jpeg',
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  throw new Error('no se encontró cabecera SOF JPEG');
}

function parseImageBuffer(buffer: Buffer, filename: string): ParsedImage {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return parsePng(buffer);
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return parseJpeg(buffer);
  throw new Error(`formato no soportado para verificación profunda: ${filename}`);
}

async function loadSharp() {
  try {
    return await import('sharp') as SharpModule;
  } catch {
    return null;
  }
}

async function getAverageStdDev(sharpModule: SharpModule, fullPath: string) {
  const stats = await sharpModule.default(fullPath).stats();
  if (!stats.channels.length) return 0;
  return stats.channels.reduce((sum, channel) => sum + channel.stdev, 0) / stats.channels.length;
}

async function main() {
  if (!fs.existsSync(CREDITS_PATH)) {
    console.error(`ERROR: CREDITS.md not found at ${CREDITS_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(CREDITS_PATH, 'utf-8');
  const declared = parseCredits(content);
  if (declared.length === 0) {
    console.error('ERROR: No image files declared in CREDITS.md');
    process.exit(1);
  }

  const sharpModule = await loadSharp();
  if (!sharpModule) console.warn('WARN: sharp no está disponible; la detección visual usará heurísticas de tamaño y dimensiones.');

  console.log(`Checking ${declared.length} declared image(s) in ${IMAGES_DIR}:\n`);

  let failures = 0;
  let probablePlaceholders = 0;

  for (const filename of declared) {
    const fullPath = path.join(IMAGES_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      console.error(`  MISSING: ${filename}`);
      failures += 1;
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (stat.size === 0) {
      console.error(`  EMPTY:   ${filename} (0 bytes)`);
      failures += 1;
      continue;
    }

    let parsed: ParsedImage;
    try {
      parsed = parseImageBuffer(fs.readFileSync(fullPath), filename);
    } catch (error) {
      console.error(`  INVALID: ${filename} (${error instanceof Error ? error.message : 'parse error'})`);
      failures += 1;
      continue;
    }

    const notes: string[] = [];
    let probable = false;

    if (stat.size < SMALL_FILE_BYTES) {
      notes.push(`archivo pequeño (${(stat.size / 1024).toFixed(1)} KB)`);
    }

    if (parsed.width >= 1200 && stat.size < SMALL_FILE_BYTES) {
      probable = true;
      notes.push('dimensión alta con peso atípicamente bajo');
    }

    if (sharpModule) {
      try {
        const avgStdDev = await getAverageStdDev(sharpModule, fullPath);
        notes.push(`variación cromática media ${avgStdDev.toFixed(1)}`);
        if (avgStdDev < 10) {
          probable = true;
          notes.push('variación cromática demasiado baja');
        }
      } catch (error) {
        console.warn(`  WARN:    ${filename} (sharp no pudo calcular estadísticas: ${error instanceof Error ? error.message : 'unknown error'})`);
      }
    }

    const summary = `${parsed.format.toUpperCase()} ${parsed.width}x${parsed.height} · ${(stat.size / 1024).toFixed(1)} KB`;
    if (probable) {
      console.error(`  PROBABLE PLACEHOLDER: ${filename} (${summary}; ${notes.join('; ')})`);
      probablePlaceholders += 1;
      continue;
    }

    if (notes.length) {
      console.warn(`  WARN:    ${filename} (${summary}; ${notes.join('; ')})`);
    } else {
      console.log(`  OK:      ${filename} (${summary})`);
    }
  }

  if (failures > 0 || probablePlaceholders > 0) {
    console.error(`\nVerification failed: ${failures} invalid/missing asset(s) and ${probablePlaceholders} probable placeholder(s) detected.`);
    process.exit(1);
  }

  console.log(`\nAll ${declared.length} credited assets parsed successfully.`);
}

main();
