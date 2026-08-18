'use client';

import { useState } from 'react';
import {
  DOMAINS,
  GRADES,
  SEGMENTS,
  canAcquire,
  debtCapacity,
  type AcquisitionTarget,
  type CompanyState,
  type Dataset,
  type Decision,
  type Product,
  type Talent,
} from '@axsim/engine';
import { domainLabel, eok, gradeLabel, segmentLabel } from '../lib/format';

const CERTS = ['swBusinessCert', 'isms', 'gsCert', 'cmmi', 'iso27001'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h4 style={{ margin: 0, fontSize: 14 }}>{title}</h4>
      {children}
    </div>
  );
}

function Btn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? 'var(--surface-2)' : 'var(--accent)',
        color: disabled ? 'var(--text-faint)' : '#fff',
        border: 'none',
        borderRadius: 6,
        padding: '5px 12px',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function HireSection({
  talents,
  state,
  onAdd,
}: {
  talents: Talent[];
  state: CompanyState;
  onAdd: (d: Decision) => void;
}) {
  if (talents.length === 0) return null;
  return (
    <Section title="영입 가능 인재">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {talents.map((t) => {
          const already = state.hires.some((h) => h.talentId === t.id && h.active);
          const affordable = state.cashKRW >= t.cost.signingKRW;
          return (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <div>
                <div>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  계약금 {eok(t.cost.signingKRW)} · 분기 {eok(t.cost.quarterlyKRW)} · 발현 {t.rampQuarters}Q
                </div>
              </div>
              <Btn disabled={already || !affordable} onClick={() => onAdd({ type: 'hire', talentId: t.id })}>
                {already ? '영입됨' : '영입'}
              </Btn>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function AcquireSection({
  targets,
  state,
  onAdd,
}: {
  targets: AcquisitionTarget[];
  state: CompanyState;
  onAdd: (d: Decision) => void;
}) {
  if (targets.length === 0) return null;
  const capacity = debtCapacity(state);

  return (
    <Section title="인수 가능 대상">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {targets.map((t) => {
          const owned = state.acquisitions.some((a) => a.targetId === t.id);
          const financing = (['cash', 'mixed', 'debt'] as const).map((f) => ({ f, ok: canAcquire(state, t, f).ok }));
          const best = financing.find((x) => x.ok);
          return (
            <div key={t.id} style={{ fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t.name}</span>
                <span className="mono" style={{ color: 'var(--text-dim)' }}>{eok(t.priceKRW, 0)}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                통합 {t.pmi.integrationQuarters}Q · 실적 {t.brings.trackRecords.length}건 · 자격 {t.brings.certs.length}개
                {(t.brings.vendorRegistrations?.length ?? 0) > 0 && ` · 벤더 ${t.brings.vendorRegistrations!.join(',')}`}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {owned ? (
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>이미 인수함</span>
                ) : best ? (
                  <Btn onClick={() => onAdd({ type: 'acquire', targetId: t.id, financing: best.f })}>
                    인수 ({best.f === 'cash' ? '현금' : best.f === 'debt' ? '전액차입' : '절반차입'})
                  </Btn>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--bad)' }}>
                    현금·차입한도 부족 (한도 {eok(capacity, 0)})
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function InvestSection({ state, onAdd }: { state: CompanyState; onAdd: (d: Decision) => void }) {
  const [salesAmt, setSalesAmt] = useState(2);
  const [salesSeg, setSalesSeg] = useState(SEGMENTS[0]);
  const [trainAmt, setTrainAmt] = useState(2);
  const [trainDomain, setTrainDomain] = useState(DOMAINS[0]);
  const [mktAmt, setMktAmt] = useState(2);
  const E = 100_000_000;

  return (
    <Section title="투자">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <span style={{ width: 60 }}>영업</span>
          <select value={salesSeg} onChange={(e) => setSalesSeg(e.target.value as typeof salesSeg)}>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>{segmentLabel(s)}</option>
            ))}
          </select>
          <input type="number" min={0} value={salesAmt} onChange={(e) => setSalesAmt(Number(e.target.value))} style={{ width: 56 }} />
          억
          <Btn
            disabled={state.cashKRW < salesAmt * E}
            onClick={() => onAdd({ type: 'invest', target: 'sales', amountKRW: salesAmt * E, segment: salesSeg })}
          >
            투자
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <span style={{ width: 60 }}>역량훈련</span>
          <select value={trainDomain} onChange={(e) => setTrainDomain(e.target.value as typeof trainDomain)}>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>{domainLabel(d)}</option>
            ))}
          </select>
          <input type="number" min={0} value={trainAmt} onChange={(e) => setTrainAmt(Number(e.target.value))} style={{ width: 56 }} />
          억
          <Btn
            disabled={state.cashKRW < trainAmt * E}
            onClick={() => onAdd({ type: 'invest', target: 'training', amountKRW: trainAmt * E, domain: trainDomain })}
          >
            투자
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
          <span style={{ width: 60 }}>마케팅</span>
          <input type="number" min={0} value={mktAmt} onChange={(e) => setMktAmt(Number(e.target.value))} style={{ width: 56 }} />
          억
          <Btn
            disabled={state.cashKRW < mktAmt * E}
            onClick={() => onAdd({ type: 'invest', target: 'marketing', amountKRW: mktAmt * E })}
          >
            투자
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ width: 60 }}>자격취득</span>
          {CERTS.map((c) => {
            const has = state.certs.includes(c);
            const pending = state.pendingCerts.some((p) => p.cert === c);
            return (
              <Btn key={c} disabled={has || pending} onClick={() => onAdd({ type: 'invest', target: 'cert', amountKRW: 0, cert: c })}>
                {c}
              </Btn>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function RndSection({ products, state, onAdd }: { products: Product[]; state: CompanyState; onAdd: (d: Decision) => void }) {
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const E = 100_000_000;
  const undone = products.filter((p) => !state.products.find((s) => s.productId === p.id)?.launched);
  if (undone.length === 0) return null;

  return (
    <Section title="제품 R&D">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {undone.map((p) => {
          const invested = state.products.find((s) => s.productId === p.id)?.rndInvestedKRW ?? 0;
          const remaining = p.rndToLaunchKRW - invested;
          const amt = amounts[p.id] ?? Math.min(5, Math.ceil(remaining / E));
          return (
            <div key={p.id} style={{ fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.name}</span>
                <span className="mono" style={{ color: 'var(--text-dim)' }}>잔여 {eok(remaining)}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                <input
                  type="number"
                  min={0}
                  value={amt}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                  style={{ width: 56 }}
                />
                억
                <Btn
                  disabled={state.cashKRW < amt * E || amt <= 0}
                  onClick={() => onAdd({ type: 'rnd', productId: p.id, amountKRW: amt * E })}
                >
                  투자
                </Btn>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function StaffSection({ state, onAdd }: { state: CompanyState; onAdd: (d: Decision) => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  return (
    <Section title="채용 / 감원">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {GRADES.map((g) => (
          <div key={g} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <span style={{ width: 40 }}>{gradeLabel(g)}</span>
            <span className="mono" style={{ width: 24, color: 'var(--text-faint)' }}>{state.staff[g]}</span>
            <input
              type="number"
              min={0}
              value={counts[g] ?? 1}
              onChange={(e) => setCounts((prev) => ({ ...prev, [g]: Number(e.target.value) }))}
              style={{ width: 48 }}
            />
            <Btn onClick={() => onAdd({ type: 'recruit', grade: g, count: counts[g] ?? 1 })}>채용</Btn>
            <Btn
              disabled={state.staff[g] < (counts[g] ?? 1)}
              onClick={() => onAdd({ type: 'layoff', grade: g, count: counts[g] ?? 1 })}
            >
              감원
            </Btn>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function DecisionPanel({
  dataset,
  state,
  talents,
  targets,
  onAdd,
}: {
  dataset: Dataset;
  state: CompanyState;
  talents: Talent[];
  targets: AcquisitionTarget[];
  onAdd: (d: Decision) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <HireSection talents={talents} state={state} onAdd={onAdd} />
      <AcquireSection targets={targets} state={state} onAdd={onAdd} />
      <InvestSection state={state} onAdd={onAdd} />
      <RndSection products={dataset.products} state={state} onAdd={onAdd} />
      <StaffSection state={state} onAdd={onAdd} />
    </div>
  );
}
