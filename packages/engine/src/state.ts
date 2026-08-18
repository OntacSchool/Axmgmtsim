/**
 * 초기 상태 생성.
 * 회사 프로필(자사형/가상형)은 데이터로 분리되어 있고, 여기서 런타임 상태로 변환된다.
 */

import type { ActiveProject, CompanyProfile, CompanyState, TrackRecord } from './types.ts';

/** 요구 투입인력을 계약 규모에서 역산한다 (프로필의 진행 중 사업용, 딜 데이터와 동일한 비율). */
function inferStaffMix(quarterlyRevenueKRW: number): ActiveProject['staffMix'] {
  const target = quarterlyRevenueKRW * 0.32;
  return {
    principal: Math.max(0, Math.round((target * 0.22) / 42_000_000)),
    senior: Math.max(0, Math.round((target * 0.3) / 30_000_000)),
    mid: Math.max(1, Math.round((target * 0.33) / 21_000_000)),
    junior: Math.max(0, Math.round((target * 0.15) / 14_000_000)),
  };
}

export function createInitialState(profile: CompanyProfile): CompanyState {
  const trackRecords: TrackRecord[] = profile.trackRecords.map((tr, i) => ({
    ...tr,
    dealId: `${profile.id}-INIT-${i}`,
    completedPeriod: profile.startPeriod,
  }));

  const projects: ActiveProject[] = profile.initialProjects.map((p, i) => ({
    dealId: `${profile.id}-WIP-${i}`,
    title: p.title,
    agency: p.agency,
    segment: p.segment,
    domain: [...p.domain],
    contractKRW: p.contractKRW,
    totalQuarters: p.totalQuarters,
    quartersLeft: p.quartersLeft,
    staffMix: inferStaffMix(p.contractKRW / p.totalQuarters),
    qualityAcc: 0,
    quartersWorked: 0,
  }));

  return {
    profileId: profile.id,
    period: profile.startPeriod,
    turn: 0,
    cashKRW: profile.cashKRW,
    debtKRW: 0,
    staff: { ...profile.staff },
    morale: profile.morale,
    capability: { ...profile.capability },
    channel: { ...profile.channel },
    certs: [...profile.certs],
    pendingCerts: [],
    trackRecords,
    relations: { ...profile.relations },
    vendorRegistrations: [...profile.vendorRegistrations],
    products: [],
    projects,
    hires: [],
    acquisitions: [],
    brand: profile.brand,
    techDebt: profile.techDebt,
    bankrupt: false,
    distressQuarters: 0,
    history: [],
  };
}

/** 깊은 복사. 엔진은 상태를 제자리에서 변형하지 않는다. */
export function cloneState(state: CompanyState): CompanyState {
  return structuredClone(state);
}
