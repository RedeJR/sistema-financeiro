import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarConferenciasCaixa, type StatusConferenciaCaixa } from "@/lib/conferenciaCaixa";

function formatarDataHora(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "UTC" });
}

// "AAAA-MM-DDTHH:MM" — mesmo formato que a tela de Relatório de Caixa
// espera nos campos datetime-local.
function paraDatetimeLocal(d: Date): string {
  return d.toISOString().slice(0, 16);
}

const ROTULO_STATUS: Record<StatusConferenciaCaixa, string> = {
  PENDENTE: "Pendente",
  CONFERIDO: "Conferido",
  DIVERGENTE: "Divergente",
};

const COR_STATUS: Record<StatusConferenciaCaixa, string> = {
  PENDENTE: "bg-black/10 text-foreground/60 dark:bg-white/10",
  CONFERIDO: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
  DIVERGENTE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400",
};

export default async function HistoricoConferenciaCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; status?: string }>;
}) {
  const { postoId, status } = await searchParams;
  const statusFiltro = status === "CONFERIDO" || status === "DIVERGENTE" ? status : undefined;

  const [postos, linhas] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    buscarConferenciasCaixa({ postoId: postoId || undefined, status: statusFiltro }),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/60">
        Caixas já marcados como conferido ou divergente na aba Relatório de Caixa. &quot;Rever&quot; volta
        pro relatório com o posto e o período preenchidos, pra pesquisar aquele caixa de novo.
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
          <label htmlFor="status" className="text-foreground/60">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFiltro ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todos</option>
            <option value="CONFERIDO">Conferido</option>
            <option value="DIVERGENTE">Divergente</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Filtrar
        </button>
        {(postoId || statusFiltro) && (
          <Link href="/conferencia-caixa/conferencia" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      {linhas.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Nenhum caixa conferido ainda (ou nenhum com esse filtro).
        </p>
      )}

      {linhas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-1.5 text-left font-medium">Posto</th>
                <th className="px-4 py-1.5 text-left font-medium">Início</th>
                <th className="px-4 py-1.5 text-left font-medium">Fim</th>
                <th className="px-4 py-1.5 text-right font-medium">Valor total</th>
                <th className="px-4 py-1.5 text-left font-medium">Status</th>
                <th className="px-4 py-1.5 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const qsRever = new URLSearchParams({
                  postoId: l.postoId,
                  inicio: paraDatetimeLocal(l.inicio),
                  fim: paraDatetimeLocal(l.fim),
                  rever: "1",
                });
                return (
                  <tr key={l.id} className="border-t border-black/5 dark:border-white/10">
                    <td className="px-4 py-1.5">{l.posto}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">{formatarDataHora(l.inicio)}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">{formatarDataHora(l.fim)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.valorTotal)}</td>
                    <td className="px-4 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${COR_STATUS[l.status]}`}>
                        {ROTULO_STATUS[l.status]}
                      </span>
                    </td>
                    <td className="px-4 py-1.5">
                      <Link
                        href={`/conferencia-caixa/relatorio?${qsRever.toString()}`}
                        className="text-foreground/70 underline"
                      >
                        Rever
                      </Link>
                    </td>
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
