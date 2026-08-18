/**
 * 분기 문자열("2023Q1") 유틸리티.
 * 턴 인덱스와 분기 문자열 사이를 오간다.
 */

export interface ParsedPeriod {
  year: number;
  quarter: number;
}

export function parsePeriod(period: string): ParsedPeriod {
  const m = /^(\d{4})Q([1-4])$/.exec(period);
  if (!m) throw new Error(`잘못된 분기 형식: ${period} (예: 2023Q1)`);
  return { year: Number(m[1]), quarter: Number(m[2]) };
}

export function formatPeriod(year: number, quarter: number): string {
  return `${year}Q${quarter}`;
}

/** 분기를 n 만큼 진행시킨다. */
export function addQuarters(period: string, n: number): string {
  const { year, quarter } = parsePeriod(period);
  const total = year * 4 + (quarter - 1) + n;
  return formatPeriod(Math.floor(total / 4), (total % 4) + 1);
}

/** a 에서 b 까지의 분기 수 (b − a) */
export function diffQuarters(a: string, b: string): number {
  const pa = parsePeriod(a);
  const pb = parsePeriod(b);
  return (pb.year * 4 + pb.quarter) - (pa.year * 4 + pa.quarter);
}

export function comparePeriod(a: string, b: string): number {
  return diffQuarters(b, a);
}

/** start 부터 count 개의 연속 분기 */
export function periodRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addQuarters(start, i));
}
