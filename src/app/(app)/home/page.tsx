import { Suspense } from "react";
import { PageLoader } from "@/components/ui/misc";
import { HomeView } from "@/components/home/home-view";

export const metadata = { title: "Home" };

export default function HomePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <HomeView />
    </Suspense>
  );
}
