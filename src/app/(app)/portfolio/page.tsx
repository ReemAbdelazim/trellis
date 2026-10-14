"use client";

import { RecordPage } from "@/components/shell/record-page";
import { PortfolioDetail } from "@/components/portfolios/portfolio-detail";
import { routes } from "@/lib/routes";

export default function Page() {
  return (
    <RecordPage
      what="portfolio"
      backHref={routes.portfolios}
      backLabel="All portfolios"
      render={(id) => <PortfolioDetail key={id} portfolioId={id} />}
    />
  );
}
