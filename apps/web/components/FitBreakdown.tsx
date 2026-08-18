import { TECH_CRITERIA, type FitResult } from '@axsim/engine';

export function FitBreakdown({ fit }: { fit: FitResult }) {
  if (!fit.gate) {
    return (
      <div style={{ color: 'var(--bad)', fontSize: 13, padding: '4px 0' }}>
        입찰 불가 — {fit.gateReason}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
      {TECH_CRITERIA.map((c) => (
        <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 56, fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>{c}</span>
          <div style={{ flex: 1, background: 'var(--surface-2)', height: 6, borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, fit.breakdown[c] * 100)}%`,
                height: '100%',
                background: 'var(--accent)',
              }}
            />
          </div>
          <span className="mono" style={{ width: 36, fontSize: 12, textAlign: 'right', flexShrink: 0 }}>
            {(fit.breakdown[c] * 100).toFixed(0)}
          </span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
        관계보너스 +{fit.relationBonus.toFixed(1)} · 기술점수 {fit.techScore.toFixed(1)} · 종합{' '}
        <strong style={{ color: 'var(--text)' }}>{fit.fitScore.toFixed(1)}</strong>
      </div>
    </div>
  );
}
