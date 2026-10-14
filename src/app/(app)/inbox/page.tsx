import { Suspense } from "react";
import { PageLoader } from "@/components/ui/misc";
import { InboxView } from "@/components/inbox/inbox-view";

export const metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <InboxView />
    </Suspense>
  );
}
