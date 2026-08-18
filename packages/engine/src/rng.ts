/**
 * 결정론적 난수 생성기.
 *
 * 엔진 전체에서 Math.random() 은 절대 쓰지 않는다. 같은 시드 + 같은 결정이면
 * 항상 같은 결과가 나와야 반사실 분석(counterfactual)과 서버 재현 검증이 성립한다.
 */

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [min, max) */
  range(min: number, max: number): number;
  int(minInclusive: number, maxExclusive: number): number;
  /** 확률 p 로 true */
  chance(p: number): boolean;
  /** 평균 mean, 표준편차 sd 의 정규분포 표본 */
  normal(mean: number, sd: number): number;
  pick<T>(items: readonly T[]): T;
  /** 현재 내부 상태 (스냅샷/재개용) */
  getState(): number;
}

/** mulberry32 — 짧고 빠르며 통계적 성질이 충분한 32비트 PRNG */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  // 시드 0 은 mulberry32 에서 퇴화하므로 보정한다.
  if (a === 0) a = 0x9e3779b9;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min)),
    chance: (p) => next() < p,
    normal(mean, sd) {
      // Box-Muller. u1 이 0 이면 log 가 발산하므로 하한을 둔다.
      const u1 = Math.max(next(), 1e-12);
      const u2 = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
    pick: (items) => items[Math.floor(next() * items.length)],
    getState: () => a,
  };
}

/** 문자열을 32비트 시드로 해싱 (시나리오 ID 등을 시드에 섞을 때 사용) */
export function hashSeed(text: string, base = 0): number {
  let h = (2166136261 ^ base) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
