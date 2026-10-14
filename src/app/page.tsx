"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { routes } from "@/lib/routes";
import { PageLoader } from "@/components/ui/misc";

/** Entry point: the app gate on /home sends signed-out visitors to /login. */
export default function Root() {
  const router = useRouter();
  useEffect(() => router.replace(routes.home), [router]);
  return (
    <div className="h-dvh">
      <PageLoader />
    </div>
  );
}
