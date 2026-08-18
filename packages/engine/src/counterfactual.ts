/**
 * 반사실 분석 — "그때 다른 선택을 했다면?"
 *
 * 엔진이 순수 함수이고 난수가 (시드, 턴)에서만 파생되므로, 임의의 시점 상태를
 * 스냅샷 떠서 서로 다른 결정을 각각 여러 시드로 롤아웃할 수 있다. 기대값 하나가
 * 아니라 분포를 비교하는 것이 핵심이다 — 인수는 기대 매출도 높지만 파산 확률도 높다.
 */

import { indexDataset, type DatasetIndex } from './market.ts';
import { advanceTurn } from './reduce.ts';
import { rngForTurn } from './replay.ts';
import type { Strategy } from './strategies.ts';
import type { CompanyState, Dataset, Decision, Domain, TurnSummary } from './types.ts';

/** 달성 시점을 재고 싶은 목표. 기본값은 "공공 대형사업 자격이 열리는 실적 요건". */
export interface Milestone {
  label: string;
  domain: Domain;
  count: number;
  minAmountKRW: number;
}

/**
 * 기본 목표는 "대형 공공 AI 사업 입찰 자격".
 * 2020년대 중반 대형 공고(50억~80억)가 요구하는 유사실적 수준에 맞췄다.
 * 이 시점에 도달해야 비로소 가장 큰 사업에 들어갈 수 있으므로, 전략 간 차이가
 * 가장 선명하게 드러나는 지표다.
 */
export const DEFAULT_MILESTONE: Milestone = {
  label: '대형 공공 AI 사업 입찰자격 (AI 20억 이상 실적 3건)',
  domain: 'ai',
  count: 3,
  minAmountKRW: 2_000_000_000,
};

export interface RolloutMetrics {
  cumulativeRevenueKRW: number;
  finalCashKRW: number;
  finalHeadcount: number;
  trackRecordCount: number;
  bankrupt: boolean;
  /** 목표 달성까지 걸린 분기 수. 기간 내 미달성이면 null. */
  quartersToMilestone: number | null;
  peakQuarterlyRevenueKRW: number;
}

export interface RolloutResult {
  finalState: CompanyState;
  summaries: TurnSummary[];
  metrics: RolloutMetrics;
}

function milestoneMet(state: CompanyState, m: Milestone): boolean {
  return (
    state.trackRecords.filter((tr) => tr.domain === m.domain && tr.amountKRW >= m.minAmountKRW).length >= m.count
  );
}

export interface RolloutOptions {
  dataset: Dataset;
  index?: DatasetIndex;
  strategy: Strategy;
  seed: number;
  /** 진행할 분기 수 */
  horizon: number;
  /**
   * 첫 턴에 추가로 적용할 결정 (반사실 비교의 '선택지').
   * 전략의 평소 결정을 대체하지 않고 '덧붙인다' — 비교하려는 것은
   * "평소대로 하면서 이 수를 두느냐 마느냐" 이지, "이 수만 두느냐" 가 아니다.
   */
  firstTurnDecisions?: Decision[];
  milestone?: Milestone;
}

export function rollout(start: CompanyState, options: RolloutOptions): RolloutResult {
  const { dataset, strategy, seed, horizon } = options;
  const index = options.index ?? indexDataset(dataset);
  const milestone = options.milestone ?? DEFAULT_MILESTONE;

  let state = structuredClone(start);
  const summaries: TurnSummary[] = [];
  let cumulativeRevenueKRW = 0;
  let peakQuarterlyRevenueKRW = 0;
  let quartersToMilestone: number | null = milestoneMet(state, milestone) ? 0 : null;

  for (let i = 0; i < horizon; i++) {
    if (state.bankrupt) break;

    const rng = rngForTurn(seed, state.turn);
    const routine = strategy({ state, dataset, index, rng: rngForTurn(seed ^ 0x5bf03635, state.turn) });
    // 선택지는 맨 앞에 둔다. 인수·영입이 먼저 반영돼야 같은 턴의 입찰에 효과가 실린다.
    const decisions =
      i === 0 && options.firstTurnDecisions ? [...options.firstTurnDecisions, ...routine] : routine;

    const result = advanceTurn(state, decisions, { dataset, index }, rng);
    state = result.state;
    summaries.push(result.summary);
    cumulativeRevenueKRW += result.summary.revenueKRW;
    peakQuarterlyRevenueKRW = Math.max(peakQuarterlyRevenueKRW, result.summary.revenueKRW);

    if (quartersToMilestone === null && milestoneMet(state, milestone)) {
      quartersToMilestone = i + 1;
    }
  }

  return {
    finalState: state,
    summaries,
    metrics: {
      cumulativeRevenueKRW,
      finalCashKRW: state.cashKRW,
      finalHeadcount: Object.values(state.staff).reduce((a, b) => a + b, 0),
      trackRecordCount: state.trackRecords.length,
      bankrupt: state.bankrupt,
      quartersToMilestone,
      peakQuarterlyRevenueKRW,
    },
  };
}

// ── 분포 통계 ─────────────────────────────────────────────────

export interface Distribution {
  mean: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
}

export function describe(values: number[]): Distribution {
  if (values.length === 0) {
    return { mean: 0, median: 0, p10: 0, p90: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: at(0.5),
    p10: at(0.1),
    p90: at(0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

export interface VariantSpec {
  label: string;
  /** 이 시점에 내리는 선택. 이후 분기는 baseStrategy 를 따른다. */
  decisions: Decision[];
}

export interface VariantReport {
  label: string;
  runs: number;
  cumulativeRevenue: Distribution;
  finalCash: Distribution;
  trackRecords: Distribution;
  bankruptcyRate: number;
  /** 목표 달성 분기 (달성한 시뮬레이션만 집계) */
  quartersToMilestone: Distribution;
  milestoneAchievedRate: number;
}

export interface ComparisonReport {
  milestone: Milestone;
  horizon: number;
  seeds: number;
  variants: VariantReport[];
}

export interface CompareOptions {
  dataset: Dataset;
  strategy: Strategy;
  horizon: number;
  /** 몬테카를로 반복 수 */
  runs: number;
  /** 시드 생성 기준값 */
  baseSeed?: number;
  milestone?: Milestone;
}

/**
 * 같은 시작 상태에서 여러 선택지를 비교한다.
 * 모든 변형이 동일한 시드 집합을 쓰므로 운의 차이가 아니라 선택의 차이만 남는다.
 */
export function compareVariants(
  start: CompanyState,
  variants: VariantSpec[],
  options: CompareOptions,
): ComparisonReport {
  const index = indexDataset(options.dataset);
  const milestone = options.milestone ?? DEFAULT_MILESTONE;
  const baseSeed = options.baseSeed ?? 20260818;

  const reports: VariantReport[] = variants.map((variant) => {
    const metrics: RolloutMetrics[] = [];
    for (let i = 0; i < options.runs; i++) {
      const result = rollout(start, {
        dataset: options.dataset,
        index,
        strategy: options.strategy,
        seed: baseSeed + i * 7919,
        horizon: options.horizon,
        firstTurnDecisions: variant.decisions,
        milestone,
      });
      metrics.push(result.metrics);
    }

    const achieved = metrics.filter((m) => m.quartersToMilestone !== null);
    return {
      label: variant.label,
      runs: metrics.length,
      cumulativeRevenue: describe(metrics.map((m) => m.cumulativeRevenueKRW)),
      finalCash: describe(metrics.map((m) => m.finalCashKRW)),
      trackRecords: describe(metrics.map((m) => m.trackRecordCount)),
      bankruptcyRate: metrics.filter((m) => m.bankrupt).length / Math.max(1, metrics.length),
      quartersToMilestone: describe(achieved.map((m) => m.quartersToMilestone as number)),
      milestoneAchievedRate: achieved.length / Math.max(1, metrics.length),
    };
  });

  return { milestone, horizon: options.horizon, seeds: options.runs, variants: reports };
}
