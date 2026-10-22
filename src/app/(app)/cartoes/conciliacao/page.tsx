import Link from "next/link";
import { paraLista, anexarLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import {
  buscarConciliacaoVariosPostos,
  type AgrupamentoConciliacao,
  type LinhaConciliacao,
  type LinhaConciliacaoPosto,
  type StatusConciliacao,
} from "@/lib/cartoes/conciliacao";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { BotaoImprimir } from "./botao-imprimir";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CABECALHO_TABELA, CAMPO, CARTAO } from "@/lib/estilo";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";

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
  CONCILIADO: "bg-[#E7F6EC] text-[#14693A] dark:bg-green-900/40 dark:text-green-400",
  DIVERGENTE: "bg-[#FDECEC] text-[#A12727] dark:bg-red-900/40 dark:text-red-400",
  PENDENTE: "bg-[#EEF0F3] text-[#374151] dark:bg-white/10 dark:text-foreground/70",
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
    postoId?: string | string[];
    inicio?: string;
    fim?: string;
    adquirenteId?: string | string[];
    status?: string;
    filtrarPor?: string;
    agruparPor?: string;
  }>;
}) {
  const { postoId, inicio, fim, adquirenteId, status, filtrarPor, agruparPor } = await searchParams;
  const postoIds = paraLista(postoId);
  const filtrarPorVenda = filtrarPor === "venda";
  const adquirenteIds = adquirenteId ? (Array.isArray(adquirenteId) ? adquirenteId : [adquirenteId]) : [];
  const agrupamento: AgrupamentoConciliacao = agruparPor === "adquirente" ? agruparPor : "recebimento";

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const temFiltro = Boolean(inicio && fim);
  const todasLinhas =
    temFiltro && inicio && fim
      ? await buscarConciliacaoVariosPostos({
          postoIds: postoIds.length ? postoIds : postos.map((p) => p.id),
          dataInicio: dataUTC(inicio),
          dataFim: dataUTC(fim, true),
          adquirenteIds,
          filtrarPor: filtrarPorVenda ? "venda" : "pagamento",
          agruparPor: agrupamento,
        })
      : null;

  const linhas = todasLinhas && status ? todasLinhas.filter((l) => l.status === status) : todasLinhas;

  const postoNome = postos.filter((p) => postoIds.includes(p.id)).map((p) => p.nome).join(", ");
  const varios = postoIds.length !== 1;
  const qsBase = new URLSearchParams({ inicio: inicio ?? "", fim: fim ?? "" });
  anexarLista(qsBase, "postoId", postoIds);
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
    <div className="pagina-paisagem space-y-6">
      <CabecalhoImpressao titulo="Conciliação de Cartões — Recebimentos" detalhes={[{ rotulo: "Posto", valor: postoNome ?? "Todos os postos" }, { rotulo: "Período", valor: `${inicio} a ${fim}` }]} />

      <p className="text-sm text-foreground/60 print:hidden">
        Compara, por adquirente e dia de pagamento, o valor líquido esperado (vendas) contra o que caiu no
        extrato bancário. &quot;Pendente&quot; é dia sem lançamento no extrato ainda; &quot;Divergente&quot;
        é lançamento que não bate com o esperado.
      </p>

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm print:hidden`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <SeletorDropdown
            nome="postoId"
            rotuloTodos="Todos os postos"
            selecionados={postoIds}
            itens={postos}
          />
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
            className={CAMPO}
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
            className={CAMPO}
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
            className={CAMPO}
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
            className={CAMPO}
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
            className={CAMPO}
          />
        </div>
        <button
          type="submit"
          className={BOTAO_PRIMARIO}
        >
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/cartoes/conciliacao" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {temFiltro && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/cartoes/conciliacao/exportar?${qsBase.toString()}`}
              className={`${BOTAO_SECUNDARIO} font-medium`}
            >
              Exportar (Excel)
            </Link>
            <BotaoImprimir />
          </div>
        )}
      </form>

      {temFiltro && filtrarPorVenda && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
          <strong>Filtrando por data da venda.</strong> O esperado só considera as vendas do período, mas o extrato do
          mesmo intervalo também traz recebimentos de vendas anteriores (ex: D+31 da Premmia, vendas de meses
          passados). Por isso as diferenças e o status &quot;Divergente&quot; deste modo não indicam erro. Pra conferir
          com o extrato, use <em>Data de pagamento</em>.
        </div>
      )}

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
        <div className={`${CARTAO} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className={CABECALHO_TABELA}>
              <tr>
                {varios && <th className="px-4 py-2.5 text-left">Posto</th>}
                <th className="px-4 py-2.5 text-left">{colunaData}</th>
                <th className="px-4 py-2.5 text-left">Adquirente</th>
                <th className="px-4 py-2.5 text-left">Prazo</th>
                <th className="px-4 py-2.5 text-right">Qtd vendas</th>
                <th className="px-4 py-2.5 text-right">Esperado</th>
                <th className="px-4 py-2.5 text-right">Extrato Débito</th>
                <th className="px-4 py-2.5 text-right">Extrato Crédito</th>
                <th className="px-4 py-2.5 text-right">Diferença</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left print:hidden">Lançamentos</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: LinhaConciliacaoPosto) => {
                const qsLancamentos = new URLSearchParams({
                  postoId: l.postoId,
                  categoria: l.categoriaId ?? "",
                  de: l.dataLinkDe,
                  ate: l.dataLinkAte,
                });
                return (
                  <tr
                    key={l.chave}
                    className={`border-t border-black/5 dark:border-white/10 ${COR_LINHA[l.status]}`}
                  >
                    {varios && <td className="px-4 py-3">{l.posto}</td>}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {l.data ? formatarData(l.data) : `${formatarData(l.dataLinkDe)} a ${formatarData(l.dataLinkAte)}`}
                    </td>
                    <td className="px-4 py-3">{l.adquirente}</td>
                    <td className="px-4 py-3 text-foreground/60">
                      {l.fontePrazo === "ARQUIVO" ? "Arquivo" : l.fontePrazo === "MISTO" ? "Arquivo + regra fixa" : "Sistema (regra fixa)"}
                    </td>
                    <td className="px-4 py-3 text-right">{l.qtdVendas}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(l.esperado)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(l.extratoDebito)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(l.extratoCredito)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(l.diferenca)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR_STATUS[l.status]}`}>
                        {ROTULO_STATUS[l.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 print:hidden">
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
              <tr className="border-t border-black/10 bg-[#DCE7FA] font-bold dark:border-white/10 dark:bg-blue-950/40">
                <td className="px-4 py-3" colSpan={varios ? 5 : 4}>
                  Total
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totais.esperado)}</td>
                <td colSpan={2}></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totais.diferenca)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
