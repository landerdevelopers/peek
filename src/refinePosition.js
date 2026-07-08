/**
 * Position Refine UI (pill + popup) near a selection anchor with viewport clamping.
 * @param {{ x: number, y: number }} anchor — overlay CSS px (mouseup / cursor)
 * @param {{ width: number, height: number }} size — element to place
 * @param {{ vw?: number, vh?: number, gap?: number, margin?: number, preferBelow?: boolean }} [opts]
 */
export function anchorRefineUi(anchor, size, opts = {}) {
  const {
    vw = window.innerWidth,
    vh = window.innerHeight,
    gap = 12,
    margin = 8,
    preferBelow = true,
  } = opts;

  const { width, height } = size;
  let left = anchor.x - width / 2;
  let top = preferBelow ? anchor.y + gap : anchor.y - height - gap;

  const roomBelow = vh - margin - (anchor.y + gap);
  const roomAbove = anchor.y - gap - margin;
  if (preferBelow && top + height > vh - margin && roomAbove > roomBelow) {
    top = anchor.y - height - gap;
  } else if (!preferBelow && top < margin && roomBelow >= roomAbove) {
    top = anchor.y + gap;
  }

  top = Math.min(Math.max(top, margin), Math.max(margin, vh - height - margin));
  left = Math.min(Math.max(left, margin), Math.max(margin, vw - width - margin));

  return { left, top };
}

/** @type {Record<string, { width: number, height: number }>} */
export const REFINE_UI_SIZES = {
  pill: { width: 92, height: 34 },
  palette: { width: 420, height: 380 },
  loading: { width: 420, height: 560 },
  answer: { width: 420, height: 560 },
  chat: { width: 420, height: 600 },
};

export function anchorRefinePopup(anchor, view, opts = {}) {
  const size = REFINE_UI_SIZES[view] || REFINE_UI_SIZES.palette;
  return anchorRefineUi(anchor, size, { gap: 10, ...opts });
}

/**
 * Anchors the refine card to the SELECTION EDGE rather than centering a
 * fixed-height box. It drops just below the selection when there's room, else
 * rises from just above it (bottom-anchored, so the card's near edge hugs the
 * selection no matter how tall the content is — no big gap when the answer is
 * short). The below/above choice depends only on the selection position, not
 * the current view, so palette → answer → chat stay pinned to the same edge.
 * Returns { pos, maxHeight } where pos carries either `top` or `bottom`.
 */
export function anchorRefineCard(anchor, { width = 420, gap = 10, margin = 10, minBelow = 220 } = {}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = Math.min(width, vw - margin * 2);
  const left = Math.min(Math.max(anchor.x - W / 2, margin), Math.max(margin, vw - W - margin));
  const roomBelow = vh - (anchor.y + gap) - margin;
  const roomAbove = (anchor.y - gap) - margin;
  const cap = vh * 0.72;
  if (roomBelow >= minBelow || roomBelow >= roomAbove) {
    return { pos: { left, top: Math.max(margin, anchor.y + gap) }, maxHeight: Math.min(cap, Math.max(140, roomBelow)) };
  }
  return { pos: { left, bottom: Math.max(margin, vh - (anchor.y - gap)) }, maxHeight: Math.min(cap, Math.max(140, roomAbove)) };
}
