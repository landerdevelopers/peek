import { useState } from "react";
import { IconImage, IconChatTab, IconMic, IconCondense, IconWand, IconArrowLeft } from "./Icons.jsx";
const BTN = 44;
const STRIP_ITEM_PULL = 10;
const PULL_EASE = "0.24s cubic-bezier(0.34, 1.25, 0.64, 1)";

const ROOT_ITEMS = [
  { key: "image", label: "Image", Icon: IconImage },
  { key: "text", label: "Text", Icon: IconChatTab },
  { key: "voice", label: "Voice", Icon: IconMic },
];

const TEXT_STARTERS = [
  { key: "chat", label: "Chat with screen", Icon: IconChatTab },
  { key: "summarize", label: "Summarize screen", Icon: IconCondense },
  { key: "custom", label: "Ask something", Icon: IconWand },
];

export default function BubbleStrip({
  bubblePos, bubbleSize, onLeftSide, view,
  activeChat, menuOpen,
  onOpenChat, onImage, onText, onVoice, onTextStarter, onBack, onEnter, onLeave,
}) {
  if (!activeChat && !menuOpen) return null;

  const openBelow = bubblePos.y < window.innerHeight / 2;
  const items = view === "text-options" ? TEXT_STARTERS : ROOT_ITEMS;
  const radius = onLeftSide ? "0 13px 13px 0" : "13px 0 0 13px";
  const activeRadius = onLeftSide ? "0 14px 14px 0" : "14px 0 0 14px";

  const positionStyle = {
    position: "fixed",
    ...(onLeftSide ? { left: 0 } : { right: 0 }),
    ...(openBelow
      ? { top: bubblePos.y + bubbleSize + 8 }
      : { bottom: window.innerHeight - bubblePos.y + 8 }),
  };

  const handleClick = (key) => {
    if (view === "text-options") { onTextStarter(key); return; }
    if (key === "image") onImage();
    else if (key === "voice") onVoice();
    else onText();
  };

  const chatLabel = activeChat?.ready
    ? "Answer ready"
    : activeChat?.busy
    ? "Thinking…"
    : "Open chat";

  const ChatIcon = IconChatTab;

  return (
    <div
      data-peek-ui="true"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        ...positionStyle, zIndex: 59,
        display: "flex", flexDirection: openBelow ? "column" : "column-reverse", gap: 7,
        alignItems: onLeftSide ? "flex-start" : "flex-end",
      }}
    >
      {activeChat && (
        <StripButton
          Icon={ChatIcon}
          label={chatLabel}
          onClick={onOpenChat}
          onLeftSide={onLeftSide}
          radius={activeRadius}
          light
          status={activeChat.ready ? "ready" : activeChat.busy ? "busy" : null}
        />
      )}
      {menuOpen && view === "text-options" && (
        <StripButton Icon={IconArrowLeft} label="Back" onClick={onBack} onLeftSide={onLeftSide} radius={activeRadius} light />
      )}
      {menuOpen && items.map(({ key, label, Icon }) => (
        <StripButton key={key} Icon={Icon} label={label} onClick={() => handleClick(key)} onLeftSide={onLeftSide} radius={radius} />
      ))}
    </div>
  );
}

function StripButton({ Icon, label, onClick, onLeftSide, radius, muted, light, status }) {
  const [hover, setHover] = useState(false);
  const width = BTN + (hover ? STRIP_ITEM_PULL : 0);
  return (
    <div style={{
      display: "flex", flexDirection: onLeftSide ? "row" : "row-reverse", alignItems: "center", gap: 8,
    }}>
      <button
        type="button"
        className="peek-interactive"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: "relative",
          width, height: BTN, borderRadius: radius, flexShrink: 0,
          background: light
            ? (hover ? "#F4F4F5" : "#FFFFFF")
            : (hover ? "#333" : "#1E1E1E"),
          color: light ? "#2D1B36" : muted ? "rgba(255,255,255,0.55)" : "#EDEDED",
          border: light ? "1px solid rgba(147,51,234,0.22)" : "none",
          cursor: "pointer",
          display: "flex", alignItems: "center",
          justifyContent: onLeftSide ? "flex-end" : "flex-start",
          padding: onLeftSide ? "0 13px 0 0" : "0 0 0 13px",
          boxShadow: light
            ? (hover
              ? "0 10px 28px rgba(147,51,234,0.28), 0 0 0 1px rgba(147,51,234,0.12)"
              : "0 8px 22px rgba(147,51,234,0.22), 0 0 0 1px rgba(147,51,234,0.1)")
            : (hover
              ? "0 10px 24px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.08)"
              : "0 6px 18px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)"),
          transition: `width ${PULL_EASE}, background 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow ${PULL_EASE}, color 0.18s ease`,
        }}
      >
        <Icon style={{ width: 18, height: 18, color: light ? "#9333EA" : undefined }} />
        {status && (
          <span style={{
            position: "absolute",
            bottom: 6,
            ...(onLeftSide ? { left: 8 } : { right: 8 }),
            width: 7, height: 7, borderRadius: "50%",
            background: status === "ready" ? "#22C55E" : "#FBBF24",
            border: "1.5px solid #fff",
            boxShadow: status === "ready" ? "0 0 5px rgba(34,197,94,0.6)" : "0 0 5px rgba(251,191,36,0.5)",
            animation: status === "busy" ? "peek-bubble-pulse 1.2s ease-in-out infinite" : undefined,
            transition: "opacity 0.18s ease, transform 0.18s ease",
          }} />
        )}
      </button>
      {hover && (
        <span style={{
          background: light ? "#fff" : "#1E1E1E",
          color: light ? "#2D1B36" : "#EDEDED",
          fontSize: 12, fontWeight: 600,
          padding: "5px 9px", borderRadius: 8, whiteSpace: "nowrap", pointerEvents: "none",
          border: light ? "1px solid rgba(147,51,234,0.15)" : "none",
          boxShadow: light
            ? "0 6px 18px rgba(147,51,234,0.15), 0 0 0 1px rgba(147,51,234,0.08)"
            : "0 6px 18px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)",
          animation: "peek-strip-label-in 0.18s cubic-bezier(0.34, 1.2, 0.64, 1)",
        }}>{label}</span>
      )}
    </div>
  );
}
