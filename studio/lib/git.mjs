// Publish helper — stage a single content file, commit, and push so Cloudflare
// redeploys. Scoped to one file on purpose, so unrelated work-in-progress (other
// drafts, studio config edits) is never pushed by accident.

import { spawn } from 'node:child_process';
import { ROOT } from './content.mjs';

function run(cmd, args) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { cwd: ROOT });
    let out = '';
    let err = '';
    c.stdout.on('data', (d) => (out += d.toString()));
    c.stderr.on('data', (d) => (err += d.toString()));
    c.on('error', (e) => resolve({ code: -1, out, err: e.message }));
    c.on('close', (code) => resolve({ code, out, err }));
  });
}

export async function publishFile(path, message) {
  const add = await run('git', ['add', path]);
  if (add.code !== 0) return { ok: false, step: 'add', detail: add.err || add.out };

  const commit = await run('git', ['commit', '-m', message, '--', path]);
  // "nothing to commit" just means the file is already committed — not an error.
  const nothingToCommit = /nothing to commit|no changes added/i.test(commit.out + commit.err);
  if (commit.code !== 0 && !nothingToCommit) {
    return { ok: false, step: 'commit', detail: commit.err || commit.out };
  }

  const push = await run('git', ['push', 'origin', 'HEAD']);
  if (push.code !== 0) {
    const detail = push.err || push.out;
    if (/could not read|authenticat|permission|denied/i.test(detail)) {
      return { ok: false, step: 'push', detail: 'git push failed to authenticate — run `git push` once in your terminal to set up credentials.' };
    }
    return { ok: false, step: 'push', detail };
  }
  return { ok: true, committed: !nothingToCommit };
}
