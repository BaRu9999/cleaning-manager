import type { JobTitle, Role } from "@/config/constants";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  /** admin のみ表示（cleaningLeaderOk=true なら清掃リーダーにも表示） */
  adminOnly?: boolean;
  /** adminOnly と併用。role が staff でも job_title=cleaning_leader なら表示する */
  cleaningLeaderOk?: boolean;
  /** モバイル下部タブに出す（表示順） */
  tab?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "今日の清掃", short: "今日", tab: 1 },
  { href: "/history", label: "清掃履歴", short: "履歴", tab: 5 },
  { href: "/admin", label: "管理ダッシュボード", short: "管理", adminOnly: true, tab: 2 },
  { href: "/admin/master", label: "清掃項目マスタ", short: "項目", adminOnly: true, tab: 3 },
  { href: "/admin/calendar", label: "清掃カレンダー", short: "暦", adminOnly: true, tab: 4 },
  { href: "/admin/analysis", label: "清掃漏れ分析", short: "分析", adminOnly: true },
  { href: "/admin/analysis/time", label: "実績時間分析", short: "時間", adminOnly: true },
  { href: "/admin/assignments", label: "出勤・清掃割当", short: "割当", adminOnly: true },
  { href: "/admin/shift-import", label: "シフト取込", short: "シフト", adminOnly: true },
  { href: "/admin/equipment-issues", label: "設備異常", short: "設備", adminOnly: true },
  { href: "/admin/areas", label: "カテゴリー・場所", short: "場所", adminOnly: true },
  { href: "/admin/staff", label: "スタッフ管理", short: "人員", adminOnly: true },
  { href: "/admin/settings", label: "店舗設定", short: "設定", adminOnly: true },
  { href: "/admin/notifications", label: "通知設定", short: "通知", adminOnly: true },
  {
    href: "/reports",
    label: "完了レポート",
    short: "レポート",
    adminOnly: true,
    cleaningLeaderOk: true,
  },
];

function canSee(item: NavItem, role: Role, jobTitle: JobTitle): boolean {
  if (!item.adminOnly) return true;
  if (role === "admin") return true;
  return item.cleaningLeaderOk === true && jobTitle === "cleaning_leader";
}

export function navItemsForRole(role: Role, jobTitle: JobTitle = "staff"): NavItem[] {
  return NAV_ITEMS.filter((item) => canSee(item, role, jobTitle));
}

export function bottomTabsForRole(role: Role, jobTitle: JobTitle = "staff"): NavItem[] {
  return navItemsForRole(role, jobTitle)
    .filter((i) => typeof i.tab === "number")
    .sort((a, b) => (a.tab ?? 99) - (b.tab ?? 99))
    .slice(0, 5);
}
