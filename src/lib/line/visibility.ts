/**
 * 役職（job_title）× 閲覧可能カテゴリーに応じて、通知に含めるタスクを絞る純関数。
 *
 *   staff           … 自分が担当するタスクのみ（他人の担当は一切見せない）
 *   cleaning_leader … 原則すべて（visible_category_ids 指定時はその範囲）
 *   hall_leader     … 既定はホール系（side = hall / other）。管理画面で
 *                     visible_category_ids を指定すると「全清掃閲覧可能」等に変更可
 *   manager         … すべて ＋ 管理サマリ（未実施 / 期限超過 / 担当未設定）
 */

import type { CategorySide, JobTitle } from "@/config/constants";

export interface VisibilityUser {
  id: string;
  jobTitle: JobTitle;
  /** null = 役職の既定範囲 / 配列 = そのカテゴリーに限定 */
  visibleCategoryIds: string[] | null;
}

export interface VisibilityTask {
  assigneeId: string | null;
  categoryId: string | null;
}

/** その利用者の通知に含めるべきタスクだけを返す */
export function visibleTasksForUser<T extends VisibilityTask>(
  user: VisibilityUser,
  tasks: T[],
  sideByCategoryId: Map<string, CategorySide>,
): T[] {
  if (user.jobTitle === "staff") {
    return tasks.filter((t) => t.assigneeId != null && t.assigneeId === user.id);
  }

  // 明示的な閲覧カテゴリー指定があれば最優先（ホールリーダーの範囲変更など）
  if (user.visibleCategoryIds && user.visibleCategoryIds.length > 0) {
    const allow = new Set(user.visibleCategoryIds);
    return tasks.filter((t) => t.categoryId != null && allow.has(t.categoryId));
  }

  if (user.jobTitle === "hall_leader") {
    return tasks.filter((t) => {
      const side: CategorySide = t.categoryId
        ? (sideByCategoryId.get(t.categoryId) ?? "other")
        : "other";
      return side === "hall" || side === "other";
    });
  }

  // cleaning_leader / manager … すべて
  return tasks;
}

/** 管理サマリ（未実施 / 期限超過 / 担当未設定）を通知に付けるべき役職か */
export function wantsManagementView(jobTitle: JobTitle): boolean {
  return jobTitle === "manager" || jobTitle === "cleaning_leader";
}

/** 全スケジュール（担当・時間・ステータス）を見せる役職か（= staff 以外） */
export function wantsFullSchedule(jobTitle: JobTitle): boolean {
  return jobTitle !== "staff";
}
