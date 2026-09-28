import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarRelatorioCampoExtrato, listarCategoriasRelatorioExtrato } from "@/lib/extratos/relatorioCampos";
import { BotaoImprimir } from "./botao-imprimir";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export default async function RelatoriosExtratosPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; categoriaId?: string; de?: string; ate?: string }>;
}) {
  await exigirPermissao("EXTRATOS", "visualizar");

  const { postoId, de, ate, categoriaId: categoriaIdParam } = await searchParams;

  const [postos, categorias] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    listarCategoriasRelatorioExtrato(),
  ]);
  // Sem escolha na URL, cai na categoria "OUTROS" quando ela existir (é o
  // campo que a usuária mais usa pro fechamento) — senão, a primeira da
  // lista.
  const categoriaId =
    categoriaIdParam && categorias.some((c) => c.id === categoriaIdParam)
      ? categoriaIdParam
      : (categorias.find((c) => c.nome === "OUTROS") ?? categorias[0])?.id;

  const temFiltro = Boolean(de && ate && categoriaId);
  const blocos = temFiltro
    ? await buscarRelatorioCampoExtrato({
        categoriaId: categoriaId!,
        postoId: postoId || undefined,
        dataInicio: dataUTC(de!),
        dataFim: dataUTC(ate!, true),
      })
    : null;

  const totalGeral = (blocos ?? []).reduce((s, b) => s + b.total, 0);
  const nomeCategoria = categorias.find((c) => c.id === categoriaId)?.nome ?? "";
  const postoNome = postos.find((p) => p.id === postoId)?.nome;
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });

  const qsBase = new URLSearchParams({ categoriaId: categoriaId ?? "", de: de ?? "", ate: ate ?? "" });
  if (postoId) qsBase.set("postoId", postoId);

  return (
    <div className="space-y-4">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">
          {nomeCategoria} — {postoNome ?? "Todos os postos"} — {de} a {ate}
        </h2>
        <p className="text-xs text-foreground/60">Gerado em {geradoEm}</p>
      </div>

      <div className="flex items-center justify-between print:hidden">
        <div>
          <Link href="/extratos" className="text-sm text-foreground/60 underline">
            ← Voltar pra Conciliação de Extratos
          </Link>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
        </div>
      </div>

      <p className="text-sm text-foreground/60 print:hidden">
        Junta os lançamentos de extrato de uma categoria (qualquer uma cadastrada em Categorias de Extrato) por
        posto, no formato da planilha de receitas extras do fechamento.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm print:hidden">
        <div className="flex flex-col gap-1">
          <label htmlFor="categoriaId" className="text-foreground/60">
            Campo
          </label>
          <select
            id="categoriaId"
            name="categoriaId"
            defaultValue={categoriaId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
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
          <label htmlFor="de" className="text-foreground/60">
            Período — de
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={de ?? ""}
            required
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
          <Link href="/extratos/relatorios" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {temFiltro && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/extratos/relatorios/exportar?${qsBase.toString()}`}
              className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Exportar (Excel)
            </Link>
            <BotaoImprimir />
          </div>
        )}
      </form>

      {!blocos && (
        <p className="py-10 text-center text-sm text-foreground/50">Escolha o período pra ver o relatório.</p>
      )}

      {blocos && (
        <div className="space-y-4">
          {blocos.map((b) => (
            <div key={b.postoId} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
                {b.postoNome}
              </div>
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col />
                </colgroup>
                <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-1.5 text-left font-medium">Data</th>
                    <th className="px-4 py-1.5 text-right font-medium">Valor</th>
                    <th className="px-4 py-1.5 text-left font-medium">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {b.linhas.map((l, i) => (
                    <tr
                      key={l.id}
                      className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                    >
                      <td className="px-4 py-1.5 whitespace-nowrap">{formatarData(l.data)}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.valor)}</td>
                      <td className="px-4 py-1.5 text-foreground/70 break-words">{l.descricao || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-black/10 bg-black/[0.03] font-semibold dark:border-white/10 dark:bg-white/[0.04]">
                    <td className="px-4 py-1.5">Total</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(b.total)}</td>
                    <td className="px-4 py-1.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          {blocos.length > 1 && (
            <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <div className="flex items-center justify-between bg-blue-950/10 px-4 py-2 text-sm font-semibold text-foreground/80 dark:bg-blue-950/25">
                <span>Total geral — {nomeCategoria}</span>
                <span>{formatarMoeda(totalGeral)}</span>
              </div>
            </div>
          )}

          {blocos.length === 0 && (
            <p className="py-10 text-center text-sm text-foreground/50">Nenhum posto encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
}
