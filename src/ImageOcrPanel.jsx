import { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT } from "./theme.js";
import { IconClose, IconPeek } from "./Icons.jsx";

function stripOcr(text) {
  let t = String(text || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  return t;
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

/** Compact card tucked against the crop rect — below, above, or beside as needed. */
function layoutNearCrop(anchor) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 10;
  const minW = 260;
  const maxW = 400;
  const maxH = 260;
  const minH = 96;

  if (!anchor) {
    const width = Math.min(maxW, vw - 24);
    const height = Math.min(maxH, 220);
    return {
      left: (vw - width) / 2,
      top: vh - height - 48,
      width,
      height,
    };
  }

  const width = clamp(anchor.width, minW, maxW);
  let left = anchor.x + (anchor.width - width) / 2;
  left = clamp(left, 8, vw - width - 8);

  let top = anchor.y + anchor.height + gap;
  let height = Math.min(maxH, vh - top - 12);

  if (height < minH) {
    top = anchor.y - gap - maxH;
    height = Math.min(maxH, anchor.y - gap - 8);
  }
  if (height < minH) {
    left = clamp(anchor.x + anchor.width + gap, 8, vw - width - 8);
    top = clamp(anchor.y, 8, vh - maxH - 8);
    height = Math.min(maxH, vh - top - 8, anchor.height);
  }
  height = clamp(height, minH, maxH);
  top = clamp(top, 8, vh - height - 8);

  return { left, top, width, height };
}

const MIRROR_PROPS = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing",
  "textTransform", "wordSpacing", "textIndent", "whiteSpace", "lineHeight",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "boxSizing",
];

function getTextareaSelectionAnchor(textarea) {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart === selectionEnd) return null;

  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  MIRROR_PROPS.forEach((p) => { mirror.style[p] = style[p]; });
  mirror.style.position = "fixed";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";
  mirror.style.pointerEvents = "none";

  const taRect = textarea.getBoundingClientRect();
  mirror.style.top = `${taRect.top}px`;
  mirror.style.left = `${taRect.left}px`;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = `${textarea.clientHeight}px`;
  mirror.style.padding = style.padding;

  const before = value.substring(0, selectionStart);
  const selected = value.substring(selectionStart, selectionEnd) || " ";
  mirror.textContent = before;
  const span = document.createElement("span");
  span.textContent = selected;
  mirror.appendChild(span);
  document.body.appendChild(mirror);
  mirror.scrollTop = textarea.scrollTop;

  const spanRect = span.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    x: spanRect.left + spanRect.width / 2,
    y: Math.max(8, spanRect.top - 6),
  };
}

const pillBtn = {
  background: "transparent",
  border: "none",
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 600,
  padding: "5px 11px",
  borderRadius: 999,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "opacity 0.16s cubic-bezier(0.22, 1, 0.36, 1), transform 0.16s cubic-bezier(0.22, 1, 0.36, 1)",
};

function SelectionToolbar({ pos, copied, onCopy, onSelectAll, onClear }) {
  if (!pos) return null;
  const left = clamp(pos.x, 80, window.innerWidth - 80);
  const top = clamp(pos.y, 48, window.innerHeight - 48);

  return (
    <div
      data-peek-ui="true"
      className="peek-pop-in"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left,
        top,
        transform: "translate(-50%, -100%)",
        zIndex: 110,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "5px 6px",
        borderRadius: 999,
        background: "rgba(20,10,25,0.94)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.32)",
      }}
    >
      <button type="button" onClick={onCopy} style={pillBtn}>
        {copied ? "Copied!" : "Copy"}
      </button>
      <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.18)" }} />
      <button type="button" onClick={onSelectAll} style={pillBtn}>Select all</button>
      <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.18)" }} />
      <button type="button" onClick={onClear} style={pillBtn}>Clear</button>
    </div>
  );
}

/**
 * Compact OCR card anchored to the image crop. Text only; Copy / Select all /
 * Clear appear in a floating pill while text is highlighted.
 */
export default function ImageOcrPanel({ busy, text, anchorRect, onClose }) {
  const [copied, setCopied] = useState(false);
  const [value, setValue] = useState("");
  const [toolbarPos, setToolbarPos] = useState(null);
  const taRef = useRef(null);

  const box = useMemo(() => layoutNearCrop(anchorRect), [anchorRect]);

  useEffect(() => {
    if (text) setValue(stripOcr(text));
  }, [text]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const syncToolbar = (e) => {
    const el = taRef.current;
    if (!el || busy) {
      setToolbarPos(null);
      return;
    }
    const { selectionStart, selectionEnd } = el;
    if (selectionStart === selectionEnd) {
      setToolbarPos(null);
      return;
    }
    const anchor = getTextareaSelectionAnchor(el);
    if (anchor) {
      setToolbarPos(anchor);
    } else if (e?.clientX != null) {
      setToolbarPos({ x: e.clientX, y: e.clientY });
    }
  };

  const getSelectedText = () => {
    const el = taRef.current;
    if (!el) return "";
    const { selectionStart, selectionEnd, value: v } = el;
    if (selectionStart === selectionEnd) return "";
    return v.substring(selectionStart, selectionEnd);
  };

  const copy = async () => {
    const str = getSelectedText().trim();
    if (!str) return;
    await window.peekDesktop.copyToClipboard(str);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const selectAll = () => {
    const el = taRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
    requestAnimationFrame(() => syncToolbar());
  };

  const clearSelection = () => {
    const el = taRef.current;
    if (!el) return;
    const end = el.value.length;
    el.focus();
    el.setSelectionRange(end, end);
    setToolbarPos(null);
  };

  const ready = !busy && !!text;

  return (
    <>
      <div
        data-peek-ui="true"
        className="peek-pop-in"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          zIndex: 102,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 12px 36px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          title="Close"
          style={{
            position: "absolute", top: 6, right: 6, zIndex: 2,
            width: 24, height: 24, borderRadius: "50%", border: "none",
            background: "rgba(255,255,255,0.92)", color: LIGHT.muted,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <IconClose style={{ width: 12, height: 12 }} />
        </button>

        {busy ? (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            color: LIGHT.muted, fontSize: 12.5,
          }}>
            <IconPeek width={28} loading style={{ color: "#000", flexShrink: 0 }} />
            Reading text…
          </div>
        ) : (
          <textarea
            ref={taRef}
            className="peek-scroll peek-selectable"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              requestAnimationFrame(() => syncToolbar());
            }}
            onSelect={syncToolbar}
            onMouseUp={syncToolbar}
            onKeyUp={syncToolbar}
            onScroll={() => syncToolbar()}
            placeholder="Text from image…"
            style={{
              flex: 1, minHeight: 0, width: "100%", resize: "none",
              border: "none", borderRadius: 12,
              padding: "10px 12px", paddingRight: 28,
              fontSize: 13, lineHeight: 1.5,
              fontFamily: "inherit", color: LIGHT.text, outline: "none",
              boxSizing: "border-box", background: "#fff",
            }}
          />
        )}
      </div>

      {ready && toolbarPos && (
        <SelectionToolbar
          pos={toolbarPos}
          copied={copied}
          onCopy={copy}
          onSelectAll={selectAll}
          onClear={clearSelection}
        />
      )}
    </>
  );
}
