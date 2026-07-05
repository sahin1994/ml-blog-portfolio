const j = async (r) => {
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'request failed');
  return data;
};

export const api = {
  meta: () => fetch('/api/meta').then(j),
  posts: () => fetch('/api/posts').then(j),
  post: (slug) => fetch(`/api/post/${slug}`).then(j),
  create: (payload) =>
    fetch('/api/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(j),
  save: (slug, payload) =>
    fetch(`/api/post/${slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(j),
  setDraft: (slug, draft) =>
    fetch(`/api/post/${slug}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft }) }).then(j),
  config: () => fetch('/api/config').then(j),
  saveConfig: (payload) =>
    fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(j),
};

// Stream the AI chat endpoint (SSE-over-fetch). Calls handlers per event.
export async function chatStream(payload, handlers) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const part of parts) {
      const ev = part.match(/event: (.*)/)?.[1];
      const dataLine = part.match(/data: (.*)/s)?.[1];
      if (!ev || !dataLine) continue;
      handlers[ev]?.(JSON.parse(dataLine));
    }
  }
}
