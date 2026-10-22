import Link from "next/link";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { paraLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarConferenciasCaixa, type StatusConferenciaCaixa } from "@/lib/conferenciaCaixa";
import { BOTAO_PRIMARIO, CABECALHO_TABELA, CAMPO, CARTAO } from "@/lib/estilo";

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
  CONFERIDO: "bg-[#E7F6EC] text-[#14693A] dark:bg-green-900/40 dark:text-green-400",
  DIVERGENTE: "bg-[#FDECEC] text-[#A12727] dark:bg-red-900/40 dark:text-red-400",
};

export default async function HistoricoConferenciaCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; status?: string }>;
}) {
  const { postoId, status } = await searchParams;
  const postoIds = paraLista(postoId);
  const statusFiltro = status === "CONFERIDO" || status === "DIVERGENTE" ? status : undefined;

  const [postos, linhas] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    buscarConferenciasCaixa({ postoId: postoIds, status: statusFiltro }),
  ]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-foreground/60">
        Caixas já marcados como conferido ou divergente na aba Relatório de Caixa. &quot;Rever&quot; volta
        pro relatório com o posto e o período preenchidos, pra pesquisar aquele caixa de novo.
      </p>

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <SeletorDropdown
            nome="postoId"
            rotuloTodos="Todos os postos"
            selecionados={postoIds}
            itens={postos.map((p) => ({ id: p.id, nome: p.nome }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-foreground/60">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFiltro ?? ""}
            className={CAMPO}
          >
            <option value="">Todos</option>
            <option value="CONFERIDO">Conferido</option>
            <option value="DIVERGENTE">Divergente</option>
          </select>
        </div>
        <button
          type="submit"
          className={BOTAO_PRIMARIO}
        >
          Filtrar
        </button>
        {(postoIds.length || statusFiltro) && (
          <Link href="/conferencia-caixa/conferencia" className="self-center text-foreground/60 underline">
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
        <div className={`${CARTAO} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className={CABECALHO_TABELA}>
              <tr>
                <th className="px-4 py-2.5 text-left">Posto</th>
                <th className="px-4 py-2.5 text-left">Início</th>
                <th className="px-4 py-2.5 text-left">Fim</th>
                <th className="px-4 py-2.5 text-right">Valor total</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left"></th>
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
                    <td className="px-4 py-3">{l.posto}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">{formatarDataHora(l.inicio)}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">{formatarDataHora(l.fim)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.valorTotal)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${COR_STATUS[l.status]}`}>
                        {ROTULO_STATUS[l.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
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
