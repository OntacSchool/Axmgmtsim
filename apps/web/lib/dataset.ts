/**
 * 데이터셋 로더 (브라우저/번들러용).
 *
 * @axsim/data 의 `loadDataset()` 은 Node ESM 의 `import ... with { type: 'json' }` 을
 * 쓰는데, 번들러 환경에서 항상 지원되는 문법이 아니다. 그래서 여기서는 JSON 을
 * 평범하게 import 하고 `loadDatasetFrom()` 으로 검증만 받는다 (계획 참조: 사전 확정 2).
 */

import { loadDatasetFrom } from '@axsim/data';
import type { Dataset } from '@axsim/engine';

import deals from '../../../packages/data/seed/deals.json';
import talents from '../../../packages/data/seed/talents.json';
import targets from '../../../packages/data/seed/targets.json';
import products from '../../../packages/data/seed/products.json';
import profiles from '../../../packages/data/seed/companies.json';
import config from '../../../packages/data/seed/config.json';

let cached: Dataset | null = null;

/** 모듈 스코프에서 1회만 검증한다. 페이지를 오갈 때마다 zod 검증을 반복하지 않는다. */
export function getDataset(): Dataset {
  if (!cached) {
    cached = loadDatasetFrom({ deals, talents, targets, products, profiles, config });
  }
  return cached;
}
