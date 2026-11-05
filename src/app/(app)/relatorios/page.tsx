import { exigirPermissaoQualquer } from "@/lib/auth";
import type { FiltrosRelatorio } from "./consulta";
import { RelatorioContas } from "./relatorio-contas";

export const metadata = { title: "Relatórios" };

// Relatório de contas (pagas e a pagar). A tela em si é a mesma de Contas Pagas — ver relatorio-contas.tsx.
export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<FiltrosRelatorio> }) {
  await exigirPermissaoQualquer(["CONTAS_A_PAGAR", "DESPESAS_PAGAS"], "visualizar");
  return <RelatorioContas modo="relatorios" filtros={await searchParams} />;
}
