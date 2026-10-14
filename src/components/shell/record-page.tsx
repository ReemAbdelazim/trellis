"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageLoader } from "@/components/ui/misc";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function NotFoundNotice({ what, backHref, backLabel }: { what: string; backHref: string; backLabel: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="font-medium">This {what} doesn&apos;t exist or you don&apos;t have access to it.</p>
      <p className="mt-1 text-sm text-muted">It may have been deleted, or it&apos;s private.</p>
      <Link href={backHref} className="mt-3 inline-block text-sm text-accent hover:underline">
        {backLabel}
      </Link>
    </div>
  );
}

function Resolve({
  render,
  what,
  backHref,
  backLabel,
}: {
  render: (id: string) => React.ReactNode;
  what: string;
  backHref: string;
  backLabel: string;
}) {
  const id = useSearchParams().get("id") ?? "";
  if (!UUID.test(id)) return <NotFoundNotice what={what} backHref={backHref} backLabel={backLabel} />;
  return render(id);
}

/** Page for a single record addressed as `?id=<uuid>` (static hosting has no dynamic paths). */
export function RecordPage(props: {
  render: (id: string) => React.ReactNode;
  what: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Resolve {...props} />
    </Suspense>
  );
}
