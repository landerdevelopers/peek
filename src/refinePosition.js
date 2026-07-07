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
