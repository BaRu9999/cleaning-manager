import { requireAdmin } from "@/lib/auth/guard";
import { loadMasterFormOptions } from "@/lib/data/master-form";
import { PageHeader } from "@/components/layout/PageHeader";
import { MasterForm } from "@/components/master/MasterForm";

export const dynamic = "force-dynamic";

export default async function NewMasterPage() {
  await requireAdmin();
  const options = await loadMasterFormOptions();

  return (
    <div>
      <PageHeader
        title="清掃項目を登録"
        back={{ href: "/admin/master", label: "清掃項目マスタ" }}
      />
      <MasterForm initial={null} options={options} />
    </div>
  );
}
