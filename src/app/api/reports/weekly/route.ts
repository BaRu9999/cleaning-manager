/**
 * 週次清掃レポートPDF。管理者 または 清掃リーダーのみ（requireReportViewer）。
 * クエリ: ?date=YYYY-MM-DD（その日を含む週。省略時は今週）
 */
import { requireReportViewer } from "@/lib/auth/guard";
import { getStatTasks } from "@/lib/data/stats-data";
import { getStoreSettings } from "@/lib/data/settings";
import { jstDateString, formatInstantJst } from "@/lib/date/jst";
import { getWeekRange } from "@/lib/reports/period";
import { buildCleaningReport } from "@/lib/reports/build-report";
import { renderCleaningReportPdf } from "@/lib/reports/render-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  await requireReportViewer();

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const base = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : jstDateString();
  const period = getWeekRange(base);

  const [tasks, store] = await Promise.all([
    getStatTasks(period.from, period.to),
    getStoreSettings(),
  ]);

  const data = buildCleaningReport({
    tasks,
    period,
    periodType: "week",
    storeName: store.storeName,
    generatedAtLabel: formatInstantJst(new Date().toISOString()) ?? "",
  });

  const pdf = await renderCleaningReportPdf(data);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cleaning-weekly-${period.from}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
