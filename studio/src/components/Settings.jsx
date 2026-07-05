import { useState, useEffect } from 'react';
import { api } from '../api';

const MODELS = ['sonnet', 'opus', 'haiku'];

export default function Settings({ open, onClose, categories, initial, onSaved }) {
  const [style, setStyle] = useState('');
  const [model, setModel] = useState('sonnet');
  const [defaultCategory, setDefaultCategory] = useState('tutorial');
  const [quick, setQuick] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && initial) {
      setStyle(initial.styleGuide || '');
      setModel(initial.config?.model || 'sonnet');
      setDefaultCategory(initial.config?.defaultCategory || 'tutorial');
      setQuick(initial.config?.quickActions || []);
    }
  }, [open, initial]);

  if (!open) return null;

  const updateQuick = (i, k, v) => setQuick(quick.map((q, j) => (j === i ? { ...q, [k]: v } : q)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.saveConfig({
        styleGuide: style,
        config: { model, defaultCategory, quickActions: quick.filter((q) => q.label.trim() && q.prompt.trim()) },
      });
      onSaved(res);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Studio settings</strong>
          <button onClick={onClose} aria-label="Close"><i className="ti ti-x" /></button>
        </div>

        <div className="modal-body">
          <div className="two">
            <label className="fld">
              <span>Model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {MODELS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="fld">
              <span>Default category for new posts</span>
              <select value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)}>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <label className="fld">
            <span>Style guide — the AI's writing voice (applies everywhere, live)</span>
            <textarea value={style} onChange={(e) => setStyle(e.target.value)} rows={11} />
          </label>

          <div className="fld">
            <div className="qa-head">
              <span>Quick actions (AI panel buttons)</span>
              <button className="btn" onClick={() => setQuick([...quick, { label: '', prompt: '' }])}>
                <i className="ti ti-plus" /> add
              </button>
            </div>
            {quick.map((q, i) => (
              <div className="qa-row" key={i}>
                <input placeholder="Label" value={q.label} onChange={(e) => updateQuick(i, 'label', e.target.value)} />
                <input placeholder="Prompt sent to Claude" value={q.prompt} onChange={(e) => updateQuick(i, 'prompt', e.target.value)} />
                <button aria-label="Remove" onClick={() => setQuick(quick.filter((_, j) => j !== i))}><i className="ti ti-trash" /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
