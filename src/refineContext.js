import {
  IconCheck, IconWand, IconZap, IconCondense, IconShuffle, IconBulb, IconAlignLines,
} from "./Icons.jsx";

/** @typedef {{ key: string, label: string, icon: import('react').ComponentType, instruction: string }} RefineAction */

/** Fixed writing actions — no site or content detection. Custom prompts via the search box. */
const BASIC_ACTIONS = [
  {
    key: "fix", label: "Fix grammar", icon: IconCheck,
    instruction: "Fix all spelling and grammar mistakes.",
  },
  {
    key: "improve", label: "Improve writing", icon: IconWand,
    instruction: "Improve for clarity and flow while keeping the original meaning and tone.",
  },
  {
    key: "punchier", label: "Make it punchier", icon: IconZap,
    instruction: "Make punchier and more direct while keeping the same meaning.",
  },
  {
    key: "condense", label: "Condense", icon: IconCondense,
    instruction: "Condense significantly while preserving the core meaning.",
  },
  {
    key: "rephrase", label: "Rephrase", icon: IconShuffle,
    instruction: "Rephrase with different wording and sentence structure, same meaning and tone.",
  },
  {
    key: "expand", label: "Expand & elaborate", icon: IconBulb,
    instruction: "Expand with relevant detail while keeping the original voice.",
  },
  {
    key: "structure", label: "Improve structure", icon: IconAlignLines,
    instruction: "Improve structure, formatting, and spacing without changing the meaning.",
  },
];

/** @returns {{ actions: RefineAction[] }} */
export function getRefineActions() {
  return { actions: BASIC_ACTIONS };
}

export { BASIC_ACTIONS as REFINE_ACTIONS };
