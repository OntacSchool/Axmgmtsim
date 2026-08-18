/**
 * `sim play` — 28분기 플레이.
 *
 * 대화형(사람)과 관전형(--strategy 봇) 둘 다 지원한다. 관전형은 TTY 없이도
 * 엔진이 끝까지 도는지 확인하는 스모크 테스트 역할을 겸한다.
 */

import { createInterface } from 'node:readline/promises';
import {
  DOMAINS,
  GRADES,
  SEGMENTS,
  advanceTurn,
  computeFit,
  createInitialState,
  dealsInPeriod,
  getStrategy,
  indexDataset,
  rngForTurn,
  targetsAvailable,
  talentsAvailable,
  utilization,
  type CompanyState,
  type Dataset,
  type Decision,
  type Domain,
  type Grade,
  type Product,
  type Segment,
  type TurnResult,
} from '@axsim/engine';
import { HR, eok, pad, padStart, pct, table, truncate } from './format.ts';

const E = 100_000_000;

export interface PlayOptions {
  dataset: Dataset;
  profileId: string;
  seed: number;
  /** 지정하면 봇이 대신 플레이한다 (관전 모드) */
  strategy?: string;
  turns?: number;
}

interface TurnView {
  deals: ReturnType<typeof buildDealView>;
  talents: ReturnType<typeof talentsAvailable>;
  targets: ReturnType<typeof targetsAvailable>;
  products: Product[];
}

function launchedProducts(state: CompanyState, index: ReturnType<typeof indexDataset>): Product[] {
  return state.products
    .filter((p) => p.launched)
    .map((p) => index.products.get(p.productId))
    .filter((p): p is Product => Boolean(p));
}

function buildDealView(state: CompanyState, dataset: Dataset, index: ReturnType<typeof indexDataset>) {
  const products = launchedProducts(state, index);
  return dealsInPeriod(dataset, state.period).map((deal) => {
    const plain = computeFit(state, deal, { consortium: false, launchedProducts: products });
    const withConsortium = computeFit(state, deal, { consortium: true, launchedProducts: products });
    return { deal, plain, withConsortium };
  });
}

function buildView(state: CompanyState, dataset: Dataset, index: ReturnType<typeof indexDataset>): TurnView {
  const hired = new Set(state.hires.filter((h) => h.active).map((h) => h.talentId));
  const owned = new Set(state.acquisitions.map((a) => a.targetId));
  return {
    deals: buildDealView(state, dataset, index),
    talents: talentsAvailable(dataset, state.period).filter((t) => !hired.has(t.id)),
    targets: targetsAvailable(dataset, state.period).filter((t) => !owned.has(t.id)),
    products: dataset.products.filter((p) => p.availableFrom <= state.period),
  };
}

function renderState(state: CompanyState, dataset: Dataset): string {
  const head = Object.values(state.staff).reduce((a, b) => a + b, 0);
  const util = utilization(state);
  const lines: string[] = [];
  lines.push(`\n${HR}`);
  lines.push(`■ ${state.period}  (턴 ${state.turn + 1}/${dataset.config.totalTurns})`);
  lines.push(
    `  현금 ${eok(state.cashKRW)}   차입 ${eok(state.debtKRW)}   인원 ${head}명   가동률 ${pct(util)}   사기 ${state.morale.toFixed(0)}   기술부채 ${state.techDebt.toFixed(0)}`,
  );
  lines.push(
    `  역량 ${DOMAINS.map((d) => `${d} ${state.capability[d].toFixed(0)}`).join(' / ')}`,
  );
  lines.push(
    `  채널 ${SEGMENTS.map((s) => `${s} ${state.channel[s].toFixed(0)}`).join(' / ')}`,
  );
  lines.push(`  자격 ${state.certs.join(', ') || '없음'}${state.pendingCerts.length ? `  (취득중: ${state.pendingCerts.map((p) => `${p.cert}/${p.quartersLeft}Q`).join(', ')})` : ''}`);
  lines.push(`  벤더 ${state.vendorRegistrations.join(', ') || '없음'}   실적 ${state.trackRecords.length}건`);

  if (state.projects.length > 0) {
    lines.push('  수행중:');
    for (const p of state.projects) {
      lines.push(`    · ${truncate(p.title, 34)} ${padStart(eok(p.contractKRW), 8)}  남은 ${p.quartersLeft}/${p.totalQuarters}Q`);
    }
  }
  return lines.join('\n');
}

function renderDeals(view: TurnView, config: Dataset['config']): string {
  if (view.deals.length === 0) return '\n  이번 분기에 공고된 사업이 없습니다.';
  const rows: string[][] = [['#', '세그먼트', '발주처', '사업명', '예산', '기간', '적합도', '비고']];
  view.deals.forEach((c, i) => {
    const best = c.plain.gate ? c.plain : c.withConsortium;
    const note = !c.plain.gate
      ? c.withConsortium.gate
        ? '컨소시엄 필요'
        : (c.plain.gateReason ?? '입찰 불가')
      : '';
    rows.push([
      `${i + 1}`,
      c.deal.segment,
      truncate(c.deal.agency, 18),
      truncate(c.deal.title, 30),
      eok(c.deal.budgetKRW, 0),
      `${c.deal.durationQuarters}Q`,
      best.gate ? best.fitScore.toFixed(1) : '—',
      truncate(note, 26),
    ]);
  });
  return `\n▸ 공고 사업 (제안비 예산의 ${pct(config.proposalCostRate, 1)})\n${table(rows, ['r', 'l', 'l', 'l', 'r', 'r', 'r', 'l'])}`;
}

function renderOptions(view: TurnView, state: CompanyState): string {
  const out: string[] = [];
  if (view.talents.length > 0) {
    const rows: string[][] = [['#', '인재', '계약금', '분기비용', '효과발현']];
    view.talents.forEach((t, i) => {
      rows.push([`${i + 1}`, truncate(t.title, 34), eok(t.cost.signingKRW), eok(t.cost.quarterlyKRW), `${t.rampQuarters}Q`]);
    });
    out.push(`\n▸ 영입 가능 인재\n${table(rows, ['r', 'l', 'r', 'r', 'r'])}`);
  }
  if (view.targets.length > 0) {
    const rows: string[][] = [['#', 'M&A 대상', '인수가', '통합', '가져오는 것']];
    view.targets.forEach((t, i) => {
      const brings = [
        t.brings.certs.length ? `자격 ${t.brings.certs.length}` : '',
        t.brings.trackRecords.length ? `실적 ${t.brings.trackRecords.length}건` : '',
        (t.brings.vendorRegistrations ?? []).length ? `벤더 ${(t.brings.vendorRegistrations ?? []).join('/')}` : '',
      ].filter(Boolean).join(', ');
      rows.push([`${i + 1}`, truncate(t.name, 26), eok(t.priceKRW, 0), `${t.pmi.integrationQuarters}Q`, truncate(brings, 34)]);
    });
    out.push(`\n▸ 인수 가능 대상\n${table(rows, ['r', 'l', 'r', 'r', 'l'])}`);
  }
  const undone = view.products.filter((p) => !state.products.find((s) => s.productId === p.id)?.launched);
  if (undone.length > 0) {
    const rows: string[][] = [['#', '제품', '출시까지', '분기 ARPU']];
    undone.forEach((p, i) => {
      const invested = state.products.find((s) => s.productId === p.id)?.rndInvestedKRW ?? 0;
      rows.push([`${i + 1}`, truncate(p.name, 26), eok(Math.max(0, p.rndToLaunchKRW - invested)), eok(p.arpuQuarterlyKRW, 2)]);
    });
    out.push(`\n▸ 개발 가능 제품\n${table(rows, ['r', 'l', 'r', 'r'])}`);
  }
  return out.join('\n');
}

const HELP = `
명령어
  b <번호> [할인율%] [c]     입찰 (c 를 붙이면 컨소시엄)     예: b 1 10 c
  h <번호>                   인재 영입                       예: h 3
  m <번호> [cash|debt|mixed] 인수                            예: m 1 mixed
  i sales|marketing|training <금액억> [세그먼트|도메인]        예: i sales 3 public
  i cert <자격>              자격 취득 착수                   예: i cert isms
  r <번호> <금액억>          제품 R&D                         예: r 1 5
  + <등급> <인원>            채용 (principal|senior|mid|junior)
  - <등급> <인원>            감원
  ls                         현황 다시 보기
  auto                       이번 분기는 봇에게 맡김
  go / (엔터)                결정 확정, 다음 분기로
  q                          종료
`;

function renderEvents(result: TurnResult): string {
  if (result.events.length === 0) return '';
  return `\n▸ ${result.summary.period} 결과\n` + result.events.map((e) => `  · ${e.message}`).join('\n');
}

function parseCommand(
  input: string,
  view: TurnView,
  state: CompanyState,
): { decision?: Decision; message?: string; control?: 'go' | 'quit' | 'auto' | 'help' | 'ls' } {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { control: 'go' };
  const cmd = parts[0].toLowerCase();

  if (cmd === 'go') return { control: 'go' };
  if (cmd === 'q' || cmd === 'quit') return { control: 'quit' };
  if (cmd === 'auto') return { control: 'auto' };
  if (cmd === '?' || cmd === 'help') return { control: 'help' };
  if (cmd === 'ls') return { control: 'ls' };

  if (cmd === 'b') {
    const idx = Number(parts[1]) - 1;
    const cand = view.deals[idx];
    if (!cand) return { message: `사업 번호가 잘못됐습니다: ${parts[1]}` };
    const consortium = parts.includes('c');
    const discountRate = parts[2] && parts[2] !== 'c' ? Number(parts[2]) / 100 : 0;
    if (Number.isNaN(discountRate)) return { message: '할인율은 숫자여야 합니다' };
    return { decision: { type: 'bid', dealId: cand.deal.id, discountRate, consortium } };
  }

  if (cmd === 'h') {
    const t = view.talents[Number(parts[1]) - 1];
    if (!t) return { message: `인재 번호가 잘못됐습니다: ${parts[1]}` };
    if (state.cashKRW < t.cost.signingKRW) return { message: `현금 부족 (계약금 ${eok(t.cost.signingKRW)})` };
    return { decision: { type: 'hire', talentId: t.id } };
  }

  if (cmd === 'm') {
    const t = view.targets[Number(parts[1]) - 1];
    if (!t) return { message: `대상 번호가 잘못됐습니다: ${parts[1]}` };
    const financing = (parts[2] ?? 'mixed') as 'cash' | 'debt' | 'mixed';
    if (!['cash', 'debt', 'mixed'].includes(financing)) return { message: '조달 방식은 cash|debt|mixed' };
    return { decision: { type: 'acquire', targetId: t.id, financing } };
  }

  if (cmd === 'i') {
    const target = parts[1];
    if (target === 'cert') {
      const cert = parts[2] as Decision extends { cert?: infer C } ? C : never;
      if (!cert) return { message: '자격명을 입력하세요 (swBusinessCert|isms|gsCert|cmmi|iso27001)' };
      return { decision: { type: 'invest', target: 'cert', amountKRW: 0, cert: cert as never } };
    }
    if (!['sales', 'marketing', 'training', 'rnd'].includes(target ?? '')) {
      return { message: '투자 대상은 sales|marketing|training|rnd|cert' };
    }
    const amount = Number(parts[2]) * E;
    if (!Number.isFinite(amount) || amount <= 0) return { message: '금액(억)을 입력하세요' };
    const extra = parts[3];
    return {
      decision: {
        type: 'invest',
        target: target as 'sales' | 'marketing' | 'training' | 'rnd',
        amountKRW: amount,
        segment: SEGMENTS.includes(extra as Segment) ? (extra as Segment) : undefined,
        domain: DOMAINS.includes(extra as Domain) ? (extra as Domain) : undefined,
      },
    };
  }

  if (cmd === 'r') {
    const undone = view.products.filter((p) => !state.products.find((s) => s.productId === p.id)?.launched);
    const p = undone[Number(parts[1]) - 1];
    if (!p) return { message: `제품 번호가 잘못됐습니다: ${parts[1]}` };
    const amount = Number(parts[2]) * E;
    if (!Number.isFinite(amount) || amount <= 0) return { message: '금액(억)을 입력하세요' };
    return { decision: { type: 'rnd', productId: p.id, amountKRW: amount } };
  }

  if (cmd === '+' || cmd === '-') {
    const grade = parts[1] as Grade;
    if (!GRADES.includes(grade)) return { message: `등급은 ${GRADES.join('|')}` };
    const count = Number(parts[2]);
    if (!Number.isFinite(count) || count <= 0) return { message: '인원을 입력하세요' };
    return { decision: cmd === '+' ? { type: 'recruit', grade, count } : { type: 'layoff', grade, count } };
  }

  return { message: `알 수 없는 명령: ${cmd} (? 로 도움말)` };
}

export async function runPlay(options: PlayOptions): Promise<CompanyState> {
  const { dataset } = options;
  const profile = dataset.profiles.find((p) => p.id === options.profileId);
  if (!profile) throw new Error(`알 수 없는 프로필: ${options.profileId}`);

  const index = indexDataset(dataset);
  const turns = options.turns ?? dataset.config.totalTurns;
  let state = createInitialState(profile);

  console.log(`\n${profile.name}`);
  console.log(profile.description);
  console.log(`시드 ${options.seed} · ${turns}분기`);

  const botStrategy = options.strategy ? getStrategy(options.strategy) : null;
  const rl = botStrategy ? null : createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (let turn = 0; turn < turns && !state.bankrupt; turn++) {
      const view = buildView(state, dataset, index);
      const decisionRng = rngForTurn(options.seed ^ 0x5bf03635, state.turn);

      let decisions: Decision[];
      if (botStrategy) {
        console.log(renderState(state, dataset));
        console.log(renderDeals(view, dataset.config));
        decisions = botStrategy({ state, dataset, index, rng: decisionRng });
        console.log(`\n▸ 봇 결정 ${describeDecisions(decisions, view)}`);
      } else {
        decisions = await collectDecisions(rl!, state, dataset, index, view, decisionRng);
        if (decisions.length === 1 && decisions[0].type === 'pass' && (decisions[0] as { quit?: boolean }).quit) break;
      }

      const result = advanceTurn(state, decisions, { dataset, index }, rngForTurn(options.seed, state.turn));
      console.log(renderEvents(result));
      state = result.state;
    }
  } finally {
    rl?.close();
  }

  printFinal(state, dataset);
  return state;
}

function describeDecisions(decisions: Decision[], view: TurnView): string {
  if (decisions.length === 0 || (decisions.length === 1 && decisions[0].type === 'pass')) return '없음';
  return decisions
    .map((d) => {
      switch (d.type) {
        case 'bid': {
          const deal = view.deals.find((c) => c.deal.id === d.dealId)?.deal;
          return `입찰(${truncate(deal?.title ?? d.dealId, 16)}${d.consortium ? '/컨소' : ''}, -${pct(d.discountRate)})`;
        }
        case 'hire': return `영입(${d.talentId})`;
        case 'acquire': return `인수(${d.targetId})`;
        case 'invest': return `투자(${d.target}${d.cert ? `:${d.cert}` : ''} ${d.amountKRW ? eok(d.amountKRW) : ''})`;
        case 'rnd': return `R&D(${d.productId} ${eok(d.amountKRW)})`;
        case 'recruit': return `채용(${d.grade} ${d.count})`;
        case 'layoff': return `감원(${d.grade} ${d.count})`;
        default: return '';
      }
    })
    .filter(Boolean)
    .join(', ');
}

async function collectDecisions(
  rl: ReturnType<typeof createInterface>,
  state: CompanyState,
  dataset: Dataset,
  index: ReturnType<typeof indexDataset>,
  view: TurnView,
  _rng: ReturnType<typeof rngForTurn>,
): Promise<Decision[]> {
  console.log(renderState(state, dataset));
  console.log(renderDeals(view, dataset.config));
  console.log(renderOptions(view, state));
  console.log('\n  명령을 입력하세요. ? 도움말, 엔터로 다음 분기.');

  const decisions: Decision[] = [];
  for (;;) {
    const line = await rl.question(`${state.period}> `);
    const parsed = parseCommand(line, view, state);

    if (parsed.control === 'quit') {
      const quit = { type: 'pass', quit: true } as Decision;
      return [quit];
    }
    if (parsed.control === 'go') return decisions.length > 0 ? decisions : [{ type: 'pass' }];
    if (parsed.control === 'help') { console.log(HELP); continue; }
    if (parsed.control === 'ls') {
      console.log(renderState(state, dataset));
      console.log(renderDeals(view, dataset.config));
      console.log(renderOptions(view, state));
      continue;
    }
    if (parsed.control === 'auto') {
      const bot = getStrategy('balanced');
      const auto = bot({ state, dataset, index, rng: _rng });
      console.log(`  봇 결정: ${describeDecisions(auto, view)}`);
      return auto;
    }
    if (parsed.message) { console.log(`  ${parsed.message}`); continue; }
    if (parsed.decision) {
      decisions.push(parsed.decision);
      console.log(`  담김: ${describeDecisions([parsed.decision], view)}  (총 ${decisions.length}개)`);
    }
  }
}

function printFinal(state: CompanyState, dataset: Dataset): void {
  const totalRevenue = state.history.reduce((s, h) => s + h.revenueKRW, 0);
  const peak = Math.max(0, ...state.history.map((h) => h.revenueKRW));
  console.log(`\n${HR}`);
  console.log(`■ 종료 — ${state.period} (${state.turn}분기 진행)${state.bankrupt ? '  ※ 파산' : ''}`);
  console.log(`  누적 매출 ${eok(totalRevenue, 0)}   최고 분기매출 ${eok(peak)}   최종 현금 ${eok(state.cashKRW)}   차입 ${eok(state.debtKRW)}`);
  console.log(`  인원 ${Object.values(state.staff).reduce((a, b) => a + b, 0)}명   실적 ${state.trackRecords.length}건   자격 ${state.certs.length}개   벤더 ${state.vendorRegistrations.length}개`);
  console.log(`  역량 ${DOMAINS.map((d) => `${d} ${state.capability[d].toFixed(0)}`).join(' / ')}`);
  console.log(`  채널 ${SEGMENTS.map((s) => `${s} ${state.channel[s].toFixed(0)}`).join(' / ')}`);
  if (state.acquisitions.length > 0) {
    console.log(`  인수 ${state.acquisitions.map((a) => a.targetId).join(', ')}`);
  }
  console.log(`  ${pad('분기별 매출', 12)} ${state.history.map((h) => (h.revenueKRW / 1e8).toFixed(0)).join(' ')}`);
  console.log(`  ${pad('분기별 현금', 12)} ${state.history.map((h) => (h.cashKRW / 1e8).toFixed(0)).join(' ')}`);
  void dataset;
}
