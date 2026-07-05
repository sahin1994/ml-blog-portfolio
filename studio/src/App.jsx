import { useEffect, useRef, useState, useCallback } from 'react';
import { api, chatStream } from './api';
import Editor from './components/Editor';
import AiPanel from './components/AiPanel';
import Settings from './components/Settings';

const ASTRO = 'http://localhost:4321';
const COLOR = { tutorial: 'var(--pro-text)', 'deep-dive': 'var(--warning)', guide: 'var(--accent)', note: 'var(--success)' };

export default function App() {
  const [posts, setPosts] = useState([]);
  const [meta, setMeta] = useState({ categories: [] });
  const [slug, setSlug] = useState(null);
  const [data, setData] = useState(null);
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('preview');
  const [previewKey, setPreviewKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [sideW, setSideW] = useState(340);
  const [resizing, setResizing] = useState(false);
  const [cfgBundle, setCfgBundle] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState(null);

  const [messages, setMessages] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [diff, setDiff] = useState(null);

  const saveTimer = useRef(null);
  const flash = (t) => { setToast(t); setTimeout(() => setToast(null), 1600); };

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {});
    api.config().then(setCfgBundle).catch(() => {});
    refreshPosts();
  }, []);

  const refreshPosts = async () => {
    const p = await api.posts();
    setPosts(p);
    return p;
  };

  const openPost = useCallback(async (s) => {
    const post = await api.post(s);
    setSlug(s);
    setData(post.data);
    setBody(post.body);
    setDirty(false);
    setDiff(null);
    setMessages([]);
    setPreviewKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!slug && posts.length) openPost(posts[0].slug);
  }, [posts, slug, openPost]);

  // Debounced autosave (paused during AI streaming or a pending diff).
  useEffect(() => {
    if (!slug || !dirty || aiBusy || diff) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await api.save(slug, { data, body });
        setDirty(false);
        setPreviewKey((k) => k + 1);
        refreshPosts();
      } catch (e) {
        flash(e.message);
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [body, data, dirty, slug, aiBusy, diff]);

  const editBody = (v) => { setBody(v); setDirty(true); };
  const editField = (k, v) => { setData((d) => ({ ...d, [k]: v })); setDirty(true); };

  const newPost = async () => {
    const title = prompt('New post title');
    if (!title) return;
    try {
      const category = cfgBundle?.config?.defaultCategory || 'tutorial';
      const post = await api.create({ title, description: '', category, tags: [], body: 'Write your intro here.\n\n## First section\n\n' });
      await refreshPosts();
      openPost(post.slug);
    } catch (e) { flash(e.message); }
  };

  const togglePublish = async () => {
    const next = !data.draft;
    await api.save(slug, { data: { ...data, body: undefined }, body });
    const post = await api.setDraft(slug, next);
    setData(post.data);
    await refreshPosts();
    flash(next ? 'Set to draft' : 'Published');
  };

  // ---- AI ----
  async function sendAI(text, opts = {}) {
    if (!slug) return;
    setTab('ai');
    if (!opts.transform) setMessages((m) => [...m, { role: 'user', text }]);
    setAiInput('');
    setAiBusy(true);
    let acc = '';
    const claudeIdx = { current: null };
    await chatStream(
      { message: text, slug, body, selection: opts.selection, plain: !!opts.transform },
      {
        text: ({ text }) => {
          acc += text;
          setMessages((m) => {
            const copy = [...m];
            if (claudeIdx.current === null) { copy.push({ role: 'claude', text: acc }); claudeIdx.current = copy.length - 1; }
            else copy[claudeIdx.current] = { role: 'claude', text: acc };
            return copy;
          });
        },
        tool: ({ name }) => setMessages((m) => [...m, { role: 'tool', text: `used ${name}` }]),
        result: ({ text }) => { if (text) acc = text; },
        error: ({ message }) => setMessages((m) => [...m, { role: 'claude', text: '⚠ ' + message }]),
      },
    );
    setAiBusy(false);

    if (opts.transform) {
      const rep = acc.trim().replace(/^```[a-z]*\n?|\n?```$/g, '');
      const { from, to, original } = opts.transform;
      if (!rep) {
        setPendingRange(null);
        return;
      }
      setBody((b) => b.slice(0, from) + rep + b.slice(to));
      setDirty(true);
      setDiff({ from, to: from + rep.length, original, label: 'AI edit — review' });
      setPendingRange(null);
    } else {
      // Claude may have edited the file via MCP tools — reload from disk.
      try {
        const post = await api.post(slug);
        setBody(post.body);
        setData(post.data);
        setDirty(false);
        setPreviewKey((k) => k + 1);
        refreshPosts();
      } catch {}
    }
  }

  const onSelectionAction = (action, f) => {
    if (action === 'ask') { setTab('ai'); setAiInput(`> ${f.text}\n\n`); return; }
    const instr = {
      rewrite: 'Rewrite the following passage to be clearer and sharper, matching the blog voice. Return ONLY the rewritten passage, no preamble or quotes.',
      expand: 'Expand the following passage with one or two more sentences of useful detail. Return ONLY the new passage, no preamble.',
      simplify: 'Simplify the following passage for clarity. Return ONLY the simplified passage, no preamble.',
    }[action];
    setPendingRange({ from: f.from, to: f.to });
    sendAI(`${instr}\n\nPassage:\n${f.text}`, { transform: { from: f.from, to: f.to, original: f.text } });
  };

  const acceptDiff = () => setDiff(null);
  const rejectDiff = () => {
    setBody((b) => b.slice(0, diff.from) + diff.original + b.slice(diff.to));
    setDiff(null);
  };

  const startResize = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragging');
    const handle = e.currentTarget;
    setResizing(true);
    const move = (ev) => {
      const w = window.innerWidth - ev.clientX;
      setSideW(Math.max(280, Math.min(window.innerWidth - 380, w)));
    };
    const up = () => {
      handle.classList.remove('dragging');
      setResizing(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  const toggleExpand = () =>
    setSideW((w) => (w > 520 ? 340 : Math.round(Math.min(window.innerWidth - 380, window.innerWidth * 0.6))));

  const current = posts.find((p) => p.slug === slug);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">◐</span>
          <strong>Studio</strong>
          {slug && <span className="muted">/ {slug}</span>}
        </div>
        <div className="actions">
          {saving ? <span className="muted" style={{ fontSize: 11 }}><span className="spin" /> saving</span>
            : dirty ? <span className="muted" style={{ fontSize: 11 }}>unsaved</span>
            : slug && <span className="muted" style={{ fontSize: 11 }}>saved</span>}
          {data && <span className={`pill ${data.draft ? 'draft' : 'live'}`}>{data.draft ? 'draft' : 'published'}</span>}
          <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings"><i className="ti ti-settings" /></button>
          <button className="btn" onClick={() => setPreviewKey((k) => k + 1)} disabled={!slug}>Refresh</button>
          <button className="btn primary" onClick={togglePublish} disabled={!slug}>{data?.draft ? 'Publish' : 'Unpublish'}</button>
        </div>
      </div>

      <div className="panes">
        <div className="rail">
          <div className="head"><span>POSTS</span><button className="btn" style={{ padding: '1px 6px' }} onClick={newPost}><i className="ti ti-plus" /></button></div>
          {posts.map((p) => (
            <button key={p.slug} className={`item ${p.slug === slug ? 'active' : ''}`} onClick={() => openPost(p.slug)}>
              <span className="sdot" style={{ background: p.draft ? 'var(--warning)' : 'var(--success)' }} />
              <span className="name">{p.title}</span>
            </button>
          ))}
        </div>

        <div className="center">
          {slug ? (
            <>
              <Editor
                value={body}
                onChange={editBody}
                onSelectionAction={onSelectionAction}
                diff={diff && { ...diff, onAccept: acceptDiff, onReject: rejectDiff }}
                highlight={diff ? { from: diff.from, to: diff.to } : pendingRange}
              />
              {data && (
                <div className="frontmatter">
                  <label>Title</label>
                  <input className="" value={data.title || ''} onChange={(e) => editField('title', e.target.value)} />
                  <label>Category</label>
                  <select value={data.category} onChange={(e) => editField('category', e.target.value)}>
                    {meta.categories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <label>Description</label>
                  <input className="full" value={data.description || ''} onChange={(e) => editField('description', e.target.value)} />
                  <label>Tags</label>
                  <input value={(data.tags || []).join(', ')} onChange={(e) => editField('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
                  <label>Featured</label>
                  <input type="checkbox" style={{ width: 'auto', justifySelf: 'start' }} checked={!!data.featured} onChange={(e) => editField('featured', e.target.checked)} />
                </div>
              )}
            </>
          ) : <div className="preview-empty">No post selected</div>}
        </div>

        <div className="resizer" onMouseDown={startResize} title="Drag to resize" />

        <div className="side" style={{ width: sideW }}>
          <div className="tabs">
            <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>Preview</button>
            <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>AI</button>
            <button className="expand-btn" title="Expand / collapse panel" onClick={toggleExpand}>
              <i className={`ti ${sideW > 520 ? 'ti-arrows-diagonal-minimize-2' : 'ti-arrows-diagonal'}`} />
            </button>
          </div>
          {tab === 'preview' ? (
            slug ? <iframe key={previewKey} className="preview-frame" style={{ pointerEvents: resizing ? 'none' : 'auto' }} src={`${ASTRO}/writing/${slug}/`} title="preview" />
              : <div className="preview-empty">Select a post to preview</div>
          ) : (
            <AiPanel messages={messages} busy={aiBusy} input={aiInput} onInput={setAiInput} onSend={(t) => sendAI(t)} disabled={!slug} quickActions={cfgBundle?.config?.quickActions} />
          )}
        </div>
      </div>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        categories={meta.categories}
        initial={cfgBundle}
        onSaved={setCfgBundle}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
