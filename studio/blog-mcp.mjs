#!/usr/bin/env node
// Blog MCP server — exposes the site's content operations as MCP tools so an
// MCP client (Claude Desktop, Claude Code) can draft, edit, and publish posts.
//
// The server does NOT call an LLM. Claude (the client) does the writing and
// calls these tools to persist it — so this runs on your subscription with no
// API key, and stays a thin, safe layer over the content files.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import matter from 'gray-matter';
import { readStyleGuide } from './lib/config.mjs';
import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POSTS_DIR = join(__dirname, '..', 'src', 'content', 'posts');
const PROJECTS_DIR = join(__dirname, '..', 'src', 'content', 'projects');

const CATEGORIES = ['tutorial', 'deep-dive', 'guide', 'note'];
const COLORS = ['accent', 'pro', 'warning', 'success'];

const HOUSE_STYLE = `House style for this blog:
- Clear, direct, no hype. Show the working, not just the result.
- Open with a 2-3 sentence intro paragraph (no heading before it).
- Use "## " headings for sections (they become the table of contents).
- Fenced code blocks with a language tag; keep code correct and runnable.
- Inline math with $...$, display math with $$...$$ (KaTeX).
- For an important caveat, use the Callout component directly — it is available in
  every post, so NO import line is needed: <Callout type="warning" title="...">text</Callout>
  (types: note | warning | tip). Do NOT include frontmatter in the body — the
  tools manage frontmatter for you.
- Aim for ~500-900 focused words.`;

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);

const today = () => new Date().toISOString().slice(0, 10);

const dateOnly = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

// gray-matter parses unquoted YAML dates into JS Date objects; coerce date
// fields back to YYYY-MM-DD strings so rewrites keep the frontmatter clean.
function normalizeDates(data) {
  const d = { ...data };
  if (d.pubDate) d.pubDate = dateOnly(d.pubDate);
  if (d.updatedDate) d.updatedDate = dateOnly(d.updatedDate);
  return d;
}

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

async function listEntries(dir) {
  const files = (await readdir(dir)).filter((f) => /\.mdx?$/.test(f));
  const out = [];
  for (const f of files) {
    const raw = await readFile(join(dir, f), 'utf8');
    const { data, content } = matter(raw);
    out.push({ slug: f.replace(/\.mdx?$/, ''), file: f, data, body: content });
  }
  return out;
}

async function findEntry(dir, slug) {
  for (const ext of ['.mdx', '.md']) {
    const p = join(dir, slug + ext);
    if (await exists(p)) {
      const { data, content } = matter(await readFile(p, 'utf8'));
      return { path: p, data, body: content };
    }
  }
  return null;
}

function ok(text) {
  return { content: [{ type: 'text', text }] };
}
function fail(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

const server = new McpServer({ name: 'blog-studio', version: '0.1.0' });

server.registerTool(
  'get_style_guide',
  {
    title: 'Get style guide',
    description:
      'Return the blog house style and a sample post. Read this before drafting so new posts match the voice and formatting.',
    inputSchema: {},
  },
  async () => {
    const style = (await readStyleGuide()) || HOUSE_STYLE;
    const posts = await listEntries(POSTS_DIR).catch(() => []);
    const sample = posts[0] ? `\n\nSample post body (match this tone):\n---\n${posts[0].body.slice(0, 1600)}\n---` : '';
    return ok(style + sample);
  },
);

server.registerTool(
  'list_posts',
  {
    title: 'List posts',
    description: 'List all blog posts with their slug, title, category, tags, draft status, and date.',
    inputSchema: {
      include_drafts: z.boolean().default(true).describe('Include drafts (default true).'),
      tag: z.string().optional().describe('Only posts containing this tag or category.'),
    },
  },
  async ({ include_drafts, tag }) => {
    let posts = await listEntries(POSTS_DIR);
    if (!include_drafts) posts = posts.filter((p) => !p.data.draft);
    if (tag) posts = posts.filter((p) => [p.data.category, ...(p.data.tags || [])].includes(tag));
    posts.sort((a, b) => String(b.data.pubDate).localeCompare(String(a.data.pubDate)));
    if (!posts.length) return ok('No posts found.');
    const lines = posts.map(
      (p) =>
        `- ${p.slug}  [${p.data.draft ? 'DRAFT' : 'published'}]  ${p.data.category}  ${dateOnly(p.data.pubDate)}\n    ${p.data.title}  (tags: ${(p.data.tags || []).join(', ') || 'none'})`,
    );
    return ok(`${posts.length} post(s):\n${lines.join('\n')}`);
  },
);

server.registerTool(
  'read_post',
  {
    title: 'Read post',
    description: 'Read a single post by slug — returns its frontmatter and full body.',
    inputSchema: { slug: z.string().describe('The post slug (filename without extension).') },
  },
  async ({ slug }) => {
    const e = await findEntry(POSTS_DIR, slug);
    if (!e) return fail(`No post with slug "${slug}". Use list_posts to see available slugs.`);
    return ok(`Frontmatter:\n${JSON.stringify(e.data, null, 2)}\n\nBody:\n${e.body}`);
  },
);

server.registerTool(
  'create_post',
  {
    title: 'Create post',
    description:
      'Create a new blog post. YOU write the body (Markdown/MDX, no frontmatter) following the style guide; this tool manages the frontmatter and file. Defaults to draft: true so nothing publishes until reviewed.',
    inputSchema: {
      title: z.string().describe('Post title.'),
      description: z.string().describe('One-line summary shown in lists and meta tags.'),
      category: z.enum(CATEGORIES).describe('One of: ' + CATEGORIES.join(', ')),
      tags: z.array(z.string()).default([]).describe('Lowercase topic tags.'),
      body: z.string().describe('The post body in Markdown/MDX. Do NOT include a frontmatter block.'),
      draft: z.boolean().default(true).describe('Keep as draft (default true).'),
      featured: z.boolean().default(false).describe('Feature on the home page.'),
    },
  },
  async ({ title, description, category, tags, body, draft, featured }) => {
    const slug = slugify(title);
    if (await findEntry(POSTS_DIR, slug))
      return fail(`A post with slug "${slug}" already exists. Use update_post, or choose a different title.`);
    const cleaned = body.replace(/^---\n[\s\S]*?\n---\n+/, '').trim();
    const file = matter.stringify(cleaned + '\n', {
      title,
      description,
      pubDate: today(),
      category,
      tags,
      draft,
      featured,
    });
    await writeFile(join(POSTS_DIR, slug + '.mdx'), file);
    return ok(`Created src/content/posts/${slug}.mdx (draft: ${draft}). ${draft ? 'Set draft:false or use set_draft to publish.' : 'It is live.'}`);
  },
);

server.registerTool(
  'update_post',
  {
    title: 'Update post',
    description: 'Update an existing post. Pass only the fields you want to change; omitted fields are kept.',
    inputSchema: {
      slug: z.string().describe('Slug of the post to update.'),
      title: z.string().optional(),
      description: z.string().optional(),
      category: z.enum(CATEGORIES).optional(),
      tags: z.array(z.string()).optional(),
      body: z.string().optional().describe('Replacement body (Markdown/MDX, no frontmatter).'),
      featured: z.boolean().optional(),
    },
  },
  async ({ slug, body, ...fields }) => {
    const e = await findEntry(POSTS_DIR, slug);
    if (!e) return fail(`No post with slug "${slug}".`);
    const data = normalizeDates(e.data);
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) data[k] = v;
    const newBody = body !== undefined ? body.replace(/^---\n[\s\S]*?\n---\n+/, '').trim() + '\n' : e.body;
    await writeFile(e.path, matter.stringify(newBody, data));
    return ok(`Updated ${slug} (${Object.keys(fields).filter((k) => fields[k] !== undefined).concat(body !== undefined ? ['body'] : []).join(', ') || 'no fields'}).`);
  },
);

server.registerTool(
  'set_draft',
  {
    title: 'Publish or unpublish',
    description: 'Set a post\'s draft status. draft:false publishes it; draft:true hides it.',
    inputSchema: {
      slug: z.string().describe('Slug of the post.'),
      draft: z.boolean().describe('true = hide as draft, false = publish.'),
    },
  },
  async ({ slug, draft }) => {
    const e = await findEntry(POSTS_DIR, slug);
    if (!e) return fail(`No post with slug "${slug}".`);
    await writeFile(e.path, matter.stringify(e.body, { ...normalizeDates(e.data), draft }));
    return ok(`${slug} is now ${draft ? 'a draft (hidden)' : 'published'}.`);
  },
);

server.registerTool(
  'search_posts',
  {
    title: 'Search posts',
    description: 'Full-text search across post titles, descriptions, and bodies.',
    inputSchema: { query: z.string().describe('Search text.') },
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    const posts = await listEntries(POSTS_DIR);
    const hits = posts.filter((p) =>
      `${p.data.title} ${p.data.description} ${p.body}`.toLowerCase().includes(q),
    );
    if (!hits.length) return ok(`No posts match "${query}".`);
    return ok(`${hits.length} match(es):\n${hits.map((p) => `- ${p.slug}: ${p.data.title}`).join('\n')}`);
  },
);

server.registerTool(
  'list_projects',
  {
    title: 'List projects',
    description: 'List portfolio projects with slug, title, tech, and draft status.',
    inputSchema: {},
  },
  async () => {
    const items = await listEntries(PROJECTS_DIR);
    if (!items.length) return ok('No projects found.');
    return ok(
      items
        .map((p) => `- ${p.slug}  [${p.data.draft ? 'DRAFT' : 'published'}]  ${p.data.title}  (${(p.data.tech || []).join(', ')})`)
        .join('\n'),
    );
  },
);

server.registerTool(
  'create_project',
  {
    title: 'Create project',
    description: 'Create a portfolio project case study. YOU write the body; this manages frontmatter. Defaults to draft.',
    inputSchema: {
      title: z.string(),
      description: z.string(),
      color: z.enum(COLORS).default('accent').describe('Accent color: ' + COLORS.join(', ')),
      icon: z.string().default('ti-code').describe('A Tabler icon name, e.g. ti-timeline.'),
      tech: z.array(z.string()).default([]),
      repo: z.string().url().optional(),
      demo: z.string().url().optional(),
      body: z.string().describe('Case-study body in Markdown/MDX, no frontmatter.'),
      draft: z.boolean().default(true),
      featured: z.boolean().default(false),
    },
  },
  async ({ title, body, ...fields }) => {
    const slug = slugify(title);
    if (await findEntry(PROJECTS_DIR, slug)) return fail(`Project "${slug}" already exists.`);
    const cleaned = body.replace(/^---\n[\s\S]*?\n---\n+/, '').trim();
    const file = matter.stringify(cleaned + '\n', { title, pubDate: today(), ...fields });
    await writeFile(join(PROJECTS_DIR, slug + '.md'), file);
    return ok(`Created src/content/projects/${slug}.md (draft: ${fields.draft}).`);
  },
);

server.registerTool(
  'replace_in_post',
  {
    title: 'Replace text in a post',
    description:
      'Make a surgical edit to a post body by replacing an exact substring — without rewriting the whole post. Prefer this over update_post for small changes. Errors if the text is not found, or if it matches more than once and all is not set.',
    inputSchema: {
      slug: z.string(),
      find: z.string().min(1).describe('Exact text to find in the body.'),
      replace: z.string().describe('Replacement text.'),
      all: z.boolean().default(false).describe('Replace every occurrence (default requires a single, unique match).'),
    },
  },
  async ({ slug, find, replace, all }) => {
    const e = await findEntry(POSTS_DIR, slug);
    if (!e) return fail(`No post with slug "${slug}".`);
    const count = e.body.split(find).length - 1;
    if (count === 0) return fail(`Text not found in ${slug}. The "find" string must match the body exactly.`);
    if (count > 1 && !all)
      return fail(`Found ${count} matches in ${slug}. Pass all=true to replace them, or use a more specific "find".`);
    const newBody = all ? e.body.split(find).join(replace) : e.body.replace(find, replace);
    await writeFile(e.path, matter.stringify(newBody.trim() + '\n', normalizeDates(e.data)));
    return ok(`Replaced ${all ? count : 1} occurrence(s) in ${slug}.`);
  },
);

server.registerTool(
  'validate_build',
  {
    title: 'Validate the site build',
    description:
      'Run the production build to check that all content (frontmatter, MDX, math, Mermaid) compiles. Use this after edits to confirm nothing is broken. Returns success, or the build errors so you can fix them.',
    inputSchema: {},
  },
  async () =>
    new Promise((resolve) => {
      const child = spawn('npx', ['astro', 'build'], { cwd: ROOT });
      let out = '';
      child.stdout.on('data', (d) => (out += d.toString()));
      child.stderr.on('data', (d) => (out += d.toString()));
      child.on('error', (e) => resolve(fail(`Could not run astro build: ${e.message}`)));
      child.on('close', (code) => {
        if (code === 0) return resolve(ok('Build succeeded — all content compiles cleanly.'));
        const lines = out.split('\n').filter((l) => l.trim());
        const errs = lines.filter((l) => /error|✗|failed|cannot|expected|invalid/i.test(l)).slice(-12).join('\n');
        resolve(fail('Build FAILED:\n' + (errs || lines.slice(-12).join('\n'))));
      });
    }),
);

server.registerTool(
  'read_project',
  {
    title: 'Read project',
    description: 'Read a portfolio project by slug — returns its frontmatter and body.',
    inputSchema: { slug: z.string() },
  },
  async ({ slug }) => {
    const e = await findEntry(PROJECTS_DIR, slug);
    if (!e) return fail(`No project with slug "${slug}". Use list_projects to see slugs.`);
    return ok(`Frontmatter:\n${JSON.stringify(e.data, null, 2)}\n\nBody:\n${e.body}`);
  },
);

server.registerTool(
  'update_project',
  {
    title: 'Update project',
    description: 'Update a project. Pass only the fields you want to change; omitted fields are kept.',
    inputSchema: {
      slug: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      color: z.enum(COLORS).optional(),
      icon: z.string().optional(),
      tech: z.array(z.string()).optional(),
      repo: z.string().url().optional(),
      demo: z.string().url().optional(),
      body: z.string().optional().describe('Replacement body (Markdown/MDX, no frontmatter).'),
      featured: z.boolean().optional(),
    },
  },
  async ({ slug, body, ...fields }) => {
    const e = await findEntry(PROJECTS_DIR, slug);
    if (!e) return fail(`No project with slug "${slug}".`);
    const data = normalizeDates(e.data);
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) data[k] = v;
    const newBody = body !== undefined ? body.replace(/^---\n[\s\S]*?\n---\n+/, '').trim() + '\n' : e.body;
    await writeFile(e.path, matter.stringify(newBody, data));
    return ok(`Updated project ${slug}.`);
  },
);

server.registerTool(
  'set_project_draft',
  {
    title: 'Publish or unpublish project',
    description: "Set a project's draft status. draft:false publishes it; draft:true hides it.",
    inputSchema: { slug: z.string(), draft: z.boolean() },
  },
  async ({ slug, draft }) => {
    const e = await findEntry(PROJECTS_DIR, slug);
    if (!e) return fail(`No project with slug "${slug}".`);
    await writeFile(e.path, matter.stringify(e.body, { ...normalizeDates(e.data), draft }));
    return ok(`Project ${slug} is now ${draft ? 'a draft (hidden)' : 'published'}.`);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
