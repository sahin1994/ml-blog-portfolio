#!/usr/bin/env node
// Local draft studio — drafts a blog post with Claude (your logged-in account,
// via the Claude Code CLI) and writes it as a draft .mdx file.
//
//   npm run write                 interactive
//   npm run write -- --dry-run    scaffold a file without calling Claude
//   npm run write -- --model opus use a specific model
//
// Auth: uses the same account you logged into Claude Code with — no API key.
// Run `claude` once to sign in if you haven't.

import { spawn } from 'node:child_process';
import { readStyleGuide, readConfig } from '../studio/lib/config.mjs';
import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = join(__dirname, '..', 'src', 'content', 'posts');
const CATEGORIES = ['tutorial', 'deep-dive', 'guide', 'note'];

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const i = args.indexOf(f);
  return i !== -1 ? args[i + 1] : undefined;
};

if (has('--help') || has('-h')) {
  console.log(`
Draft studio — write a blog post with Claude on your account.

  npm run write                 interactive prompts
  npm run write -- --dry-run    scaffold a file, skip the Claude call
  npm run write -- --model opus pick a model (default: sonnet)

You can also pass any field up front (skips that prompt):
  --title "..."  --description "..."  --category tutorial
  --tags "nlp, python"  --outline "..."

The result is written to src/content/posts/<slug>.mdx with draft: true,
so it won't publish until you review it and flip the flag.
`);
  process.exit(0);
}

const DRY = has('--dry-run');
let MODEL = val('--model'); // resolved from studio config in main() if not passed

const slugify = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);

const today = () => new Date().toISOString().slice(0, 10);

async function styleSample() {
  try {
    const files = (await readdir(POSTS_DIR)).filter((f) => /\.mdx?$/.test(f));
    if (!files.length) return '';
    const body = await readFile(join(POSTS_DIR, files[0]), 'utf8');
    return body.slice(0, 1800);
  } catch {
    return '';
  }
}

function buildPrompt({ title, description, category, tags, outline, sample, styleGuide }) {
  return `You are drafting a blog post for a personal machine-learning and data-science blog.

Write ONLY the body of the post in Markdown/MDX. Do NOT include frontmatter (no --- block) — that is added automatically.

House style, follow it closely:
${styleGuide}

Post to write:
- Title: ${title}
- One-line summary: ${description}
- Category: ${category}
- Tags: ${tags.join(', ') || '(none)'}
${outline ? `- Author's outline / notes:\n${outline}\n` : ''}
${sample ? `\nHere is an existing post for voice and formatting reference (match this tone, do not copy content):\n---\n${sample}\n---\n` : ''}
Output the post body now, starting with the import line (only if you use Callout) or the intro paragraph.`;
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const cliArgs = ['-p', '--output-format', 'text'];
    if (MODEL) cliArgs.push('--model', MODEL);
    const child = spawn('claude', cliArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      const s = d.toString();
      out += s;
      stdout.write('.');
    });
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', (e) =>
      reject(new Error(`Could not run the "claude" CLI: ${e.message}`)),
    );
    child.on('close', (code) => {
      stdout.write('\n');
      if (code !== 0) {
        const detail = [err.trim(), out.trim()].filter(Boolean).join('\n');
        if (/401|authenticate|credential/i.test(detail)) {
          reject(
            new Error(
              'Claude could not authenticate. Run `claude` once in this terminal to sign in with your account, then try again.',
            ),
          );
        } else {
          reject(
            new Error(
              `claude exited with code ${code}.` +
                (detail ? `\n\n  --- claude output ---\n  ${detail.replace(/\n/g, '\n  ')}` : ' (no output captured)'),
            ),
          );
        }
        return;
      }
      resolve(out.trim());
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function cleanBody(text) {
  let body = text.trim();
  // Strip an accidental wrapping code fence around the whole thing.
  const fence = body.match(/^```(?:mdx|markdown|md)?\n([\s\S]*)\n```$/);
  if (fence) body = fence[1].trim();
  // Strip frontmatter if the model added one anyway.
  body = body.replace(/^---\n[\s\S]*?\n---\n+/, '');
  return body;
}

function frontmatter({ title, description, category, tags }) {
  const t = tags.length ? `[${tags.join(', ')}]` : '[]';
  return `---
title: ${JSON.stringify(title)}
description: ${JSON.stringify(description)}
pubDate: ${today()}
category: ${category}
tags: ${t}
draft: true
featured: false
---

`;
}

async function main() {
  const cfg = await readConfig();
  if (!MODEL) MODEL = cfg.model;
  console.log(`\n  Draft studio — ${DRY ? 'dry run (no Claude call)' : `model: ${MODEL || 'default'}`}\n`);

  // Any field can come from a flag; we only prompt for what's missing.
  const flags = {
    title: val('--title'),
    description: val('--description'),
    category: val('--category'),
    tags: val('--tags'),
    outline: val('--outline'),
  };

  const needsPrompt =
    flags.title === undefined ||
    flags.description === undefined ||
    flags.category === undefined ||
    flags.tags === undefined ||
    (!DRY && flags.outline === undefined);

  let rl;
  const ask = async (q, def) => {
    if (!rl) rl = createInterface({ input: stdin, output: stdout });
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def || '';
  };

  if (needsPrompt && !stdin.isTTY) {
    console.error(
      'Missing fields. In a non-interactive shell, pass them as flags:\n' +
        '  --title "..." --description "..." --category tutorial --tags "a, b"\n',
    );
    process.exit(1);
  }

  const title = flags.title ?? (await ask('Title'));
  if (!title) {
    console.error('A title is required.');
    rl?.close();
    process.exit(1);
  }
  const description = flags.description ?? (await ask('One-line description'));
  let category = flags.category ?? (await ask(`Category (${CATEGORIES.join('/')})`, cfg.defaultCategory));
  if (!CATEGORIES.includes(category)) category = cfg.defaultCategory;
  const tags = (flags.tags ?? (await ask('Tags (comma-separated)')))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const outline = DRY ? '' : (flags.outline ?? (await ask('Outline / notes (optional)')));
  rl?.close();

  const slug = slugify(title);
  const outPath = join(POSTS_DIR, `${slug}.mdx`);
  try {
    await access(outPath);
    console.error(`\nA post already exists at ${slug}.mdx — choose a different title.`);
    process.exit(1);
  } catch {
    /* good, file does not exist */
  }

  let body;
  if (DRY) {
    body = `This is a dry-run scaffold for **${title}**. Replace this with real content, or run \`npm run write\` without --dry-run to draft it with Claude.

## First section

Your content here.
`;
  } else {
    console.log('\n  Drafting with Claude (this uses your account)…');
    const sample = await styleSample();
    const styleGuide = await readStyleGuide();
    body = cleanBody(
      await runClaude(buildPrompt({ title, description, category, tags, outline, sample, styleGuide })),
    );
  }

  await writeFile(outPath, frontmatter({ title, description, category, tags }) + body + '\n');
  console.log(`\n  ✓ Wrote src/content/posts/${slug}.mdx (draft: true)`);
  console.log('  Review it, then set draft: false to publish.\n');
}

main().catch((e) => {
  console.error(`\n  ✗ ${e.message}\n`);
  process.exit(1);
});
