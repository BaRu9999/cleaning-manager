"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, ROLE_LABELS, type Role } from "@/config/constants";
import { cn } from "@/lib/cn";
import { bottomTabsForRole, navItemsForRole } from "./nav-items";

export function AppShell({
  role,
  displayName,
  storeName,
  children,
}: {
  role: Role;
  displayName: string;
  storeName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = navItemsForRole(role);
  const tabs = bottomTabsForRole(role);

  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="tap rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="メニュー"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <div className="leading-tight">
              <div className="text-sm font-bold text-slate-800">{storeName}</div>
              <div className="hidden text-[11px] text-slate-400 sm:block">{APP_NAME}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/profile"
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] font-bold",
                role === "admin"
                  ? "border-slate-300 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-100 text-slate-600",
              )}
              title="プロフィール"
            >
              {ROLE_LABELS[role]}
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="tap rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
                title={displayName}
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>

        {/* PC ナビ */}
        <nav className="mx-auto hidden max-w-5xl flex-wrap gap-1 px-3 pb-2 lg:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
                isActive(item.href)
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* モバイル展開メニュー */}
        {menuOpen ? (
          <nav className="grid grid-cols-2 gap-1 border-t border-slate-100 px-3 py-2 lg:hidden">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "tap flex items-center rounded-lg px-3 py-2.5 text-sm font-bold",
                  isActive(item.href)
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50 text-slate-700",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 pb-24 lg:pb-8">{children}</main>

      {/* モバイル下部タブ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white lg:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-[11px] font-bold",
              isActive(item.href) ? "text-slate-900" : "text-slate-400",
            )}
          >
            <span
              className={cn(
                "h-1 w-6 rounded-full",
                isActive(item.href) ? "bg-slate-900" : "bg-transparent",
              )}
            />
            {item.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
