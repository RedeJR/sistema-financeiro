import Link from "next/link";
import { paraLista, anexarLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarVendasCartoes, type LinhaVendas } from "@/lib/cartoes/vendas";
import { ROTULO_MODALIDADE_VENDA } from "@/lib/cartoes/normalizar";
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

export default async function VendasCartoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    postoId?: string | string[];
    inicio?: string;
    fim?: string;
    adquirenteId?: string | string[];
  }>;
}) {
  const { postoId, inicio, fim, adquirenteId } = await searchParams;
  const postoIds = paraLista(postoId);
  const adquirenteIds = adquirenteId ? (Array.isArray(adquirenteId) ? adquirenteId : [adquirenteId]) : [];

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const temFiltro = Boolean(inicio && fim);
  const linhas =
    temFiltro && inicio && fim
      ? await buscarVendasCartoes({
          postoIds: postoIds.length ? postoIds : postos.map((p) => p.id),
          adquirenteIds,
          dataInicio: dataUTC(inicio),
          dataFim: dataUTC(fim, true),
        })
      : null;

  const postoNome = postos.filter((p) => postoIds.includes(p.id)).map((p) => p.nome).join(", ");
  const varios = postoIds.length !== 1;
  const qsBase = new URLSearchParams({ inicio: inicio ?? "", fim: fim ?? "" });
  anexarLista(qsBase, "postoId", postoIds);
  for (const id of adquirenteIds) qsBase.append("adquirenteId", id);
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });

  const totais = linhas?.reduce(
    (acc, l) => ({ bruto: acc.bruto + l.totalBruto, liquido: acc.liquido + l.totalLiquido, taxa: acc.taxa + l.taxa }),
    { bruto: 0, liquido: 0, taxa: 0 }
  );

  return (
    <div className="pagina-paisagem space-y-6">
      <CabecalhoImpressao titulo="Vendas de Cartões" detalhes={[{ rotulo: "Posto", valor: postoNome || "Todos os postos" }, { rotulo: "Período", valor: `${inicio} a ${fim}` }]} />

      <p className="text-sm text-foreground/60 print:hidden">
        Relação crua das vendas por data da venda, adquirente e modalidade (débito, crédito, pix) — bruto, líquido e taxa — sem comparar com o
        extrato. Serve pra conferir se o arquivo foi lido certo.
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
          <label htmlFor="inicio" className="text-foreground/60">
            Data de venda — de
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
          <Link href="/cartoes/vendas" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {temFiltro && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/cartoes/vendas/exportar?${qsBase.toString()}`}
              className={`${BOTAO_SECUNDARIO} font-medium`}
            >
              Exportar (Excel)
            </Link>
            <BotaoImprimir />
          </div>
        )}
      </form>

      {!linhas && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Escolha o período (e, se quiser, os postos) pra ver as vendas.
        </p>
      )}

      {linhas && linhas.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Nenhuma venda de cartão com data de venda nesse período/filtro.
        </p>
      )}

      {linhas && linhas.length > 0 && totais && (
        <div className={`${CARTAO} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className={CABECALHO_TABELA}>
              <tr>
                {varios && <th className="px-4 py-2.5 text-left">Posto</th>}
                <th className="px-4 py-2.5 text-left">Data</th>
                <th className="px-4 py-2.5 text-left">Adquirente</th>
                <th className="px-4 py-2.5 text-left">Modalidade</th>
                <th className="px-4 py-2.5 text-right">Qtd</th>
                <th className="px-4 py-2.5 text-right">Bruto</th>
                <th className="px-4 py-2.5 text-right">Líquido</th>
                <th className="px-4 py-2.5 text-right">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: LinhaVendas) => (
                <tr key={`${l.postoId}|${l.adquirenteId}|${l.data}|${l.modalidade}`} className="border-t border-black/5 dark:border-white/10">
                  {varios && <td className="px-4 py-3">{l.posto}</td>}
                  <td className="px-4 py-3 whitespace-nowrap">{formatarData(l.data)}</td>
                  <td className="px-4 py-3">{l.adquirente}</td>
                  <td className="px-4 py-3 text-foreground/70">{ROTULO_MODALIDADE_VENDA[l.modalidade]}</td>
                  <td className="px-4 py-3 text-right">{l.qtd}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(l.totalBruto)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(l.totalLiquido)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(l.taxa)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-[#DCE7FA] font-bold dark:border-white/10 dark:bg-blue-950/40">
                <td className="px-4 py-3" colSpan={varios ? 5 : 4}>
                  Total
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totais.bruto)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totais.liquido)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totais.taxa)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
