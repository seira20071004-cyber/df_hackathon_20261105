import type { StairRange } from './model.ts';

// Only draw a range whose floor numbers are explicitly stated in the manual.
export function stairRange(text: string): StairRange | undefined {
  const normalized = text.normalize('NFKC');
  if (!/階段/.test(normalized) || /地下|B\s*\d|除外|を除|対象外|含めない|含めません|清掃しない|清掃しません/i.test(normalized)) return;
  const ranges = [...normalized.matchAll(/(\d{1,2})階?\s*(?:から|〜|～|~|－|-|–)\s*(\d{1,2})階/g)];
  const unique = new Set(ranges.map(match => match[1] + '-' + match[2]));
  if (unique.size !== 1) return;
  const fromFloor = Number(ranges[0][1]);
  const toFloor = Number(ranges[0][2]);
  if (fromFloor < 1 || toFloor <= fromFloor || toFloor - fromFloor > 5) return;
  return {kind:'stair-range', fromFloor, toFloor, includeLandings:/踊り場/.test(normalized)};
}
