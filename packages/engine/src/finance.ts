/**
 * 재무 정산 — 손익, 현금흐름, 파산 판정.
 *
 * 현금이 게임의 제약이다. 공공 사업은 수주해도 매출이 여러 분기에 걸쳐 들어오는데
 * 인건비는 매 분기 나가므로, 성장 전략은 거의 항상 현금 문제로 나타난다.
 */

import { GRADES, type CompanyState, type Grade, type SimConfig } from './types.ts';

/** 차입금 분기 이자율 (연 8.8% 수준) */
const QUARTERLY_INTEREST_RATE = 0.022;

/**
 * 차입 원금의 분기 상환율 (약 4년 만기).
 *
 * 이자만 내는 모델에서는 레버리지 인수가 공짜에 가깝다. 원금을 갚게 해야
 * "인수는 매출을 사 오지만 몇 년간 현금을 묶는다"는 실제 부담이 생긴다.
 */
const DEBT_AMORTIZATION_RATE = 0.06;

export interface FinanceInput {
  /** 사업 수행으로 인식된 매출 */
  projectRevenueKRW: number;
  /** 제품 반복 매출 */
  productRevenueKRW: number;
  /** 인수 회사 승계 매출 */
  inheritedRevenueKRW: number;
  /** 영입 인재 분기 인건비 */
  hireCostKRW: number;
  /** 이번 분기 일회성 지출 (제안비, 투자, 채용비, 인수대금 등) */
  oneOffCostKRW: number;
}

export interface FinanceResult {
  revenueKRW: number;
  costKRW: number;
  profitKRW: number;
  cashKRW: number;
  payrollKRW: number;
  overheadKRW: number;
  directCostKRW: number;
  interestKRW: number;
  /** 이번 분기 원금 상환액 (비용이 아니라 현금 유출) */
  principalRepaidKRW: number;
  /** 상환 후 남은 차입금 */
  debtKRW: number;
}

export function payroll(staff: Record<Grade, number>, config: SimConfig): number {
  return GRADES.reduce((sum, g) => sum + staff[g] * config.quarterlyCostByGrade[g], 0);
}

export function settleQuarter(
  state: CompanyState,
  input: FinanceInput,
  config: SimConfig,
): FinanceResult {
  const revenueKRW = input.projectRevenueKRW + input.productRevenueKRW + input.inheritedRevenueKRW;

  const payrollKRW = payroll(state.staff, config) + input.hireCostKRW;
  const overheadKRW = config.fixedOverheadKRW + payrollKRW * config.overheadRate;
  // 직접 원가는 사업 매출에만 붙는다 (제품/승계 매출은 원가 구조가 다르다).
  const directCostKRW = input.projectRevenueKRW * config.directCostRate;
  const interestKRW = state.debtKRW * QUARTERLY_INTEREST_RATE;

  const costKRW = payrollKRW + overheadKRW + directCostKRW + interestKRW + input.oneOffCostKRW;
  const profitKRW = revenueKRW - costKRW;

  // 원금 상환은 손익에 잡히지 않지만 현금은 그만큼 빠져나간다.
  const principalRepaidKRW = Math.min(state.debtKRW, state.debtKRW * DEBT_AMORTIZATION_RATE);

  return {
    revenueKRW,
    costKRW,
    profitKRW,
    cashKRW: state.cashKRW + profitKRW - principalRepaidKRW,
    payrollKRW,
    overheadKRW,
    directCostKRW,
    interestKRW,
    principalRepaidKRW,
    debtKRW: state.debtKRW - principalRepaidKRW,
  };
}

/** 수주잔고 — 아직 매출로 인식되지 않은 계약 금액 */
export function backlog(state: CompanyState): number {
  return state.projects.reduce(
    (sum, p) => sum + (p.contractKRW / p.totalQuarters) * p.quartersLeft,
    0,
  );
}

/**
 * 파산 판정. 한 분기 적자로는 망하지 않지만, 기준 현금 아래가 연속되면 끝난다.
 * 반환값은 갱신된 distressQuarters 와 파산 여부.
 */
export function checkBankruptcy(
  cashKRW: number,
  distressQuarters: number,
  config: SimConfig,
): { distressQuarters: number; bankrupt: boolean } {
  const next = cashKRW < config.bankruptcyCashKRW ? distressQuarters + 1 : 0;
  return { distressQuarters: next, bankrupt: next >= config.bankruptcyQuarters };
}
