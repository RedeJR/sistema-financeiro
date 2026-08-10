import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarDespesasPagas, type FiltrosDespesasPagas } from "../consulta";
import { BotaoImprimir } from "./botao-imprimir";

function formatarData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

export default async function RelatorioDespesasPagasPage({
  searchParams,
}: {
  searchParams: Promise<FiltrosDespesasPagas>;
}) {
  await exigirPermissao("DESPESAS_PAGAS", "visualizar");

  const filtros = await searchParams;
  const contas = await buscarDespesasPagas(filtros);
  const total = contas.reduce((soma, c) => soma + Number(c.valor), 0);
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Relatório de Despesas Pagas</h1>
        <BotaoImprimir />
      </div>

      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">Relatório de Despesas Pagas</h1>
        <p className="text-xs text-foreground/60">Gerado em {geradoEm}</p>
      </div>

      <p className="text-sm text-foreground/60">
        {contas.length} despesa{contas.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
      </p>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/20">
            <th className="px-2 py-1.5 text-left font-medium">Pago em</th>
            <th className="px-2 py-1.5 text-left font-medium">Posto</th>
            <th className="px-2 py-1.5 text-left font-medium">Fornecedor</th>
            <th className="px-2 py-1.5 text-left font-medium">Plano de contas</th>
            <th className="px-2 py-1.5 text-left font-medium">Banco</th>
            <th className="px-2 py-1.5 text-left font-medium">Observação</th>
            <th className="px-2 py-1.5 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {contas.map((c) => (
            <tr key={c.id} className="border-b border-black/10">
              <td className="px-2 py-1.5">
                {formatarData(c.dataPagamento)}
                {c.avulsa && " (avulsa)"}
              </td>
              <td className="px-2 py-1.5">{c.posto.nome}</td>
              <td className="px-2 py-1.5">{c.fornecedor.nome}</td>
              <td className="px-2 py-1.5">{c.planoConta.nome}</td>
              <td className="px-2 py-1.5">{c.bancoPagamento?.nome ?? "—"}</td>
              <td className="px-2 py-1.5">{c.descricao ?? "—"}</td>
              <td className="px-2 py-1.5 text-right">{formatarMoeda(c.valor.toString())}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black/30 font-medium">
            <td colSpan={6} className="px-2 py-2 text-right">
              Total
            </td>
            <td className="px-2 py-2 text-right">{formatarMoeda(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
