// AI backend — drives the `claude` CLI in headless streaming mode. This uses
// the user's Claude subscription login (no API key). The blog MCP server is
// auto-loaded from the project's .mcp.json, so Claude can read/update/create
// posts by calling those tools; file changes are then reloaded by the UI.

import { spawn } from 'node:child_process';
import { ROOT } from '../lib/content.mjs';
import { readConfig, readStyleGuide } from '../lib/config.mjs';

function buildPrompt({ message, slug, body, selection, styleGuide }) {
  const lines = [
    'You are the writing assistant embedded in the studio for a personal machine-learning blog.',
    'You can use the "blog" MCP tools to change the content files directly: read_post, replace_in_post (prefer this for small, surgical edits — an exact find/replace), update_post (for larger rewrites), create_post, set_draft, search_posts, list_posts, get_style_guide, validate_build, and the project tools (read_project, update_project, create_project, set_project_draft).',
    'Follow the blog house style. For a small change use replace_in_post; for a substantial rewrite use update_post. After any non-trivial edit, run validate_build to confirm the site still compiles, and fix anything it reports. Then reply with a brief one or two sentence summary of what you changed. When the user only asks a question, just answer concisely — do not edit.',
    '',
  ];
  if (styleGuide) lines.push(`Blog house style:\n${styleGuide}\n`);
  if (slug) lines.push(`The user is currently editing the post with slug: ${slug}`);
  if (selection) lines.push(`\nThe user has selected this text:\n"""\n${selection}\n"""`);
  if (body) lines.push(`\nCurrent post body:\n"""\n${body}\n"""`);
  lines.push(`\nUser request:\n${message}`);
  return lines.join('\n');
}

export async function runAgent(payload, send) {
  const cfg = await readConfig();
  const styleGuide = await readStyleGuide();
  const prompt = buildPrompt({ ...payload, styleGuide });

  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    'mcp__blog__*',
  ];
  if (cfg.model) args.push('--model', cfg.model);

  const child = spawn('claude', args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  let buf = '';
  const usedTools = new Set();

  const handleMessage = (msg) => {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) send('text', { text: block.text });
        if (block.type === 'tool_use' && block.name) {
          const short = block.name.replace(/^mcp__blog__/, '');
          usedTools.add(short);
          send('tool', { name: short });
        }
      }
    } else if (msg.type === 'result') {
      send('result', { text: msg.result || '', tools: [...usedTools] });
    }
  };

  child.stdout.on('data', (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        handleMessage(JSON.parse(line));
      } catch {
        /* ignore non-JSON lines */
      }
    }
  });
  child.stderr.on('data', (d) => (stderr += d.toString()));

  await new Promise((resolve) => {
    child.on('error', (e) => {
      send('error', { message: `Could not run the "claude" CLI: ${e.message}` });
      resolve();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = stderr.trim();
        if (/401|authenticate|credential/i.test(detail)) {
          send('error', {
            message: 'Claude could not authenticate. Run `claude` once in your terminal to sign in, then restart the studio.',
          });
        } else if (detail) {
          send('error', { message: detail.slice(0, 500) });
        }
      }
      resolve();
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
