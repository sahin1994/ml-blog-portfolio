// Shared content operations for the studio backend — read/write the blog's
// Markdown/MDX files. Returns structured data (the Express API serializes it).
// Paths resolve relative to this file, independent of the process cwd.

import matter from 'gray-matter';
import { readFile, writeFile, readdir, access, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');
export const POSTS_DIR = join(ROOT, 'src', 'content', 'posts');
export const PROJECTS_DIR = join(ROOT, 'src', 'content', 'projects');

export const CATEGORIES = ['tutorial', 'deep-dive', 'guide', 'note'];
export const COLORS = ['accent', 'pro', 'warning', 'success'];

export const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);

export const today = () => new Date().toISOString().slice(0, 10);

const dateOnly = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

function normalizeDates(data) {
  const d = { ...data };
  if (d.pubDate) d.pubDate = dateOnly(d.pubDate);
  if (d.updatedDate) d.updatedDate = dateOnly(d.updatedDate);
  return d;
}

const stripFrontmatter = (body) => body.replace(/^---\n[\s\S]*?\n---\n+/, '').trim();

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveFile(dir, slug) {
  for (const ext of ['.mdx', '.md']) {
    const p = join(dir, slug + ext);
    if (await pathExists(p)) return p;
  }
  return null;
}

export async function listPosts() {
  const files = (await readdir(POSTS_DIR)).filter((f) => /\.mdx?$/.test(f));
  const out = [];
  for (const f of files) {
    const { data } = matter(await readFile(join(POSTS_DIR, f), 'utf8'));
    out.push({
      slug: f.replace(/\.mdx?$/, ''),
      title: data.title ?? f,
      description: data.description ?? '',
      category: data.category ?? 'note',
      tags: data.tags ?? [],
      pubDate: dateOnly(data.pubDate) ?? '',
      draft: !!data.draft,
      featured: !!data.featured,
    });
  }
  out.sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));
  return out;
}

export async function readPost(slug) {
  const p = await resolveFile(POSTS_DIR, slug);
  if (!p) return null;
  const { data, content } = matter(await readFile(p, 'utf8'));
  return { slug, path: p, data: normalizeDates(data), body: content.trim() };
}

export async function createPost({ title, description, category, tags = [], body, draft = true, featured = false }) {
  if (!title) throw new Error('title is required');
  if (!CATEGORIES.includes(category)) throw new Error(`category must be one of: ${CATEGORIES.join(', ')}`);
  const slug = slugify(title);
  if (await resolveFile(POSTS_DIR, slug)) throw new Error(`A post "${slug}" already exists.`);
  const file = matter.stringify(stripFrontmatter(body || '') + '\n', {
    title,
    description: description ?? '',
    pubDate: today(),
    category,
    tags,
    draft,
    featured,
  });
  await writeFile(join(POSTS_DIR, slug + '.mdx'), file);
  return readPost(slug);
}

export async function savePost(slug, { data, body }) {
  const existing = await readPost(slug);
  if (!existing) throw new Error(`No post "${slug}".`);
  const merged = normalizeDates({ ...existing.data, ...(data || {}) });
  if (merged.category && !CATEGORIES.includes(merged.category))
    throw new Error(`category must be one of: ${CATEGORIES.join(', ')}`);
  const newBody = body !== undefined ? stripFrontmatter(body) + '\n' : existing.body + '\n';
  await writeFile(existing.path, matter.stringify(newBody, merged));
  return readPost(slug);
}

export async function setDraft(slug, draft) {
  return savePost(slug, { data: { draft } });
}

export async function deletePost(slug) {
  const p = await resolveFile(POSTS_DIR, slug);
  if (!p) throw new Error(`No post "${slug}".`);
  await unlink(p);
  return { deleted: slug };
}
