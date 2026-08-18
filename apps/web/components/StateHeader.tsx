import { DOMAINS, SEGMENTS, backlog, utilization, type CompanyState } from '@axsim/engine';
import { domainLabel, eok, pct, segmentLabel } from '../lib/format';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{label}</div>
      <div
        className="mono"
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: tone ? `var(--${tone})` : 'var(--text)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Bars({ items, getValue }: { items: readonly string[]; getValue: (k: string) => number }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {items.map((k) => {
        const v = getValue(k);
        return (
          <div key={k} style={{ minWidth: 64 }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>
              {domainLabel(k) !== k ? domainLabel(k) : segmentLabel(k)}
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, v))}%`,
                  height: '100%',
                  background: 'var(--accent)',
                }}
              />
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {v.toFixed(0)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StateHeader({ state }: { state: CompanyState }) {
  const util = utilization(state);
  const headcount = Object.values(state.staff).reduce((a, b) => a + b, 0);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>
          {state.period}
          <span style={{ fontSize: 13, color: 'var(--text-faint)', marginLeft: 8 }}>턴 {state.turn}</span>
        </h2>
        {state.bankrupt && (
          <span
            style={{
              color: 'var(--bad)',
              fontWeight: 700,
              border: '1px solid var(--bad)',
              borderRadius: 6,
              padding: '2px 10px',
              fontSize: 13,
            }}
          >
            파산
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 12 }}>
        <Stat label="현금" value={eok(state.cashKRW)} tone={state.cashKRW < 0 ? 'bad' : undefined} />
        <Stat label="차입" value={eok(state.debtKRW)} />
        <Stat label="수주잔고" value={eok(backlog(state))} />
        <Stat label="인원" value={`${headcount}명`} />
        <Stat label="가동률" value={pct(util)} tone={util > 1 ? 'warn' : undefined} />
        <Stat label="사기" value={state.morale.toFixed(0)} tone={state.morale < 40 ? 'bad' : undefined} />
        <Stat label="기술부채" value={state.techDebt.toFixed(0)} tone={state.techDebt > 50 ? 'warn' : undefined} />
        <Stat label="실적" value={`${state.trackRecords.length}건`} />
      </div>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>역량</div>
          <Bars items={DOMAINS} getValue={(d) => state.capability[d as keyof typeof state.capability]} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>채널</div>
          <Bars items={SEGMENTS} getValue={(s) => state.channel[s as keyof typeof state.channel]} />
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-dim)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span>
          자격: {state.certs.length > 0 ? state.certs.join(', ') : '없음'}
          {state.pendingCerts.length > 0 &&
            ` (취득중: ${state.pendingCerts.map((p) => `${p.cert}/${p.quartersLeft}Q`).join(', ')})`}
        </span>
        <span>벤더: {state.vendorRegistrations.length > 0 ? state.vendorRegistrations.join(', ') : '없음'}</span>
      </div>
    </div>
  );
}
