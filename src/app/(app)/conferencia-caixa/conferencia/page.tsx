import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarConferenciasCaixa, type StatusConferenciaCaixa } from "@/lib/conferenciaCaixa";
import { atualizarStatusConferenciaCaixa } from "./actions";

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

export default async function ConferenciaCaixaListaPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; status?: string }>;
}) {
  const { postoId, status } = await searchParams;
  const statusFiltro = status === "PENDENTE" || status === "CONFERIDO" || status === "DIVERGENTE" ? status : undefined;

  const [postos, linhas, podeEditar] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    buscarConferenciasCaixa({ postoId: postoId || undefined, status: statusFiltro }),
    podeEditarModulo("CONFERENCIA_CAIXA"),
  ]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/60">
        Relatórios de caixa já baixados (aba Relatório de Caixa) — período, valor total encontrado e se já foi
        conferido contra o caixa físico. Use &quot;Rever&quot; pra abrir a pesquisa daquele caixa de novo.
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
            <option value="PENDENTE">Pendente</option>
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
          Nenhum relatório de caixa baixado ainda (ou nenhum com esse filtro).
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
                <th className="px-4 py-1.5 text-left font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const qsRever = new URLSearchParams({
                  postoId: l.postoId,
                  inicio: paraDatetimeLocal(l.inicio),
                  fim: paraDatetimeLocal(l.fim),
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
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/conferencia-caixa/relatorio?${qsRever.toString()}`}
                          className="rounded-md px-2 py-1 text-foreground/70 underline hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          Rever
                        </Link>
                        {podeEditar && l.status !== "CONFERIDO" && (
                          <form action={atualizarStatusConferenciaCaixa}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="status" value="CONFERIDO" />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-green-700 hover:bg-black/5 dark:text-green-400 dark:hover:bg-white/10"
                            >
                              Conferido
                            </button>
                          </form>
                        )}
                        {podeEditar && l.status !== "DIVERGENTE" && (
                          <form action={atualizarStatusConferenciaCaixa}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="status" value="DIVERGENTE" />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-red-700 hover:bg-black/5 dark:text-red-400 dark:hover:bg-white/10"
                            >
                              Divergente
                            </button>
                          </form>
                        )}
                      </div>
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
