import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarVendasCartoes, type LinhaVendas } from "@/lib/cartoes/vendas";
import { ROTULO_MODALIDADE_VENDA } from "@/lib/cartoes/normalizar";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { BotaoImprimir } from "./botao-imprimir";

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
    postoId?: string;
    inicio?: string;
    fim?: string;
    adquirenteId?: string | string[];
  }>;
}) {
  const { postoId, inicio, fim, adquirenteId } = await searchParams;
  const adquirenteIds = adquirenteId ? (Array.isArray(adquirenteId) ? adquirenteId : [adquirenteId]) : [];

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const temFiltro = Boolean(postoId && inicio && fim);
  const linhas =
    temFiltro && postoId && inicio && fim
      ? await buscarVendasCartoes({
          postoId,
          adquirenteIds,
          dataInicio: dataUTC(inicio),
          dataFim: dataUTC(fim, true),
        })
      : null;

  const postoNome = postos.find((p) => p.id === postoId)?.nome;
  const qsBase = new URLSearchParams({ postoId: postoId ?? "", inicio: inicio ?? "", fim: fim ?? "" });
  for (const id of adquirenteIds) qsBase.append("adquirenteId", id);
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });

  const totais = linhas?.reduce(
    (acc, l) => ({ bruto: acc.bruto + l.totalBruto, liquido: acc.liquido + l.totalLiquido, taxa: acc.taxa + l.taxa }),
    { bruto: 0, liquido: 0, taxa: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">
          Vendas de Cartões — {postoNome ?? ""} — {inicio} a {fim}
        </h2>
        <p className="text-xs text-foreground/60">Gerado em {geradoEm}</p>
      </div>

      <p className="text-sm text-foreground/60 print:hidden">
        Relação crua das vendas por data da venda, adquirente e modalidade (débito, crédito, pix) — bruto, líquido e taxa — sem comparar com o
        extrato. Serve pra conferir se o arquivo foi lido certo.
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
          <label htmlFor="inicio" className="text-foreground/60">
            Data de venda — de
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
          <Link href="/cartoes/vendas" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {temFiltro && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/cartoes/vendas/exportar?${qsBase.toString()}`}
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
          Escolha um posto e o período pra ver as vendas.
        </p>
      )}

      {linhas && linhas.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Nenhuma venda de cartão com data de venda nesse período/filtro.
        </p>
      )}

      {linhas && linhas.length > 0 && totais && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-1.5 text-left font-medium">Data</th>
                <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
                <th className="px-4 py-1.5 text-left font-medium">Modalidade</th>
                <th className="px-4 py-1.5 text-right font-medium">Qtd</th>
                <th className="px-4 py-1.5 text-right font-medium">Bruto</th>
                <th className="px-4 py-1.5 text-right font-medium">Líquido</th>
                <th className="px-4 py-1.5 text-right font-medium">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: LinhaVendas) => (
                <tr key={`${l.adquirenteId}|${l.data}|${l.modalidade}`} className="border-t border-black/5 dark:border-white/10">
                  <td className="px-4 py-1.5 whitespace-nowrap">{formatarData(l.data)}</td>
                  <td className="px-4 py-1.5">{l.adquirente}</td>
                  <td className="px-4 py-1.5 text-foreground/70">{ROTULO_MODALIDADE_VENDA[l.modalidade]}</td>
                  <td className="px-4 py-1.5 text-right">{l.qtd}</td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.totalBruto)}</td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.totalLiquido)}</td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.taxa)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-blue-950/10 font-semibold dark:border-white/10 dark:bg-blue-950/25">
                <td className="px-4 py-1.5" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totais.bruto)}</td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totais.liquido)}</td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totais.taxa)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
