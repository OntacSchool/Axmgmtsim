/**
 * 입찰 판정.
 *
 * 기술점수와 가격점수를 배점대로 합산해 경쟁사 최고점과 겨룬다.
 * 경쟁사 점수는 시드 PRNG 로 샘플링하므로 같은 시드에서는 항상 같은 결과가 나온다.
 */

import { CONSORTIUM_SHARE, computeFit, type FitOptions } from './fit.ts';
import type { Rng } from './rng.ts';
import type { BidOutcome, CompanyState, Deal, Product, SimConfig } from './types.ts';

/**
 * 가격점수. 할인율이 클수록 점수가 높지만 그만큼 계약금액이 깎인다.
 * 공공 적격심사의 가격점수 곡선처럼 상한에 가까울수록 체감하도록 완만한 곡선을 쓴다.
 */
export function priceScore(discountRate: number, maxDiscountRate: number): number {
  const r = Math.min(Math.max(discountRate, 0), maxDiscountRate);
  const normalized = maxDiscountRate <= 0 ? 0 : r / maxDiscountRate;
  return 100 * Math.pow(normalized, 0.7);
}

/** 경쟁사 1곳의 종합점수를 샘플링한다. */
function sampleCompetitor(deal: Deal, rng: Rng): number {
  // 경쟁 강도가 높을수록 기술점수 기대값이 올라간다.
  // 이 계수가 게임의 난이도 손잡이다 — 낮추면 거의 다 이겨서 현금 압박이 사라진다.
  const techMean = 55 + deal.competition.strength * 33;
  const tech = Math.min(100, Math.max(0, rng.normal(techMean, 9)));
  // 예산이 큰 사업일수록 경쟁사도 공격적으로 가격을 쓴다.
  const priceMean = 45 + deal.competition.strength * 35;
  const price = Math.min(100, Math.max(0, rng.normal(priceMean, 14)));
  return (tech * deal.scoring.tech + price * deal.scoring.price) / 100;
}

export interface BidInput {
  deal: Deal;
  discountRate: number;
  consortium: boolean;
}

export function resolveBid(
  state: CompanyState,
  input: BidInput,
  config: SimConfig,
  rng: Rng,
  fitOptions: Omit<FitOptions, 'consortium'> & { launchedProducts?: Product[] },
): BidOutcome {
  const { deal, consortium } = input;
  const discountRate = Math.min(Math.max(input.discountRate, 0), config.maxDiscountRate);

  const fit = computeFit(state, deal, { ...fitOptions, consortium });
  const proposalCostKRW = Math.round(deal.budgetKRW * config.proposalCostRate);

  // 계약금액: 할인분을 뺀 뒤 컨소시엄 지분을 넘긴다.
  const gross = deal.budgetKRW * (1 - discountRate);
  const contractKRW = Math.round(gross * (consortium ? 1 - CONSORTIUM_SHARE : 1));

  if (!fit.gate) {
    // 자격 미달이면 제안서를 쓰지도 못하므로 비용도 발생하지 않는다.
    return { dealId: deal.id, won: false, fit, myTotal: 0, bestCompetitor: 0, proposalCostKRW: 0, contractKRW: 0 };
  }

  const myTotal =
    (fit.fitScore * deal.scoring.tech + priceScore(discountRate, config.maxDiscountRate) * deal.scoring.price) / 100;

  let bestCompetitor = 0;
  for (let i = 0; i < deal.competition.count; i++) {
    bestCompetitor = Math.max(bestCompetitor, sampleCompetitor(deal, rng));
  }

  return {
    dealId: deal.id,
    won: myTotal > bestCompetitor,
    fit,
    myTotal,
    bestCompetitor,
    proposalCostKRW,
    contractKRW,
  };
}
