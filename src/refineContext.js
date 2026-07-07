import {
  IconCheck, IconWand, IconZap, IconCondense, IconShuffle, IconBulb, IconAlignLines,
  IconCodeTab, IconChatTab,
} from "./Icons.jsx";

/** @typedef {{ key: string, label: string, icon: import('react').ComponentType, instruction: string }} RefineAction */

const ACTIONS = {
  fix: {
    key: "fix", label: "Fix grammar", icon: IconCheck,
    instruction: "Fix all spelling and grammar mistakes.",
  },
  improve: {
    key: "improve", label: "Improve writing", icon: IconWand,
    instruction: "Improve for clarity and flow while keeping the original meaning and tone.",
  },
  punchier: {
    key: "punchier", label: "Make it punchier", icon: IconZap,
    instruction: "Make punchier and more direct while keeping the same meaning.",
  },
  condense: {
    key: "condense", label: "Condense", icon: IconCondense,
    instruction: "Condense significantly while preserving the core meaning.",
  },
  rephrase: {
    key: "rephrase", label: "Rephrase / Mix it up", icon: IconShuffle,
    instruction: "Rephrase with different wording and sentence structure, same meaning and tone.",
  },
  expand: {
    key: "expand", label: "Expand & Elaborate", icon: IconBulb,
    instruction: "Expand with relevant detail while keeping the original voice.",
  },
  structure: {
    key: "structure", label: "Improve structure & spacing", icon: IconAlignLines,
    instruction: "Improve structure, formatting, and spacing without changing the meaning.",
  },
  explain: {
    key: "explain", label: "Explain this", icon: IconBulb,
    instruction: "Explain what this means in plain language. Be concise.",
  },
  summarize: {
    key: "summarize", label: "Summarize", icon: IconCondense,
    instruction: "Summarize the key points in a short bullet list.",
  },
  simplify: {
    key: "simplify", label: "Simplify", icon: IconWand,
    instruction: "Rewrite in simpler language that's easier to understand.",
  },
  translate: {
    key: "translate", label: "Translate to English", icon: IconShuffle,
    instruction: "Translate to clear English. If already English, polish it slightly.",
  },
  bullets: {
    key: "bullets", label: "Turn into bullets", icon: IconAlignLines,
    instruction: "Turn this into a concise bullet list, preserving the facts.",
  },
  eli5: {
    key: "eli5", label: "Explain simply", icon: IconBulb,
    instruction: "Explain in very simple terms, as if for someone new to the topic.",
  },
  keyPoints: {
    key: "key-points", label: "Key takeaways", icon: IconAlignLines,
    instruction: "Extract the key takeaways as a short bullet list.",
  },
  formatMd: {
    key: "format-md", label: "Clean up markdown", icon: IconAlignLines,
    instruction: "Clean up markdown formatting (headings, lists, spacing) without changing meaning.",
  },
  mdStructure: {
    key: "md-structure", label: "Improve headings & outline", icon: IconAlignLines,
    instruction: "Improve markdown structure: clearer headings, hierarchy, and spacing. Keep the same content.",
  },
  mdBullets: {
    key: "md-bullets", label: "Convert to bullet list", icon: IconAlignLines,
    instruction: "Convert this markdown content into a well-structured bullet list.",
  },
  explainCode: {
    key: "explain-code", label: "Explain code", icon: IconBulb,
    instruction: "Explain what this code does, step by step, in plain language.",
  },
  refactor: {
    key: "refactor", label: "Refactor", icon: IconCodeTab,
    instruction: "Refactor for clarity and maintainability. Keep the same behavior. Output only the revised code.",
  },
  comments: {
    key: "comments", label: "Add comments", icon: IconChatTab,
    instruction: "Add clear, concise comments. Output only the commented code.",
  },
  fixCode: {
    key: "fix-code", label: "Fix bugs", icon: IconCheck,
    instruction: "Fix bugs or obvious issues. Output only the corrected code.",
  },
  simplifyCode: {
    key: "simplify-code", label: "Simplify code", icon: IconCondense,
    instruction: "Simplify without changing behavior. Output only the simplified code.",
  },
  explainError: {
    key: "explain-error", label: "Explain error", icon: IconBulb,
    instruction: "Explain what this error/output means and the most likely cause.",
  },
  suggestFix: {
    key: "suggest-fix", label: "Suggest fix", icon: IconWand,
    instruction: "Suggest the most likely fix for this error/output. Be specific and actionable.",
  },
  draftReply: {
    key: "draft-reply", label: "Draft a reply", icon: IconChatTab,
    instruction: "Draft a concise, natural reply to this email or message.",
  },
  draftEmail: {
    key: "draft-email", label: "Draft email", icon: IconChatTab,
    instruction: "Turn this into a clear, well-structured email. Include a subject line if missing.",
  },
  polishSubject: {
    key: "polish-subject", label: "Polish subject line", icon: IconWand,
    instruction: "Rewrite as a clear, compelling email subject line only. No other text.",
  },
  formal: {
    key: "formal", label: "Make more formal", icon: IconAlignLines,
    instruction: "Rewrite in a more formal, professional tone.",
  },
  shorten: {
    key: "shorten", label: "Shorten", icon: IconCondense,
    instruction: "Shorten while keeping the essential meaning.",
  },
  friendlier: {
    key: "friendlier", label: "Make friendlier", icon: IconWand,
    instruction: "Make warmer and friendlier while keeping the same intent.",
  },
  professional: {
    key: "professional", label: "More professional", icon: IconAlignLines,
    instruction: "Make more professional and polished.",
  },
  prComment: {
    key: "pr-comment", label: "Polish PR comment", icon: IconChatTab,
    instruction: "Polish this as a constructive pull-request comment. Be specific and kind.",
  },
  issueComment: {
    key: "issue-comment", label: "Clearer issue comment", icon: IconChatTab,
    instruction: "Rewrite as a clear, actionable issue or bug report comment.",
  },
  hookOpening: {
    key: "hook-opening", label: "Stronger opening", icon: IconZap,
    instruction: "Rewrite the opening to be more engaging. Keep the rest of the meaning.",
  },
  addCta: {
    key: "add-cta", label: "Add call to action", icon: IconZap,
    instruction: "Add a natural call to action at the end without changing the core message.",
  },
  threadTweet: {
    key: "thread-tweet", label: "Fit for a post", icon: IconCondense,
    instruction: "Tighten for a short social post. Stay under 280 characters if possible.",
  },
  explainFormula: {
    key: "explain-formula", label: "Explain formula", icon: IconBulb,
    instruction: "Explain what this spreadsheet formula or cell content means.",
  },
};

const PROFILES = {
  prose: {
    id: "prose",
    label: "Writing",
    keys: ["fix", "improve", "punchier", "condense", "rephrase", "expand", "structure"],
  },
  browser: {
    id: "browser",
    label: "Web page",
    keys: ["explain", "summarize", "simplify", "keyPoints", "translate"],
  },
  markdown: {
    id: "markdown",
    label: "Markdown",
    keys: ["formatMd", "mdStructure", "condense", "improve", "mdBullets", "fix"],
  },
  code: {
    id: "code",
    label: "Code",
    keys: ["explainCode", "refactor", "comments", "fixCode", "simplifyCode"],
  },
  email: {
    id: "email",
    label: "Email",
    keys: ["draftReply", "shorten", "formal", "fix", "professional", "friendlier"],
  },
  chat: {
    id: "chat",
    label: "Message",
    keys: ["shorten", "friendlier", "professional", "rephrase", "fix"],
  },
  terminal: {
    id: "terminal",
    label: "Terminal",
    keys: ["explainError", "suggestFix", "simplify"],
  },
  spreadsheet: {
    id: "spreadsheet",
    label: "Spreadsheet",
    keys: ["explainFormula", "summarize", "simplify"],
  },
  // --- Site-specific (browser tab titles) -----------------------------------
  gmail: {
    id: "gmail",
    label: "Gmail",
    keys: ["draftReply", "shorten", "formal", "fix", "professional", "polishSubject"],
  },
  outlookWeb: {
    id: "outlook-web",
    label: "Outlook",
    keys: ["draftReply", "draftEmail", "shorten", "formal", "fix", "professional"],
  },
  webmail: {
    id: "webmail",
    label: "Email",
    keys: ["draftReply", "draftEmail", "shorten", "formal", "fix", "professional"],
  },
  googleDocs: {
    id: "google-docs",
    label: "Google Docs",
    keys: ["fix", "improve", "condense", "rephrase", "structure", "formal"],
  },
  notion: {
    id: "notion",
    label: "Notion",
    keys: ["improve", "condense", "bullets", "structure", "fix", "expand"],
  },
  github: {
    id: "github",
    label: "GitHub",
    keys: ["explain", "prComment", "issueComment", "improve", "summarize", "shorten"],
  },
  gitlab: {
    id: "gitlab",
    label: "GitLab",
    keys: ["explain", "prComment", "issueComment", "improve", "summarize"],
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    keys: ["professional", "punchier", "hookOpening", "shorten", "addCta", "fix"],
  },
  twitter: {
    id: "twitter",
    label: "X / Twitter",
    keys: ["threadTweet", "punchier", "shorten", "rephrase", "hookOpening"],
  },
  slackWeb: {
    id: "slack-web",
    label: "Slack",
    keys: ["shorten", "friendlier", "professional", "rephrase", "fix"],
  },
  discordWeb: {
    id: "discord-web",
    label: "Discord",
    keys: ["shorten", "friendlier", "rephrase", "fix"],
  },
  stackoverflow: {
    id: "stackoverflow",
    label: "Stack Overflow",
    keys: ["explain", "simplify", "eli5", "summarize", "improve"],
  },
  reddit: {
    id: "reddit",
    label: "Reddit",
    keys: ["summarize", "explain", "simplify", "bullets"],
  },
  wikipedia: {
    id: "wikipedia",
    label: "Wikipedia",
    keys: ["summarize", "keyPoints", "simplify", "eli5"],
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    keys: ["summarize", "keyPoints", "bullets", "explain"],
  },
  medium: {
    id: "medium",
    label: "Article",
    keys: ["summarize", "keyPoints", "simplify", "explain"],
  },
  googleSheets: {
    id: "google-sheets",
    label: "Google Sheets",
    keys: ["explainFormula", "summarize", "simplify"],
  },
};

/** @type {{ id: keyof typeof PROFILES, label: string, test: (title: string) => boolean }[]} */
const SITE_RULES = [
  { id: "gmail", label: "Gmail", test: (t) => /\bgmail\b/i.test(t) || /@gmail\.com/i.test(t) || /\binbox\b.*\bgoogle\b/i.test(t) },
  { id: "outlookWeb", label: "Outlook", test: (t) => /\boutlook\b/i.test(t) && /\b(mail|office|live)\b/i.test(t) },
  { id: "webmail", label: "Yahoo Mail", test: (t) => /\byahoo\s*mail\b/i.test(t) },
  { id: "webmail", label: "Proton Mail", test: (t) => /\bproton\s*mail\b/i.test(t) },
  { id: "webmail", label: "iCloud Mail", test: (t) => /\bicloud\s*mail\b/i.test(t) },
  { id: "googleDocs", label: "Google Docs", test: (t) => /\bgoogle docs\b/i.test(t) },
  { id: "googleSheets", label: "Google Sheets", test: (t) => /\bgoogle sheets\b/i.test(t) },
  { id: "notion", label: "Notion", test: (t) => /\bnotion\b/i.test(t) },
  { id: "github", label: "GitHub", test: (t) => /\bgithub\b/i.test(t) },
  { id: "gitlab", label: "GitLab", test: (t) => /\bgitlab\b/i.test(t) },
  { id: "linkedin", label: "LinkedIn", test: (t) => /\blinkedin\b/i.test(t) },
  { id: "twitter", label: "X", test: (t) => /\b(twitter|x\.com)\b/i.test(t) || /\s\/\s*X\s*$/i.test(t) || /\s-\s*X\s*$/i.test(t) },
  { id: "slackWeb", label: "Slack", test: (t) => /\bslack\b/i.test(t) },
  { id: "discordWeb", label: "Discord", test: (t) => /\bdiscord\b/i.test(t) },
  { id: "stackoverflow", label: "Stack Overflow", test: (t) => /\bstack overflow\b/i.test(t) },
  { id: "reddit", label: "Reddit", test: (t) => /\breddit\b/i.test(t) },
  { id: "wikipedia", label: "Wikipedia", test: (t) => /\bwikipedia\b/i.test(t) },
  { id: "youtube", label: "YouTube", test: (t) => /\byoutube\b/i.test(t) },
  { id: "medium", label: "Medium", test: (t) => /\bmedium\b/i.test(t) || /\bsubstack\b/i.test(t) },
];

const BROWSER_PROCESSES = new Set([
  "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "arc", "zen", "waterfox", "safari",
]);
const IDE_PROCESSES = new Set([
  "cursor", "code", "devenv", "windsurf", "idea64", "pycharm64", "webstorm64",
  "rider64", "goland64", "sublime_text", "notepad++", "nvim", "vim", "xcode",
]);
const EMAIL_PROCESSES = new Set(["outlook", "thunderbird", "olk", "mail"]);
const CHAT_PROCESSES = new Set(["slack", "discord", "teams", "zoom", "messages"]);
const SPREADSHEET_PROCESSES = new Set(["excel", "calc"]);
const WORD_PROCESSES = new Set(["winword", "soffice", "writer"]);

function looksLikeMarkdown(text) {
  const t = text.trim();
  if (t.length < 2) return false;
  if (/^```[\s\S]*```/m.test(t)) return true;
  if (/(^|\n)#{1,6}\s+\S/m.test(t)) return true;
  if (/(^|\n)([-*+]|\d+\.)\s+\S/m.test(t) && (/\*\*[^*]+\*\*/.test(t) || /\[[^\]]+\]\([^)]+\)/.test(t))) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(t) && /(^|\n)#{1,6}\s/m.test(t)) return true;
  return false;
}

function looksLikeCode(text) {
  const t = text.trim();
  if (t.length < 3) return false;
  const signals = [
    /\b(function|const|let|var|class|import|export|def|async|await|return)\b/,
    /=>/,
    /[{}`;]/,
    /^\s*\/\//m,
    /^\s*#/m,
    /\b(console\.|printf|println|System\.out)/,
  ];
  let score = 0;
  for (const re of signals) if (re.test(t)) score++;
  return score >= 2 || (/^\s*(import|from|def|class)\s/m.test(t));
}

function looksLikeError(text) {
  const t = text.trim();
  return /\b(error|exception|failed|traceback|panic|errno|warning)\b/i.test(t)
    || /:\d+:\d+/.test(t)
    || /^\s*at\s+\S+/m.test(t);
}

function titleHintsMarkdown(title) {
  return /\.(md|markdown)(\s|$|[-–—])/i.test(title) || /\bmarkdown\b/i.test(title);
}

function isBrowserContext({ processName, windowTitle }) {
  const proc = (processName || "").toLowerCase();
  if (BROWSER_PROCESSES.has(proc)) return true;
  return /\s[-–—]\s*(google chrome|microsoft edge|mozilla firefox|brave|opera|arc|vivaldi|safari)\s*$/i.test(windowTitle || "");
}

function detectSite(windowTitle) {
  const t = windowTitle || "";
  for (const rule of SITE_RULES) {
    if (rule.test(t)) return rule;
  }
  return null;
}

function inferAppKind({ processName, windowTitle }) {
  const proc = (processName || "").toLowerCase();
  const title = (windowTitle || "").toLowerCase();

  if (isBrowserContext({ processName, windowTitle })) return "browser";
  if (IDE_PROCESSES.has(proc)) return "ide";
  if (EMAIL_PROCESSES.has(proc)) return "email";
  if (CHAT_PROCESSES.has(proc)) return "chat";
  if (SPREADSHEET_PROCESSES.has(proc)) return "spreadsheet";
  if (WORD_PROCESSES.has(proc)) return "prose";
  if (proc === "notepad") return "prose";

  if (/\bvisual studio code\b/i.test(title) || title.endsWith(" - cursor")) return "ide";
  if (title.includes("outlook") || title.includes("gmail")) return "email";
  if (title.includes("slack") || title.includes("discord") || title.includes("teams")) return "chat";

  return "unknown";
}

function profileFromSite(site) {
  const base = PROFILES[site.id];
  if (!base) return null;
  return { ...base, label: site.label, source: site.label };
}

/**
 * @param {{ processName?: string, windowTitle?: string, windowClass?: string, selectedText?: string } | null | undefined} ctx
 */
export function inferRefineProfile(ctx, selectedText = "") {
  const text = String(selectedText || "");
  const title = ctx?.windowTitle || "";
  const appKind = inferAppKind(ctx || {});
  const site = appKind === "browser" ? detectSite(title) : null;

  // Content shape beats generic site — but not editable webmail compose.
  if (looksLikeMarkdown(text) || titleHintsMarkdown(title)) {
    if (site?.id === "notion") {
      return { ...PROFILES.notion, source: title || "Notion" };
    }
    return { ...PROFILES.markdown, source: title || ctx?.processName || "selection" };
  }
  if (looksLikeCode(text)) {
    return { ...PROFILES.code, source: title || ctx?.processName || "selection" };
  }

  // Browser: site-specific profiles first.
  if (appKind === "browser" && site) {
    const siteProfile = profileFromSite(site);
    if (siteProfile) {
      return { ...siteProfile, source: title || site.label };
    }
  }

  if (appKind === "browser") {
    return { ...PROFILES.browser, source: title || "Web page" };
  }

  if (appKind === "ide") {
    if (text.length > 0 && !looksLikeCode(text)) {
      return { ...PROFILES.prose, label: "Writing in editor", source: title || "Editor" };
    }
    return { ...PROFILES.code, source: title || "Editor" };
  }
  if (appKind === "email") {
    return { ...PROFILES.email, source: title || "Email" };
  }
  if (appKind === "chat") {
    return { ...PROFILES.chat, source: title || "Chat" };
  }
  if (appKind === "spreadsheet") {
    return { ...PROFILES.spreadsheet, source: title || "Spreadsheet" };
  }
  if (looksLikeError(text) && (appKind === "unknown" || ctx?.processName?.match(/terminal|cmd|powershell|pwsh|iterm|warp|kitty/))) {
    return { ...PROFILES.terminal, source: title || "Terminal" };
  }

  return { ...PROFILES.prose, source: title || ctx?.processName || "Writing" };
}

/**
 * @param {{ processName?: string, windowTitle?: string, windowClass?: string } | null | undefined} ctx
 * @param {string} selectedText
 * @returns {{ profile: ReturnType<typeof inferRefineProfile>, actions: RefineAction[] }}
 */
export function getRefineActions(ctx, selectedText = "") {
  const profile = inferRefineProfile(ctx, selectedText);
  const actions = profile.keys.map((k) => ACTIONS[k]).filter(Boolean);
  return { profile, actions: actions.length ? actions : PROFILES.prose.keys.map((k) => ACTIONS[k]) };
}

export { ACTIONS as REFINE_ACTIONS };
