import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { getProfile, getSessionUser } from "@/lib/auth/guard";
import { getStoreSettings } from "@/lib/data/settings";
import { AppShell } from "@/components/layout/AppShell";
import { ConfigNotice } from "@/components/layout/ConfigNotice";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabaseEnv()) {
    return <ConfigNotice kind="env" />;
  }

  const session = await getSessionUser();
  if (!session) redirect("/login");

  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/pending");

  const store = await getStoreSettings();

  return (
    <AppShell
      role={profile.role}
      jobTitle={profile.jobTitle}
      displayName={profile.displayName}
      storeName={store.storeName}
    >
      {children}
    </AppShell>
  );
}
