import { PAL } from "./theme.js";

// Tiny markdown renderer for answer text in the panel. Zero-dep; covers the
// subset a model actually emits: paragraphs, bullet/numbered lists, **bold**,
// and `inline code`. Adapted from buddy/src/Markdown.jsx.

function renderInline(text, keyPrefix, theme) {
  const nodes = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const bold = m[2] ?? m[3];
    if (bold !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`} style={{ fontWeight: 600, color: theme.text }}>{bold}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-c${i}`} style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "0.92em", color: theme.text, background: theme.borderSoft,
          border: `1px solid ${theme.border}`, borderRadius: 5, padding: "1px 4px",
        }}>{m[4]}</code>,
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// `theme` picks which palette (dark PAL by default, or LIGHT for the
// dashboard) drives bold/code colors; `color` overrides just the body text.
export function RichText({ text, color, theme = PAL }) {
  if (!text) return null;

  const normalized = String(text)
    .replace(/\r/g, "")
    .replace(/\s+[-•]\s+(?=\*\*)/g, "\n- ")
    .replace(/\s+(\d+[.)])\s+(?=\*\*)/g, "\n$1 ");

  const lines = normalized.split("\n");
  const blocks = [];
  let list = null;
  const flush = () => { if (list) { blocks.push(list); list = null; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (bullet) {
      if (!list || list.type !== "ul") { flush(); list = { type: "ul", items: [] }; }
      list.items.push(bullet[1]);
    } else if (numbered) {
      if (!list || list.type !== "ol") { flush(); list = { type: "ol", items: [] }; }
      list.items.push(numbered[2]);
    } else {
      flush();
      blocks.push({ type: "p", text: line });
    }
  }
  flush();

  const liStyle = { marginBottom: 3, paddingLeft: 2 };
  const listStyle = { margin: "2px 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 1 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, color: color || theme.text, lineHeight: 1.5 }}>
      {blocks.map((b, i) => {
        if (b.type === "p") return <div key={i}>{renderInline(b.text, `p${i}`, theme)}</div>;
        if (b.type === "ol") {
          return (
            <ol key={i} style={{ ...listStyle, listStyleType: "decimal" }}>
              {b.items.map((it, j) => <li key={j} style={liStyle}>{renderInline(it, `o${i}-${j}`, theme)}</li>)}
            </ol>
          );
        }
        return (
          <ul key={i} style={{ ...listStyle, listStyleType: "disc" }}>
            {b.items.map((it, j) => <li key={j} style={liStyle}>{renderInline(it, `u${i}-${j}`, theme)}</li>)}
          </ul>
        );
      })}
    </div>
  );
}
