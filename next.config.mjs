/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint は `npm run lint`（および CI）で明示的に実行する。
  // `next build` は型チェック + コンパイルに専念させ、lint 警告がデプロイを止めないようにする。
  eslint: {
    ignoreDuringBuilds: true,
  },
  // PDFレポート生成（src/lib/reports/）用。.woff フォントや PDF 描画の内部実装を
  // webpack にバンドルさせず、実行時に node_modules から直接 require させる
  // （バンドル対象にすると .woff がJSモジュールとして解釈されビルド失敗する）。
  serverExternalPackages: ["@react-pdf/renderer", "noto-sans-cjk-jp"],
  // @react-pdf/renderer が内部で使う pdfkit は standard-fonts（Helvetica 等）を、
  // 日本語PDFレポートは noto-sans-cjk-jp の .woff を、どちらも実行時に動的に読むため、
  // Vercel のファイルトレースだけでは検出されずデプロイ後に
  // "Cannot find module '.../pdfkit/js/standard-fonts/Helvetica.cjs'" や
  // "ENOENT: .../noto-sans-cjk-jp/fonts/NotoSansCJKjp-Regular.woff" で 500 になる。
  // レポートAPIの関数バンドルへ明示的に含める。
  outputFileTracingIncludes: {
    "/api/reports/weekly": [
      "./node_modules/pdfkit/js/**/*",
      "./node_modules/noto-sans-cjk-jp/fonts/NotoSansCJKjp-Regular.woff",
    ],
    "/api/reports/monthly": [
      "./node_modules/pdfkit/js/**/*",
      "./node_modules/noto-sans-cjk-jp/fonts/NotoSansCJKjp-Regular.woff",
    ],
  },
};

export default nextConfig;
