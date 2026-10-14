import { Suspense } from "react";
import { PageLoader } from "@/components/ui/misc";
import { SearchResults } from "@/components/search/search-results";

export const metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SearchResults />
    </Suspense>
  );
}
