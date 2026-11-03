import { getLiffId } from "@/lib/env";
import { LiffBoot } from "@/components/liff/LiffBoot";

export const dynamic = "force-dynamic";

export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-100">
      <LiffBoot liffId={getLiffId()}>{children}</LiffBoot>
    </div>
  );
}
