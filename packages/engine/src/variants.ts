/**
 * 반사실 비교의 '선택지' 자동 구성.
 *
 * CLI 와 웹이 똑같은 로직으로 "지금 실제로 가능한 수"를 골라야 한다 — 자격 미달인
 * 결정을 변형에 넣으면 advanceTurn() 이 조용히 무시해서 모든 변형이 같은 결과로
 * 나오는 무의미한 비교가 된다. 이 판정을 CLI 와 웹이 각자 구현하면 언젠가 갈라지므로
 * 여기 한 곳에 둔다.
 */

import { canAcquire } from './mna.ts';
import { targetsAvailable } from './market.ts';
import type { VariantSpec } from './counterfactual.ts';
import { GRADES, type CompanyState, type Dataset } from './types.ts';

const FINANCING_LABEL = { cash: '전액 현금', mixed: '절반 차입', debt: '전액 차입' } as const;

function eok(krw: number): string {
  return `${(krw / 1e8).toFixed(0)}억`;
}

/**
 * 비교 시점에서 실제로 가능한 선택지들을 자동 구성한다.
 * 기본 대조군은 "자체 성장"(아무 특별한 수를 두지 않고 전략대로) 이다.
 */
export function buildVariants(dataset: Dataset, snapshot: CompanyState): VariantSpec[] {
  const variants: VariantSpec[] = [{ label: '자체 성장 (이번 분기에 특별한 수 없음)', decisions: [] }];

  // 실제로 실행 가능한 선택지만 비교한다.
  const owned = new Set(snapshot.acquisitions.map((a) => a.targetId));
  const acquirable = targetsAvailable(dataset, snapshot.period)
    .filter((t) => !owned.has(t.id))
    .map((t) => {
      const financing = (['cash', 'mixed', 'debt'] as const).find((f) => canAcquire(snapshot, t, f).ok);
      return financing ? { target: t, financing } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.target.priceKRW - a.target.priceKRW);

  const pick = acquirable[0];
  if (pick) {
    variants.push({
      label: `인수: ${pick.target.name} (${eok(pick.target.priceKRW)}, ${FINANCING_LABEL[pick.financing]})`,
      decisions: [{ type: 'acquire', targetId: pick.target.id, financing: pick.financing }],
    });

    // "회사를 사는 것" 과 "사람만 뽑는 것" 을 같은 규모로 붙여 본다.
    // 인원 수는 같지만 실적·자격·관계자본이 따라오지 않는다는 점이 그대로 드러난다.
    const brought = GRADES.reduce((sum, g) => sum + (pick.target.brings.headcount[g] ?? 0), 0);
    const mid = Math.round(brought * 0.6);
    const junior = brought - mid;
    variants.push({
      label: `자체 증원: 같은 규모 ${brought}명 채용 (실적·자격 없음)`,
      decisions: [
        { type: 'recruit', grade: 'mid', count: mid },
        { type: 'recruit', grade: 'junior', count: junior },
      ],
    });
  }

  return variants;
}
