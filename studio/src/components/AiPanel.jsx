import { useRef, useEffect } from 'react';

const FALLBACK_QUICK = [
  { label: 'Draft', prompt: 'Draft a new section that would naturally come next in this post.' },
  { label: 'Tighten', prompt: 'Tighten the whole post — cut filler, keep the meaning. Update the post.' },
];

export default function AiPanel({ messages, busy, input, onInput, onSend, disabled, quickActions }) {
  const QUICK = quickActions?.length ? quickActions : FALLBACK_QUICK;
  const logRef = useRef(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, busy]);

  const submit = () => {
    const t = input.trim();
    if (t && !busy) onSend(t);
  };

  return (
    <div className="ai">
      <div className="log" ref={logRef}>
        {messages.length === 0 && (
          <div className="muted" style={{ fontSize: 12, padding: '4px 2px' }}>
            Ask Claude to draft, edit, or diagram this post. Changes are written straight to the file.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'tool' ? <><i className="ti ti-tool" /> {m.text}</> : m.text}
          </div>
        ))}
        {busy && <div className="msg claude"><span className="spin" /></div>}
      </div>
      <div className="composer">
        <div className="chips">
          {QUICK.map((q) => (
            <button key={q.label} disabled={disabled || busy} onClick={() => onSend(q.prompt)}>
              {q.label}
            </button>
          ))}
        </div>
        <div className="inputrow">
          <textarea
            rows={1}
            placeholder={disabled ? 'Select a post first' : 'Ask Claude…'}
            value={input}
            disabled={disabled}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button disabled={disabled || busy || !input.trim()} onClick={submit} aria-label="Send">
            <i className="ti ti-arrow-up" />
          </button>
        </div>
      </div>
    </div>
  );
}
