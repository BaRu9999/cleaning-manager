"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    liff?: any;
  }
}

interface LiffState {
  ready: boolean;
  error: string | null;
  /** x-line-id-token を付けて /api/liff/* を叩く */
  liffFetch: (path: string, init?: RequestInit) => Promise<Response>;
  openExternal: (url: string) => void;
}

const Ctx = createContext<LiffState | null>(null);

export function useLiff(): LiffState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLiff must be used within <LiffBoot>");
  return v;
}

const SDK_SRC = "https://static.line-scdn.net/liff/edge/2/sdk.js";

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.liff) return resolve();
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("LIFF SDK の読み込みに失敗しました")));
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("LIFF SDK の読み込みに失敗しました"));
    document.head.appendChild(s);
  });
}

export function LiffBoot({
  liffId,
  children,
}: {
  liffId: string | null;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!liffId) throw new Error("LIFF ID が未設定です（NEXT_PUBLIC_LIFF_ID）");
        await loadSdk();
        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) {
          window.liff.login();
          return; // リダイレクトされる
        }
        const token: string | null = window.liff.getIDToken?.() ?? null;
        if (!token) throw new Error("ID トークンを取得できませんでした。LINE で開き直してください。");
        if (cancelled) return;
        setIdToken(token);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "初期化に失敗しました");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId]);

  const liffFetch = useCallback(
    (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (idToken) headers.set("x-line-id-token", idToken);
      if (window.liff?.getAccessToken) {
        const at = window.liff.getAccessToken();
        if (at) headers.set("x-line-access-token", at);
      }
      return fetch(path, { ...init, headers });
    },
    [idToken],
  );

  const openExternal = useCallback((url: string) => {
    if (window.liff?.openWindow) window.liff.openWindow({ url, external: true });
    else window.open(url, "_blank");
  }, []);

  const value = useMemo<LiffState>(
    () => ({ ready, error, liffFetch, openExternal }),
    [ready, error, liffFetch, openExternal],
  );

  return (
    <Ctx.Provider value={value}>
      {error ? (
        <div className="mx-auto max-w-sm p-6 text-center">
          <p className="text-base font-bold text-red-600">エラー</p>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      ) : !ready ? (
        <div className="flex min-h-dvh items-center justify-center text-sm text-slate-400">
          読み込み中…
        </div>
      ) : (
        children
      )}
    </Ctx.Provider>
  );
}
