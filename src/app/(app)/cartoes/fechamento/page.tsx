import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarFechamentoCartoes, type LinhaFechamento } from "@/lib/cartoes/fechamento";
import { BotaoImprimir } from "./botao-imprimir";

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export default async function FechamentoCartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; inicio?: string; fim?: string; adquirenteId?: string }>;
}) {
  const { postoId, inicio, fim, adquirenteId } = await searchParams;

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const temFiltro = Boolean(inicio && fim);
  const linhas = temFiltro
    ? await buscarFechamentoCartoes({
        postoId: postoId || undefined,
        adquirenteId: adquirenteId || undefined,
        dataInicio: dataUTC(inicio!),
        dataFim: dataUTC(fim!, true),
      })
    : null;

  const porPosto = new Map<string, LinhaFechamento[]>();
  for (const l of linhas ?? []) {
    const arr = porPosto.get(l.posto) ?? [];
    arr.push(l);
    porPosto.set(l.posto, arr);
  }

  const postoNome = postos.find((p) => p.id === postoId)?.nome;
  const qsBase = new URLSearchParams({ inicio: inicio ?? "", fim: fim ?? "" });
  if (postoId) qsBase.set("postoId", postoId);
  if (adquirenteId) qsBase.set("adquirenteId", adquirenteId);
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });

  const totalGeral = linhas?.reduce(
    (acc, l) => ({ bruto: acc.bruto + l.totalBruto, liquido: acc.liquido + l.totalLiquido, taxa: acc.taxa + l.taxa }),
    { bruto: 0, liquido: 0, taxa: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">
          Fechamento de Cartões — {postoNome ?? "Todos os postos"} — {inicio} a {fim}
        </h2>
        <p className="text-xs text-foreground/60">Gerado em {geradoEm}</p>
      </div>

      <p className="text-sm text-foreground/60 print:hidden">
        Fecha o bruto, líquido e taxa das vendas de cartão por posto e adquirente, pela data da venda. Sem
        escolher um posto, mostra todos agrupados.
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
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todos os postos</option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="adquirenteId" className="text-foreground/60">
            Adquirente
          </label>
          <select
            id="adquirenteId"
            name="adquirenteId"
            defaultValue={adquirenteId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todas</option>
            {adquirentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="inicio" className="text-foreground/60">
            Data da venda — de
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
          <Link href="/cartoes/fechamento" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {temFiltro && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/cartoes/fechamento/exportar?${qsBase.toString()}`}
              className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Exportar (Excel)
            </Link>
            <BotaoImprimir />
          </div>
        )}
      </form>

      {!linhas && (
        <p className="py-10 text-center text-sm text-foreground/50">Escolha o período pra ver o fechamento.</p>
      )}

      {linhas && linhas.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhuma venda de cartão nesse período/filtro.</p>
      )}

      {linhas && linhas.length > 0 && totalGeral && (
        <div className="space-y-4">
          {[...porPosto.entries()].map(([posto, linhasPosto]) => {
            const subtotal = linhasPosto.reduce(
              (acc, l) => ({ bruto: acc.bruto + l.totalBruto, liquido: acc.liquido + l.totalLiquido, taxa: acc.taxa + l.taxa }),
              { bruto: 0, liquido: 0, taxa: 0 }
            );
            return (
              <div key={posto} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
                <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
                  {posto}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                    <tr>
                      <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
                      <th className="px-4 py-1.5 text-right font-medium">Qtd</th>
                      <th className="px-4 py-1.5 text-right font-medium">Total Bruto</th>
                      <th className="px-4 py-1.5 text-right font-medium">Total Líquido</th>
                      <th className="px-4 py-1.5 text-right font-medium">Taxas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasPosto.map((l, i) => (
                      <tr
                        key={l.adquirente}
                        className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                      >
                        <td className="px-4 py-1.5">{l.adquirente}</td>
                        <td className="px-4 py-1.5 text-right">{l.qtd}</td>
                        <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.totalBruto)}</td>
                        <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.totalLiquido)}</td>
                        <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.taxa)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-black/10 bg-black/[0.03] font-semibold dark:border-white/10 dark:bg-white/[0.04]">
                      <td className="px-4 py-1.5" colSpan={2}>
                        Total {posto}
                      </td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(subtotal.bruto)}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(subtotal.liquido)}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(subtotal.taxa)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}

          {porPosto.size > 1 && (
            <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-blue-950/10 font-semibold dark:bg-blue-950/25">
                    <td className="px-4 py-1.5" colSpan={2}>
                      Total geral
                    </td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totalGeral.bruto)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totalGeral.liquido)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totalGeral.taxa)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
