/**
 * 인재 영입 / 조직.
 *
 * 설계 의도: 영입은 즉효약이 아니다. rampQuarters 에 걸쳐 효과가 서서히 붙고,
 * 조직 사기가 낮으면 그 전에 나가버린다. 경영자가 배워야 할 교훈의 상당 부분이 여기서 나온다.
 *
 * 상태(state)에는 채널/역량의 절대값만 저장하므로, 인재 효과는 매 분기
 * "이번에 새로 발현된 만큼"의 증분 델타로 상태에 더해진다. 이탈 시에는
 * 그때까지 발현된 총량을 음수로 되돌린다.
 */

import type { Rng } from './rng.ts';
import type { CompanyState, HiredTalent, SimEvent, Talent, TalentEffects } from './types.ts';

/** 효과를 배율 r 로 스케일한다. 벤더 등록은 부분 발현이 없어 제외한다. */
export function scaleEffects(effects: TalentEffects, r: number): TalentEffects {
  const scaleMap = (obj: Record<string, number> | undefined) => {
    if (!obj) return undefined;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = v * r;
    return out;
  };
  return {
    channel: scaleMap(effects.channel as Record<string, number> | undefined) as TalentEffects['channel'],
    capability: scaleMap(effects.capability as Record<string, number> | undefined) as TalentEffects['capability'],
    relations: scaleMap(effects.relations),
    bidWinBonus: (effects.bidWinBonus ?? 0) * r,
    deliveryQuality: (effects.deliveryQuality ?? 0) * r,
  };
}

/** 활동 중인 인재들의 입찰 가점 합계 (ramp 반영) */
export function totalBidBonus(state: CompanyState, talents: Map<string, Talent>): number {
  return state.hires
    .filter((h) => h.active)
    .reduce((sum, h) => sum + (talents.get(h.talentId)?.effects.bidWinBonus ?? 0) * h.ramp, 0);
}

/** 활동 중인 인재들의 수행 품질 보정 합계 (ramp 반영) */
export function totalDeliveryBonus(state: CompanyState, talents: Map<string, Talent>): number {
  return state.hires
    .filter((h) => h.active)
    .reduce((sum, h) => sum + (talents.get(h.talentId)?.effects.deliveryQuality ?? 0) * h.ramp, 0);
}

/** 활동 중인 인재들의 분기 인건비 */
export function hireQuarterlyCost(state: CompanyState, talents: Map<string, Talent>): number {
  return state.hires
    .filter((h) => h.active)
    .reduce((sum, h) => sum + (talents.get(h.talentId)?.cost.quarterlyKRW ?? 0), 0);
}

export interface TalentTickResult {
  hires: HiredTalent[];
  events: SimEvent[];
  /** 이번 분기에 상태에 더해야 할 증분 효과 (이탈분은 음수로 들어온다) */
  deltas: TalentEffects[];
  moraleDelta: number;
}

/** 매 분기 인재 상태 갱신: ramp 진행과 이탈 판정. */
export function tickTalents(
  state: CompanyState,
  talents: Map<string, Talent>,
  rng: Rng,
): TalentTickResult {
  const events: SimEvent[] = [];
  const deltas: TalentEffects[] = [];
  let moraleDelta = 0;

  const hires = state.hires.map((hire) => {
    if (!hire.active) return hire;
    const talent = talents.get(hire.talentId);
    if (!talent) return hire;

    // 사기가 낮을수록, 문화 민감도가 높을수록 잘 나간다.
    const moraleGap = Math.max(0, 60 - state.morale) / 60;
    const leaveProb = talent.attritionRisk * (1 + moraleGap * talent.cultureFitSensitivity * 2.5);

    if (rng.chance(leaveProb)) {
      // 그때까지 발현된 효과를 전부 되돌린다.
      deltas.push(scaleEffects(talent.effects, -hire.ramp));
      moraleDelta -= 4;
      events.push({
        kind: 'hire.left',
        period: state.period,
        message: `이탈: ${talent.title} (사기 ${state.morale.toFixed(0)})`,
        data: { talentId: talent.id },
      });
      return { ...hire, active: false, ramp: 0, leftPeriod: state.period };
    }

    const step = talent.rampQuarters <= 0 ? 1 : 1 / talent.rampQuarters;
    const nextRamp = Math.min(1, hire.ramp + step);
    const gained = nextRamp - hire.ramp;
    if (gained > 0) deltas.push(scaleEffects(talent.effects, gained));

    return { ...hire, ramp: nextRamp };
  });

  return { hires, events, deltas, moraleDelta };
}
