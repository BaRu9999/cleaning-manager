/**
 * LIFF スタッフ登録: 検証済みの LINE userId と staff を紐付ける。
 * body: { staffId } または { staffCode }
 * userId は必ずサーバーでトークン検証した値を使う（クライアント値は信用しない）。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLiffContext } from "@/lib/liff/session";
import { liffErrorResponse } from "@/lib/liff/respond";
import { linkStaffLineAccount } from "@/lib/line/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ staffId: z.string().uuid() }),
  z.object({ staffCode: z.string().trim().min(3).max(16) }),
]);

export async function POST(request: Request): Promise<Response> {
  try {
    const { line, staff, admin } = await getLiffContext(request);
    if (staff) {
      return NextResponse.json({ ok: true, staff: { staffId: staff.staffId, displayName: staff.displayName } });
    }

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "staffId または staffCode が必要です" }, { status: 400 });
    }

    let staffId: string;
    if ("staffId" in parsed.data) {
      staffId = parsed.data.staffId;
    } else {
      const code = parsed.data.staffCode.toUpperCase();
      const { data: u } = await admin
        .from("users")
        .select("id")
        .eq("staff_code", code)
        .eq("active", true)
        .maybeSingle();
      if (!u) {
        return NextResponse.json({ ok: false, error: "スタッフコードが見つかりません" }, { status: 404 });
      }
      staffId = String((u as { id: string }).id);
    }

    // 対象スタッフが在籍中か
    const { data: target } = await admin
      .from("users")
      .select("id, display_name, active")
      .eq("id", staffId)
      .maybeSingle();
    if (!target || (target as { active: boolean }).active === false) {
      return NextResponse.json({ ok: false, error: "対象のスタッフが見つかりません" }, { status: 404 });
    }

    const res = await linkStaffLineAccount(admin, {
      lineUserId: line.userId,
      staffId,
      lineDisplayName: line.displayName,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      staff: {
        staffId,
        displayName: String((target as { display_name: string }).display_name),
      },
    });
  } catch (e) {
    return liffErrorResponse(e);
  }
}
