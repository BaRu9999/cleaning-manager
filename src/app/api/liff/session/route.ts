/** LIFF 起動時のブートストラップ。本人（LINE）と連携スタッフの有無を返す。 */
import { NextResponse } from "next/server";
import { getLiffContext } from "@/lib/liff/session";
import { liffErrorResponse } from "@/lib/liff/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { line, staff } = await getLiffContext(request);
    return NextResponse.json({
      ok: true,
      line: { userId: line.userId, displayName: line.displayName },
      staff: staff
        ? {
            staffId: staff.staffId,
            displayName: staff.displayName,
            jobTitle: staff.jobTitle,
            position: staff.position,
          }
        : null,
    });
  } catch (e) {
    return liffErrorResponse(e);
  }
}
