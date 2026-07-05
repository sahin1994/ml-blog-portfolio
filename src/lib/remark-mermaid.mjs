// Turn ```mermaid fenced code blocks into <pre class="mermaid"> nodes so they
// bypass Shiki and get rendered as diagrams by the client-side mermaid script.

const encode = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function walk(node) {
  if (!node || !Array.isArray(node.children)) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === 'code' && child.lang === 'mermaid') {
      node.children[i] = { type: 'html', value: `<pre class="mermaid">${encode(child.value)}</pre>` };
    } else {
      walk(child);
    }
  }
}

export default function remarkMermaid() {
  return (tree) => walk(tree);
}
