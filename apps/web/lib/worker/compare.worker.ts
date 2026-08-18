/**
 * 반사실 비교를 메인 스레드 밖에서 계산하는 Worker.
 *
 * `compareVariants()` 는 변형 전체를 한 번에 계산해 진행률을 낼 지점이 없다. 그렇다고
 * 엔진에 진행률 콜백을 추가하지는 않는다 — 변형(variant)들은 서로 완전히 독립적이라
 * (baseSeed 는 변형 배열의 위치가 아니라 runs·baseSeed 에서만 파생된다), 변형마다
 * compareVariants() 를 한 번씩 따로 불러 이어붙여도 한 번에 부른 것과 결과가 완전히
 * 같다. 그 성질을 이용해 여기서 반복 호출로 진행률만 끼워넣는다.
 */

import { DEFAULT_MILESTONE, compareVariants, getStrategy } from '@axsim/engine';
import type { CompanyState, ComparisonReport, Decision, VariantReport } from '@axsim/engine';
import { getDataset } from '../dataset';

export interface CompareWorkerRequest {
  type: 'run';
  snapshot: CompanyState;
  variants: { label: string; decisions: Decision[] }[];
  strategyKey: string;
  horizon: number;
  runs: number;
  seed: number;
}

export type CompareWorkerResponse =
  | { type: 'progress'; completed: number; total: number; label: string }
  | { type: 'done'; report: ComparisonReport }
  | { type: 'error'; message: string };

self.onmessage = (event: MessageEvent<CompareWorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== 'run') return;

  try {
    const dataset = getDataset();
    const strategy = getStrategy(msg.strategyKey);
    const variantReports: VariantReport[] = [];

    for (const variant of msg.variants) {
      const single = compareVariants(msg.snapshot, [variant], {
        dataset,
        strategy,
        horizon: msg.horizon,
        runs: msg.runs,
        baseSeed: msg.seed,
        milestone: DEFAULT_MILESTONE,
      });
      variantReports.push(single.variants[0]);

      const progress: CompareWorkerResponse = {
        type: 'progress',
        completed: variantReports.length,
        total: msg.variants.length,
        label: variant.label,
      };
      self.postMessage(progress);
    }

    const report: ComparisonReport = {
      milestone: DEFAULT_MILESTONE,
      horizon: msg.horizon,
      seeds: msg.runs,
      variants: variantReports,
    };
    const done: CompareWorkerResponse = { type: 'done', report };
    self.postMessage(done);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fail: CompareWorkerResponse = { type: 'error', message };
    self.postMessage(fail);
  }
};
