#!/usr/bin/env node
/**
 * AX 경영 시뮬레이션 CLI
 *
 *   sim play    --profile ontact --seed 42 [--strategy balanced] [--turns 28]
 *   sim auto    --strategy all --runs 200 [--profile ontact] [--csv out.csv]
 *   sim compare --at 8 [--runs 200] [--horizon 12] [--variant mna|organic|hire]
 *   sim validate
 */

import { writeFileSync } from 'node:fs';
import { loadDataset } from '@axsim/data';
import { STRATEGY_PRESETS, buildVariants } from '@axsim/engine';
import { printAuto, runAuto, toCsv } from './auto.ts';
import { buildSnapshot, printCompare, runCompare } from './compare.ts';
import { runPlay } from './play.ts';
import { HR, eok } from './format.ts';

interface Args {
  command: string;
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function str(flags: Args['flags'], key: string, fallback: string): string {
  const v = flags[key];
  return typeof v === 'string' ? v : fallback;
}

function num(flags: Args['flags'], key: string, fallback: number): number {
  const v = flags[key];
  const n = typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const USAGE = `
AX 경영 시뮬레이션

  npm run sim -- play    --profile ontact --seed 42
                         [--strategy public-focus] [--turns 28]
  npm run sim -- auto    --strategy all --runs 200 [--profile ontact] [--csv out/auto.csv]
  npm run sim -- compare --at 8 --runs 200 [--horizon 12] [--profile ontact]
  npm run sim -- list

전략: ${Object.keys(STRATEGY_PRESETS).join(', ')}
`;

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const dataset = loadDataset();

  if (command === 'help' || flags.help) {
    console.log(USAGE);
    return;
  }

  if (command === 'list') {
    console.log('\n▸ 회사 프로필');
    for (const p of dataset.profiles) {
      console.log(`  ${p.id.padEnd(10)} ${p.name} — 현금 ${eok(p.cashKRW, 0)}, 인원 ${Object.values(p.staff).reduce((a, b) => a + b, 0)}명`);
    }
    console.log('\n▸ 전략 프리셋');
    for (const [key, params] of Object.entries(STRATEGY_PRESETS)) {
      console.log(`  ${key.padEnd(18)} ${params.name} — 선호 ${params.segments.join('>')}`);
    }
    return;
  }

  if (command === 'play') {
    await runPlay({
      dataset,
      profileId: str(flags, 'profile', 'ontact'),
      seed: num(flags, 'seed', 42),
      strategy: typeof flags.strategy === 'string' ? flags.strategy : undefined,
      turns: flags.turns ? num(flags, 'turns', dataset.config.totalTurns) : undefined,
    });
    return;
  }

  if (command === 'auto') {
    const requested = str(flags, 'strategy', 'all');
    const strategies = requested === 'all' ? Object.keys(STRATEGY_PRESETS) : requested.split(',');
    const runs = num(flags, 'runs', 100);
    const profileId = str(flags, 'profile', 'ontact');
    const profile = dataset.profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error(`알 수 없는 프로필: ${profileId}`);

    const results = runAuto({
      dataset,
      profileId,
      strategies,
      runs,
      baseSeed: num(flags, 'seed', 20260818),
    });
    printAuto(results, profile.name, runs);

    if (typeof flags.csv === 'string') {
      writeFileSync(flags.csv, toCsv(results));
      console.log(`\n  CSV 저장: ${flags.csv}`);
    }
    return;
  }

  if (command === 'compare') {
    const profileId = str(flags, 'profile', 'ontact');
    const warmupTurns = num(flags, 'at', 8);
    const seed = num(flags, 'seed', 20260818);
    const baseOptions = {
      dataset,
      profileId,
      warmupTurns,
      warmupStrategy: str(flags, 'warmup', 'public-focus'),
      baseStrategy: str(flags, 'base', 'public-focus'),
      runs: num(flags, 'runs', 100),
      horizon: num(flags, 'horizon', 12),
      seed,
      variants: [],
    };

    const snapshot = buildSnapshot(baseOptions);
    const variants = buildVariants(dataset, snapshot);
    if (variants.length < 2) {
      console.log('\n비교할 선택지가 없습니다. --at 값을 늘려 인수·영입 대상이 등장한 시점으로 이동해 보세요.');
      return;
    }

    const report = runCompare(snapshot, { ...baseOptions, variants });
    printCompare(report, snapshot);
    return;
  }

  console.log(USAGE);
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(`\n${HR}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
