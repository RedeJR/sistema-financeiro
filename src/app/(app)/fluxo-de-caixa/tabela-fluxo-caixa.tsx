"use client";

import { useMemo, useState } from "react";
import { formatarMoeda, paraDecimalString } from "@/lib/dinheiro";
import type { DiaFluxoCaixa } from "./consulta";

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

function paraNumero(texto: string): number {
  const s = paraDecimalString(texto);
  return s === null ? 0 : Number(s);
}

const classeInput =
  "w-full rounded-md border border-black/15 bg-transparent px-2 py-1 text-right text-sm outline-none focus:border-foreground/40 dark:border-white/20";

type CamposManuais = { saldoInicial: string; recebimentos: string; despesasExtras: string };
type LinhaCalculada = { saldoInicialEfetivo: number; saldoFinal: number };

// Recalcula tudo na hora, a cada tecla digitada — sem precisar clicar em
// Salvar. Quando "encadear" está marcado, o Saldo Inicial de cada posto a
// partir do 2º dia do período deixa de ser digitado e passa a ser o Saldo
// Final desse mesmo posto no dia anterior (dentro do período filtrado, não
// antes dele) — pedido da usuária pra preencher só o primeiro dia e deixar
// o resto da semana calculando sozinho. O valor calculado ainda é o que vai
// no <input> (só fica `readOnly`), então Salvar grava exatamente o que
// apareceu na tela.
export function TabelaFluxoCaixa({ dias, podeEditar }: { dias: DiaFluxoCaixa[]; podeEditar: boolean }) {
  const [valores, setValores] = useState<Record<string, CamposManuais>>(() =>
    Object.fromEntries(
      dias.flatMap((dia) =>
        dia.linhas.map((l) => [
          `${l.postoId}|${l.data}`,
          {
            saldoInicial: paraEdicao(l.saldoInicial),
            recebimentos: paraEdicao(l.recebimentos),
            despesasExtras: paraEdicao(l.despesasExtras),
          },
        ])
      )
    )
  );
  const [encadear, setEncadear] = useState(false);

  function atualizar(chave: string, campo: keyof CamposManuais, valor: string) {
    setValores((atual) => ({ ...atual, [chave]: { ...atual[chave], [campo]: valor } }));
  }

  // Um único cálculo em ordem cronológica: cada dia usa o Saldo Final já
  // calculado do dia anterior (mesmo posto) quando encadeado, por isso não
  // dá pra calcular cada tabela isolada — precisa ser tudo junto e em ordem.
  const { calculado, saldoFinalRedePorDia } = useMemo(() => {
    const calculado = new Map<string, LinhaCalculada>();
    const saldoFinalRedePorDia = new Map<string, number>();
    dias.forEach((dia, indiceDia) => {
      let totalDia = 0;
      for (const linha of dia.linhas) {
        const chave = `${linha.postoId}|${linha.data}`;
        const v = valores[chave];
        const saldoInicialEfetivo =
          indiceDia > 0 && encadear
            ? (calculado.get(`${linha.postoId}|${dias[indiceDia - 1].data}`)?.saldoFinal ?? 0)
            : paraNumero(v.saldoInicial);
        const saldoFinal =
          saldoInicialEfetivo + paraNumero(v.recebimentos) - linha.combustiveis - linha.despesas - paraNumero(v.despesasExtras);
        calculado.set(chave, { saldoInicialEfetivo, saldoFinal });
        totalDia += saldoFinal;
      }
      saldoFinalRedePorDia.set(dia.data, totalDia);
    });
    return { calculado, saldoFinalRedePorDia };
  }, [dias, valores, encadear]);

  return (
    <div className="space-y-4">
      {podeEditar && dias.length > 1 && (
        <label className="flex items-center gap-2 text-sm text-foreground/80">
          <input type="checkbox" checked={encadear} onChange={(e) => setEncadear(e.target.checked)} />
          Puxar o saldo final do dia anterior como saldo inicial do dia seguinte
        </label>
      )}

      {dias.map((dia, indiceDia) => (
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
                  const v = valores[chave];
                  const { saldoInicialEfetivo, saldoFinal } = calculado.get(chave)!;
                  const saldoInicialEncadeado = indiceDia > 0 && encadear;
                  return (
                    <tr key={chave} className="border-t border-black/5 dark:border-white/10">
                      <td className="px-3 py-1.5">{linha.posto}</td>
                      <td className="px-3 py-1.5">
                        {podeEditar && <input type="hidden" name="chave" value={chave} />}
                        <p className={podeEditar ? "hidden text-right print:block" : "text-right"}>
                          {formatarMoeda(saldoInicialEfetivo)}
                        </p>
                        {podeEditar && (
                          <input
                            type="text"
                            inputMode="decimal"
                            name={`saldoInicial__${chave}`}
                            value={saldoInicialEncadeado ? paraEdicao(saldoInicialEfetivo) : v.saldoInicial}
                            onChange={(e) => atualizar(chave, "saldoInicial", e.target.value)}
                            readOnly={saldoInicialEncadeado}
                            title={saldoInicialEncadeado ? "Vem do Saldo Final do dia anterior" : undefined}
                            placeholder="0,00"
                            className={`${classeInput} print:hidden ${
                              saldoInicialEncadeado ? "bg-black/5 dark:bg-white/5" : ""
                            }`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <p className={podeEditar ? "hidden text-right print:block" : "text-right"}>
                          {formatarMoeda(paraNumero(v.recebimentos))}
                        </p>
                        {podeEditar && (
                          <input
                            type="text"
                            inputMode="decimal"
                            name={`recebimentos__${chave}`}
                            value={v.recebimentos}
                            onChange={(e) => atualizar(chave, "recebimentos", e.target.value)}
                            placeholder="0,00"
                            className={`${classeInput} print:hidden`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-foreground/70">{formatarMoeda(linha.combustiveis)}</td>
                      <td className="px-3 py-1.5 text-right text-foreground/70">{formatarMoeda(linha.despesas)}</td>
                      <td className="px-3 py-1.5">
                        <p className={podeEditar ? "hidden text-right print:block" : "text-right"}>
                          {formatarMoeda(paraNumero(v.despesasExtras))}
                        </p>
                        {podeEditar && (
                          <input
                            type="text"
                            inputMode="decimal"
                            name={`despesasExtras__${chave}`}
                            value={v.despesasExtras}
                            onChange={(e) => atualizar(chave, "despesasExtras", e.target.value)}
                            placeholder="0,00"
                            className={`${classeInput} print:hidden`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatarMoeda(saldoFinal)}</td>
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
                    <td className="px-3 py-2 text-right">{formatarMoeda(saldoFinalRedePorDia.get(dia.data) ?? 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
