/**
 * 반사실 비교 결과의 해석 문장.
 *
 * CLI 의 apps/cli/src/compare.ts printVerdict() 와 같은 규칙이다 — 첫 변형("자체 성장")을
 * 기준선으로 삼아 나머지 변형과의 차이를 한 줄씩 말한다. 순수 텍스트 조립이라
 * 엔진에 넣지 않고 여기 둔다.
 */

import type { ComparisonReport } from '@axsim/engine';
import { eok, pct } from './format';

export function buildInterpretation(report: ComparisonReport): string[] {
  if (report.variants.length < 2) return [];
  const [a, ...rest] = report.variants;
  const lines: string[] = [];

  for (const b of rest) {
    const revGap = b.cumulativeRevenue.median - a.cumulativeRevenue.median;
    const riskGap = b.bankruptcyRate - a.bankruptcyRate;
    const parts: string[] = [`누적 매출 중앙값 ${revGap >= 0 ? '+' : ''}${eok(revGap, 0)}`];

    if (a.milestoneAchievedRate > 0 && b.milestoneAchievedRate > 0) {
      const q = a.quartersToMilestone.median - b.quartersToMilestone.median;
      if (Math.abs(q) >= 1) {
        parts.push(`목표 도달 ${q > 0 ? `${q.toFixed(0)}분기 단축` : `${(-q).toFixed(0)}분기 지연`}`);
      }
    } else if (b.milestoneAchievedRate > a.milestoneAchievedRate) {
      parts.push(`목표 달성율 +${pct(b.milestoneAchievedRate - a.milestoneAchievedRate)}`);
    }

    parts.push(`파산 확률 ${riskGap >= 0 ? '+' : ''}${pct(riskGap, 1)}`);
    lines.push(`"${b.label}" 은 "${a.label}" 대비 ${parts.join(', ')}`);
  }

  return lines;
}
