import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import {
  buscarConciliacaoCartoes,
  type AgrupamentoConciliacao,
  type LinhaConciliacao,
  type StatusConciliacao,
} from "@/lib/cartoes/conciliacao";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { BotaoImprimir } from "./botao-imprimir";

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

function formatarData(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const ROTULO_STATUS: Record<StatusConciliacao, string> = {
  CONCILIADO: "Conciliado",
  DIVERGENTE: "Divergente",
  PENDENTE: "Pendente",
};

const COR_STATUS: Record<StatusConciliacao, string> = {
  CONCILIADO: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  DIVERGENTE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
  PENDENTE: "bg-black/10 text-foreground/60 dark:bg-white/10",
};

const COR_LINHA: Record<StatusConciliacao, string> = {
  CONCILIADO: "",
  DIVERGENTE: "bg-red-50/60 dark:bg-red-950/20",
  PENDENTE: "",
};

const ROTULO_AGRUPAMENTO: Record<AgrupamentoConciliacao, string> = {
  recebimento: "Data do recebimento",
  adquirente: "Adquirente",
};

export default async function ConciliacaoCartoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    postoId?: string;
    inicio?: string;
    fim?: string;
    adquirenteId?: string | string[];
    status?: string;
    filtrarPor?: string;
    agruparPor?: string;
  }>;
}) {
  const { postoId, inicio, fim, adquirenteId, status, filtrarPor, agruparPor } = await searchParams;
  const filtrarPorVenda = filtrarPor === "venda";
  const adquirenteIds = adquirenteId ? (Array.isArray(adquirenteId) ? adquirenteId : [adquirenteId]) : [];
  const agrupamento: AgrupamentoConciliacao = agruparPor === "adquirente" ? agruparPor : "recebimento";

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const temFiltro = Boolean(postoId && inicio && fim);
  const todasLinhas =
    temFiltro && postoId && inicio && fim
      ? await buscarConciliacaoCartoes({
          postoId,
          dataInicio: dataUTC(inicio),
          dataFim: dataUTC(fim, true),
          adquirenteIds,
          filtrarPor: filtrarPorVenda ? "venda" : "pagamento",
          agruparPor: agrupamento,
        })
      : null;

  const linhas = todasLinhas && status ? todasLinhas.filter((l) => l.status === status) : todasLinhas;

  const postoNome = postos.find((p) => p.id === postoId)?.nome;
  const qsBase = new URLSearchParams({ postoId: postoId ?? "", inicio: inicio ?? "", fim: fim ?? "" });
  for (const id of adquirenteIds) qsBase.append("adquirenteId", id);
  if (status) qsBase.set("status", status);
  if (filtrarPorVenda) qsBase.set("filtrarPor", "venda");
  if (agrupamento !== "recebimento") qsBase.set("agruparPor", agrupamento);
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });
  const colunaData = agrupamento === "adquirente" ? "Período" : ROTULO_AGRUPAMENTO[agrupamento];

  const totais = linhas?.reduce(
    (acc, l) => ({
      esperado: acc.esperado + l.esperado,
      extratoTotal: acc.extratoTotal + l.extratoTotal,
      diferenca: acc.diferenca + l.diferenca,
    }),
    { esperado: 0, extratoTotal: 0, diferenca: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">
          Conciliação de Cartões — {postoNome ?? ""} — {inicio} a {fim}
        </h2>
        <p className="text-xs text-foreground/60">Gerado em {geradoEm}</p>
      </div>

      <p className="text-sm text-foreground/60 print:hidden">
        Compara, por adquirente e dia de pagamento, o valor líquido esperado (vendas) contra o que caiu no
        extrato bancário. &quot;Pendente&quot; é dia sem lançamento no extrato ainda; &quot;Divergente&quot;
        é lançamento que não bate com o esperado.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm print:hidden">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select
            id="postoId"
            name="postoId"
            defaultValue={postoId ?? ""}
            required
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="" disabled>
              Escolha um posto
            </option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-foreground/60">Adquirente</span>
          <SeletorDropdown nome="adquirenteId" rotuloTodos="Todas" selecionados={adquirenteIds} itens={adquirentes} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="agruparPor" className="text-foreground/60">
            Agrupar por
          </label>
          <select
            id="agruparPor"
            name="agruparPor"
            defaultValue={agrupamento}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="recebimento">Data do recebimento</option>
            <option value="adquirente">Adquirente</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-foreground/60">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todos</option>
            <option value="CONCILIADO">Conciliado</option>
            <option value="DIVERGENTE">Divergente</option>
            <option value="PENDENTE">Pendente</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtrarPor" className="text-foreground/60">
            Filtrar período por
          </label>
          <select
            id="filtrarPor"
            name="filtrarPor"
            defaultValue={filtrarPorVenda ? "venda" : "pagamento"}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="pagamento">Data de pagamento</option>
            <option value="venda">Data de venda</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="inicio" className="text-foreground/60">
            {filtrarPorVenda ? "Data de venda — de" : "Data de pagamento — de"}
          </label>
          <input
            id="inicio"
            type="date"
            name="inicio"
            defaultValue={inicio ?? ""}
            required
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fim" className="text-foreground/60">
            até
          </label>
          <input
            id="fim"
            type="date"
            name="fim"
            defaultValue={fim ?? ""}
            required
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/cartoes/conciliacao" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {temFiltro && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/cartoes/conciliacao/exportar?${qsBase.toString()}`}
              className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Exportar (Excel)
            </Link>
            <BotaoImprimir />
          </div>
        )}
      </form>

      {!linhas && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Escolha um posto e o período pra ver a conciliação.
        </p>
      )}

      {linhas && linhas.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Nenhuma venda de cartão com data de pagamento nesse período/filtro.
        </p>
      )}

      {linhas && linhas.length > 0 && totais && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-1.5 text-left font-medium">{colunaData}</th>
                <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
                <th className="px-4 py-1.5 text-left font-medium">Prazo</th>
                <th className="px-4 py-1.5 text-right font-medium">Qtd vendas</th>
                <th className="px-4 py-1.5 text-right font-medium">Esperado</th>
                <th className="px-4 py-1.5 text-right font-medium">Extrato Débito</th>
                <th className="px-4 py-1.5 text-right font-medium">Extrato Crédito</th>
                <th className="px-4 py-1.5 text-right font-medium">Diferença</th>
                <th className="px-4 py-1.5 text-left font-medium">Status</th>
                <th className="px-4 py-1.5 text-left font-medium print:hidden">Lançamentos</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: LinhaConciliacao) => {
                const qsLancamentos = new URLSearchParams({
                  postoId: postoId ?? "",
                  categoria: l.categoriaId ?? "",
                  de: l.dataLinkDe,
                  ate: l.dataLinkAte,
                });
                return (
                  <tr
                    key={l.chave}
                    className={`border-t border-black/5 dark:border-white/10 ${COR_LINHA[l.status]}`}
                  >
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {l.data ? formatarData(l.data) : `${formatarData(l.dataLinkDe)} a ${formatarData(l.dataLinkAte)}`}
                    </td>
                    <td className="px-4 py-1.5">{l.adquirente}</td>
                    <td className="px-4 py-1.5 text-foreground/60">
                      {l.fontePrazo === "ARQUIVO" ? "Arquivo" : "Sistema (regra fixa)"}
                    </td>
                    <td className="px-4 py-1.5 text-right">{l.qtdVendas}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.esperado)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.extratoDebito)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.extratoCredito)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.diferenca)}</td>
                    <td className="px-4 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${COR_STATUS[l.status]}`}>
                        {ROTULO_STATUS[l.status]}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 print:hidden">
                      {l.categoriaId && (
                        <Link href={`/extratos/editar?${qsLancamentos.toString()}`} className="text-foreground/60 underline">
                          Ver
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-blue-950/10 font-semibold dark:border-white/10 dark:bg-blue-950/25">
                <td className="px-4 py-1.5" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totais.esperado)}</td>
                <td colSpan={2}></td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totais.diferenca)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
