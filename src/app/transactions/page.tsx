import { redirect } from "next/navigation";
import { getPortfolioTransactionsPath } from "@/lib/portfolio/paths";
import { getPortfolioSelection } from "@/lib/portfolio/selection";

export const dynamic = "force-dynamic";

type TransactionsRedirectPageProps = {
  searchParams?: Promise<{
    edit?: string | string[];
  }>;
};

function appendSearchParams(
  path: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else if (value != null) {
      params.set(key, value);
    }
  }

  const queryString = params.toString();

  return queryString ? `${path}?${queryString}` : path;
}

export default async function TransactionsRedirectPage({
  searchParams,
}: TransactionsRedirectPageProps) {
  const { selectedPortfolio } = await getPortfolioSelection();
  const resolvedSearchParams = (await searchParams) ?? {};

  redirect(
    appendSearchParams(getPortfolioTransactionsPath(selectedPortfolio.key), resolvedSearchParams),
  );
}
