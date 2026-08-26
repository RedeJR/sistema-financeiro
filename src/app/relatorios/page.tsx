import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoQualquer } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import {
  buscarRelatorio,
  agruparPorVencimento,
  agruparPorPlanoConta,
  agruparPorPosto,
  type FiltrosRelatorio,
} from "./consulta";
import { BotaoImprimir } from "./botao-imprimir";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function paraArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<FiltrosRelatorio> }) {
  await exigirPermissaoQualquer(["CONTAS_A_PAGAR", "DESPESAS_PAGAS"], "visualizar");

  const filtros = await searchParams;
  const statusSelecionado = paraArray(filtros.status);
  const postoIdsSelecionados = paraArray(filtros.postoId);
  const fornecedorIdsSelecionados = paraArray(filtros.fornecedorId);
  const planoContaIdsSelecionados = paraArray(filtros.planoContaId);
  const ordem =
    filtros.ordem === "planoConta" ? "planoConta" : filtros.ordem === "posto" ? "posto" : "vencimento";

  // Antes do primeiro "Filtrar" (sem "statusEnviado" na URL — link direto de
  // fora ou primeira visita), as duas caixas aparecem marcadas — é só
  // visual, a consulta em si já mostra tudo nesse estado (ver
  // buscarRelatorio). Depois que passa por aqui uma vez, o que estiver
  // marcado/desmarcado no form é o que vale, inclusive as duas desmarcadas.
  const statusPagaMarcado = !filtros.statusEnviado || statusSelecionado.includes("PAGA");
  const statusAPagarMarcado = !filtros.statusEnviado || statusSelecionado.includes("A_PAGAR");

  const [linhas, postos, fornecedores, gruposPlanoConta] = await Promise.all([
    buscarRelatorio(filtros),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.grupoPlanoConta.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { where: { ativo: true }, orderBy: { nome: "asc" } } },
    }),
  ]);

  const total = linhas.reduce((soma, l) => soma + Number(l.valor), 0);
  const grupos =
    ordem === "planoConta"
      ? agruparPorPlanoConta(linhas)
      : ordem === "posto"
        ? agruparPorPosto(linhas)
        : agruparPorVencimento(linhas);

  const temFiltro = Boolean(
    filtros.statusEnviado ||
      postoIdsSelecionados.length ||
      fornecedorIdsSelecionados.length ||
      planoContaIdsSelecionados.length ||
      filtros.de ||
      filtros.ate ||
      (filtros.ordem && filtros.ordem !== "vencimento")
  );

  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <BotaoImprimir />
      </div>
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">Relatório de Contas</h1>
        <p className="text-xs text-foreground/60">Gerado em {geradoEm}</p>
      </div>

      <form className="space-y-3 text-sm print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-foreground/60">Situação</span>
            <div className="flex items-center gap-3 rounded-md border border-black/15 px-3 py-[0.4rem] dark:border-white/20">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="status" value="PAGA" defaultChecked={statusPagaMarcado} />
                Pagas
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="status" value="A_PAGAR" defaultChecked={statusAPagarMarcado} />
                A pagar
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="postoId" className="text-foreground/60">
              Posto <span className="text-xs">(Ctrl/Cmd+clique pra mais de um)</span>
            </label>
            {/* Filtra por quem PAGOU, não por dono da despesa — escolher a
                OLIVEIRA traz também o que ela pagou pra outros postos. */}
            <select
              id="postoId"
              name="postoId"
              multiple
              size={5}
              defaultValue={postoIdsSelecionados}
              className="min-w-[11rem] rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
            >
              {postos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <p className="max-w-[11rem] text-xs text-foreground/50">Filtra por quem pagou, não pelo dono da despesa.</p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="fornecedorId" className="text-foreground/60">
              Fornecedor
            </label>
            <select
              id="fornecedorId"
              name="fornecedorId"
              multiple
              size={5}
              defaultValue={fornecedorIdsSelecionados}
              className="min-w-[13rem] rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
            >
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="planoContaId" className="text-foreground/60">
              Plano de contas
            </label>
            <select
              id="planoContaId"
              name="planoContaId"
              multiple
              size={5}
              defaultValue={planoContaIdsSelecionados}
              className="min-w-[13rem] rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
            >
              {gruposPlanoConta.map((g) => (
                <optgroup key={g.id} label={g.nome}>
                  {g.contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="de" className="text-foreground/60">
              Vencimento de
            </label>
            <input
              id="de"
              type="date"
              name="de"
              defaultValue={filtros.de ?? ""}
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
              defaultValue={filtros.ate ?? ""}
              className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-foreground/60">Ordenar / agrupar por</span>
            <div className="flex items-center gap-3 rounded-md border border-black/15 px-3 py-[0.4rem] dark:border-white/20">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="ordem" value="vencimento" defaultChecked={ordem === "vencimento"} />
                Vencimento (agrupa por data)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="ordem" value="planoConta" defaultChecked={ordem === "planoConta"} />
                Plano de contas (agrupa por conta)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="ordem" value="posto" defaultChecked={ordem === "posto"} />
                Posto (agrupa por quem pagou)
              </label>
            </div>
          </div>

          <input type="hidden" name="statusEnviado" value="1" />
          <button
            type="submit"
            className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Filtrar
          </button>
          {temFiltro && (
            <Link href="/relatorios" className="text-foreground/60 underline">
              Limpar filtros
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-foreground/60">
        {linhas.length} conta{linhas.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
      </p>

      <div className="space-y-4">
        {grupos.map((g) => (
          <div key={g.chave} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <div className="border-b border-black/10 bg-black/[0.03] px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-white/[0.04]">
              {g.subtitulo ? `${g.subtitulo} / ${g.titulo}` : g.titulo} — {g.linhas.length} conta
              {g.linhas.length === 1 ? "" : "s"} — total {formatarMoeda(g.total)}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                  <tr>
                    {/* A dimensão usada pra agrupar já está no cabeçalho do
                        bloco acima — não repete como coluna. */}
                    {ordem !== "vencimento" && <th className="px-4 py-1.5 text-left font-medium">Vencimento</th>}
                    <th className="px-4 py-1.5 text-left font-medium">Situação</th>
                    {ordem !== "posto" && <th className="px-4 py-1.5 text-left font-medium">Posto</th>}
                    <th className="px-4 py-1.5 text-left font-medium">Fornecedor</th>
                    {ordem !== "planoConta" && (
                      <th className="px-4 py-1.5 text-left font-medium">Plano de contas</th>
                    )}
                    <th className="px-4 py-1.5 text-left font-medium">Descrição</th>
                    <th className="px-4 py-1.5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {g.linhas.map((l, i) => (
                    <tr
                      key={l.id}
                      className={`border-t border-black/5 dark:border-white/10 ${
                        i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""
                      }`}
                    >
                      {ordem !== "vencimento" && (
                        <td className="px-4 py-1.5 whitespace-nowrap">{formatarData(l.dataVencimento)}</td>
                      )}
                      <td className="px-4 py-1.5 whitespace-nowrap">
                        {l.paga ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-400">
                            Paga{l.dataPagamento ? ` em ${formatarData(l.dataPagamento)}` : ""}
                          </span>
                        ) : (
                          <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10">
                            A pagar
                          </span>
                        )}
                      </td>
                      {ordem !== "posto" && (
                        <td className="px-4 py-1.5">
                          {(l.postoPagamento ?? l.posto).nome}
                          {l.postoPagamentoId && (
                            <span className="block text-xs text-foreground/50">despesa de {l.posto.nome}</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-1.5">
                        {l.fornecedor.nome}
                        {/* Nessa visão o cabeçalho do grupo já é quem pagou —
                            só falta dizer de quem é a despesa quando for de
                            outro posto. */}
                        {ordem === "posto" && l.postoPagamentoId && (
                          <span className="block text-xs text-foreground/50">despesa de {l.posto.nome}</span>
                        )}
                      </td>
                      {ordem !== "planoConta" && (
                        <td className="px-4 py-1.5 text-foreground/70">
                          {l.planoConta.grupo.nome} / {l.planoConta.nome}
                        </td>
                      )}
                      <td className="px-4 py-1.5 text-foreground/70">{l.descricao ?? "—"}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">
                        {formatarMoeda(l.valor.toString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {grupos.length === 0 && (
          <p className="rounded-lg border border-black/10 px-4 py-6 text-center text-sm text-foreground/50 dark:border-white/15">
            Nenhuma conta encontrada pra esse filtro.
          </p>
        )}
      </div>
    </div>
  );
}
