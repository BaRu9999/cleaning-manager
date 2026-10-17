import { requireAdmin } from "@/lib/auth/guard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { ShiftImportWizard } from "@/components/admin/ShiftImportWizard";

export const dynamic = "force-dynamic";

export default async function ShiftImportPage() {
  await requireAdmin();

  return (
    <div className="space-y-4">
      <PageHeader
        title="シフト取込"
        description="タニタ柏シフトの「取込用」CSVから、出勤スタッフとホール／キッチンの担当を自動反映します。"
        back={{ href: "/admin/assignments", label: "出勤・清掃割当" }}
      />
      <Alert tone="info">
        role 列の <code className="text-xs">H</code> はホール、<code className="text-xs">K</code>{" "}
        はキッチン、<code className="text-xs">H・K</code> は兼務として取り込みます。
        兼務のスタッフは「出勤・清掃割当」の自動割当でホール・キッチンどちらのタスクにも割り当てられます。
        アプリ未登録のスタッフ（LINE通知の対象外の一般スタッフなど）は、氏名から
        「シフト連携のみ」のスタッフとして自動登録され、出勤登録・清掃の自動割当に使われます
        （ログインや LINE 通知は利用しません）。
      </Alert>
      <ShiftImportWizard />
    </div>
  );
}
