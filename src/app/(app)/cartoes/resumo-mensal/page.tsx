import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarResumoMensal, type LinhaResumoMensal, type VendasPor } from "@/lib/cartoes/resumoMensal";
import { BotaoImprimir } from "./botao-imprimir";

function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m - 1, 1)).toLocaleDateString("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });
}

function percentual(l: LinhaResumoMensal): string {
  if (l.totalVendas === 0) return "—";
  return `${((l.entradas / l.totalVendas) * 100).toFixed(1).replace(".", ",")}%`;
}

function CabecalhoTabela() {
  return (
    <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
      <tr>
        <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
        <th className="px-4 py-1.5 text-right font-medium">Débito</th>
        <th className="px-4 py-1.5 text-right font-medium">Crédito</th>
        <th className="px-4 py-1.5 text-right font-medium">Pix</th>
        <th className="px-4 py-1.5 text-right font-medium">Total vendas</th>
        <th className="px-4 py-1.5 text-right font-medium">Entradas no banco</th>
        <th className="px-4 py-1.5 text-right font-medium">Diferença</th>
        <th className="px-4 py-1.5 text-right font-medium">Entradas / vendas</th>
      </tr>
    </thead>
  );
}

function CelulasValores({ l }: { l: LinhaResumoMensal }) {
  return (
    <>
      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.debito)}</td>
      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.credito)}</td>
      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.pix)}</td>
      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.totalVendas)}</td>
      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.entradas)}</td>
      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.diferenca)}</td>
      <td className="px-4 py-1.5 text-right whitespace-nowrap">{percentual(l)}</td>
    </>
  );
}

export default async function ResumoMensalCartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; postoId?: string; vendasPor?: string }>;
}) {
  const { mes, postoId, vendasPor } = await searchParams;
  const vendasPorPagamento = vendasPor === "pagamento";
  const modo: VendasPor = vendasPorPagamento ? "pagamento" : "venda";
  const mesValido = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : undefined;

  const postos = await prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  const resultado = mesValido ? await buscarResumoMensal({ mes: mesValido, postoId: postoId || undefined, vendasPor: modo }) : null;

  const qsBase = new URLSearchParams({ mes: mesValido ?? "" });
  if (postoId) qsBase.set("postoId", postoId);
  if (vendasPorPagamento) qsBase.set("vendasPor", "pagamento");
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });
  const postoNome = postos.find((p) => p.id === postoId)?.nome;

  const totalGeral = resultado?.reduce(
    (acc, p) => ({
      ...acc,
      debito: acc.debito + p.total.debito,
      credito: acc.credito + p.total.credito,
      pix: acc.pix + p.total.pix,
      totalVendas: acc.totalVendas + p.total.totalVendas,
      entradas: acc.entradas + p.total.entradas,
      diferenca: acc.diferenca + p.total.diferenca,
    }),
    { adquirente: "Total geral", debito: 0, credito: 0, pix: 0, totalVendas: 0, entradas: 0, diferenca: 0 } as LinhaResumoMensal
  );

  return (
    <div className="space-y-4">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">
          Resumo mensal de Cartões — {postoNome ?? "Todos os postos"} — {mesValido ? rotuloMes(mesValido) : ""}
        </h2>
        <p className="text-xs text-foreground/60">Gerado em {geradoEm}</p>
      </div>

      <p className="text-sm text-foreground/60 print:hidden">
        Total vendido no mês (valor líquido, por modalidade) contra o total que entrou no banco, por adquirente —
        pra ver se um compensa o outro mesmo quando o repasse não bate 100% (ex: operação de crédito com trava
        de cartões). O total do posto é o que vale pra essa conta: o repasse de uma adquirente pode cair na
        conta de outra.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm print:hidden">
        <div className="flex flex-col gap-1">
          <label htmlFor="mes" className="text-foreground/60">
            Mês
          </label>
          <input
            id="mes"
            type="month"
            name="mes"
            defaultValue={mesValido ?? ""}
            required
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
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
          <label htmlFor="vendasPor" className="text-foreground/60">
            Vendas por
          </label>
          <select
            id="vendasPor"
            name="vendasPor"
            defaultValue={modo}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="venda">Data da venda</option>
            <option value="pagamento">Data do pagamento</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Filtrar
        </button>
        {mesValido && (
          <Link href="/cartoes/resumo-mensal" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {mesValido && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/cartoes/resumo-mensal/exportar?${qsBase.toString()}`}
              className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Exportar (Excel)
            </Link>
            <BotaoImprimir />
          </div>
        )}
      </form>

      {!resultado && <p className="py-10 text-center text-sm text-foreground/50">Escolha o mês pra ver o resumo.</p>}

      {resultado && resultado.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhuma venda nem entrada de adquirente nesse mês/filtro.</p>
      )}

      {resultado && resultado.length > 0 && totalGeral && (
        <div className="space-y-4">
          {resultado.map((p) => (
            <div key={p.postoId} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
                {p.posto}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <CabecalhoTabela />
                  <tbody>
                    {p.linhas.map((l, i) => (
                      <tr
                        key={l.adquirente}
                        className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                      >
                        <td className="px-4 py-1.5">
                          {l.adquirente}
                          {l.totalVendas === 0 && l.entradas > 0 && (
                            <span className="ml-2 text-xs text-foreground/50">sem vendas no sistema</span>
                          )}
                        </td>
                        <CelulasValores l={l} />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-black/10 bg-black/[0.03] font-semibold dark:border-white/10 dark:bg-white/[0.04]">
                      <td className="px-4 py-1.5">Total {p.posto}</td>
                      <CelulasValores l={p.total} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {p.vendasSemLiquido > 0 && (
                <p className="border-t border-black/5 px-4 py-1.5 text-xs text-foreground/50 dark:border-white/10">
                  {p.vendasSemLiquido} venda(s) sem valor líquido no arquivo — não entram nas somas acima.
                </p>
              )}
            </div>
          ))}

          {resultado.length > 1 && (
            <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-blue-950/10 font-semibold dark:bg-blue-950/25">
                    <td className="px-4 py-1.5">Total geral</td>
                    <CelulasValores l={totalGeral} />
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
