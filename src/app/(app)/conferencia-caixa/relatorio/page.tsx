import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarRelatorioCaixa } from "@/lib/cartoes/relatorio";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function paraDatetimeUTC(valor: string): Date {
  // datetime-local vem como "AAAA-MM-DDTHH:MM", sem fuso — trata como UTC
  // direto, mesmo padrão de data usado no resto do sistema.
  return new Date(`${valor}:00.000Z`);
}

export default async function RelatorioCaixaPage({
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
  const relatorio =
    temFiltro && postoId && inicio && fim
      ? await buscarRelatorioCaixa({
          postoId,
          inicio: paraDatetimeUTC(inicio),
          fim: paraDatetimeUTC(fim),
        })
      : null;

  return (
    <div className="space-y-4">
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
          <label htmlFor="inicio" className="text-foreground/60">
            Início do turno
          </label>
          <input
            id="inicio"
            type="datetime-local"
            name="inicio"
            defaultValue={inicio ?? ""}
            required
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fim" className="text-foreground/60">
            Fim do turno
          </label>
          <input
            id="fim"
            type="datetime-local"
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
          <Link href="/conferencia-caixa/relatorio" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>
      <p className="text-xs text-foreground/50">
        O fim pode ser no dia seguinte ao início — útil pra turnos que viram a noite (ex: 06:00 de um dia
        até 06:00 do dia seguinte).
      </p>

      {!relatorio && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Escolha um posto e o período do turno pra ver as vendas encontradas.
        </p>
      )}

      {relatorio && relatorio.linhas.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Nenhuma venda encontrada nesse posto/período. Confira se os arquivos já foram importados na aba
          Upload dos Arquivos.
        </p>
      )}

      {relatorio && relatorio.linhas.length > 0 && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
              Resumo por adquirente
            </div>
            <table className="w-full text-sm">
              <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
                  <th className="px-4 py-1.5 text-right font-medium">Qtd</th>
                  <th className="px-4 py-1.5 text-right font-medium">Valor bruto</th>
                  <th className="px-4 py-1.5 text-right font-medium">Taxa</th>
                  <th className="px-4 py-1.5 text-right font-medium">Valor líquido</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.resumo.map((r, i) => (
                  <tr
                    key={r.adquirente}
                    className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                  >
                    <td className="px-4 py-1.5">{r.adquirente}</td>
                    <td className="px-4 py-1.5 text-right">{r.qtd}</td>
                    <td className="px-4 py-1.5 text-right">{formatarMoeda(r.totalBruto)}</td>
                    <td className="px-4 py-1.5 text-right">{formatarMoeda(r.totalTaxa)}</td>
                    <td className="px-4 py-1.5 text-right">{formatarMoeda(r.totalLiquido)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/10 bg-blue-950/10 font-semibold dark:border-white/10 dark:bg-blue-950/25">
                  <td className="px-4 py-1.5">Total geral</td>
                  <td className="px-4 py-1.5 text-right">{relatorio.linhas.length}</td>
                  <td className="px-4 py-1.5 text-right">{formatarMoeda(relatorio.totalBruto)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <div className="border-b border-black/10 bg-black/[0.02] px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-white/[0.02]">
              Detalhamento das vendas
            </div>
            <div className="max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/[0.02] dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-1.5 text-left font-medium">Data</th>
                    <th className="px-4 py-1.5 text-left font-medium">Hora</th>
                    <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
                    <th className="px-4 py-1.5 text-left font-medium">Modalidade</th>
                    <th className="px-4 py-1.5 text-right font-medium">Valor bruto</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.linhas.map((l, i) => (
                    <tr
                      key={l.id}
                      className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                    >
                      <td className="px-4 py-1.5 whitespace-nowrap">{formatarData(l.dataVenda)}</td>
                      <td className="px-4 py-1.5 whitespace-nowrap">{l.horaVenda || "—"}</td>
                      <td className="px-4 py-1.5">{l.adquirente}</td>
                      <td className="px-4 py-1.5 text-foreground/70">{l.tipoVenda}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.valorBruto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
