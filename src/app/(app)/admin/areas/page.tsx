import { requireAdmin } from "@/lib/auth/guard";
import { listAreas, listCategories } from "@/lib/data/masters";
import { PageHeader } from "@/components/layout/PageHeader";
import { AreaManager } from "@/components/master/AreaManager";

export const dynamic = "force-dynamic";

export default async function AreasPage() {
  await requireAdmin();
  const [categories, areas] = await Promise.all([
    listCategories({ includeInactive: true }),
    listAreas({ includeInactive: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="カテゴリー・清掃場所"
        description="清掃場所をカテゴリーで分類します。清掃項目マスタの「場所」で使います。名称はその場で編集・保存されます。"
      />
      <AreaManager
        categories={categories.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
        areas={areas.map((a) => ({
          id: a.id,
          categoryId: a.categoryId,
          name: a.name,
          active: a.active,
        }))}
      />
    </div>
  );
}
