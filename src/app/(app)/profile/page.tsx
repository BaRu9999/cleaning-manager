import { requireMember } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileForm } from "@/components/ProfileForm";
import { LineLinkCard } from "@/components/LineLinkCard";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await requireMember();

  const supabase = await createClient();
  const { data: acct } = await supabase
    .from("staff_line_accounts")
    .select("line_display_name, is_active")
    .eq("staff_id", me.id)
    .maybeSingle();
  const linked = !!acct && (acct as { is_active: boolean }).is_active;

  return (
    <div className="space-y-4">
      <PageHeader title="プロフィール" back={{ href: "/today", label: "今日の清掃" }} />
      <ProfileForm
        displayName={me.displayName}
        phone={me.phone}
        email={me.email}
        role={me.role}
        position={me.position}
      />
      <LineLinkCard
        linked={linked}
        lineDisplayName={
          linked ? ((acct as { line_display_name: string | null }).line_display_name ?? null) : null
        }
        staffCode={me.staffCode}
      />
    </div>
  );
}
