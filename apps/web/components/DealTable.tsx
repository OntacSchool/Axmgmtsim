'use client';

import { useState } from 'react';
import { computeFit, type CompanyState, type Deal, type Decision, type Product } from '@axsim/engine';
import { eok, segmentLabel } from '../lib/format';
import { FitBreakdown } from './FitBreakdown';

interface DealRowProps {
  deal: Deal;
  state: CompanyState;
  launchedProducts: Product[];
  maxDiscountRate: number;
  onBid: (decision: Decision) => void;
  staged: boolean;
}

function DealRow({ deal, state, launchedProducts, maxDiscountRate, onBid, staged }: DealRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [discountPct, setDiscountPct] = useState(5);
  const [consortium, setConsortium] = useState(false);

  const plain = computeFit(state, deal, { consortium: false, launchedProducts });
  // 자격이 없어도 벤더 등록만 없는 게 아니면 컨소시엄으로 보완 가능성이 있으니 같이 보여준다.
  const withConsortium = plain.gate ? plain : computeFit(state, deal, { consortium: true, launchedProducts });
  const effectiveFit = consortium ? withConsortium : plain;
  const canBidAtAll = plain.gate || withConsortium.gate;

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer', borderBottom: expanded ? 'none' : '1px solid var(--border)' }}
      >
        <td style={{ padding: '10px 8px', fontSize: 13 }}>{segmentLabel(deal.segment)}</td>
        <td style={{ padding: '10px 8px', fontSize: 13, color: 'var(--text-dim)' }}>{deal.agency}</td>
        <td style={{ padding: '10px 8px', fontSize: 13 }}>{deal.title}</td>
        <td className="mono" style={{ padding: '10px 8px', fontSize: 13, textAlign: 'right' }}>
          {eok(deal.budgetKRW, 0)}
        </td>
        <td className="mono" style={{ padding: '10px 8px', fontSize: 13, textAlign: 'right' }}>
          {deal.durationQuarters}Q
        </td>
        <td
          className="mono"
          style={{
            padding: '10px 8px',
            fontSize: 13,
            textAlign: 'right',
            color: !canBidAtAll ? 'var(--text-faint)' : 'var(--text)',
          }}
        >
          {plain.gate ? plain.fitScore.toFixed(1) : withConsortium.gate ? `${withConsortium.fitScore.toFixed(1)}*` : '—'}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
          {staged && <span style={{ fontSize: 12, color: 'var(--accent)' }}>담김</span>}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={7} style={{ padding: '0 8px 14px', background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', paddingTop: 8 }}>
              <div style={{ minWidth: 260, flex: 1 }}>
                <FitBreakdown fit={effectiveFit} />
              </div>
              {canBidAtAll && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
                  {!plain.gate && withConsortium.gate && (
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={consortium}
                        onChange={(e) => setConsortium(e.target.checked)}
                      />
                      컨소시엄 (계약금액 30% 파트너 지분)
                    </label>
                  )}
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    할인율
                    <input
                      type="number"
                      min={0}
                      max={maxDiscountRate * 100}
                      value={discountPct}
                      onChange={(e) => setDiscountPct(Number(e.target.value))}
                      style={{ width: 56 }}
                    />
                    %
                  </label>
                  <button
                    onClick={() =>
                      onBid({
                        type: 'bid',
                        dealId: deal.id,
                        discountRate: discountPct / 100,
                        consortium: !plain.gate && withConsortium.gate ? consortium : false,
                      })
                    }
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 14px',
                      fontSize: 13,
                    }}
                  >
                    입찰 담기
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function DealTable({
  deals,
  state,
  launchedProducts,
  maxDiscountRate,
  stagedDealIds,
  onBid,
}: {
  deals: Deal[];
  state: CompanyState;
  launchedProducts: Product[];
  maxDiscountRate: number;
  stagedDealIds: Set<string>;
  onBid: (decision: Decision) => void;
}) {
  if (deals.length === 0) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>이번 분기에 공고된 사업이 없습니다.</p>;
  }

  return (
    <div className="overflow-x">
      <table>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['세그먼트', '발주처', '사업명', '예산', '기간', '적합도', ''].map((h) => (
              <th
                key={h}
                style={{
                  padding: '6px 8px',
                  textAlign: h === '예산' || h === '기간' || h === '적합도' ? 'right' : 'left',
                  fontSize: 12,
                  color: 'var(--text-faint)',
                  fontWeight: 500,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <DealRow
              key={deal.id}
              deal={deal}
              state={state}
              launchedProducts={launchedProducts}
              maxDiscountRate={maxDiscountRate}
              onBid={onBid}
              staged={stagedDealIds.has(deal.id)}
            />
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
        * 컨소시엄으로 자격을 보완했을 때의 점수
      </p>
    </div>
  );
}
