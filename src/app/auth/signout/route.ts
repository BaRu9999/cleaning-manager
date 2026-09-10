import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const base = new URL(request.url).origin || getSiteUrl();
  return NextResponse.redirect(new URL("/login", base), { status: 303 });
}
