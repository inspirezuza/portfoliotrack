import { redirect } from "next/navigation";
import { PortfolioManagementPanel } from "@/components/portfolio-management-panel";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getPortfolioSelection, isAllPortfoliosSelection } from "@/lib/portfolio/selection";

export const dynamic = "force-dynamic";

export default async function PortfoliosPage() {
  const isAdmin = await isAdminAuthenticated();

  if (!isAdmin) {
    redirect("/login?next=/portfolios");
  }

  const { portfolios, selectedPortfolio } = await getPortfolioSelection();
  const selectedPortfolioId = isAllPortfoliosSelection(selectedPortfolio)
    ? portfolios.find((portfolio) => portfolio.isDefault)?.id ?? portfolios[0]?.id ?? 0
    : selectedPortfolio.id;

  return (
    <section className="workstation-page">
      <div className="workstation-topbar">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Portfolios</h1>
          <p>Create, rename, choose a default, or delete a portfolio.</p>
        </div>
      </div>

      <PortfolioManagementPanel
        initialPortfolios={portfolios}
        selectedPortfolioId={selectedPortfolioId}
      />
    </section>
  );
}
