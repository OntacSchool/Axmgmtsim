'use client';

import { useState } from 'react';
import { computeFit, type CompanyState, type Deal, type Decision, type Product } from '@axsim/engine';
import { eok, segmentLabel } from '../lib/format';
import { FitBreakdown } from './FitBreakdown';

const SEGMENT_COLOR: Record<string, string> = {
  public: 'var(--series-1)',
  enterprise: 'var(--series-2)',
  global: 'var(--series-3)',
  smb: 'var(--series-4)',
};

function gaugeColor(score: number): string {
  if (score >= 75) return 'var(--game-win)';
  if (score >= 50) return 'var(--game-gold)';
  return 'var(--game-danger)';
}

function FitGauge({ score }: { score: number }) {
  const color = gaugeColor(score);
  return (
    <div
      className="fit-gauge"
      style={{ ['--gauge-color' as string]: color, ['--gauge-pct' as string]: Math.min(100, score) }}
    >
      <div className="fit-gauge__inner" style={{ color }}>
        {score.toFixed(0)}
      </div>
    </div>
  );
}

interface DealCardProps {
  deal: Deal;
  state: CompanyState;
  launchedProducts: Product[];
  maxDiscountRate: number;
  onBid: (decision: Decision) => void;
  staged: boolean;
}

function DealCard({ deal, state, launchedProducts, maxDiscountRate, onBid, staged }: DealCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [discountPct, setDiscountPct] = useState(5);
  const [consortium, setConsortium] = useState(false);

  const plain = computeFit(state, deal, { consortium: false, launchedProducts });
  const withConsortium = plain.gate ? plain : computeFit(state, deal, { consortium: true, launchedProducts });
  const effectiveFit = consortium ? withConsortium : plain;
  const canBidAtAll = plain.gate || withConsortium.gate;
  const bestFit = plain.gate ? plain : withConsortium;

  return (
    <div
      className={`game-card ${canBidAtAll ? 'game-card--interactive' : 'game-card--locked'} ${staged ? 'game-card--staged game-pop' : ''}`}
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      onClick={() => canBidAtAll && setExpanded((v) => !v)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span
              className="game-chip"
              style={{ background: `color-mix(in srgb, ${SEGMENT_COLOR[deal.segment]} 20%, transparent)`, color: SEGMENT_COLOR[deal.segment] }}
            >
              {segmentLabel(deal.segment)}
            </span>
            <span className="game-chip" style={{ background: 'var(--game-gold-bg)', color: 'var(--game-gold)' }}>
              💰 {eok(deal.budgetKRW, 0)}
            </span>
            <span className="game-chip" style={{ background: 'var(--chart-grid)', color: 'var(--text-dim)' }}>
              ⏱ {deal.durationQuarters}Q
            </span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{deal.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{deal.agency}</div>
        </div>

        {canBidAtAll ? (
          <FitGauge score={bestFit.fitScore} />
        ) : (
          <div style={{ fontSize: 20, flexShrink: 0 }} title="입찰 불가">
            🔒
          </div>
        )}
      </div>

      {!canBidAtAll && (
        <div style={{ fontSize: 12, color: 'var(--bad)' }}>{plain.gateReason}</div>
      )}

      {staged && (
        <div className="game-chip game-pop" style={{ background: 'var(--game-win-bg)', color: 'var(--game-win)', alignSelf: 'flex-start' }}>
          ✓ 입찰 담김
        </div>
      )}

      {expanded && canBidAtAll && (
        <div
          style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}
          onClick={(e) => e.stopPropagation()}
        >
          <FitBreakdown fit={effectiveFit} />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!plain.gate && withConsortium.gate && (
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={consortium} onChange={(e) => setConsortium(e.target.checked)} />
                컨소시엄
              </label>
            )}
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              할인
              <input
                type="number"
                min={0}
                max={maxDiscountRate * 100}
                value={discountPct}
                onChange={(e) => setDiscountPct(Number(e.target.value))}
                style={{ width: 48 }}
              />
              %
            </label>
            <button
              className="game-btn"
              onClick={() =>
                onBid({
                  type: 'bid',
                  dealId: deal.id,
                  discountRate: discountPct / 100,
                  consortium: !plain.gate && withConsortium.gate ? consortium : false,
                })
              }
              style={{ background: 'var(--accent)', color: '#fff', padding: '8px 16px', fontSize: 13, marginLeft: 'auto' }}
            >
              🎯 입찰하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DealCards({
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
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-faint)' }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>💤</div>
        이번 분기에 공고된 사업이 없습니다.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {deals.map((deal) => (
        <DealCard
          key={deal.id}
          deal={deal}
          state={state}
          launchedProducts={launchedProducts}
          maxDiscountRate={maxDiscountRate}
          onBid={onBid}
          staged={stagedDealIds.has(deal.id)}
        />
      ))}
    </div>
  );
}
