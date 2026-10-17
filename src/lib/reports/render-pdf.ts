/** サーバー専用（Node.js runtime）。CleaningReportData を PDF バイト列にする。 */

import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { CleaningReportDocument } from "./pdf-document";
import type { CleaningReportData } from "./build-report";

export async function renderCleaningReportPdf(data: CleaningReportData): Promise<Buffer> {
  // CleaningReportDocument は <Document> を返すラッパーのため、renderToBuffer の厳密な
  // ReactElement<DocumentProps> 型とは構造的に一致しない（DocumentProps は非公開の名前空間型）。
  // 実行時には Document ルートを正しく解決できるため、ここでのみ型を合わせてキャストする。
  const element = React.createElement(CleaningReportDocument, { data });
  return renderToBuffer(element as unknown as Parameters<typeof renderToBuffer>[0]);
}
