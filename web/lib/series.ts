/**
 * Drops the empty stretch at the start of a time series so charts begin where coverage
 * begins, keeping `pad` empty points of lead-in and at least `minLen` points overall.
 */
export function trimLeadingEmpty<T>(
  rows: T[],
  isEmpty: (row: T) => boolean,
  minLen: number,
  pad = 0,
): T[] {
  const first = rows.findIndex((r) => !isEmpty(r));
  if (first === -1) return rows.slice(-minLen);
  let start = Math.max(0, first - pad);
  if (rows.length - start < minLen) start = Math.max(0, rows.length - minLen);
  return rows.slice(start);
}
