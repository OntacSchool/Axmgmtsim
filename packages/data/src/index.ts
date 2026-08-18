/**
 * 시드 데이터 로더.
 *
 * 모든 데이터는 seed/*.json 에 있고, 여기서 zod 스키마로 검증한 뒤 엔진 타입으로 넘긴다.
 * 나중에 나라장터 실데이터 파이프라인을 붙이면 이 로더만 소스를 바꾸면 된다.
 */

import type { Dataset } from '@axsim/engine';
import { datasetSchema } from './schemas/index.ts';

import dealsJson from '../seed/deals.json' with { type: 'json' };
import talentsJson from '../seed/talents.json' with { type: 'json' };
import targetsJson from '../seed/targets.json' with { type: 'json' };
import productsJson from '../seed/products.json' with { type: 'json' };
import companiesJson from '../seed/companies.json' with { type: 'json' };
import configJson from '../seed/config.json' with { type: 'json' };

const raw = {
  deals: dealsJson,
  talents: talentsJson,
  targets: targetsJson,
  products: productsJson,
  profiles: companiesJson,
  config: configJson,
};

/** 검증 결과를 그대로 반환한다. 실패하면 사용처에서 메시지를 보여줄 수 있도록 throw 하지 않는다. */
export function parseDataset() {
  return datasetSchema.safeParse(raw);
}

/** 검증된 데이터셋. 스키마를 통과하지 못하면 즉시 실패한다. */
export function loadDataset(): Dataset {
  const result = parseDataset();
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`시드 데이터 검증 실패:\n${issues}`);
  }
  return result.data as unknown as Dataset;
}

export * from './schemas/index.ts';
