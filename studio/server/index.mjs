import express from 'express';
import cors from 'cors';
import {
  listPosts,
  readPost,
  createPost,
  savePost,
  setDraft,
  deletePost,
  CATEGORIES,
  COLORS,
} from '../lib/content.mjs';
import { readConfig, writeConfig, readStyleGuide, writeStyleGuide } from '../lib/config.mjs';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

app.get('/api/meta', (_req, res) => res.json({ categories: CATEGORIES, colors: COLORS }));
app.get('/api/config', wrap(async () => ({ config: await readConfig(), styleGuide: await readStyleGuide() })));
app.put(
  '/api/config',
  wrap(async (req) => {
    if (req.body.styleGuide !== undefined) await writeStyleGuide(req.body.styleGuide);
    const config = req.body.config ? await writeConfig(req.body.config) : await readConfig();
    return { config, styleGuide: await readStyleGuide() };
  }),
);
app.get('/api/posts', wrap(() => listPosts()));
app.get(
  '/api/post/:slug',
  wrap(async (req) => {
    const post = await readPost(req.params.slug);
    if (!post) throw new Error('not found');
    return post;
  }),
);
app.post('/api/post', wrap((req) => createPost(req.body)));
app.put('/api/post/:slug', wrap((req) => savePost(req.params.slug, req.body)));
app.post('/api/post/:slug/draft', wrap((req) => setDraft(req.params.slug, !!req.body.draft)));
app.delete('/api/post/:slug', wrap((req) => deletePost(req.params.slug)));

// AI chat — Server-Sent Events stream. Delegates to the Agent SDK wrapper.
app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const { runAgent } = await import('./agent.mjs');
    await runAgent(req.body, send);
  } catch (e) {
    send('error', { message: e.message });
  }
  send('done', {});
  res.end();
});

const PORT = process.env.STUDIO_PORT || 5177;
app.listen(PORT, () => console.log(`[studio] api on http://localhost:${PORT}`));
