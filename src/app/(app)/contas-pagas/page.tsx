import { exigirPermissao } from "@/lib/auth";
import type { FiltrosRelatorio } from "@/app/(app)/relatorios/consulta";
import { RelatorioContas } from "@/app/(app)/relatorios/relatorio-contas";

export const metadata = { title: "Contas Pagas" };

// Mesma tela do relatório de contas (relatorios/relatorio-contas.tsx), com a situação sempre fixa em "paga" —
// é isso que diferencia esse módulo do Relatórios (que mostra pagas e a pagar).
export default async function ContasPagasPage({ searchParams }: { searchParams: Promise<FiltrosRelatorio> }) {
  await exigirPermissao("CONTAS_PAGAS", "visualizar");
  return <RelatorioContas modo="contas-pagas" filtros={await searchParams} />;
}
