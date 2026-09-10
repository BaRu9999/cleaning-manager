/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint は `npm run lint`（および CI）で明示的に実行する。
  // `next build` は型チェック + コンパイルに専念させ、lint 警告がデプロイを止めないようにする。
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
