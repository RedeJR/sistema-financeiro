import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarConferenciaTaxas, type LinhaConferenciaTaxas } from "@/lib/cartoes/conferenciaTaxas";

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

function formatarDias(d: number | null): string {
  return d === null ? "—" : `${d >= 0 ? "D+" : "D"}${Math.round(d)}`;
}

function formatarPct(p: number | null): string {
  return p === null ? "—" : `${p.toFixed(2)}%`;
}

// Destaca diferença de prazo (dia) e de taxa (ponto percentual) — limiar
// pequeno só pra não piscar em diferença de arredondamento (ex: prazo médio
// 0.98 vs cadastro 1).
function temDivergencia(l: LinhaConferenciaTaxas): boolean {
  if (l.semTaxaCadastrada) return false;
  const difPrazo = l.prazoRealDias !== null && l.prazoCadastradoDias !== null ? Math.abs(l.prazoRealDias - l.prazoCadastradoDias) : 0;
  const difTaxa = l.taxaRealPct !== null && l.taxaCadastradaPct !== null ? Math.abs(l.taxaRealPct - l.taxaCadastradaPct) : 0;
  return difPrazo >= 1 || difTaxa >= 0.1;
}

export default async function ConferenciaTaxasPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; inicio?: string; fim?: string }>;
}) {
  const { postoId, inicio, fim } = await searchParams;

  const postos = await prisma.posto.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  const temFiltro = Boolean(postoId && inicio && fim);
  const linhas =
    temFiltro && postoId && inicio && fim
      ? await buscarConferenciaTaxas({ postoId, dataInicio: dataUTC(inicio), dataFim: dataUTC(fim, true) })
      : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/60">
        Compara o prazo e a taxa que vieram no arquivo de cada adquirente (por venda) contra o que está
        cadastrado em Taxas de Cartão pra esse posto — pra achar divergência entre o contratado e o
        praticado.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm">
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
          <Link href="/cartoes/conferencia-taxas" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <p className="text-xs text-foreground/50">
        O prazo real é a média, em dias corridos, entre a data da venda e a data de pagamento que veio no
        arquivo (quando o arquivo não traz data de pagamento explícita, como a Stone, essa coluna fica
        vazia). Diferença de prazo/taxa pequena pode ser só arredondamento de dias úteis — confira o
        contexto antes de considerar erro.
      </p>

      {!linhas && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Escolha um posto e o período pra ver a conferência.
        </p>
      )}

      {linhas && linhas.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Nenhuma venda de cartão encontrada nesse posto/período.
        </p>
      )}

      {linhas && linhas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
                <th className="px-4 py-1.5 text-left font-medium">Modalidade (arquivo)</th>
                <th className="px-4 py-1.5 text-right font-medium">Qtd</th>
                <th className="px-4 py-1.5 text-right font-medium">Bruto</th>
                <th className="px-4 py-1.5 text-right font-medium">Prazo cadastrado</th>
                <th className="px-4 py-1.5 text-right font-medium">Prazo real (arquivo)</th>
                <th className="px-4 py-1.5 text-right font-medium">Taxa cadastrada</th>
                <th className="px-4 py-1.5 text-right font-medium">Taxa real (arquivo)</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const divergente = temDivergencia(l);
                return (
                  <tr
                    key={`${l.adquirente}|${l.tipoVenda}`}
                    className={`border-t border-black/5 dark:border-white/10 ${
                      divergente
                        ? "bg-amber-100/60 dark:bg-amber-900/20"
                        : i % 2 === 1
                          ? "bg-black/[0.015] dark:bg-white/[0.02]"
                          : ""
                    }`}
                  >
                    <td className="px-4 py-1.5">{l.adquirente}</td>
                    <td className="px-4 py-1.5 text-foreground/70">{l.tipoVenda}</td>
                    <td className="px-4 py-1.5 text-right">{l.qtd}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.somaBruto)}</td>
                    {l.semTaxaCadastrada ? (
                      <td colSpan={4} className="px-4 py-1.5 text-center text-foreground/50">
                        Sem Taxas de Cartão cadastrada pra essa adquirente nesse posto
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarDias(l.prazoCadastradoDias)}</td>
                        <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarDias(l.prazoRealDias)}</td>
                        <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarPct(l.taxaCadastradaPct)}</td>
                        <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarPct(l.taxaRealPct)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
