import { Skeleton, StatGridSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <StatGridSkeleton count={6} />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
