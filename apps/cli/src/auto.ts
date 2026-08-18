/**
 * `sim auto` — 전략 봇으로 여러 판을 돌려 밸런싱을 확인한다.
 *
 * 밸런싱 기준(README 5장)이 실제로 성립하는지 여기서 검증한다.
 * 특히 "지배 전략이 없을 것" 은 이 명령의 출력으로만 확인할 수 있다.
 */

import {
  DEFAULT_MILESTONE,
  STRATEGY_PRESETS,
  createInitialState,
  describe,
  getStrategy,
  indexDataset,
  rollout,
  type Dataset,
  type RolloutMetrics,
} from '@axsim/engine';
import { HR, distLine, eok, pad, padStart, pct, table } from './format.ts';

export interface AutoOptions {
  dataset: Dataset;
  profileId: string;
  strategies: string[];
  runs: number;
  baseSeed: number;
  csv?: string;
}

interface StrategyStats {
  key: string;
  name: string;
  metrics: RolloutMetrics[];
}

export function runAuto(options: AutoOptions): StrategyStats[] {
  const { dataset } = options;
  const profile = dataset.profiles.find((p) => p.id === options.profileId);
  if (!profile) throw new Error(`알 수 없는 프로필: ${options.profileId}`);

  const index = indexDataset(dataset);
  const start = createInitialState(profile);
  const results: StrategyStats[] = [];

  for (const key of options.strategies) {
    const strategy = getStrategy(key);
    const metrics: RolloutMetrics[] = [];
    for (let i = 0; i < options.runs; i++) {
      const r = rollout(start, {
        dataset,
        index,
        strategy,
        seed: options.baseSeed + i * 7919,
        horizon: dataset.config.totalTurns,
        milestone: DEFAULT_MILESTONE,
      });
      metrics.push(r.metrics);
    }
    results.push({ key, name: STRATEGY_PRESETS[key].name, metrics });
  }

  return results;
}

export function printAuto(results: StrategyStats[], profileName: string, runs: number): void {
  console.log(`\n▸ 전략 배치 시뮬레이션 — ${profileName} · 전략당 ${runs}판 · 28분기\n`);

  const rows: string[][] = [
    ['전략', '누적매출(중앙)', '최종현금(중앙)', '실적건수', '파산율', '목표달성율', '목표도달(중앙)'],
  ];

  for (const r of results) {
    const rev = describe(r.metrics.map((m) => m.cumulativeRevenueKRW));
    const cash = describe(r.metrics.map((m) => m.finalCashKRW));
    const tr = describe(r.metrics.map((m) => m.trackRecordCount));
    const bankrupt = r.metrics.filter((m) => m.bankrupt).length / r.metrics.length;
    const achieved = r.metrics.filter((m) => m.quartersToMilestone !== null);
    const ms = describe(achieved.map((m) => m.quartersToMilestone as number));

    rows.push([
      `${r.name} (${r.key})`,
      eok(rev.median, 0),
      eok(cash.median, 0),
      tr.median.toFixed(0),
      pct(bankrupt),
      pct(achieved.length / r.metrics.length),
      achieved.length > 0 ? `${ms.median.toFixed(0)}분기` : '—',
    ]);
  }

  console.log(table(rows, ['l', 'r', 'r', 'r', 'r', 'r', 'r']));
  console.log(`\n  목표: ${DEFAULT_MILESTONE.label}`);

  printBalanceChecks(results);
}

/** README 5장의 밸런싱 기준을 자동 판정한다. */
export function printBalanceChecks(results: StrategyStats[]): void {
  console.log(`\n${HR}\n▸ 밸런싱 기준 판정\n`);

  const byRevenue = [...results].sort(
    (a, b) =>
      describe(b.metrics.map((m) => m.cumulativeRevenueKRW)).median -
      describe(a.metrics.map((m) => m.cumulativeRevenueKRW)).median,
  );
  const top = byRevenue[0];
  const bottom = byRevenue[byRevenue.length - 1];
  const topRev = describe(top.metrics.map((m) => m.cumulativeRevenueKRW)).median;
  const bottomRev = describe(bottom.metrics.map((m) => m.cumulativeRevenueKRW)).median;
  const spread = bottomRev > 0 ? topRev / bottomRev : Infinity;

  // 최고 전략과 최저 전략의 격차로 본다. 상위 두 전략만 비교하면 둘 다 같은
  // 지배 전략일 때(예: 어느 쪽이든 인수를 하는 경우) 문제를 놓친다.
  check(
    '지배 전략 부재',
    spread < 2.5,
    `1위 ${top.name} ${eok(topRev, 0)} / 최하위 ${bottom.name} ${eok(bottomRev, 0)} — 격차 ${spread.toFixed(2)}배 (2.5배 미만이면 통과)`,
  );

  const bankruptcies = results.map((r) => r.metrics.filter((m) => m.bankrupt).length / r.metrics.length);
  const minB = Math.min(...bankruptcies);
  const maxB = Math.max(...bankruptcies);
  check(
    '파산 위험 존재',
    maxB >= 0.03 && minB <= 0.45,
    `파산율 범위 ${pct(minB)} ~ ${pct(maxB)} (최대 3% 이상, 최소 45% 이하면 통과)`,
  );

  // M&A 는 "매출 상위 + 실제 파산 위험 존재" 여야 한다.
  // 인수와 자체성장의 위험 차이를 정확히 재려면 같은 상태에서 갈라 봐야 하므로,
  // 그 비교는 `sim compare` 가 맡는다. 여기서는 배치 수준의 최소 조건만 본다.
  const mna = results.find((r) => r.key === 'mna-first');
  if (mna) {
    const rank = byRevenue.findIndex((r) => r.key === 'mna-first') + 1;
    const mnaBankrupt = mna.metrics.filter((m) => m.bankrupt).length / mna.metrics.length;
    check(
      'M&A 는 양날의 검',
      rank <= 2 && mnaBankrupt >= 0.03,
      `매출 ${rank}위 · 파산율 ${pct(mnaBankrupt)} (상위 2위 이내 + 파산율 3% 이상이면 통과)`,
    );
  }

  const pub = results.find((r) => r.key === 'public-focus');
  if (pub) {
    const rate = pub.metrics.filter((m) => m.quartersToMilestone !== null).length / pub.metrics.length;
    check('공공 플라이휠 작동', rate >= 0.5, `공공 집중 전략의 실적요건 달성율 ${pct(rate)} (50% 이상이면 통과)`);
  }
}

function check(label: string, passed: boolean, detail: string): void {
  console.log(`  ${passed ? '✔' : '✖'} ${pad(label, 20)} ${detail}`);
}

export function toCsv(results: StrategyStats[]): string {
  const lines = ['strategy,run,cumulative_revenue,final_cash,headcount,track_records,bankrupt,quarters_to_milestone'];
  for (const r of results) {
    r.metrics.forEach((m, i) => {
      lines.push(
        [
          r.key,
          i,
          Math.round(m.cumulativeRevenueKRW),
          Math.round(m.finalCashKRW),
          m.finalHeadcount,
          m.trackRecordCount,
          m.bankrupt ? 1 : 0,
          m.quartersToMilestone ?? '',
        ].join(','),
      );
    });
  }
  return lines.join('\n');
}

export { distLine, padStart };
