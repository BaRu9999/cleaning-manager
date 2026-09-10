import type { Role } from "@/config/constants";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  /** admin のみ表示 */
  adminOnly?: boolean;
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
  { href: "/admin/areas", label: "カテゴリー・場所", short: "場所", adminOnly: true },
  { href: "/admin/staff", label: "スタッフ管理", short: "人員", adminOnly: true },
  { href: "/admin/settings", label: "店舗設定", short: "設定", adminOnly: true },
  { href: "/admin/notifications", label: "Slack通知設定", short: "通知", adminOnly: true },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => role === "admin" || !item.adminOnly);
}

export function bottomTabsForRole(role: Role): NavItem[] {
  return navItemsForRole(role)
    .filter((i) => typeof i.tab === "number")
    .sort((a, b) => (a.tab ?? 99) - (b.tab ?? 99))
    .slice(0, 5);
}
