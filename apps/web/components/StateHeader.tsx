import { DOMAINS, SEGMENTS, backlog, utilization, type CompanyState } from '@axsim/engine';
import { domainLabel, eok, pct, segmentLabel } from '../lib/format';

const SEGMENT_COLOR: Record<string, string> = {
  public: 'var(--series-1)',
  enterprise: 'var(--series-2)',
  global: 'var(--series-3)',
  smb: 'var(--series-4)',
};

function meterColor(value: number, invert = false): string {
  const good = invert ? value <= 40 : value >= 60;
  const bad = invert ? value >= 70 : value <= 30;
  if (bad) return 'var(--game-danger)';
  if (good) return 'var(--game-win)';
  return 'var(--game-gold)';
}

function Stat({ icon, label, value, tone }: { icon: string; label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{label}</div>
        <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: tone ?? 'var(--text)' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function Bars({ items, getValue, colorOf }: { items: readonly string[]; getValue: (k: string) => number; colorOf?: (k: string) => string }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {items.map((k) => {
        const v = getValue(k);
        const color = colorOf ? colorOf(k) : 'var(--accent)';
        return (
          <div key={k} style={{ minWidth: 64 }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 3 }}>
              {domainLabel(k) !== k ? domainLabel(k) : segmentLabel(k)}
            </div>
            <div style={{ background: 'var(--chart-grid)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, v))}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 4,
                  transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
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
    <div className="game-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span>📅 {state.period}</span>
          <span style={{ fontSize: 13, color: 'var(--text-faint)', fontWeight: 400 }}>턴 {state.turn}</span>
        </h2>
        {state.bankrupt && (
          <span
            className="game-chip"
            style={{ background: 'var(--game-danger-bg)', color: 'var(--game-danger)', fontSize: 13, padding: '4px 12px' }}
          >
            💥 파산
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 28 }}>💰</span>
        <span
          className="mono"
          style={{ fontSize: 34, fontWeight: 800, color: state.cashKRW < 0 ? 'var(--game-danger)' : 'var(--game-win)' }}
        >
          {eok(state.cashKRW)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>보유 현금</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
        <Stat icon="🏦" label="차입" value={eok(state.debtKRW)} />
        <Stat icon="📦" label="수주잔고" value={eok(backlog(state))} />
        <Stat icon="👥" label="인원" value={`${headcount}명`} />
        <Stat icon="⚙️" label="가동률" value={pct(util)} tone={meterColor(util * 100, true)} />
        <Stat icon="😊" label="사기" value={state.morale.toFixed(0)} tone={meterColor(state.morale)} />
        <Stat icon="🧯" label="기술부채" value={state.techDebt.toFixed(0)} tone={meterColor(state.techDebt, true)} />
        <Stat icon="🏅" label="실적" value={`${state.trackRecords.length}건`} />
      </div>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>역량</div>
          <Bars items={DOMAINS} getValue={(d) => state.capability[d as keyof typeof state.capability]} colorOf={() => 'var(--game-info)'} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>채널</div>
          <Bars items={SEGMENTS} getValue={(s) => state.channel[s as keyof typeof state.channel]} colorOf={(s) => SEGMENT_COLOR[s]} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>자격</span>
          {state.certs.length === 0 && state.pendingCerts.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>없음</span>
          )}
          {state.certs.map((c) => (
            <span key={c} className="game-chip" style={{ background: 'var(--game-gold-bg)', color: 'var(--game-gold)' }}>
              📜 {c}
            </span>
          ))}
          {state.pendingCerts.map((p) => (
            <span
              key={p.cert}
              className="game-chip"
              style={{ background: 'var(--chart-grid)', color: 'var(--text-faint)', border: '1px dashed var(--border)' }}
            >
              ⏳ {p.cert} ({p.quartersLeft}Q)
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>벤더</span>
          {state.vendorRegistrations.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>없음</span>
          ) : (
            state.vendorRegistrations.map((v) => (
              <span key={v} className="game-chip" style={{ background: 'var(--game-info-bg)', color: 'var(--game-info)' }}>
                🔑 {v}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
