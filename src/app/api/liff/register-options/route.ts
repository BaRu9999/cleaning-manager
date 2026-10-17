/** LIFF スタッフ登録の選択肢（在籍スタッフ一覧）。ID トークン検証済みのユーザーのみ。 */
import { NextResponse } from "next/server";
import { getLiffContext } from "@/lib/liff/session";
import { liffErrorResponse } from "@/lib/liff/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { admin, staff } = await getLiffContext(request);
    if (staff) {
      // 既に連携済み
      return NextResponse.json({ ok: true, alreadyLinked: true, staff: { staffId: staff.staffId, displayName: staff.displayName } });
    }
    // 未連携スタッフのみ（既に他 LINE と紐付いている staff は除外）
    const { data: linked } = await admin
      .from("staff_line_accounts")
      .select("staff_id")
      .eq("is_active", true);
    const linkedIds = new Set((linked ?? []).map((r) => String((r as { staff_id: string }).staff_id)));

    const { data: users } = await admin
      .from("users")
      .select("id, display_name, position, job_title")
      .eq("active", true)
      .order("display_name");

    const options = ((users ?? []) as Record<string, unknown>[])
      .filter((u) => !linkedIds.has(String(u.id)))
      .map((u) => ({
        staffId: String(u.id),
        displayName: String(u.display_name ?? ""),
        position: (u.position as string | null) ?? null,
        jobTitle: String(u.job_title ?? "staff"),
      }));

    return NextResponse.json({ ok: true, alreadyLinked: false, options });
  } catch (e) {
    return liffErrorResponse(e);
  }
}
