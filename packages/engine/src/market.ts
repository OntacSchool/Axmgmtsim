/**
 * 시장 — 분기별로 어떤 사업이 열리는지, 어떤 인재/인수 대상이 등장하는지.
 *
 * 데이터는 전부 외생(packages/data)이다. 나중에 나라장터 실데이터로 교체할 때
 * 이 파일은 바뀌지 않고 seed JSON 만 갈아끼우면 되도록 조회 로직만 담는다.
 */

import { comparePeriod } from './period.ts';
import type { AcquisitionTarget, Dataset, Deal, Product, Talent } from './types.ts';

/** 해당 분기에 공고가 열린 사업 */
export function dealsInPeriod(dataset: Dataset, period: string): Deal[] {
  return dataset.deals.filter((d) => d.period === period);
}

/** 해당 분기에 영입 가능한 인재 (이미 영입했거나 시도한 인재는 호출부에서 제외) */
export function talentsAvailable(dataset: Dataset, period: string): Talent[] {
  return dataset.talents.filter((t) => comparePeriod(t.availableFrom, period) <= 0);
}

export function targetsAvailable(dataset: Dataset, period: string): AcquisitionTarget[] {
  return dataset.targets.filter((t) => comparePeriod(t.availableFrom, period) <= 0);
}

export function productsAvailable(dataset: Dataset, period: string): Product[] {
  return dataset.products.filter((p) => comparePeriod(p.availableFrom, period) <= 0);
}

/** id → 엔티티 조회 맵. 리듀서가 매 턴 만들지 않도록 미리 만들어 넘긴다. */
export interface DatasetIndex {
  deals: Map<string, Deal>;
  talents: Map<string, Talent>;
  targets: Map<string, AcquisitionTarget>;
  products: Map<string, Product>;
}

export function indexDataset(dataset: Dataset): DatasetIndex {
  return {
    deals: new Map(dataset.deals.map((d) => [d.id, d])),
    talents: new Map(dataset.talents.map((t) => [t.id, t])),
    targets: new Map(dataset.targets.map((t) => [t.id, t])),
    products: new Map(dataset.products.map((p) => [p.id, p])),
  };
}
