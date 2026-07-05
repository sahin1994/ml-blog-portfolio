import { useRef, useState, useCallback, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView, Decoration } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

// A CodeMirror decoration that highlights the AI-edited range until accept/reject.
const setHighlight = StateEffect.define();
const aiMark = Decoration.mark({ class: 'cm-ai-edit' });
const highlightField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setHighlight)) {
        deco =
          e.value && e.value.to > e.value.from
            ? Decoration.set([aiMark.range(e.value.from, e.value.to)])
            : Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const SNIPPETS = {
  heading: { label: 'Heading', icon: 'ti-heading', text: '## ' },
  code: { label: 'Code block', icon: 'ti-code', text: '```python\n\n```\n' },
  math: { label: 'Math', icon: 'ti-math', text: '$$\n\n$$\n' },
  callout: { label: 'Callout', icon: 'ti-info-square-rounded', text: '<Callout type="note" title="">\n\n</Callout>\n' },
  mermaid: { label: 'Diagram', icon: 'ti-sitemap', text: '```mermaid\nflowchart LR\n  A[step] --> B[step]\n```\n' },
};

export default function Editor({ value, onChange, onSelectionAction, diff, highlight }) {
  const viewRef = useRef(null);
  const [float, setFloat] = useState(null); // {top,left,text,from,to}
  const [slash, setSlash] = useState(null); // {top,left}

  // Keep the AI-edit highlight in sync with the pending/diff range.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const len = view.state.doc.length;
    const h =
      highlight && highlight.to > highlight.from
        ? { from: Math.min(highlight.from, len), to: Math.min(highlight.to, len) }
        : null;
    view.dispatch({ effects: setHighlight.of(h && h.to > h.from ? h : null) });
  }, [highlight?.from, highlight?.to, value]);

  const insert = useCallback((text) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
    view.focus();
    setSlash(null);
  }, []);

  const onUpdate = useCallback((vu) => {
    const view = vu.view;
    if (!vu.selectionSet && !vu.docChanged) return;
    const sel = view.state.selection.main;

    // Floating select-to-edit actions, anchored to the selection start.
    // Coordinates are viewport-relative (the menu uses position: fixed).
    if (!sel.empty) {
      const text = view.state.sliceDoc(sel.from, sel.to);
      const c = view.coordsAtPos(sel.from);
      if (c)
        setFloat({
          top: Math.max(8, c.top - 40),
          left: Math.min(c.left, window.innerWidth - 220),
          text,
          from: sel.from,
          to: sel.to,
        });
    } else {
      setFloat(null);
    }

    // Slash menu: "/" typed at the start of a line, anchored below the caret.
    if (vu.docChanged && sel.empty) {
      const line = view.state.doc.lineAt(sel.head);
      const before = view.state.sliceDoc(line.from, sel.head);
      if (before === '/') {
        const c = view.coordsAtPos(sel.head);
        if (c) setSlash({ top: c.bottom + 4, left: c.left });
      } else {
        setSlash(null);
      }
    }
  }, []);

  const runSnippet = (key) => {
    const view = viewRef.current;
    if (view) {
      // remove the triggering "/"
      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      if (view.state.sliceDoc(line.from, head) === '/') {
        view.dispatch({ changes: { from: line.from, to: head, insert: '' } });
      }
    }
    insert(SNIPPETS[key].text);
  };

  return (
    <>
      <div className="toolbar">
        {Object.entries(SNIPPETS).map(([k, s]) => (
          <button key={k} title={s.label} onClick={() => insert(s.text)}>
            <i className={`ti ${s.icon}`} />
          </button>
        ))}
        <span className="spacer" />
        <span className="hint">/ for blocks · select text to edit</span>
      </div>

      {diff && (
        <div className="diffbar">
          <i className="ti ti-wand" />
          <span className="grow">{diff.label}</span>
          <button onClick={diff.onReject}>Reject</button>
          <button className="accept" onClick={diff.onAccept}>Accept</button>
        </div>
      )}

      <div className="editor-wrap">
        <CodeMirror
          value={value}
          height="100%"
          extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping, highlightField]}
          onChange={onChange}
          onUpdate={onUpdate}
          onCreateEditor={(view) => (viewRef.current = view)}
          basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
        />

        {float && (
          <div className="float-actions" style={{ top: float.top, left: float.left }}>
            <button onClick={() => onSelectionAction('rewrite', float)}>Rewrite</button>
            <button onClick={() => onSelectionAction('expand', float)}>Expand</button>
            <button onClick={() => onSelectionAction('simplify', float)}>Simplify</button>
            <button className="accent" onClick={() => onSelectionAction('ask', float)}>✦ Ask</button>
          </div>
        )}

        {slash && (
          <div className="slash-menu" style={{ top: slash.top, left: slash.left }}>
            {Object.entries(SNIPPETS).map(([k, s]) => (
              <button key={k} onClick={() => runSnippet(k)}>
                <i className={`ti ${s.icon}`} />
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
