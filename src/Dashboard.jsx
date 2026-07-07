import { useEffect, useRef, useState } from "react";
import { LIGHT, USER_BUBBLE } from "./theme.js";
import ChatTurn, { ThinkingBubble } from "./ChatTurn.jsx";
import Settings from "./Settings.jsx";
import PillDropdown from "./PillDropdown.jsx";
import { useVoiceInput } from "./useVoiceInput.js";
import {
  IconSearch, IconMenu, IconPeek, IconMinimize, IconMaximize, IconClose,
  IconPanelToggle, IconArrowLeft, IconArrowRight, IconPlusCircle, IconSettings,
  IconAttachment, IconMic, IconArrowUp, IconMoreHorizontal, IconPencil, IconTrash, IconScanText,
} from "./Icons.jsx";
import { OCR_PROMPT } from "./prompts.js";
import { fmtAccel, loadPlatformInfo } from "./accelFormat.js";

const BACKEND_OPTIONS = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];
// Shared with Panel.jsx (the hotkey overlay) via localStorage — both windows
// load the same origin, so this key is the app-wide "last used backend".
const BACKEND_KEY = "peek-backend";
const SIDEBAR_W = 224;
const CHAT_COL_W = 680; // matches the composer's fixed width so thread + input line up
// Flat #F7F7F7/#E7E7E7 match the card tones the Figma composer redesign
// introduced (node 14:77) — kept here so the sidebar reads as part of the
// same flat, un-gradiented system rather than the earlier pink/purple card.
const SIDEBAR_BG = "#F7F7F7";
const NEUTRAL = {
  faint: "#EFEFEF",
  hover: "#ECECEC",
  strong: "#FFFFFF",
  divider: "#E7E7E7",
  border: "#E7E7E7",
};
// Coral is Anthropic's brand color — swapped for Peek's own identity: a
// faint 10%-opacity pink/purple wash (not a solid fill) with a matching
// hairline border, dark text for contrast against the pale tint.
// USER_BUBBLE lives in theme.js — shared with Panel.jsx.

// Figma node 14:77 — the main composer, restyled with the same pink/purple
// treatment as the rest of the app: an animated conic-gradient ring
// (.peek-gradient-border, index.html) standing in for the design's flat
// magenta border.
function greetingFor(hour) {
  if (hour < 5) return "Night";
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}


/**
 * Peek's main app window. Visual design matches the reference (Figma node
 * 5:19 — a Claude Desktop screenshot): light warm palette (see LIGHT in
 * theme.js, color-sampled from that design), serif greeting, rounded
 * composer card, sidebar with search + Recents. Recents is Peek's real
 * session history (electron/store.cjs), shared with the hotkey overlay's
 * Panel — a chat started either place shows up here.
 */
export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState([]); // [{q, a}]
  const [activeImage, setActiveImage] = useState(null);
  const [activeImagePath, setActiveImagePath] = useState(null);
  const [attachment, setAttachment] = useState(null); // {imagePath, thumbDataUrl} — pending, not yet sent
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState(() => localStorage.getItem(BACKEND_KEY) || "claude");
  const [view, setView] = useState("chat"); // chat | settings
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [hotkey, setHotkey] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [hoveredSessionId, setHoveredSessionId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const searchRef = useRef(null);

  const refreshSessions = () => window.peekDesktop.sessions.list().then(setSessions).catch(() => {});

  useEffect(() => { loadPlatformInfo(); }, []);
  useEffect(() => { refreshSessions(); }, []);
  useEffect(() => { window.peekDesktop.whoami().then(setUsername).catch(() => {}); }, []);
  useEffect(() => { window.peekDesktop.getHotkey().then(setHotkey).catch(() => {}); }, []);
  useEffect(() => { localStorage.setItem(BACKEND_KEY, backend); }, [backend]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, busy]);
  useEffect(() => { if (view === "chat") inputRef.current?.focus(); }, [view, activeId]);

  const startNewChat = () => {
    setActiveId(null);
    setThread([]);
    setActiveImage(null);
    setActiveImagePath(null);
    setAttachment(null);
    setView("chat");
    setInput("");
  };

  const pickImage = async () => {
    const res = await window.peekDesktop.pickImage();
    if (res && !res.error) setAttachment(res);
  };

  const openSession = async (id) => {
    const s = await window.peekDesktop.sessions.get(id);
    if (!s) return;
    setActiveId(s.id);
    setThread((s.thread || []).map((t) => ({ q: t.q, a: t.a })));
    setActiveImage(s.thumbDataUrl || null);
    setActiveImagePath(s.imagePath || null);
    setBackend(s.backend || "claude");
    setView("chat");
  };

  const removeSession = async (id) => {
    setMenuOpenId(null);
    await window.peekDesktop.sessions.delete(id);
    if (activeId === id) startNewChat();
    refreshSessions();
  };

  const startRename = (e, s) => {
    e.stopPropagation();
    setMenuOpenId(null);
    setRenamingId(s.id);
    setRenameValue(s.title || "");
  };

  const commitRename = async (id) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    await window.peekDesktop.sessions.rename(id, title);
    refreshSessions();
  };

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    const history = thread.map((t) => ({ q: t.q, a: t.a }));
    const res = await window.peekDesktop.ask({
      question, history, backend, sessionId: activeId,
      imagePath: attachment?.imagePath || activeImagePath,
      thumbDataUrl: attachment?.thumbDataUrl || activeImage,
    });
    if (res?.sessionId && res.sessionId !== activeId) setActiveId(res.sessionId);
    if (attachment) {
      setActiveImage(attachment.thumbDataUrl);
      setActiveImagePath(attachment.imagePath);
      setAttachment(null);
    }
    setThread((t) => [...t, { q: question, a: res?.error ? `Couldn't get an answer: ${res.error}` : (res?.text || "(no answer)") }]);
    setBusy(false);
    refreshSessions();
  };

  const regenerate = async (index) => {
    const turn = thread[index];
    if (!turn || busy) return;
    setBusy(true);
    const history = thread.slice(0, index).map((t) => ({ q: t.q, a: t.a }));
    const res = await window.peekDesktop.ask({
      question: turn.q, history, backend, sessionId: activeId,
      imagePath: activeImagePath, thumbDataUrl: activeImage,
    });
    if (res?.sessionId && res.sessionId !== activeId) setActiveId(res.sessionId);
    const answer = res?.error ? `Couldn't get an answer: ${res.error}` : (res?.text || "(no answer)");
    setThread((t) => t.map((tt, i) => (i === index ? { q: tt.q, a: answer } : tt)));
    setBusy(false);
    refreshSessions();
  };

  const extractText = async () => {
    if (!attachment || busy) return;
    setBusy(true);
    const history = thread.map((t) => ({ q: t.q, a: t.a }));
    const res = await window.peekDesktop.ask({
      question: OCR_PROMPT, history, backend, sessionId: activeId,
      imagePath: attachment.imagePath, thumbDataUrl: attachment.thumbDataUrl,
    });
    setBusy(false);
    if (res?.error || !res?.text) {
      setThread((t) => [...t, { q: "Extract text (OCR)", a: `Couldn't extract text: ${res?.error || "no text found"}` }]);
      return;
    }
    await window.peekDesktop.copyToClipboard(res.text);
    if (res?.sessionId && res.sessionId !== activeId) setActiveId(res.sessionId);
    setActiveImage(attachment.thumbDataUrl);
    setAttachment(null);
    setThread((t) => [...t, { q: "Extract text (OCR)", a: res.text }]);
    refreshSessions();
  };

  const onInputKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const focusSearch = () => {
    setSidebarOpen(true);
    setSearchOpen(true);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const closeSearch = () => {
    setSearch("");
    setSearchOpen(false);
  };

  const filtered = search.trim()
    ? sessions.filter((s) => (s.title || "").toLowerCase().includes(search.trim().toLowerCase()))
    : sessions;

  const greeting = `${greetingFor(new Date().getHours())}, ${username || "there"}`;
  const isEmpty = !activeId && thread.length === 0;

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      background: LIGHT.bg, borderRadius: 12, overflow: "hidden", color: LIGHT.text,
      border: `1px solid ${LIGHT.border}`, fontFamily: "inherit",
    }}>
      <div style={{
        WebkitAppRegion: "drag", display: "flex", alignItems: "center", height: 44,
        padding: "0 8px 0 12px", flexShrink: 0, position: "relative",
      }}>
        <div style={{ WebkitAppRegion: "no-drag", display: "flex", alignItems: "center", gap: 2 }}>
          <TitlebarIconBtn onClick={() => setSidebarOpen((v) => !v)} title="Toggle sidebar"><IconMenu /></TitlebarIconBtn>
          <TitlebarIconBtn onClick={() => setSidebarOpen((v) => !v)} title="Toggle sidebar" active={sidebarOpen}><IconPanelToggle /></TitlebarIconBtn>
          <TitlebarIconBtn onClick={focusSearch} title="Search chats"><IconSearch /></TitlebarIconBtn>
          <TitlebarIconBtn disabled title="Back"><IconArrowLeft /></TitlebarIconBtn>
          <TitlebarIconBtn disabled title="Forward"><IconArrowRight /></TitlebarIconBtn>
        </div>
        <div style={{
          position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          fontSize: 13, fontWeight: 700, letterSpacing: 0.3, color: LIGHT.text, opacity: 0.7,
          userSelect: "none", pointerEvents: "none",
        }}>Peek</div>
        <div style={{ flex: 1 }} />
        <div style={{ WebkitAppRegion: "no-drag", display: "flex", gap: 2 }}>
          <TitlebarIconBtn onClick={() => window.peekDesktop.windowMinimize()} title="Minimize"><IconMinimize /></TitlebarIconBtn>
          <TitlebarIconBtn onClick={() => window.peekDesktop.windowMaximize()} title="Maximize"><IconMaximize /></TitlebarIconBtn>
          <TitlebarIconBtn danger onClick={() => window.peekDesktop.windowClose()} title="Close"><IconClose /></TitlebarIconBtn>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, gap: 12, position: "relative" }}>
        {sidebarOpen && (
          <div style={{
            width: SIDEBAR_W, flexShrink: 0, position: "relative",
            background: SIDEBAR_BG, minHeight: 0, margin: "12px 0 12px 12px",
            borderRadius: 14, border: `1px solid ${NEUTRAL.border}`,
            boxShadow: "0 4px 14px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>
            <div style={{
              position: "relative", zIndex: 1, display: "flex", flexDirection: "column",
              gap: 10, padding: "10px 10px 14px", height: "100%", minHeight: 0, boxSizing: "border-box",
            }}>
              <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
                <SidebarMenuItem icon={<IconPlusCircle />} label="New chat" onClick={startNewChat}
                  trailing={fmtAccel(hotkey) && <span style={{ fontSize: 11, color: LIGHT.text, opacity: 0.6, fontWeight: 500 }}>{fmtAccel(hotkey)}</span>} />
              </div>

              {searchOpen && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, background: NEUTRAL.faint,
                  border: `1px solid ${NEUTRAL.divider}`, borderRadius: 8, padding: "6px 8px", flexShrink: 0,
                }}>
                  <IconSearch style={{ color: LIGHT.text, opacity: 0.6, flexShrink: 0 }} />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                    placeholder="Search chats"
                    style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: LIGHT.text, fontSize: 12.5 }}
                  />
                  <button onClick={closeSearch} title="Close search" style={{
                    background: "transparent", border: "none", color: LIGHT.text, opacity: 0.6, cursor: "pointer",
                    display: "flex", padding: 2, flexShrink: 0,
                  }}><IconClose /></button>
                </div>
              )}

              <div className="peek-bold" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.2, color: LIGHT.text, opacity: 0.55, padding: "4px 6px 0", flexShrink: 0 }}>
                Recents
              </div>
              <div className="peek-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, minHeight: 0 }}>
                {filtered.length === 0 && (
                  <div style={{ fontSize: 12, color: LIGHT.text, opacity: 0.55, padding: "8px 6px" }}>
                    {sessions.length === 0 ? "No chats yet" : "No matches"}
                  </div>
                )}
                {filtered.map((s) => {
                  const isActive = activeId === s.id;
                  const showCard = isActive || hoveredSessionId === s.id || menuOpenId === s.id || renamingId === s.id;
                  return (
                  <div
                    key={s.id}
                    className="peek-recent-row"
                    onClick={() => renamingId !== s.id && openSession(s.id)}
                    onMouseEnter={() => setHoveredSessionId(s.id)}
                    onMouseLeave={() => setHoveredSessionId((id) => (id === s.id ? null : id))}
                    style={{
                      position: "relative", zIndex: menuOpenId === s.id ? 5 : 0,
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 10px", borderRadius: 10,
                      cursor: "pointer", fontSize: 13,
                      background: showCard ? "#fff" : "transparent",
                      border: showCard
                        ? `1px solid ${isActive ? LIGHT.coral : NEUTRAL.divider}`
                        : "1px solid transparent",
                      boxShadow: showCard ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                      color: LIGHT.text, opacity: isActive ? 1 : 0.85,
                    }}
                  >
                    {renamingId === s.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(s.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={() => commitRename(s.id)}
                        style={{
                          flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
                          color: LIGHT.text, fontSize: 13, fontFamily: "inherit", padding: 0,
                        }}
                      />
                    ) : (
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.title || "Untitled chat"}
                      </span>
                    )}
                    <button
                      className="peek-recent-more"
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }}
                      title="More"
                      style={{
                        background: "transparent", border: "none", color: LIGHT.text, cursor: "pointer",
                        display: "flex", padding: "2px 4px", flexShrink: 0,
                        opacity: showCard && renamingId !== s.id ? 0.55 : 0,
                        transform: showCard && renamingId !== s.id ? "scale(1)" : "scale(0.85)",
                        pointerEvents: showCard && renamingId !== s.id ? "auto" : "none",
                      }}
                    ><IconMoreHorizontal /></button>

                    {menuOpenId === s.id && (
                      <>
                        <div
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }}
                          style={{ position: "fixed", inset: 0, zIndex: 60 }}
                        />
                        <div
                          className="peek-pop-in"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 61,
                            background: "#fff", border: `1px solid ${NEUTRAL.divider}`, borderRadius: 10,
                            boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 4, minWidth: 130,
                            display: "flex", flexDirection: "column",
                          }}
                        >
                          <button
                            onClick={(e) => startRename(e, s)}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, background: "transparent",
                              border: "none", borderRadius: 6, color: LIGHT.text, padding: "7px 8px",
                              fontSize: 12.5, fontWeight: 500, cursor: "pointer", textAlign: "left",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = NEUTRAL.faint; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          ><IconPencil style={{ color: LIGHT.icon, flexShrink: 0 }} /> Rename</button>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, background: "transparent",
                              border: "none", borderRadius: 6, color: "#C4522F", padding: "7px 8px",
                              fontSize: 12.5, fontWeight: 500, cursor: "pointer", textAlign: "left",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "#FBEAE5"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          ><IconTrash style={{ flexShrink: 0 }} /> Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                  );
                })}
              </div>

              <div style={{ borderTop: `1px solid ${NEUTRAL.divider}`, margin: "0 -10px", flexShrink: 0 }} />

              <button className="peek-interactive peek-bold" onClick={() => setView(view === "settings" ? "chat" : "settings")} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: view === "settings" ? NEUTRAL.hover : "transparent",
                border: "none", borderRadius: 8, color: LIGHT.text, padding: "7px 6px",
                fontSize: 13.5, fontWeight: 600, cursor: "pointer", textAlign: "left", flexShrink: 0,
              }}>
                <IconSettings style={{ color: LIGHT.icon, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Settings</span>
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {isEmpty ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <IconPeek width={40} loading={busy} style={{ flexShrink: 0, color: "#000" }} />
                <div style={{ fontSize: 34, fontFamily: "Georgia, 'Times New Roman', serif", color: LIGHT.text }}>{greeting}</div>
              </div>
              <Composer
                input={input} setInput={setInput} onKeyDown={onInputKey} onSend={send} busy={busy}
                backend={backend} setBackend={setBackend} inputRef={inputRef} centered
                attachment={attachment} onPickImage={pickImage} onClearAttachment={() => setAttachment(null)}
                onExtractText={extractText} extractBusy={busy}
              />
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="peek-scroll peek-selectable" style={{ flex: 1, overflowY: "auto", padding: "20px 28px", background: LIGHT.bg }}>
                <div style={{
                  width: CHAT_COL_W, maxWidth: "100%", margin: "0 auto",
                  display: "flex", flexDirection: "column", gap: 28,
                }}>
                  {activeImage && (
                    <div style={{ width: 180, borderRadius: 12, flexShrink: 0, overflow: "hidden", border: `1px solid ${LIGHT.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <img src={activeImage} alt="" style={{ display: "block", width: "100%" }} />
                    </div>
                  )}
                  {thread.map((turn, i) => (
                    <ChatTurn
                      key={i}
                      question={turn.q}
                      answer={turn.a}
                      isLast={i === thread.length - 1}
                      busy={busy}
                      onRegenerate={() => regenerate(i)}
                    />
                  ))}
                  {busy && <ThinkingBubble />}
                </div>
              </div>
              <div style={{ padding: "12px 28px 20px", flexShrink: 0, display: "flex", justifyContent: "center" }}>
                <Composer
                  input={input} setInput={setInput} onKeyDown={onInputKey} onSend={send} busy={busy}
                  backend={backend} setBackend={setBackend} inputRef={inputRef}
                  attachment={attachment} onPickImage={pickImage} onClearAttachment={() => setAttachment(null)}
                onExtractText={extractText} extractBusy={busy}
                />
              </div>
            </>
          )}
        </div>

        {view === "settings" && <Settings onClose={() => setView("chat")} />}
      </div>
    </div>
  );
}

function TitlebarIconBtn({ children, onClick, title, danger, color, disabled, active }) {
  const baseColor = color || (disabled ? LIGHT.muted : active ? LIGHT.text : LIGHT.icon);
  const baseBg = active ? NEUTRAL.hover : "transparent";
  return (
    <button
      className="peek-interactive"
      onClick={disabled ? undefined : onClick}
      title={title}
      style={{
        width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
        background: baseBg, border: "none", color: baseColor, borderRadius: 6,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (disabled) return; e.currentTarget.style.background = danger ? "#D64545" : LIGHT.borderSoft; e.currentTarget.style.color = danger ? "#fff" : LIGHT.text; }}
      onMouseLeave={(e) => { if (disabled) return; e.currentTarget.style.background = baseBg; e.currentTarget.style.color = baseColor; }}
    >
      {children}
    </button>
  );
}

function SidebarMenuItem({ icon, label, onClick, trailing }) {
  return (
    <button
      className="peek-interactive peek-bold"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, background: USER_BUBBLE.background,
        border: USER_BUBBLE.border, borderRadius: 8, color: LIGHT.text, padding: "7px 6px",
        fontSize: 13.5, fontWeight: 700, cursor: onClick ? "pointer" : "default", textAlign: "left",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(180,90,220,0.16)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = USER_BUBBLE.background; }}
    >
      <span style={{ color: LIGHT.icon, display: "flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {trailing}
    </button>
  );
}

const COMPOSER_INPUT_MAX_H = 320;

function Composer({ input, setInput, onKeyDown, onSend, busy, backend, setBackend, inputRef, centered, attachment, onPickImage, onClearAttachment, onExtractText, extractBusy }) {
  const { listening, voiceError, toggleVoice } = useVoiceInput(input, setInput);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, COMPOSER_INPUT_MAX_H) + "px";
  }, [input, inputRef]);

  return (
    <div className="peek-gradient-border" style={{ width: CHAT_COL_W, maxWidth: "100%" }}>
      <div style={{
        background: "#F7F7F7", borderRadius: 23.5, paddingBottom: 16,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{
          background: "#fff", borderRadius: "23.5px 23.5px 18px 18px", padding: 16, minHeight: centered ? 56 : 44,
          boxShadow: "0 1px 1px rgba(0,0,0,0.08)",
        }}>
          {attachment && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <img src={attachment.thumbDataUrl} alt="" style={{
                width: 36, height: 36, objectFit: "cover", borderRadius: 8, border: `1px solid ${LIGHT.border}`, flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, color: LIGHT.muted, flex: 1 }}>Image attached</span>
              <button onClick={onClearAttachment} title="Remove attachment" style={{
                background: "transparent", border: "none", cursor: "pointer", color: LIGHT.muted,
                display: "flex", padding: 2, flexShrink: 0,
              }}><IconClose /></button>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask me anything..."
            rows={1}
            className="peek-scroll"
            style={{
              width: "100%", resize: "none", background: "transparent", border: "none", outline: "none",
              color: "#3A3833", fontSize: 15, fontWeight: 500, fontFamily: "inherit",
              maxHeight: COMPOSER_INPUT_MAX_H, overflowY: "auto", display: "block",
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <PillIconBtn title="Attach an image" onClick={onPickImage}><IconAttachment /></PillIconBtn>
            <PillIconBtn title={listening ? "Stop listening" : "Voice input"} onClick={toggleVoice} active={listening}><IconMic /></PillIconBtn>
            {attachment && (
              <PillIconBtn
                title={extractBusy ? "Extracting text…" : "Extract text to clipboard"}
                onClick={onExtractText} disabled={extractBusy}
              ><IconScanText /></PillIconBtn>
            )}
            <PillDropdown value={backend} onChange={setBackend} options={BACKEND_OPTIONS} />
          </div>
          <button onClick={onSend} disabled={busy || !input.trim()} style={{
            width: 44, height: 44, borderRadius: "50%", background: "#000", border: "none",
            boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer",
            opacity: busy || !input.trim() ? 0.4 : 1, flexShrink: 0,
          }}>
            <IconArrowUp style={{ color: "#fff" }} />
          </button>
        </div>
        {voiceError && (
          <div style={{ fontSize: 11.5, color: "#C4522F", padding: "0 16px" }}>{voiceError}</div>
        )}
      </div>
    </div>
  );
}

function PillIconBtn({ children, title, onClick, active, disabled }) {
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled} style={{
      display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 34,
      borderRadius: 999,
      background: active ? "#000" : "linear-gradient(180deg, #fff 7%, rgba(255,255,255,0) 66%), #F2F2F2",
      boxShadow: active ? "0 6px 10px -4px rgba(0,0,0,0.3)" : "0 6px 10px -4px rgba(0,0,0,0.12), 0 0 0 1px #EEE",
      border: "none", color: active ? "#fff" : "#3A3833", cursor: onClick ? "pointer" : "default",
      opacity: disabled ? 0.5 : 1, flexShrink: 0,
    }}>
      {children}
    </button>
  );
}
