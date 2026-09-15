import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import {
  buscarRelatorio,
  agruparPorVencimento,
  agruparPorPlanoConta,
  agruparPorPosto,
} from "@/app/(app)/relatorios/consulta";
import { BotaoImprimir } from "./botao-imprimir";

// Mesma tela do botão "Relatório (imprimir / PDF)" de Contas a Pagar (pedido
// da usuária) — reaproveita a consulta e o agrupamento de lá (buscarRelatorio
// já suporta filtrar por situação), só que aqui a situação vem sempre fixa
// em "paga", sem a caixinha de escolher — é isso que diferencia esse módulo
// do Relatório geral (que continua mostrando pagas e a pagar).
function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function paraArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

type Filtros = {
  postoId?: string | string[];
  // "1" = filtra pelo posto PAGADOR (checkbox "Pagador" marcado); ausente
  // (padrão) = filtra pelo posto DONO da despesa — pedido explícito da
  // usuária, só nessa tela (ver postoPagador em relatorios/consulta.ts).
  postoPagador?: string;
  fornecedorId?: string | string[];
  planoContaId?: string | string[];
  de?: string;
  ate?: string;
  ordem?: string;
};

export default async function ContasPagasPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  await exigirPermissao("CONTAS_PAGAS", "visualizar");

  const filtros = await searchParams;
  const postoIdsSelecionados = paraArray(filtros.postoId);
  const fornecedorIdsSelecionados = paraArray(filtros.fornecedorId);
  const planoContaIdsSelecionados = paraArray(filtros.planoContaId);
  const ordem =
    filtros.ordem === "planoConta" ? "planoConta" : filtros.ordem === "posto" ? "posto" : "vencimento";

  const [linhas, postos, fornecedores, gruposPlanoConta] = await Promise.all([
    buscarRelatorio({ ...filtros, status: "PAGA", statusEnviado: "1" }),
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
    postoIdsSelecionados.length ||
      filtros.postoPagador === "1" ||
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
        <h1 className="text-2xl font-semibold">Contas Pagas</h1>
        <BotaoImprimir />
      </div>
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">Contas Pagas</h1>
        <p className="text-xs text-foreground/60">Gerado em {geradoEm}</p>
      </div>

      <form className="space-y-3 text-sm print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-foreground/60">Posto</label>
            <SeletorDropdown
              nome="postoId"
              rotuloTodos="Todos os postos"
              selecionados={postoIdsSelecionados}
              itens={postos.map((p) => ({ id: p.id, nome: p.nome }))}
            />
            {/* Padrão: filtra pelo posto DONO da despesa. Marcando essa
                caixa, passa a filtrar por quem PAGOU (ex: escolher a
                OLIVEIRA traz também o que ela pagou pra outros postos) —
                pedido explícito da usuária, só nessa tela. */}
            <label className="flex items-center gap-1.5 text-xs text-foreground/60">
              <input type="checkbox" name="postoPagador" value="1" defaultChecked={filtros.postoPagador === "1"} />
              Pagador
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-foreground/60">Fornecedor</label>
            <SeletorDropdown
              nome="fornecedorId"
              rotuloTodos="Todos os fornecedores"
              selecionados={fornecedorIdsSelecionados}
              itens={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-foreground/60">Plano de contas</label>
            <SeletorDropdown
              nome="planoContaId"
              rotuloTodos="Todos os planos de conta"
              selecionados={planoContaIdsSelecionados}
              grupos={gruposPlanoConta.map((g) => ({
                id: g.id,
                nome: g.nome,
                itens: g.contas.map((c) => ({ id: c.id, nome: c.nome })),
              }))}
            />
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

          <button
            type="submit"
            className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Filtrar
          </button>
          {temFiltro && (
            <Link href="/contas-pagas" className="text-foreground/60 underline">
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
            <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
              {g.subtitulo ? `${g.subtitulo} / ${g.titulo}` : g.titulo} — {g.linhas.length} conta
              {g.linhas.length === 1 ? "" : "s"} — total {formatarMoeda(g.total)}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                  <tr>
                    {ordem !== "vencimento" && <th className="px-4 py-1.5 text-left font-medium">Vencimento</th>}
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
            Nenhuma conta paga encontrada pra esse filtro.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-blue-950/10 px-4 py-2 text-sm font-semibold text-foreground/80 dark:bg-blue-950/25">
        <span>
          Total do período — {linhas.length} conta{linhas.length === 1 ? "" : "s"}
        </span>
        <span>{formatarMoeda(total)}</span>
      </div>
    </div>
  );
}
