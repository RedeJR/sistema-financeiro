"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { formatarMoeda, paraDecimalString } from "@/lib/dinheiro";
import type { DiaFluxoCaixa, LinhaFluxoCaixa } from "./consulta";

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

// Uma linha por (posto, dia) — cada uma cuida sozinha da digitação dos seus
// 3 campos (estado LOCAL, não da tabela inteira). Antes, digitar em QUALQUER
// campo recalculava e re-renderizava TODAS as linhas de TODOS os dias a cada
// tecla (um estado só, pra tabela inteira) — com muitos postos/dias
// filtrados (ex: um mês inteiro, todos os postos = ~570 linhas), isso
// travava o navegador. Aqui, digitar só re-renderiza essa linha; ela avisa
// o pai via `onMudar` (pra somar o Saldo Final Rede e, com "encadear"
// ligado, alimentar o Saldo Inicial do dia seguinte do mesmo posto) sem
// forçar o pai a re-renderizar a cada tecla — só ~200ms depois de parar de
// digitar (ver debounce em TabelaFluxoCaixa).
type PropsLinha = {
  linha: LinhaFluxoCaixa;
  podeEditar: boolean;
  saldoInicialForcado: number | null; // não-nulo quando "encadear" está ligado e não é o 1º dia do período
  onMudar: (chave: string, saldoFinal: number) => void;
};

const LinhaEditavel = memo(function LinhaEditavel({ linha, podeEditar, saldoInicialForcado, onMudar }: PropsLinha) {
  const chave = `${linha.postoId}|${linha.data}`;
  const [campos, setCampos] = useState<CamposManuais>(() => ({
    saldoInicial: paraEdicao(linha.saldoInicial),
    recebimentos: paraEdicao(linha.recebimentos),
    despesasExtras: paraEdicao(linha.despesasExtras),
  }));

  const saldoInicialEfetivo = saldoInicialForcado ?? paraNumero(campos.saldoInicial);
  const saldoFinal = saldoInicialEfetivo + paraNumero(campos.recebimentos) - linha.combustiveis - linha.despesas - paraNumero(campos.despesasExtras);

  // Avisa o pai a cada render (não só em onChange) porque o saldoFinal
  // também muda quando `saldoInicialForcado` chega de fora (encadeamento) —
  // sem side-effect (useEffect) isso rodaria em loop; guarda o último valor
  // avisado e só chama de novo se mudou de verdade.
  const ultimoAvisado = useRef<number | null>(null);
  if (ultimoAvisado.current !== saldoFinal) {
    ultimoAvisado.current = saldoFinal;
    onMudar(chave, saldoFinal);
  }

  const alterar = useCallback((campo: keyof CamposManuais, valor: string) => {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
  }, []);

  const encadeado = saldoInicialForcado !== null;

  return (
    <tr className="border-t border-black/5 dark:border-white/10">
      <td className="px-3 py-1.5">{linha.posto}</td>
      <td className="px-3 py-1.5">
        {podeEditar && <input type="hidden" name="chave" value={chave} />}
        <p className={podeEditar ? "hidden text-right print:block" : "text-right"}>{formatarMoeda(saldoInicialEfetivo)}</p>
        {podeEditar && (
          <input
            type="text"
            inputMode="decimal"
            name={`saldoInicial__${chave}`}
            value={encadeado ? paraEdicao(saldoInicialEfetivo) : campos.saldoInicial}
            onChange={(e) => alterar("saldoInicial", e.target.value)}
            readOnly={encadeado}
            title={encadeado ? "Vem do Saldo Final do dia anterior" : undefined}
            placeholder="0,00"
            className={`${classeInput} print:hidden ${encadeado ? "bg-black/5 dark:bg-white/5" : ""}`}
          />
        )}
      </td>
      <td className="px-3 py-1.5">
        <p className={podeEditar ? "hidden text-right print:block" : "text-right"}>{formatarMoeda(paraNumero(campos.recebimentos))}</p>
        {podeEditar && (
          <input
            type="text"
            inputMode="decimal"
            name={`recebimentos__${chave}`}
            value={campos.recebimentos}
            onChange={(e) => alterar("recebimentos", e.target.value)}
            placeholder="0,00"
            className={`${classeInput} print:hidden`}
          />
        )}
      </td>
      <td className="px-3 py-1.5 text-right text-foreground/70">{formatarMoeda(linha.combustiveis)}</td>
      <td className="px-3 py-1.5 text-right text-foreground/70">{formatarMoeda(linha.despesas)}</td>
      <td className="px-3 py-1.5">
        <p className={podeEditar ? "hidden text-right print:block" : "text-right"}>{formatarMoeda(paraNumero(campos.despesasExtras))}</p>
        {podeEditar && (
          <input
            type="text"
            inputMode="decimal"
            name={`despesasExtras__${chave}`}
            value={campos.despesasExtras}
            onChange={(e) => alterar("despesasExtras", e.target.value)}
            placeholder="0,00"
            className={`${classeInput} print:hidden`}
          />
        )}
      </td>
      <td className="px-3 py-1.5 text-right font-medium">{formatarMoeda(saldoFinal)}</td>
    </tr>
  );
});

// Recalcula tudo na hora, a cada tecla digitada — sem precisar clicar em
// Salvar. Quando "encadear" está marcado, o Saldo Inicial de cada posto a
// partir do 2º dia do período deixa de ser digitado e passa a ser o Saldo
// Final desse mesmo posto no dia anterior (dentro do período filtrado, não
// antes dele) — pedido da usuária pra preencher só o primeiro dia e deixar
// o resto da semana calculando sozinho. O valor calculado ainda é o que vai
// no <input> (só fica `readOnly`), então Salvar grava exatamente o que
// apareceu na tela.
export function TabelaFluxoCaixa({ dias, podeEditar }: { dias: DiaFluxoCaixa[]; podeEditar: boolean }) {
  const [encadear, setEncadear] = useState(false);

  // Saldo final "conhecido" de cada linha (postoId|data) — atualizado pelas
  // próprias linhas (ver LinhaEditavel/onMudar), SEM causar re-render a
  // cada tecla. Só vira re-render (pra atualizar o rodapé e as linhas
  // encadeadas) uns ~200ms depois de parar de digitar — ver debounce
  // abaixo. É intencional que o rodapé/encadeamento fiquem um instante
  // "atrasados" em troca de a digitação nunca travar.
  const saldoFinalRef = useRef<Record<string, number>>({});
  const [, forcarAtualizacao] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMudarLinha = useCallback((chave: string, saldoFinal: number) => {
    saldoFinalRef.current[chave] = saldoFinal;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => forcarAtualizacao((n) => n + 1), 200);
  }, []);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <div className="space-y-4">
      {podeEditar && dias.length > 1 && (
        <label className="flex items-center gap-2 text-sm text-foreground/80">
          <input type="checkbox" checked={encadear} onChange={(e) => setEncadear(e.target.checked)} />
          Puxar o saldo final do dia anterior como saldo inicial do dia seguinte
        </label>
      )}

      {dias.map((dia, indiceDia) => {
        const totalDia = dia.linhas.reduce((s, l) => s + (saldoFinalRef.current[`${l.postoId}|${l.data}`] ?? l.saldoFinal), 0);
        return (
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
                    const chaveAnterior = indiceDia > 0 ? `${linha.postoId}|${dias[indiceDia - 1].data}` : null;
                    const saldoInicialForcado =
                      indiceDia > 0 && encadear && chaveAnterior
                        ? (saldoFinalRef.current[chaveAnterior] ?? dias[indiceDia - 1].linhas.find((l) => l.postoId === linha.postoId)?.saldoFinal ?? 0)
                        : null;
                    return (
                      <LinhaEditavel
                        key={`${linha.postoId}|${linha.data}`}
                        linha={linha}
                        podeEditar={podeEditar}
                        saldoInicialForcado={saldoInicialForcado}
                        onMudar={onMudarLinha}
                      />
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
                      <td className="px-3 py-2 text-right">{formatarMoeda(totalDia)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
