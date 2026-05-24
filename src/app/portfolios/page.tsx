import { redirect } from "next/navigation";
import { PortfolioManagementPanel } from "@/components/portfolio-management-panel";
import { isAdminAuthenticated } from "@/lib/auth/admin";
import { getPortfolioSelection } from "@/lib/portfolio/selection";

export const dynamic = "force-dynamic";

export default async function PortfoliosPage() {
  const isAdmin = await isAdminAuthenticated();

  if (!isAdmin) {
    redirect("/login?next=/portfolios");
  }

  const { portfolios, selectedPortfolio } = await getPortfolioSelection();

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
        selectedPortfolioId={selectedPortfolio.id}
      />
    </section>
  );
}
