/**
 * 인력 수급 계산.
 *
 * 입찰 적합도(fit)와 수행 품질(delivery)이 모두 같은 인력 풀을 두고 경쟁한다.
 * "수주는 했는데 사람이 없어 품질이 무너진다"는 상황을 만들려면 두 곳이
 * 동일한 계산을 공유해야 하므로 여기로 분리했다.
 */

import { GRADES, type ActiveProject, type CompanyState, type Grade, type StaffMix } from './types.ts';

export function emptyMix(): Record<Grade, number> {
  return { principal: 0, senior: 0, mid: 0, junior: 0 };
}

export function totalStaff(staff: StaffMix): number {
  return GRADES.reduce((sum, g) => sum + (staff[g] ?? 0), 0);
}

/** 현재 수행 중인 사업에 묶여 있는 인력 */
export function committedStaff(projects: ActiveProject[]): Record<Grade, number> {
  const out = emptyMix();
  for (const p of projects) {
    for (const g of GRADES) out[g] += p.staffMix[g] ?? 0;
  }
  return out;
}

/** 신규 입찰에 투입 가능한 여유 인력 (음수 방지) */
export function availableStaff(state: CompanyState): Record<Grade, number> {
  const committed = committedStaff(state.projects);
  const out = emptyMix();
  for (const g of GRADES) out[g] = Math.max(0, state.staff[g] - committed[g]);
  return out;
}

export interface StaffFill {
  /** 요구 대비 충족 비율 0~1 */
  ratio: number;
  /** 채우지 못한 인원 */
  shortfall: Record<Grade, number>;
  /** 요구 총원 */
  required: number;
}

/**
 * 등급별 요구 인력을 보유 인력으로 채운다.
 *
 * 상위 등급이 하위 등급 자리를 대신할 수 있지만(과잉 배치), 그 반대는 불가능하다.
 * 상위 등급부터 처리해 하위 등급 자리에 상위 인력이 먼저 소진되는 것을 막는다.
 */
export function fillStaff(pool: Record<Grade, number>, need: StaffMix): StaffFill {
  const remaining = { ...pool };
  const shortfall = emptyMix();
  let required = 0;
  let filled = 0;

  // GRADES 는 상위(principal) → 하위(junior) 순서
  for (let i = 0; i < GRADES.length; i++) {
    const grade = GRADES[i];
    let want = need[grade] ?? 0;
    required += want;
    if (want <= 0) continue;

    // 1) 같은 등급에서 채운다
    const exact = Math.min(want, remaining[grade]);
    remaining[grade] -= exact;
    want -= exact;
    filled += exact;

    // 2) 모자라면 상위 등급에서 끌어온다 (인덱스가 작을수록 상위)
    for (let j = i - 1; j >= 0 && want > 0; j--) {
      const higher = GRADES[j];
      const take = Math.min(want, remaining[higher]);
      remaining[higher] -= take;
      want -= take;
      filled += take;
    }

    shortfall[grade] = want;
  }

  return {
    ratio: required === 0 ? 1 : filled / required,
    shortfall,
    required,
  };
}

/**
 * 조직 가동률. 1을 넘으면 초과 수주 상태이고 수행 품질이 떨어진다.
 * 인원 수가 아니라 등급 가중치로 계산해 특급 인력의 희소성을 반영한다.
 */
const GRADE_WEIGHT: Record<Grade, number> = { principal: 2.0, senior: 1.4, mid: 1.0, junior: 0.6 };

export function weightedStaff(staff: StaffMix): number {
  return GRADES.reduce((sum, g) => sum + (staff[g] ?? 0) * GRADE_WEIGHT[g], 0);
}

export function utilization(state: CompanyState): number {
  const capacity = weightedStaff(state.staff);
  if (capacity <= 0) return state.projects.length > 0 ? 2 : 0;
  return weightedStaff(committedStaff(state.projects)) / capacity;
}
