/**
 * Map raw video keypoints to overlay pixels for a **cover**-scaled video element.
 * When the `<video>` uses `scale-x-[-1]`, the canvas stays unmirrored — flip X here so
 * skeleton and labels align with the mirrored picture; text is drawn normally (not mirrored).
 */

export function mapVideoToDisplay(
  x: number,
  y: number,
  vw: number,
  vh: number,
  cw: number,
  ch: number
): { x: number; y: number } {
  const scale = Math.max(cw / vw, ch / vh);
  const w = vw * scale;
  const h = vh * scale;
  const ox = (cw - w) / 2;
  const oy = (ch - h) / 2;
  return { x: x * scale + ox, y: y * scale + oy };
}

/** Map keypoint to overlay pixels aligned with CSS-mirrored video (flip X). */
export function mapVideoToMirroredOverlay(
  x: number,
  y: number,
  vw: number,
  vh: number,
  cw: number,
  ch: number
): { x: number; y: number } {
  const p = mapVideoToDisplay(x, y, vw, vh, cw, ch);
  return { x: cw - p.x, y: p.y };
}
