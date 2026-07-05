# Blog studio

Two ways to write with Claude on your subscription (no API key):

- **Visual studio** (this, phase 2) — a local web app: editor, live preview, AI panel.
- **MCP server** (phase 1) — drive the blog by chatting in Claude Desktop/Code.

## Visual studio

One command launches everything (Astro site + API + web UI):

```bash
cd studio
npm install     # first time only
npm run dev
```

Then open **http://localhost:5173**. It starts three processes:

| Port | What |
|---|---|
| 5173 | Studio web UI (Vite + React) |
| 5177 | Studio API (Express) — file ops + AI |
| 4321 | Astro dev server — powers the live preview iframe |

**Features**
- **Posts rail** — every post, draft (amber) vs published (green); `+` for a new post.
- **Editor** — CodeMirror with a formatting toolbar, `/` slash menu (code, math, callout, diagram), and autosave.
- **Select-to-edit** — highlight text → Rewrite / Expand / Simplify → review the change with **Accept / Reject**.
- **Live preview** — an iframe of the real Astro page for the current draft, refreshed on save (drafts are visible in dev only).
- **Frontmatter form** — title, category, description, tags, featured — no hand-edited YAML.
- **AI panel** — chat with Claude about the post plus quick actions (Draft, Tighten, Diagram, Title, Callout). Claude edits the file directly through the MCP tools; the editor reloads.
- **Publish** — flip draft/published from the top bar.

**How the AI connects:** the API shells the `claude` CLI in streaming mode with the
blog MCP server auto-loaded from `.mcp.json`. It uses your Claude login — no API
key. If you see an auth error, run `claude` once in your terminal to sign in.

**Diagrams:** write a ` ```mermaid ` block (or ask the AI for one). Mermaid renders
in the preview and on the published site.

## Configuration

The AI's writing voice and studio defaults live in one place — `studio/config/`:

| File | What |
|---|---|
| `style-guide.md` | The house style / writing voice. Read **live** by the MCP server, the studio AI panel, and the CLI draft studio — edit it and the change applies everywhere with no restart. |
| `studio.config.json` | Defaults: `model` (sonnet/opus/haiku), `defaultCategory` for new posts, and the AI panel `quickActions` buttons. |

Two ways to edit them:
- **In the studio** — click the **⚙ gear** in the top bar. Edit the style guide, model, default category, and quick-action buttons, then Save.
- **In your editor** — edit the files directly; they're plain Markdown and JSON.

(Categories and colors themselves are validated at build time, so they live in
`src/content.config.ts` — change them there if you add a new category.)

---

## MCP server

`blog-mcp.mjs` exposes your blog's content operations as MCP tools, so you can
draft, edit, and publish posts by just talking to Claude. **Claude does the
writing and calls these tools to save it** — so it runs on your Claude
subscription, no API key. The server itself never calls an LLM; it's a thin,
safe layer over the Markdown files in `src/content/`.

This is phase 1. Phase 2 (a visual studio UI on top of these same operations,
connected via the Claude Agent SDK) can be layered on later.

## Tools

| Tool | What it does |
|---|---|
| `get_style_guide` | House style + a sample post — Claude reads this before drafting |
| `list_posts` | List posts (slug, title, category, tags, draft, date) |
| `read_post` | Read one post's frontmatter + body |
| `create_post` | Create a post (Claude writes the body; tool manages frontmatter). Draft by default |
| `update_post` | Change fields and/or the whole body of an existing post |
| `replace_in_post` | **Surgical edit** — exact find/replace in the body without rewriting the post |
| `set_draft` | Publish (`draft:false`) or unpublish (`draft:true`) |
| `search_posts` | Full-text search across titles, descriptions, bodies |
| `validate_build` | Run the production build to confirm content compiles — Claude self-checks after edits |
| `list_projects` | List portfolio projects |
| `read_project` | Read a project's frontmatter + body |
| `create_project` | Create a project case study |
| `update_project` | Change fields and/or body of a project |
| `set_project_draft` | Publish or unpublish a project |

Every create/update defaults to `draft: true`, so nothing publishes until you
review it. Categories (`tutorial`, `deep-dive`, `guide`, `note`) and project
colors are validated — an invalid value is rejected, not silently written.

## Use it in Claude Code

A project-scoped `.mcp.json` is already committed at the repo root. Just run
Claude Code from the project directory:

```bash
cd "/Users/sahinahmed/Documents/ml-blog-portfolio"
claude
```

Claude Code discovers the `blog` server automatically (approve it when
prompted). Then talk to it:

- "Read the style guide, then draft a guide on agentic design patterns. Save it as a draft."
- "List my drafts."
- "Publish the attention-from-scratch post."
- "Add a callout about numerical stability to the gradient boosting post."

## Use it in Claude Desktop

Add the server to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "blog": {
      "command": "node",
      "args": ["/Users/sahinahmed/Documents/ml-blog-portfolio/studio/blog-mcp.mjs"]
    }
  }
}
```

The `blog` tools then appear in the Desktop app.

## Publishing flow

1. Ask Claude to draft → it lands as a draft `.mdx` in `src/content/posts/`.
2. Preview locally: `npm run dev` (drafts are hidden) or open the file directly.
3. When happy: "publish it" (or set `draft: false`), then `git push`.

## Notes

- The server reads/writes files fresh on every call, so it always reflects the
  current state of `src/content/`.
- Paths resolve relative to this file, so the working directory doesn't matter.
- Run it standalone for a sanity check: `node studio/blog-mcp.mjs` (it waits on
  stdio — Ctrl-C to exit).
