import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { getMaster } from "@/lib/data/masters";
import {
  loadMasterFormOptions,
  toMasterFormInitial,
} from "@/lib/data/master-form";
import { PageHeader } from "@/components/layout/PageHeader";
import { MasterForm } from "@/components/master/MasterForm";

export const dynamic = "force-dynamic";

export default async function EditMasterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [master, options] = await Promise.all([
    getMaster(id),
    loadMasterFormOptions(),
  ]);
  if (!master) notFound();

  return (
    <div>
      <PageHeader
        title="清掃項目を編集"
        description={master.name}
        back={{ href: "/admin/master", label: "清掃項目マスタ" }}
      />
      <MasterForm initial={toMasterFormInitial(master)} options={options} />
    </div>
  );
}
