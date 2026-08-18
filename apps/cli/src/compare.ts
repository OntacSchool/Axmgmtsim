/**
 * `sim compare` — 반사실 분석.
 *
 * 특정 시점 상태에서 서로 다른 선택을 각각 N개 시드로 롤아웃하고 분포를 비교한다.
 * "인수 vs 자체성장" 같은 질문에 기대값과 리스크를 함께 답하는 것이 목적이다.
 */

import {
  DEFAULT_MILESTONE,
  compareVariants,
  createInitialState,
  getStrategy,
  indexDataset,
  rngForTurn,
  advanceTurn,
  type CompanyState,
  type ComparisonReport,
  type Dataset,
  type Decision,
} from '@axsim/engine';
import { HR, distLine, eok, pad, pct } from './format.ts';

export interface CompareOptions {
  dataset: Dataset;
  /** 시작 상태를 만들 프로필 */
  profileId: string;
  /** 비교 시점까지 봇으로 진행시킬 분기 수 */
  warmupTurns: number;
  /** warmup 에 쓸 전략 */
  warmupStrategy: string;
  /** 비교 이후 공통으로 적용할 전략 */
  baseStrategy: string;
  variants: { label: string; decisions: Decision[] }[];
  runs: number;
  horizon: number;
  seed: number;
}

/** 비교 시점의 상태를 만든다. 봇으로 warmupTurns 만큼 진행시킨 뒤 스냅샷을 뜬다. */
export function buildSnapshot(options: CompareOptions): CompanyState {
  const { dataset } = options;
  const profile = dataset.profiles.find((p) => p.id === options.profileId);
  if (!profile) throw new Error(`알 수 없는 프로필: ${options.profileId}`);

  const index = indexDataset(dataset);
  const strategy = getStrategy(options.warmupStrategy);
  let state = createInitialState(profile);

  for (let i = 0; i < options.warmupTurns; i++) {
    const rng = rngForTurn(options.seed, state.turn);
    const decisions = strategy({ state, dataset, index, rng: rngForTurn(options.seed ^ 0x5bf03635, state.turn) });
    state = advanceTurn(state, decisions, { dataset, index }, rng).state;
  }
  return state;
}

export function runCompare(start: CompanyState, options: CompareOptions): ComparisonReport {
  return compareVariants(start, options.variants, {
    dataset: options.dataset,
    strategy: getStrategy(options.baseStrategy),
    horizon: options.horizon,
    runs: options.runs,
    baseSeed: options.seed,
    milestone: DEFAULT_MILESTONE,
  });
}

export function printCompare(report: ComparisonReport, start: CompanyState): void {
  console.log(`\n▸ 반사실 분석 — ${start.period} 시점 · 이후 ${report.horizon}분기 · 변형당 ${report.seeds}판`);
  console.log(`  현재: 현금 ${eok(start.cashKRW)} · 인원 ${Object.values(start.staff).reduce((a, b) => a + b, 0)}명 · 실적 ${start.trackRecords.length}건`);
  console.log(`  목표: ${report.milestone.label}\n`);

  for (const v of report.variants) {
    console.log(HR);
    console.log(`■ ${v.label}`);
    console.log(`  ${distLine('누적 매출', v.cumulativeRevenue, 'eok')}`);
    console.log(`  ${distLine('최종 현금', v.finalCash, 'eok')}`);
    console.log(`  ${distLine('실적 건수', v.trackRecords, 'raw')}`);
    console.log(`  ${pad('파산 확률', 18)} ${pct(v.bankruptcyRate, 1)}`);
    console.log(
      `  ${pad('목표 달성', 18)} ${pct(v.milestoneAchievedRate, 1)}` +
        (v.milestoneAchievedRate > 0 ? `   중앙 ${v.quartersToMilestone.median.toFixed(0)}분기 (P10 ${v.quartersToMilestone.p10.toFixed(0)} / P90 ${v.quartersToMilestone.p90.toFixed(0)})` : ''),
    );
  }
  console.log(HR);

  printVerdict(report);
}

/** 경영자에게 줄 한 줄 결론. 이 도구의 존재 이유다. */
function printVerdict(report: ComparisonReport): void {
  if (report.variants.length < 2) return;
  const [a, ...rest] = report.variants;
  console.log('\n▸ 해석');

  for (const b of rest) {
    const revGap = b.cumulativeRevenue.median - a.cumulativeRevenue.median;
    const riskGap = b.bankruptcyRate - a.bankruptcyRate;

    const parts: string[] = [];
    parts.push(`누적 매출 중앙값 ${revGap >= 0 ? '+' : ''}${eok(revGap, 0)}`);

    if (a.milestoneAchievedRate > 0 && b.milestoneAchievedRate > 0) {
      const q = a.quartersToMilestone.median - b.quartersToMilestone.median;
      if (Math.abs(q) >= 1) {
        parts.push(`목표 도달 ${q > 0 ? `${q.toFixed(0)}분기 단축` : `${(-q).toFixed(0)}분기 지연`}`);
      }
    } else if (b.milestoneAchievedRate > a.milestoneAchievedRate) {
      parts.push(`목표 달성율 +${pct(b.milestoneAchievedRate - a.milestoneAchievedRate)}`);
    }

    parts.push(`파산 확률 ${riskGap >= 0 ? '+' : ''}${pct(riskGap, 1)}`);
    console.log(`  · "${b.label}" 은 "${a.label}" 대비 ${parts.join(', ')}`);
  }
}
