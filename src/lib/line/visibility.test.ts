import { describe, expect, it } from "vitest";
import type { CategorySide } from "@/config/constants";
import { visibleTasksForUser, type VisibilityTask } from "./visibility";

const sideMap = new Map<string, CategorySide>([
  ["hall", "hall"],
  ["kitchen", "kitchen"],
  ["backyard", "backyard"],
  ["other", "other"],
]);

const tasks: (VisibilityTask & { name: string })[] = [
  { name: "テーブル拭き", assigneeId: "u1", categoryId: "hall" },
  { name: "レジ周辺", assigneeId: "u2", categoryId: "hall" },
  { name: "シンク", assigneeId: "u1", categoryId: "kitchen" },
  { name: "排水口", assigneeId: null, categoryId: "kitchen" },
  { name: "店頭", assigneeId: "u3", categoryId: "other" },
  { name: "ストック棚", assigneeId: "u2", categoryId: "backyard" },
];

describe("visibleTasksForUser", () => {
  it("staff は自分の担当のみ", () => {
    const got = visibleTasksForUser(
      { id: "u1", jobTitle: "staff", visibleCategoryIds: null },
      tasks,
      sideMap,
    );
    expect(got.map((t) => t.name)).toEqual(["テーブル拭き", "シンク"]);
  });

  it("cleaning_leader は全部", () => {
    const got = visibleTasksForUser(
      { id: "l1", jobTitle: "cleaning_leader", visibleCategoryIds: null },
      tasks,
      sideMap,
    );
    expect(got).toHaveLength(6);
  });

  it("hall_leader は既定でホール系（hall / other）", () => {
    const got = visibleTasksForUser(
      { id: "h1", jobTitle: "hall_leader", visibleCategoryIds: null },
      tasks,
      sideMap,
    );
    expect(got.map((t) => t.name)).toEqual(["テーブル拭き", "レジ周辺", "店頭"]);
  });

  it("hall_leader に visible_category_ids を指定すると範囲変更（全清掃閲覧可能 = 全カテゴリー指定）", () => {
    const got = visibleTasksForUser(
      {
        id: "h1",
        jobTitle: "hall_leader",
        visibleCategoryIds: ["hall", "kitchen", "backyard", "other"],
      },
      tasks,
      sideMap,
    );
    expect(got).toHaveLength(6);
  });

  it("manager は全部", () => {
    const got = visibleTasksForUser(
      { id: "m1", jobTitle: "manager", visibleCategoryIds: null },
      tasks,
      sideMap,
    );
    expect(got).toHaveLength(6);
  });
});
