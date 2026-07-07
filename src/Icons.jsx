// Small inline icon set for the dashboard (titlebar controls + sidebar search/settings).
// Zero-dep, stroke-based, inherits color via currentColor — same "no icon
// library" convention the rest of Peek already follows.

import { useId } from "react";

const PEEK_LOGO_RATIO = 216 / 180;

const PEEK_BUBBLE_OUTLINE =
  "M159.22 0H41.3757C35.7841 0 30.6999 2.214 26.9649 5.8212L26.3604 6.426L6.30405 26.4816C2.42879 30.2616 0 35.5428 0 41.3964V159.278C0 170.759 9.30495 180.068 20.7796 180.068H30.797V211.831C30.797 215.536 35.266 217.393 37.8891 214.769L72.5613 180.068H138.624C144.356 180.068 149.548 177.736 153.305 173.988L173.556 153.727L173.793 153.49C177.614 149.731 180 144.482 180 138.672V20.79C180 9.3096 170.695 0 159.22 0ZM170.296 138.672C170.296 141.664 169.119 144.482 167.003 146.567L166.96 146.599L166.798 146.761C164.758 148.662 162.135 149.731 159.361 149.753H41.3757C35.266 149.753 30.2897 144.774 30.2897 138.661V20.6496C30.322 17.874 31.3799 15.2496 33.3121 13.1976L33.7547 12.7548C35.8165 10.7892 38.5151 9.7092 41.3757 9.7092H159.22C165.33 9.7092 170.306 14.688 170.306 20.8008V138.683L170.296 138.672Z";

const PEEK_BUBBLE_INNER =
  "M170.296 20.79V138.672C170.296 141.664 169.119 144.482 167.004 146.567L166.961 146.599L166.799 146.761C164.758 148.662 162.135 149.731 159.361 149.753H41.3761C35.2664 149.753 30.29 144.774 30.29 138.661V20.6496C30.3224 17.874 31.3803 15.2496 33.3125 13.1976L33.7551 12.7548C35.8169 10.7892 38.5155 9.70923 41.3761 9.70923H159.221C165.331 9.70923 170.307 14.688 170.307 20.8008L170.296 20.79Z";

function PeekLoadingDots() {
  const dots = [
    { cx: 68, delay: "0s" },
    { cx: 100, delay: "0.12s" },
    { cx: 132, delay: "0.24s" },
  ];
  return (
    <>
      {dots.map((d) => (
        <g key={d.cx} className="peek-logo-dot" style={{ animationDelay: d.delay }}>
          <circle cx={d.cx} cy={76} r={18} fill="currentColor" />
        </g>
      ))}
    </>
  );
}

function PeekFace() {
  return (
    <>
      <path d="M173.793 153.49L173.556 153.727" stroke="currentColor" strokeWidth="1.28" strokeMiterlimit="10" />
      <path d="M153.305 173.988L153.132 174.172" stroke="currentColor" strokeWidth="1.28" strokeMiterlimit="10" />
      <path d="M95.9966 67.1005H86.2059C84.8889 67.1005 83.7231 66.1825 83.4964 64.8865C82.4385 58.8385 77.16 54.2269 70.8236 54.2269C64.4871 54.2269 59.187 58.8385 58.1291 64.8865C57.9024 66.1825 56.7366 67.1005 55.4197 67.1005H42.7036C42.7036 51.5917 55.3225 38.9773 70.8236 38.9773C85.2991 38.9773 97.2595 49.9933 98.7708 64.0873C98.9435 65.7073 97.6266 67.1005 96.0074 67.1005H95.9966Z" fill="currentColor" />
      <path d="M163.031 42.6599V69.2819C163.031 103.237 135.267 131.749 101.329 131.339C74.7741 131.015 51.7276 113.713 43.9231 88.5923C43.3726 86.8103 44.7219 85.0067 46.5786 85.0067H56.8226C57.9885 85.0067 59.0031 85.7519 59.4241 86.8427C66.052 104.155 82.6002 115.873 101.512 116.089C127.139 116.392 147.778 94.9643 147.778 69.3143V64.8755C143.913 66.8735 139.531 68.0075 134.9 68.0075C120.414 68.0075 108.464 56.9807 106.953 42.8867C106.78 41.2667 108.097 39.8735 109.716 39.8735H119.507C120.824 39.8735 121.99 40.7915 122.216 42.0875C123.274 48.1463 128.553 52.7579 134.889 52.7579C141.226 52.7579 146.526 48.1463 147.584 42.0875C147.81 40.7915 148.976 39.8735 150.293 39.8735H160.246C161.779 39.8735 163.02 41.1155 163.02 42.6491L163.031 42.6599Z" fill="currentColor" />
    </>
  );
}

export function IconSearch(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconMenu(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function IconChevronDown(props) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconPeek(props) {
  const clipId = useId().replace(/:/g, "");
  const { width = 30, height, loading = false, style, ...rest } = props;
  const w = width;
  const h = height ?? (typeof w === "number" ? Math.round(w * PEEK_LOGO_RATIO) : w);
  return (
    <svg width={w} height={h} viewBox="0 0 180 216" fill="none" xmlns="http://www.w3.org/2000/svg" style={style} {...rest}>
      <g clipPath={`url(#${clipId})`}>
        <path d={PEEK_BUBBLE_OUTLINE} fill="currentColor" />
        <path d={PEEK_BUBBLE_INNER} fill="white" />
        {loading ? <PeekLoadingDots /> : <PeekFace />}
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="180" height="216" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function IconSparkle(props) {
  const gradId = useId().replace(/:/g, "");
  const { width = 14, height = 14, ...rest } = props;
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill={`url(#${gradId})`} {...rest}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#9333EA" />
        </linearGradient>
      </defs>
      <path d="M12 0c.6 3.6 1.4 6 2.7 7.3C16 8.6 18.4 9.4 22 10c-3.6.6-6 1.4-7.3 2.7C13.4 14 12.6 16.4 12 20c-.6-3.6-1.4-6-2.7-7.3C8 11.4 5.6 10.6 2 10c3.6-.6 6-1.4 7.3-2.7C10.6 6 11.4 3.6 12 0z" />
    </svg>
  );
}

export function IconSettings(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function IconKeyboard(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="6" y1="10" x2="6" y2="10" />
      <line x1="10" y1="10" x2="10" y2="10" />
      <line x1="14" y1="10" x2="14" y2="10" />
      <line x1="18" y1="10" x2="18" y2="10" />
      <line x1="7" y1="14" x2="17" y2="14" />
    </svg>
  );
}

export function IconMinimize(props) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <line x1="2" y1="6" x2="10" y2="6" />
    </svg>
  );
}

export function IconMaximize(props) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" {...props}>
      <rect x="2.5" y="2.5" width="7" height="7" />
    </svg>
  );
}

export function IconClose(props) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" {...props}>
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  );
}

export function IconPanelToggle(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <line x1="9.5" y1="4" x2="9.5" y2="20" />
    </svg>
  );
}

export function IconArrowLeft(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

export function IconArrowRight(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function IconChatTab(props) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 12.5a6 6 0 1 1 2.2 4.65L4 19l1.6-3.8" />
      <path d="M15.5 4.6A6 6 0 0 1 21 10.4c0 .9-.2 1.75-.55 2.5" />
    </svg>
  );
}

export function IconListTab(props) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
      <line x1="9" y1="6" x2="20" y2="6" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />
      <line x1="9" y1="18" x2="20" y2="18" />
    </svg>
  );
}

export function IconCodeTab(props) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="8 6 2 12 8 18" />
      <polyline points="16 6 22 12 16 18" />
    </svg>
  );
}

export function IconPlusCircle(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export function IconProjects(props) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 9.5 6 5h12l2 4.5" />
      <path d="M4 9.5h16V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V9.5z" />
    </svg>
  );
}

export function IconArtifacts(props) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M10.3 10.3 18 18" />
      <path d="M14.5 18a3.5 3.5 0 1 0 3.5-3.5" />
    </svg>
  );
}

export function IconCustomize(props) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="3" y1="13" x2="21" y2="13" />
    </svg>
  );
}

export function IconPalette(props) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.45-.18-.86-.45-1.17a1.6 1.6 0 0 1-.4-1.08c0-.9.73-1.55 1.63-1.55h1.9A4.62 4.62 0 0 0 21 11c0-4.4-4-8-9-8z" />
      <circle cx="7.3" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.8" cy="7" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.2" cy="7" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.7" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconDownload(props) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <polyline points="8 10 12 14 16 10" />
      <line x1="12" y1="3" x2="12" y2="14" />
    </svg>
  );
}

export function IconAttachment(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 11.5 12.4 20a4.5 4.5 0 0 1-6.4-6.4L14.5 5a3 3 0 0 1 4.3 4.2l-8.3 8.3a1.5 1.5 0 0 1-2.2-2.1l7.4-7.4" />
    </svg>
  );
}

export function IconScanText(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 7V5a1 1 0 0 1 1-1h2" />
      <path d="M17 4h2a1 1 0 0 1 1 1v2" />
      <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
      <path d="M7 21H5a1 1 0 0 1-1-1v-2" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="13" x2="17" y2="13" />
      <line x1="7" y1="17" x2="13" y2="17" />
    </svg>
  );
}

export function IconImage(props) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

export function IconMic(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="17.5" x2="12" y2="21.5" />
      <line x1="8.5" y1="21.5" x2="15.5" y2="21.5" />
    </svg>
  );
}

export function IconHistory(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12a9 9 0 1 0 2.6-6.3L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

export function IconArrowUp(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="6 11 12 5 18 11" />
    </svg>
  );
}


export function IconMoreHorizontal(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
    </svg>
  );
}

export function IconPencil(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 3a2.83 2.83 0 0 1 4 4L7 21l-4 1 1-4z" />
    </svg>
  );
}

export function IconTrash(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconWand(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20 15 9" />
      <path d="M15 3v3" />
      <path d="M21 7h-3" />
      <path d="m19.5 4.5 1.5 1.5" />
      <path d="m16.5 9.5 1 1" />
    </svg>
  );
}

export function IconZap(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="13 2 3 14 11 14 10 22 21 10 13 10 13 2" />
    </svg>
  );
}

export function IconCondense(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export function IconShuffle(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

export function IconBulb(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
    </svg>
  );
}

export function IconPin(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 17v5" />
      <path d="M5 10.5 12 3l7 7.5c0 3-3 5-7 5s-7-2-7-5z" />
    </svg>
  );
}

export function IconAlignLines(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <line x1="4" y1="6" x2="14" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="10" y2="18" />
    </svg>
  );
}
