'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ENGINE_VERSION, createInitialState } from '@axsim/engine';
import { eok } from '../lib/format';
import { getDataset } from '../lib/dataset';
import { createEmptyRunLog, deleteRun, listRuns, saveRun, type RunMeta } from '../lib/storage';

export default function HomePage() {
  const dataset = getDataset();
  const router = useRouter();
  const [profileId, setProfileId] = useState(dataset.profiles[0].id);
  const [seed, setSeed] = useState(42);
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [mounted, setMounted] = useState(false);

  // localStorage 는 서버 렌더 시점에 없으므로 마운트 후에 읽는다.
  // (서버·클라이언트 첫 렌더를 일치시켜 하이드레이션 경고를 피한다.)
  useEffect(() => {
    setRuns(listRuns());
    setMounted(true);
  }, []);

  function startNewRun() {
    const profile = dataset.profiles.find((p) => p.id === profileId);
    if (!profile) return;
    const log = createEmptyRunLog(profileId, seed, ENGINE_VERSION);
    const initial = createInitialState(profile);
    saveRun(log, {
      profileName: profile.name,
      period: initial.period,
      turn: initial.turn,
      cashKRW: initial.cashKRW,
      bankrupt: initial.bankrupt,
      updatedAt: new Date().toISOString(),
    });
    router.push(`/play/${log.runId}`);
  }

  function handleDelete(runId: string) {
    deleteRun(runId);
    setRuns(listRuns());
  }

  return (
    <main className="container" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>AX 경영 시뮬레이션</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          사업 {dataset.deals.length}건 · 인재 {dataset.talents.length}장 · M&amp;A 대상{' '}
          {dataset.targets.length}곳 · 제품 {dataset.products.length}개
        </p>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
        <h3 style={{ margin: 0 }}>새 판 시작</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {dataset.profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfileId(p.id)}
              style={{
                textAlign: 'left',
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${profileId === p.id ? 'var(--accent)' : 'var(--border)'}`,
                background: profileId === p.id ? 'var(--accent-dim)' : 'var(--surface-2)',
                color: 'var(--text)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{p.description}</div>
            </button>
          ))}
        </div>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          시드
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            style={{ width: 100 }}
          />
        </label>
        <button
          onClick={startNewRun}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '10px 0',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          시작
        </button>
      </div>

      {mounted && runs.length > 0 && (
        <div>
          <h3>저장된 판</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {runs.map((r) => (
              <div
                key={r.runId}
                className="card"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
              >
                <div style={{ fontSize: 13 }}>
                  <div>
                    {r.profileName} · 시드 {r.seed}
                    {r.bankrupt && <span style={{ color: 'var(--bad)', marginLeft: 8 }}>파산</span>}
                    {r.engineVersion !== ENGINE_VERSION && (
                      <span style={{ color: 'var(--warn)', marginLeft: 8 }}>엔진 버전 다름</span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>
                    {r.period} · 턴 {r.turn} · 현금 {eok(r.cashKRW)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <Link href={`/play/${r.runId}`} style={{ color: 'var(--accent)' }}>
                    이어하기
                  </Link>
                  <Link href={`/dashboard/${r.runId}`} style={{ color: 'var(--accent)' }}>
                    대시보드
                  </Link>
                  <Link href={`/compare/${r.runId}`} style={{ color: 'var(--accent)' }}>
                    반사실
                  </Link>
                  <button
                    onClick={() => handleDelete(r.runId)}
                    style={{ background: 'none', border: 'none', color: 'var(--bad)', padding: 0, fontSize: 12 }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
