// Single source of truth for the AI's style guide and studio defaults.
// Read live by the MCP server, the studio AI backend, and the CLI draft studio,
// so editing config/ (or the studio Settings panel) updates all of them.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, '..', 'config');
const STYLE_PATH = join(CONFIG_DIR, 'style-guide.md');
const CONFIG_PATH = join(CONFIG_DIR, 'studio.config.json');

export const DEFAULT_CONFIG = {
  model: 'sonnet',
  defaultCategory: 'tutorial',
  quickActions: [
    { label: 'Draft', prompt: 'Draft a new section that would naturally come next in this post.' },
    { label: 'Tighten', prompt: 'Tighten the whole post — cut filler, keep the meaning. Update the post.' },
    { label: 'Title', prompt: 'Suggest 3 sharper alternative titles for this post.' },
  ],
};

export async function readStyleGuide() {
  try {
    return await readFile(STYLE_PATH, 'utf8');
  } catch {
    return '';
  }
}

export async function readConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(await readFile(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeStyleGuide(text) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(STYLE_PATH, text.endsWith('\n') ? text : text + '\n');
}

export async function writeConfig(patch) {
  const merged = { ...(await readConfig()), ...patch };
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}
