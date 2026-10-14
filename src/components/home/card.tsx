import { cn } from "@/lib/utils";

/** Shared card chrome for the home widgets. */
export function HomeCard({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-surface shadow-sm", className)}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-2 sm:px-5">
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold">{title}</h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 px-4 pb-4 sm:px-5">{children}</div>
    </section>
  );
}
