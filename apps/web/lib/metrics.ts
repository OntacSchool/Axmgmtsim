/**
 * 대시보드용 파생 지표.
 *
 * 엔진(state.trackRecords)은 도메인마다 하나씩 실적을 쪼개 넣는다(fit 계산에서
 * 도메인별 매칭을 하기 위해서다) — 같은 사업이 도메인 2개짜리면 레코드가 2개
 * 생기고 amountKRW 도 각각 전액이 들어간다. 그래서 세그먼트별 합산 전에
 * dealId 로 먼저 중복을 제거해야 한다. 이 로직은 화면 전용이라 엔진에 넣지 않았다.
 */

import { SEGMENTS, type CompanyState, type Segment } from '@axsim/engine';

export function segmentTotals(state: CompanyState): Record<Segment, number> {
  const totals: Record<Segment, number> = { public: 0, enterprise: 0, global: 0, smb: 0 };

  const seenDealIds = new Set<string>();
  for (const tr of state.trackRecords) {
    if (seenDealIds.has(tr.dealId)) continue;
    seenDealIds.add(tr.dealId);
    totals[tr.segment] += tr.amountKRW;
  }
  for (const p of state.projects) {
    if (seenDealIds.has(p.dealId)) continue;
    seenDealIds.add(p.dealId);
    totals[p.segment] += p.contractKRW;
  }
  return totals;
}

export function segmentTotalsArray(state: CompanyState): { segment: Segment; totalKRW: number }[] {
  const totals = segmentTotals(state);
  return SEGMENTS.map((segment) => ({ segment, totalKRW: totals[segment] }));
}
