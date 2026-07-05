# ml-blog-portfolio

A personal blog + portfolio for machine learning, data science, and engineering
writing. Built with Astro, MDX, Tailwind v4, Shiki, and KaTeX.

## Stack

- **Astro** — static-first, zero JS by default
- **MDX** — Markdown posts with embeddable components (`<Callout>`, charts, demos)
- **Content Collections** — typed, schema-validated frontmatter
- **Tailwind CSS v4** — design tokens in `src/styles/global.css`
- **Shiki** — build-time syntax highlighting (dual light/dark themes)
- **KaTeX** — LaTeX math via `$...$` and `$$...$$`

## Commands

```bash
npm run dev      # local dev server at http://localhost:4321
npm run build    # production build (+ Pagefind search index) to ./dist
npm run preview  # preview the production build (search works here)
npm run write    # draft a new post with Claude (the draft studio)
```

## Draft studio — write posts with Claude

`npm run write` drafts a post using **your logged-in Claude account** (via the
Claude Code CLI — no API key, no separate billing). It reads an existing post
for voice, drafts the body, and writes a new `.mdx` file with `draft: true` so
nothing publishes until you review it.

```bash
npm run write                      # interactive prompts
npm run write -- --model opus      # pick a model (default: sonnet)
npm run write -- --dry-run         # scaffold a file without calling Claude
# non-interactive (all fields as flags):
npm run write -- --title "Multi-head attention" \
  --description "Extending attention to many heads" \
  --category tutorial --tags "nlp, python" --outline "start from single-head..."
```

If you see an auth error, run `claude` once in the same terminal to sign in,
then retry. After drafting, open the file, edit, and set `draft: false` to
publish.

## Writing studio (MCP server)

`studio/blog-mcp.mjs` is an MCP server that lets you draft, edit, and publish
posts by talking to Claude (Desktop or Code) — Claude writes, and calls the
server's tools to save the files. Runs on your Claude subscription, no API key.
A project `.mcp.json` is committed so Claude Code picks it up automatically.
See [studio/README.md](studio/README.md) for tools and setup.

## Search (Pagefind)

Full-text search is built into `npm run build` — Pagefind indexes the built
site into `dist/pagefind/`. Open search from the header (magnifying glass) or
press `/`. It works in `npm run preview` and in production, **not** in
`astro dev` (there's no built index during dev).

## Writing a post

Add a `.md` or `.mdx` file to `src/content/posts/`:

```yaml
---
title: "Your title"
description: "One-line summary shown in lists and meta tags"
pubDate: 2026-06-12
category: tutorial        # tutorial | deep-dive | guide | note
tags: [nlp, python]
featured: false           # surface on the home page
draft: false              # hide from the site while true
---
```

Reading time is computed automatically. Categories map to colors in
`src/consts.ts` (`CATEGORY_COLOR`).

## Adding a project

Add a file to `src/content/projects/` with `title`, `description`, `pubDate`,
`color`, `icon` (any Tabler icon name), `tech`, and optional `repo` / `demo`.

## Structure

```
src/
├─ pages/          routes (index, writing, projects, tags, about, 404, rss)
├─ layouts/        BaseLayout, PostLayout, ProjectLayout
├─ components/     Nav, Footer, PostRow, ProjectCard, Callout
├─ content/        posts/ and projects/ (your Markdown/MDX)
├─ styles/         global.css — all design tokens live here
├─ consts.ts       site name, nav, socials, category colors
└─ content.config.ts   collection schemas
```

## Before deploying

- Set your real domain in `astro.config.mjs` (`site`).
- Update name, email, and social links in `src/consts.ts`.
- Replace the GitHub links in `Nav.astro` and the socials.

Deploy anywhere that serves static files — Vercel, Netlify, and Cloudflare Pages
all auto-detect Astro.
