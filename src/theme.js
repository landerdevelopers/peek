export const PAL = {
  coral: "#D97757",
  bg: "#1A1A1A",
  bgElevated: "#222222",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.07)",
  text: "#E5E5E5",
  muted: "#A3A3A3",
  surface: "rgba(255,255,255,0.05)",
};

// Light palette for the main dashboard window, color-picked directly from
// the reference design (Figma node 5:19 — a Claude Desktop screenshot):
// coral #D97757 sampled exact-match to PAL.coral above, so the two themes
// share the same accent. Panel.jsx also uses LIGHT now; RecordHotkey.jsx
// stays on the dark PAL.
export const LIGHT = {
  coral: "#D97757",
  bg: "#FCFCFB",
  surface: "#FFFFFF",
  border: "#E8E7E3",
  borderSoft: "#F1F0EC",
  text: "#3A3833",
  icon: "#5B5955",
  muted: "#96938D",
};

// User message bubble — shared by Dashboard and overlay Panel.
export const USER_BUBBLE = {
  background: "rgba(180,90,220,0.1)",
  border: "1px solid rgba(147,51,234,0.18)",
  boxShadow: "0 6px 20px rgba(150,90,200,0.12)",
};
