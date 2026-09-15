"use client";

import { useState } from "react";
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

// Recalcula Saldo Final (e o total Saldo Final Rede) na hora, a cada tecla
// digitada — pedido da usuária pra não precisar clicar em Salvar só pra ver
// o resultado. Os 3 campos manuais continuam <input> normais dentro do
// <form> de fora (ver page.tsx): salvar continua funcionando igual, isso
// aqui só adianta a conta na tela.
export function TabelaDia({ dia, podeEditar }: { dia: DiaFluxoCaixa; podeEditar: boolean }) {
  const [valores, setValores] = useState<Record<string, CamposManuais>>(() =>
    Object.fromEntries(
      dia.linhas.map((l) => [
        `${l.postoId}|${l.data}`,
        {
          saldoInicial: paraEdicao(l.saldoInicial),
          recebimentos: paraEdicao(l.recebimentos),
          despesasExtras: paraEdicao(l.despesasExtras),
        },
      ])
    )
  );

  function atualizar(chave: string, campo: keyof CamposManuais, valor: string) {
    setValores((atual) => ({ ...atual, [chave]: { ...atual[chave], [campo]: valor } }));
  }

  function saldoFinalDe(chave: string, linha: DiaFluxoCaixa["linhas"][number]): number {
    const v = valores[chave];
    return (
      paraNumero(v.saldoInicial) + paraNumero(v.recebimentos) - linha.combustiveis - linha.despesas - paraNumero(v.despesasExtras)
    );
  }

  const saldoFinalRede = dia.linhas.reduce((s, l) => s + saldoFinalDe(`${l.postoId}|${l.data}`, l), 0);

  return (
    <section className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/15">
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
              const saldoFinal = saldoFinalDe(chave, linha);
              return (
                <tr key={chave} className="border-t border-black/5 dark:border-white/10">
                  <td className="px-3 py-1.5">{linha.posto}</td>
                  <td className="px-3 py-1.5">
                    {podeEditar && <input type="hidden" name="chave" value={chave} />}
                    <p className={podeEditar ? "hidden text-right print:block" : "text-right"}>
                      {formatarMoeda(paraNumero(v.saldoInicial))}
                    </p>
                    {podeEditar && (
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`saldoInicial__${chave}`}
                        value={v.saldoInicial}
                        onChange={(e) => atualizar(chave, "saldoInicial", e.target.value)}
                        placeholder="0,00"
                        className={`${classeInput} print:hidden`}
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
                <td className="px-3 py-2 text-right">{formatarMoeda(saldoFinalRede)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
