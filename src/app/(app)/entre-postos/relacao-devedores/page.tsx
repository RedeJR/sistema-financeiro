import { formatarMoeda } from "@/lib/dinheiro";
import { calcularRelacaoDevedores, calcularSaldoLiquidoPorPosto } from "@/lib/entrePostos/relatorios";
import { CABECALHO_TABELA, CAMPO, CARTAO } from "@/lib/estilo";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

export const metadata = { title: "Entre Postos - Relação de devedores" };

export default async function RelacaoDevedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ ate?: string }>;
}) {
  const { ate } = await searchParams;
  const dataFim = ate ? dataUTC(ate) : undefined;

  const [blocos, saldosPorPosto] = await Promise.all([
    calcularRelacaoDevedores({ dataFim }),
    calcularSaldoLiquidoPorPosto({ dataFim }),
  ]);

  const totalGeral = blocos.reduce((s, b) => s + b.total, 0);
  const somaLiquidos = saldosPorPosto.reduce((s, p) => s + p.liquido, 0);
  const hojeISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <p className="text-sm text-foreground/60">
        Saldo em aberto de cada relação de empréstimo — só aparece quem ainda deve, líquido de todas as
        devoluções já lançadas. Relações totalmente quitadas somem daqui sozinhas.
      </p>

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="text-foreground/60">
            Saldo até
          </label>
          <input
            id="ate"
            type="date"
            name="ate"
            defaultValue={ate ?? ""}
            max={hojeISO}
            className={CAMPO}
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Calcular
        </button>
        <p className="text-xs text-foreground/50">Em branco = considera tudo lançado até hoje.</p>
      </form>

      {saldosPorPosto.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
          <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
            Saldo líquido por posto
          </div>
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "18%" }} />
              <col />
            </colgroup>
            <thead className={CABECALHO_TABELA}>
              <tr>
                <th className="px-4 py-2.5 text-left">Posto</th>
                <th className="px-4 py-2.5 text-right">É credor (a receber)</th>
                <th className="px-4 py-2.5 text-right">Deve (a pagar)</th>
                <th className="px-4 py-2.5 text-right">Saldo líquido</th>
                <th className="px-4 py-2.5 text-left">Situação</th>
              </tr>
            </thead>
            <tbody>
              {saldosPorPosto.map((p, i) => (
                <tr
                  key={p.postoId}
                  className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                >
                  <td className="px-4 py-3">{p.postoNome}</td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(p.credor)}</td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(p.devedor)}</td>
                  <td
                    className={`px-4 py-1.5 text-right whitespace-nowrap font-medium ${
                      p.liquido > 0 ? "text-green-700 dark:text-green-500" : p.liquido < 0 ? "text-red-700 dark:text-red-500" : ""
                    }`}
                  >
                    {formatarMoeda(p.liquido)}
                  </td>
                  <td className="px-4 py-1.5 text-foreground/70">
                    {p.liquido > 0.01 ? "Credor líquido" : p.liquido < -0.01 ? "Devedor líquido" : "Quitado"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-black/[0.03] font-semibold dark:border-white/10 dark:bg-white/[0.04]">
                <td className="px-4 py-3" colSpan={3}>
                  Verificação (soma dos saldos líquidos — deve dar zero)
                </td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(somaLiquidos)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {blocos.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhuma relação em aberto — tudo quitado.</p>
      ) : (
        <div className="space-y-4">
          {blocos.map((b) => (
            <div key={b.postoId} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <div className="border-b border-black/10 bg-amber-500/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10">
                {b.postoNome} deve para:
              </div>
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <tbody>
                  {b.credores.map((c, i) => (
                    <tr
                      key={c.postoId}
                      className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                    >
                      <td className="px-4 py-3">{c.postoNome}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(c.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-black/10 bg-black/[0.03] font-semibold dark:border-white/10 dark:bg-white/[0.04]">
                    <td className="px-4 py-3">Total {b.postoNome}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(b.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <div className="flex items-center justify-between bg-blue-950/10 px-4 py-2 text-sm font-semibold text-foreground/80 dark:bg-blue-950/25">
              <span>Total geral em aberto</span>
              <span>{formatarMoeda(totalGeral)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
