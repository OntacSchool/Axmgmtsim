import type { NextConfig } from 'next';

/**
 * @axsim/engine·@axsim/data 는 워크스페이스 패키지의 .ts 소스를 직접 import 한다
 * (빌드 산출물이 없다). Next 는 node_modules 밖(워크스페이스 심볼릭 링크) 소스를
 * 기본적으로 트랜스파일하지 않으므로 transpilePackages 로 명시해야 한다.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@axsim/engine', '@axsim/data'],
  // 루트에 CLAUDE.md/AGENTS.md 를 자동 생성하는 기능을 끈다 (요청하지 않은 파일).
  agentRules: false,
};

export default nextConfig;
