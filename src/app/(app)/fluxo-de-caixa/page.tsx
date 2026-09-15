import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarFluxoCaixa } from "./consulta";
import { salvarFluxoCaixa } from "./actions";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function formatarDataExibicao(iso: string): string {
  return dataUTC(iso).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// "" pra zero (célula parece vazia, mais fácil de digitar por cima) em vez
// de raw toString() — evita o formato "1234.56" (ponto, sem vírgula) cair
// direto num input que depois é lido de volta como texto BR.
function paraEdicao(valor: number): string {
  return valor === 0 ? "" : valor.toFixed(2).replace(".", ",");
}

function paraArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

const classeInput =
  "w-full rounded-md border border-black/15 bg-transparent px-2 py-1 text-right text-sm outline-none focus:border-foreground/40 dark:border-white/20";

export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; de?: string; ate?: string }>;
}) {
  await exigirPermissao("FLUXO_DE_CAIXA", "visualizar");
  const podeEditar = await podeEditarModulo("FLUXO_DE_CAIXA");

  const filtros = await searchParams;
  const postoIds = paraArray(filtros.postoId);
  const de = filtros.de || hojeISO();
  const ate = filtros.ate || hojeISO();

  const [postosTodos, dias] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    buscarFluxoCaixa({ postoIds, de, ate }),
  ]);

  const temFiltro = Boolean(postoIds.length || filtros.de || filtros.ate);

  const qsAtual = new URLSearchParams();
  postoIds.forEach((id) => qsAtual.append("postoId", id));
  qsAtual.set("de", de);
  qsAtual.set("ate", ate);
  const voltarPara = `/fluxo-de-caixa?${qsAtual.toString()}`;

  const Tabela = ({ dia }: { dia: (typeof dias)[number] }) => (
    <section key={dia.data} className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-base font-medium capitalize">{formatarDataExibicao(dia.data)}</h2>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Posto</th>
              <th className="px-3 py-2 text-right font-medium">Saldo Inicial</th>
              <th className="px-3 py-2 text-right font-medium">Recebimentos</th>
              <th className="px-3 py-2 text-right font-medium">Combustíveis</th>
              <th className="px-3 py-2 text-right font-medium">Despesas</th>
              <th className="px-3 py-2 text-right font-medium">Despesas Extras</th>
              <th className="px-3 py-2 text-right font-medium">Saldo Final</th>
            </tr>
          </thead>
          <tbody>
            {dia.linhas.map((linha) => {
              const chave = `${linha.postoId}|${linha.data}`;
              return (
                <tr key={chave} className="border-t border-black/5 dark:border-white/10">
                  <td className="px-3 py-1.5">{linha.posto}</td>
                  <td className="px-3 py-1.5">
                    {podeEditar ? (
                      <>
                        <input type="hidden" name="chave" value={chave} />
                        <input
                          type="text"
                          inputMode="decimal"
                          name={`saldoInicial__${chave}`}
                          defaultValue={paraEdicao(linha.saldoInicial)}
                          placeholder="0,00"
                          className={classeInput}
                        />
                      </>
                    ) : (
                      <p className="text-right">{formatarMoeda(linha.saldoInicial)}</p>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {podeEditar ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`recebimentos__${chave}`}
                        defaultValue={paraEdicao(linha.recebimentos)}
                        placeholder="0,00"
                        className={classeInput}
                      />
                    ) : (
                      <p className="text-right">{formatarMoeda(linha.recebimentos)}</p>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-foreground/70">{formatarMoeda(linha.combustiveis)}</td>
                  <td className="px-3 py-1.5 text-right text-foreground/70">{formatarMoeda(linha.despesas)}</td>
                  <td className="px-3 py-1.5">
                    {podeEditar ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`despesasExtras__${chave}`}
                        defaultValue={paraEdicao(linha.despesasExtras)}
                        placeholder="0,00"
                        className={classeInput}
                      />
                    ) : (
                      <p className="text-right">{formatarMoeda(linha.despesasExtras)}</p>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium">{formatarMoeda(linha.saldoFinal)}</td>
                </tr>
              );
            })}
            {dia.linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-foreground/50">
                  Nenhum posto pra mostrar nesse filtro.
                </td>
              </tr>
            )}
          </tbody>
          {dia.linhas.length > 0 && (
            <tfoot>
              <tr className="border-t border-black/10 bg-black/5 font-medium dark:border-white/15 dark:bg-white/5">
                <td className="px-3 py-2" colSpan={6}>
                  Saldo Final Rede
                </td>
                <td className="px-3 py-2 text-right">{formatarMoeda(dia.saldoFinalRede)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Fluxo de Caixa</h1>
      <p className="text-sm text-foreground/60">
        Saldo Inicial, Recebimentos e Despesas Extras são preenchidos manual. Combustíveis vem de{" "}
        <Link href="/combustiveis-a-pagar" className="underline">
          Combustíveis a Pagar
        </Link>{" "}
        e Despesas vem de{" "}
        <Link href="/contas-a-pagar" className="underline">
          Contas a Pagar
        </Link>{" "}
        — os dois somados pela data de vencimento. Saldo Final = Saldo Inicial + Recebimentos − Combustíveis −
        Despesas − Despesas Extras.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto <span className="text-xs">(Ctrl/Cmd+clique pra mais de um)</span>
          </label>
          <select
            id="postoId"
            name="postoId"
            multiple
            size={5}
            defaultValue={postoIds}
            className="min-w-[11rem] rounded-md border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
          >
            {postosTodos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            De
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={de}
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
            defaultValue={ate}
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
          <Link href="/fluxo-de-caixa" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      {podeEditar ? (
        <form action={salvarFluxoCaixa} className="space-y-4">
          <input type="hidden" name="voltarPara" value={voltarPara} />
          {dias.map((dia) => (
            <Tabela key={dia.data} dia={dia} />
          ))}
          {dias.length > 0 && (
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
              >
                Salvar
              </button>
            </div>
          )}
        </form>
      ) : (
        <div className="space-y-4">
          {dias.map((dia) => (
            <Tabela key={dia.data} dia={dia} />
          ))}
        </div>
      )}

      {dias.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">Escolha um período pra ver o fluxo de caixa.</p>
      )}
    </div>
  );
}
