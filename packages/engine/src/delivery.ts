/**
 * 사업 수행 — 매출 인식, 품질, 실적 축적.
 *
 * 이 모듈이 게임의 플라이휠을 만든다:
 *   수주 → 수행 완료 → 트랙레코드 + 관계자본 + 역량 학습 → 다음 입찰의 fit 상승
 * 역방향도 같이 구현한다: 과다 수주 → 품질 저하 → 관계자본 하락 + 기술부채 누적.
 */

import { utilization } from './capacity.ts';
import type { Rng } from './rng.ts';
import type {
  ActiveProject,
  CompanyState,
  SimConfig,
  SimEvent,
  TrackRecord,
} from './types.ts';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 이번 분기의 수행 품질 0~1.
 * 가동률이 1을 넘는 순간부터 급격히 나빠지도록 페널티를 비선형으로 준다.
 */
export function quarterQuality(
  state: CompanyState,
  project: ActiveProject,
  deliveryBonus: number,
  rng: Rng,
): number {
  const util = utilization(state);
  const overload = Math.max(0, util - 0.85);
  const overloadPenalty = overload * overload * 1.6;

  const domainCapability =
    project.domain.reduce((s, d) => s + state.capability[d], 0) / Math.max(1, project.domain.length) / 100;

  // 인수 통합 기간 중에는 조직이 흔들려 품질이 떨어진다.
  const integrating = state.acquisitions.some((a) => a.integrationLeft > 0);
  const pmiPenalty = integrating ? 0.08 : 0;

  const base =
    0.35 +
    domainCapability * 0.45 +
    state.morale / 500 +
    deliveryBonus -
    state.techDebt / 300 -
    overloadPenalty -
    pmiPenalty;

  // 약간의 운. 통제 불가능한 현장 변수를 표현한다.
  return clamp(base + rng.normal(0, 0.05), 0, 1);
}

export interface DeliveryResult {
  /** 이번 분기에 인식된 사업 매출 */
  revenueKRW: number;
  /** 아직 남은 프로젝트 */
  ongoing: ActiveProject[];
  /** 이번 분기에 완료된 프로젝트 */
  completed: ActiveProject[];
  /** 완료로 새로 쌓인 실적 */
  newTrackRecords: TrackRecord[];
  events: SimEvent[];
  /** 완료에 따른 관계자본 변화 */
  relationDeltas: Record<string, number>;
  /** 완료에 따른 역량 학습 */
  capabilityDeltas: Partial<Record<string, number>>;
  techDebtDelta: number;
  brandDelta: number;
}

export function progressProjects(
  state: CompanyState,
  deliveryBonus: number,
  _config: SimConfig,
  rng: Rng,
): DeliveryResult {
  const ongoing: ActiveProject[] = [];
  const completed: ActiveProject[] = [];
  const newTrackRecords: TrackRecord[] = [];
  const events: SimEvent[] = [];
  const relationDeltas: Record<string, number> = {};
  const capabilityDeltas: Record<string, number> = {};
  let revenueKRW = 0;
  let techDebtDelta = 0;
  let brandDelta = 0;

  for (const project of state.projects) {
    const quality = quarterQuality(state, project, deliveryBonus, rng);
    revenueKRW += project.contractKRW / project.totalQuarters;

    const next: ActiveProject = {
      ...project,
      quartersLeft: project.quartersLeft - 1,
      qualityAcc: project.qualityAcc + quality,
      quartersWorked: project.quartersWorked + 1,
    };

    // 품질이 나쁜 분기는 기술부채로 남는다.
    if (quality < 0.5) techDebtDelta += (0.5 - quality) * 6;

    if (next.quartersLeft > 0) {
      ongoing.push(next);
      continue;
    }

    const avgQuality = next.qualityAcc / Math.max(1, next.quartersWorked);
    completed.push(next);

    // 실적 축적 — 다음 입찰의 '실적' 배점을 직접 끌어올린다.
    for (const domain of next.domain) {
      newTrackRecords.push({
        dealId: next.dealId,
        domain,
        segment: next.segment,
        amountKRW: next.contractKRW,
        agency: next.agency,
        quality: avgQuality,
        completedPeriod: state.period,
      });
    }

    // 관계자본: 잘 하면 오르고 못 하면 떨어진다. 공공에서 이게 다음 사업을 부른다.
    relationDeltas[next.agency] = (relationDeltas[next.agency] ?? 0) + (avgQuality - 0.55) * 30;

    // 수행하면서 배운다. 큰 사업일수록 학습 효과가 크다.
    const scale = Math.min(1.5, next.contractKRW / 2_000_000_000);
    for (const domain of next.domain) {
      capabilityDeltas[domain] = (capabilityDeltas[domain] ?? 0) + avgQuality * 2.5 * scale;
    }

    brandDelta += (avgQuality - 0.5) * 3 * scale;

    events.push({
      kind: 'project.completed',
      period: state.period,
      message: `사업 완료: ${next.title} (${next.agency}) — 품질 ${(avgQuality * 100).toFixed(0)}점`,
      data: { dealId: next.dealId, quality: avgQuality, contractKRW: next.contractKRW },
    });
  }

  return {
    revenueKRW,
    ongoing,
    completed,
    newTrackRecords,
    events,
    relationDeltas,
    capabilityDeltas,
    techDebtDelta,
    brandDelta,
  };
}
