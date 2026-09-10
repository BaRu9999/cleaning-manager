import { requireMember } from "@/lib/auth/guard";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProfileForm } from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await requireMember();

  return (
    <div>
      <PageHeader title="プロフィール" back={{ href: "/today", label: "今日の清掃" }} />
      <ProfileForm
        displayName={me.displayName}
        phone={me.phone}
        email={me.email}
        role={me.role}
        position={me.position}
      />
    </div>
  );
}
