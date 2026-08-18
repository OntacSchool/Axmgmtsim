/**
 * 시드 데이터 검증 CLI — `npm run validate`
 *
 * 스키마 검증(zod)에 더해, 스키마만으로는 잡히지 않는 정합성을 확인한다.
 * 예: 딜이 요구하는 벤더 등록을 아무 인재도 아무 인수 대상도 주지 못하면
 * 그 딜은 영원히 입찰 불가능한 죽은 데이터다.
 */

import { addQuarters, diffQuarters, type Dataset } from '@axsim/engine';
import { parseDataset } from './index.ts';

interface Problem {
  level: 'error' | 'warn';
  message: string;
}

function checkConsistency(dataset: Dataset): Problem[] {
  const problems: Problem[] = [];
  const err = (message: string) => problems.push({ level: 'error', message });
  const warn = (message: string) => problems.push({ level: 'warn', message });

  const dupes = (ids: string[], label: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(`${label} ID 중복: ${id}`);
      seen.add(id);
    }
  };
  dupes(dataset.deals.map((d) => d.id), '사업');
  dupes(dataset.talents.map((t) => t.id), '인재');
  dupes(dataset.targets.map((t) => t.id), 'M&A 대상');
  dupes(dataset.products.map((p) => p.id), '제품');
  dupes(dataset.profiles.map((p) => p.id), '회사 프로필');

  // 시뮬레이션 기간 안에 들어오는지
  const start = dataset.profiles[0].startPeriod;
  const end = addQuarters(start, dataset.config.totalTurns - 1);
  for (const deal of dataset.deals) {
    const offset = diffQuarters(start, deal.period);
    if (offset < 0 || offset >= dataset.config.totalTurns) {
      err(`사업 ${deal.id}(${deal.period}) 이 시뮬레이션 기간(${start}~${end}) 밖입니다`);
    }
  }

  // 분기 커버리지 — 아무 사업도 없는 분기가 있으면 플레이가 멈춘다
  const byPeriod = new Map<string, number>();
  for (const deal of dataset.deals) byPeriod.set(deal.period, (byPeriod.get(deal.period) ?? 0) + 1);
  for (let i = 0; i < dataset.config.totalTurns; i++) {
    const period = addQuarters(start, i);
    if (!byPeriod.has(period)) warn(`${period}: 공고된 사업이 없습니다`);
  }

  // 벤더 등록 획득 경로가 존재하는가
  const obtainableVendors = new Set<string>();
  for (const t of dataset.talents) for (const v of t.effects.vendorRegistrations ?? []) obtainableVendors.add(v);
  for (const t of dataset.targets) for (const v of t.brings.vendorRegistrations ?? []) obtainableVendors.add(v);
  for (const p of dataset.profiles) for (const v of p.vendorRegistrations) obtainableVendors.add(v);
  for (const deal of dataset.deals) {
    const v = deal.requirements.vendorRegistration;
    if (v && !obtainableVendors.has(v)) {
      err(`사업 ${deal.id} 이 요구하는 벤더 등록 "${v}" 을 획득할 방법이 없습니다`);
    }
  }

  // 인수 대상이 들고 오는 제품이 실재하는가
  const productIds = new Set(dataset.products.map((p) => p.id));
  for (const target of dataset.targets) {
    for (const pid of target.brings.products) {
      if (!productIds.has(pid)) err(`M&A 대상 ${target.id} 의 제품 "${pid}" 이 제품 목록에 없습니다`);
    }
  }

  // 필수 자격의 취득 비용이 정의되어 있는가
  for (const deal of dataset.deals) {
    for (const cert of deal.requirements.mandatoryCerts) {
      if (dataset.config.certCostKRW[cert] === undefined) {
        err(`자격 "${cert}" 의 취득 비용이 config 에 없습니다 (사업 ${deal.id})`);
      }
    }
  }

  // 등장 시점이 기간 안인지
  for (const t of [...dataset.talents, ...dataset.targets, ...dataset.products]) {
    const offset = diffQuarters(start, t.availableFrom);
    if (offset < 0 || offset >= dataset.config.totalTurns) {
      warn(`${'name' in t ? t.name : t.id} 의 등장 시점(${t.availableFrom})이 시뮬레이션 기간 밖입니다`);
    }
  }

  return problems;
}

function summarize(dataset: Dataset): void {
  const totalBudget = dataset.deals.reduce((s, d) => s + d.budgetKRW, 0);
  const bySegment = new Map<string, { count: number; budget: number }>();
  for (const d of dataset.deals) {
    const cur = bySegment.get(d.segment) ?? { count: 0, budget: 0 };
    bySegment.set(d.segment, { count: cur.count + 1, budget: cur.budget + d.budgetKRW });
  }

  console.log('\n▸ 데이터셋 요약');
  console.log(`  사업 ${dataset.deals.length}건 · 총 ${(totalBudget / 1e8).toFixed(0)}억 · 분기 평균 ${(totalBudget / dataset.config.totalTurns / 1e8).toFixed(1)}억`);
  for (const [segment, v] of [...bySegment].sort((a, b) => b[1].budget - a[1].budget)) {
    console.log(`    ${segment.padEnd(11)} ${String(v.count).padStart(2)}건  ${(v.budget / 1e8).toFixed(0).padStart(5)}억`);
  }
  console.log(`  인재 ${dataset.talents.length}장 · M&A 대상 ${dataset.targets.length}곳 · 제품 ${dataset.products.length}개 · 프로필 ${dataset.profiles.length}개`);
}

function main(): void {
  const parsed = parseDataset();
  if (!parsed.success) {
    console.error('✖ 스키마 검증 실패');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    process.exit(1);
  }

  const dataset = parsed.data as unknown as Dataset;
  const problems = checkConsistency(dataset);
  const errors = problems.filter((p) => p.level === 'error');
  const warnings = problems.filter((p) => p.level === 'warn');

  console.log('✔ 스키마 검증 통과');
  for (const w of warnings) console.warn(`⚠ ${w.message}`);
  for (const e of errors) console.error(`✖ ${e.message}`);

  summarize(dataset);

  if (errors.length > 0) {
    console.error(`\n✖ 정합성 오류 ${errors.length}건`);
    process.exit(1);
  }
  console.log(`\n✔ 정합성 검증 통과${warnings.length > 0 ? ` (경고 ${warnings.length}건)` : ''}`);
}

main();
