import Link from "next/link";
import { exigirPermissao } from "@/lib/auth";
import { paraLista } from "@/lib/filtro-multiplo";
import { formatarMoeda } from "@/lib/dinheiro";
import { hojeUTC } from "@/lib/datas";
import { buscarVendasAPrazo, faltaReceber, SITUACOES } from "@/lib/vendasAPrazo/consulta";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { OrientacaoImpressao } from "@/components/ui/orientacao-impressao";
import { BotaoImprimir } from "../botao-imprimir";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarIso(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function periodo(de?: string, ate?: string): string | undefined {
  if (!de && !ate) return undefined;
  return `${de ? formatarIso(de) : "…"} a ${ate ? formatarIso(ate) : "…"}`;
}

export const metadata = { title: "Vendas a Prazo - Relatório" };

// Mesmo desenho do relatório de Combustíveis a Pagar: resumo por posto em cima e, abaixo, uma tabela por posto.
export default async function RelatorioVendasAPrazoPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; q?: string; situacao?: string; de?: string; ate?: string; pde?: string; pate?: string }>;
}) {
  await exigirPermissao("VENDAS_A_PRAZO", "visualizar");

  const { postoId, q, situacao, de, ate, pde, pate } = await searchParams;
  const { vendas, situacaoFiltro } = await buscarVendasAPrazo({ postoIds: paraLista(postoId), q, situacao, de, ate, pde, pate }, hojeUTC());
  const situacaoRotulo = (s: string) => SITUACOES.find((x) => x.valor === s)!.rotulo.split(" (")[0];

  const postos = [...new Set(vendas.map((v) => v.posto.nome))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((nome) => {
      const doPosto = vendas.filter((v) => v.posto.nome === nome);
      return {
        nome,
        vendas: doPosto,
        total: doPosto.reduce((s, v) => s + Number(v.valor), 0),
        recebido: doPosto.reduce((s, v) => s + v.resumo.recebido, 0),
        falta: doPosto.reduce((s, v) => s + faltaReceber(v), 0),
      };
    });
  const total = postos.reduce((s, p) => s + p.total, 0);
  const recebido = postos.reduce((s, p) => s + p.recebido, 0);
  const falta = postos.reduce((s, p) => s + p.falta, 0);
  const periodoAbast = periodo(pde, pate);
  const periodoPgto = periodo(de, ate);

  return (
    <div className="space-y-4">
      <OrientacaoImpressao />
      <div className="flex items-center justify-between print:hidden">
        <div>
          <Link href="/vendas-a-prazo" className="text-sm text-foreground/60 underline">
            ← Voltar pra Vendas a Prazo
          </Link>
          <h2 className="text-xl font-semibold">Relatório de Vendas a Prazo</h2>
        </div>
        <BotaoImprimir />
      </div>

      <CabecalhoImpressao
        titulo="Relatório de Vendas a Prazo"
        detalhes={[
          { rotulo: "Cliente", valor: q?.trim() },
          { rotulo: "Período do abastecimento", valor: periodoAbast },
          { rotulo: "Pagamento", valor: periodoPgto },
          { rotulo: "Situação", valor: situacaoFiltro ? situacaoRotulo(situacaoFiltro) : undefined },
        ]}
      />

      <p className="text-sm text-foreground/60">
        {vendas.length} venda{vendas.length === 1 ? "" : "s"} em {postos.length} posto{postos.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
        {periodoAbast && <> · abastecimento {periodoAbast}</>}
        {periodoPgto && <> · pagamento {periodoPgto}</>}
        {situacaoFiltro && <> · {situacaoRotulo(situacaoFiltro).toLowerCase()}</>}
      </p>

      {postos.length > 0 && (
        <table className="w-full border-collapse text-sm [break-inside:avoid]">
          <thead>
            <tr className="bg-black/[0.06]">
              <th className="px-2 py-1.5 text-left text-[13px] font-semibold uppercase">Resumo por posto</th>
              <th className="px-2 py-1.5 text-right font-medium">Vendas</th>
              <th className="px-2 py-1.5 text-right font-medium">Valor</th>
              <th className="px-2 py-1.5 text-right font-medium">Recebido</th>
              <th className="px-2 py-1.5 text-right font-medium">Falta receber</th>
            </tr>
          </thead>
          <tbody>
            {postos.map((p) => (
              <tr key={p.nome} className="border-b border-black/10">
                <td className="px-2 py-1.5">{p.nome}</td>
                <td className="px-2 py-1.5 text-right">{p.vendas.length}</td>
                <td className="px-2 py-1.5 text-right">{formatarMoeda(p.total)}</td>
                <td className="px-2 py-1.5 text-right">{formatarMoeda(p.recebido)}</td>
                <td className="px-2 py-1.5 text-right">{formatarMoeda(p.falta)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black/30 font-semibold">
              <td className="px-2 py-2">Total geral</td>
              <td className="px-2 py-2 text-right">{vendas.length}</td>
              <td className="px-2 py-2 text-right">{formatarMoeda(total)}</td>
              <td className="px-2 py-2 text-right">{formatarMoeda(recebido)}</td>
              <td className="px-2 py-2 text-right">{formatarMoeda(falta)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {postos.map((p) => (
        <table key={p.nome} className="w-full border-collapse text-sm [break-inside:avoid]">
          <thead>
            <tr className="bg-black/[0.06]">
              <th colSpan={6} className="px-2 py-1.5 text-left text-[13px] font-semibold uppercase">
                {p.nome}
              </th>
            </tr>
            <tr className="border-b border-black/20">
              <th className="px-2 py-1.5 text-left font-medium">Cliente</th>
              <th className="px-2 py-1.5 text-left font-medium">Abastecimento</th>
              <th className="px-2 py-1.5 text-left font-medium">Pagamento</th>
              <th className="px-2 py-1.5 text-left font-medium">Situação</th>
              <th className="px-2 py-1.5 text-left font-medium">Extrato</th>
              <th className="px-2 py-1.5 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {p.vendas.map((v) => (
              <tr key={v.id} className="border-b border-black/10 align-top">
                <td className="px-2 py-1.5">
                  {v.cliente}
                  {v.observacao && <span className="block text-[8px] text-gray-500">{v.observacao}</span>}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {formatarData(v.periodoDe)} a {formatarData(v.periodoAte)}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">{formatarData(v.dataPagamento)}</td>
                <td className="px-2 py-1.5">{situacaoRotulo(v.situacao)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {v.creditos.length === 0
                    ? "—"
                    : [...v.creditos]
                        .sort((a, b) => a.lancamentoExtrato.data.getTime() - b.lancamentoExtrato.data.getTime())
                        .map((c) => (
                          <span key={c.id} className="block">
                            {formatarData(c.lancamentoExtrato.data)}
                            {v.creditos.length > 1 && <> · {formatarMoeda(Number(c.lancamentoExtrato.valor))}</>}
                          </span>
                        ))}
                  {v.situacao === "PARCIAL" && <span className="block text-[8px] text-gray-500">falta {formatarMoeda(faltaReceber(v))}</span>}
                </td>
                <td className="px-2 py-1.5 text-right">{formatarMoeda(Number(v.valor))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black/30 font-semibold">
              <td colSpan={5} className="px-2 py-2 text-right">
                Total {p.nome}
              </td>
              <td className="px-2 py-2 text-right">{formatarMoeda(p.total)}</td>
            </tr>
          </tfoot>
        </table>
      ))}

      {postos.length === 0 && <p className="py-10 text-center text-sm text-foreground/50">Nenhuma venda a prazo nesse filtro.</p>}
    </div>
  );
}
