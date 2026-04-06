/**
 * COCO 17-keypoint connectivity for MoveNet overlays.
 * Indices: nose 0, eyes 1-2, ears 3-4, shoulders 5-6, elbows 7-8, wrists 9-10,
 * hips 11-12, knees 13-14, ankles 15-16.
 */
export const COCO17_EDGES: ReadonlyArray<readonly [number, number]> = [
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
];

/** Core limbs for partial visibility (still draw if one joint is weak). */
const CORE_EDGE_SET = new Set<string>([
  "5-7",
  "6-8",
  "5-11",
  "6-12",
  "11-13",
  "12-14",
]);

const isCoreEdge = (a: number, b: number) => CORE_EDGE_SET.has(`${Math.min(a, b)}-${Math.max(a, b)}`);

/**
 * Line is drawn if both joints are strong, or if it's a core limb and at least one side is usable.
 */
export function shouldDrawEdge(
  scoreA: number | undefined,
  scoreB: number | undefined,
  i: number,
  j: number,
  conf: number,
  loose: number
): boolean {
  const sa = scoreA ?? 0;
  const sb = scoreB ?? 0;
  if (sa >= conf && sb >= conf) return true;
  if (isCoreEdge(i, j) && Math.max(sa, sb) >= conf && Math.min(sa, sb) >= loose) return true;
  return false;
}

export function playerHue(playerId: number): string {
  const hue = ((playerId - 1) * 67) % 360;
  return `hsl(${hue} 85% 58%)`;
}
