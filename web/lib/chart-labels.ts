/**
 * Label placement for dashed chart markers. Text width is estimated from a per-character
 * width, so this stays a pure function that runs the same on the server and in tests.
 */

export interface MarkerLabelInput {
  /** Marker position in chart coordinates. */
  x: number;
  text: string;
}

export interface PlacedMarkerLabel {
  x: number;
  text: string;
  /** `start`: text runs right of the marker; `end`: it ends at the marker. */
  anchor: 'start' | 'end';
  row: number;
}

export interface MarkerLabelOptions {
  /** Leftmost and rightmost x a label may reach (margins included). */
  minX: number;
  maxX: number;
  /** Estimated width of one character. */
  charW: number;
  /** Space between the marker line and its text. */
  pad: number;
  /** Minimum space between two labels on the same row. */
  gap: number;
  maxRows: number;
}

function cut(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars < 2) return '';
  const base = text.endsWith('…') ? text.slice(0, -1) : text;
  return `${base.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * A label goes right of its marker when it fits, otherwise left of it, otherwise on the
 * roomier side cut with an ellipsis, so no label ever leaves the chart. Labels are stacked into
 * rows so that neighbours on one row never overlap; past `maxRows` they share the last row.
 */
export function placeMarkerLabels(
  markers: MarkerLabelInput[],
  { minX, maxX, charW, pad, gap, maxRows }: MarkerLabelOptions,
): PlacedMarkerLabel[] {
  const rows: Array<Array<[number, number]>> = [];

  return markers.map(({ x, text }) => {
    const right = maxX - x - pad;
    const left = x - pad - minX;
    const width = text.length * charW;

    let anchor: 'start' | 'end';
    let label = text;
    if (width <= right) anchor = 'start';
    else if (width <= left) anchor = 'end';
    else {
      anchor = right >= left ? 'start' : 'end';
      label = cut(text, Math.floor(Math.max(right, left) / charW));
    }

    const w = pad + label.length * charW;
    const span: [number, number] = anchor === 'start' ? [x, x + w] : [x - w, x];
    let row = rows.findIndex((taken) =>
      taken.every(([a, b]) => span[1] + gap <= a || span[0] - gap >= b),
    );
    if (row === -1) row = Math.min(rows.length, maxRows - 1);
    (rows[row] ??= []).push(span);

    return { x, text: label, anchor, row };
  });
}
