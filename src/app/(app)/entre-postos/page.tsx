import Link from "next/link";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { paraLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { listarMovimentacoes } from "@/lib/entrePostos/relatorios";
import { excluirMovimentacao } from "./actions";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

const ROTULO_TIPO: Record<"EMPRESTIMO" | "DEVOLUCAO", string> = {
  EMPRESTIMO: "Empréstimo",
  DEVOLUCAO: "Devolução",
};

export default async function EntrePostosPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; de?: string; ate?: string }>;
}) {
  const { postoId, de, ate } = await searchParams;
  const postoIds = paraLista(postoId);

  const [postos, movimentacoes, podeEditar] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    listarMovimentacoes({
      postoId: postoIds,
      dataInicio: de ? dataUTC(de) : undefined,
      dataFim: ate ? dataUTC(ate, true) : undefined,
    }),
    podeEditarModulo("ENTRE_POSTOS"),
  ]);

  const totalEmprestado = movimentacoes.filter((m) => m.tipo === "EMPRESTIMO").reduce((s, m) => s + m.valor, 0);
  const totalDevolvido = movimentacoes.filter((m) => m.tipo === "DEVOLUCAO").reduce((s, m) => s + m.valor, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/60">
        Todo empréstimo e devolução de dinheiro entre postos, em ordem cronológica. Pra ver quem deve pra quem
        hoje, veja a aba Relação de Devedores.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm">
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
          <label htmlFor="de" className="text-foreground/60">
            De
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={de ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="text-foreground/60">
            até
          </label>
          <input
            id="ate"
            type="date"
            name="ate"
            defaultValue={ate ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Filtrar
        </button>
        {(postoIds.length || de || ate) && (
          <Link href="/entre-postos" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {podeEditar && (
          <Link
            href="/entre-postos/novo"
            className="ml-auto rounded-md bg-foreground px-4 py-1.5 font-medium text-background hover:opacity-90"
          >
            + Nova movimentação
          </Link>
        )}
      </form>

      {movimentacoes.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhuma movimentação registrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "10%" }} />
              <col />
              {podeEditar && <col style={{ width: "11%" }} />}
            </colgroup>
            <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-1.5 text-left font-medium">Data</th>
                <th className="px-4 py-1.5 text-left font-medium">Tipo</th>
                <th className="px-4 py-1.5 text-left font-medium">Origem</th>
                <th className="px-4 py-1.5 text-left font-medium">Destino</th>
                <th className="px-4 py-1.5 text-right font-medium">Valor</th>
                <th className="px-4 py-1.5 text-left font-medium">Extrato</th>
                <th className="px-4 py-1.5 text-left font-medium">Status / Observação</th>
                {podeEditar && <th className="px-4 py-1.5 text-right font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map((m, i) => (
                <tr
                  key={m.id}
                  className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                >
                  <td className="px-4 py-1.5 whitespace-nowrap">{formatarData(m.data)}</td>
                  <td className="px-4 py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        m.tipo === "EMPRESTIMO"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400"
                          : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400"
                      }`}
                    >
                      {ROTULO_TIPO[m.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 break-words">{m.postoOrigemNome}</td>
                  <td className="px-4 py-1.5 break-words">{m.postoDestinoNome}</td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(m.valor)}</td>
                  <td className="px-4 py-1.5">
                    <Link
                      href={`/entre-postos/${m.id}/vincular`}
                      className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
                        m.vinculadoOrigem && m.vinculadoDestino
                          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400"
                          : m.vinculadoOrigem || m.vinculadoDestino
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
                            : "bg-black/5 text-foreground/60 dark:bg-white/10"
                      }`}
                    >
                      {m.vinculadoOrigem && m.vinculadoDestino
                        ? "Vinculado"
                        : m.vinculadoOrigem || m.vinculadoDestino
                          ? "Parcial"
                          : "Sem vínculo"}
                    </Link>
                  </td>
                  <td className="px-4 py-1.5 text-foreground/70 break-words">
                    {m.statusManual && <span>{m.statusManual}</span>}
                    {m.statusManual && m.observacao && " · "}
                    {m.observacao}
                    {!m.statusManual && !m.observacao && "—"}
                  </td>
                  {podeEditar && (
                    <td className="px-4 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/entre-postos/${m.id}/editar`}
                          className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          Editar
                        </Link>
                        <form action={excluirMovimentacao}>
                          <input type="hidden" name="id" value={m.id} />
                          <ConfirmSubmitButton
                            confirmMessage={`Excluir essa ${ROTULO_TIPO[m.tipo].toLowerCase()} de ${formatarMoeda(m.valor)} (${formatarData(m.data)})? Essa ação não pode ser desfeita.`}
                          >
                            Excluir
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-blue-950/10 font-semibold dark:border-white/10 dark:bg-blue-950/25">
                <td className="px-4 py-1.5" colSpan={4}>
                  Total — {movimentacoes.length} movimentação{movimentacoes.length === 1 ? "" : "ões"}
                </td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap" colSpan={podeEditar ? 4 : 3}>
                  Emprestado {formatarMoeda(totalEmprestado)} · Devolvido {formatarMoeda(totalDevolvido)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
