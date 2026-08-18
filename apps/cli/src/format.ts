/** 콘솔 출력 포맷 헬퍼 */

import type { Distribution } from '@axsim/engine';

/** 원 단위를 억 단위 문자열로 */
export function eok(krw: number, digits = 1): string {
  return `${(krw / 1e8).toFixed(digits)}억`;
}

export function pct(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function pad(text: string, width: number): string {
  // 한글은 폭이 2이므로 실제 표시 폭으로 계산한다.
  const w = displayWidth(text);
  return w >= width ? text : text + ' '.repeat(width - w);
}

export function padStart(text: string, width: number): string {
  const w = displayWidth(text);
  return w >= width ? text : ' '.repeat(width - w) + text;
}

export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // 한글·CJK·전각 문자는 폭 2
    w += (code >= 0x1100 && code <= 0x115f) ||
         (code >= 0x2e80 && code <= 0xa4cf) ||
         (code >= 0xac00 && code <= 0xd7a3) ||
         (code >= 0xf900 && code <= 0xfaff) ||
         (code >= 0xfe30 && code <= 0xfe6f) ||
         (code >= 0xff00 && code <= 0xff60) ||
         (code >= 0xffe0 && code <= 0xffe6)
      ? 2
      : 1;
  }
  return w;
}

export function truncate(text: string, width: number): string {
  if (displayWidth(text) <= width) return text;
  let out = '';
  for (const ch of text) {
    if (displayWidth(out + ch) > width - 1) break;
    out += ch;
  }
  return out + '…';
}

export function table(rows: string[][], align: ('l' | 'r')[] = []): string {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => displayWidth(r[col] ?? ''))));
  return rows
    .map((row) =>
      row
        .map((cell, i) => (align[i] === 'r' ? padStart(cell, widths[i]) : pad(cell, widths[i])))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

export function distLine(label: string, d: Distribution, unit: 'eok' | 'raw', width = 18): string {
  const f = (v: number) => (unit === 'eok' ? eok(v) : v.toFixed(1));
  return `${pad(label, width)} 중앙 ${padStart(f(d.median), 9)}   평균 ${padStart(f(d.mean), 9)}   P10 ${padStart(f(d.p10), 9)}   P90 ${padStart(f(d.p90), 9)}`;
}

export const HR = '─'.repeat(78);
