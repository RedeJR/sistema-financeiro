// Quanto de uma Venda a Prazo já entrou no extrato. Sem "server-only": as telas (servidor) e qualquer cálculo
// puro usam o mesmo critério.

// Diferença aceita pra dar a venda por recebida (ex: Pix de R$ 5.493,46 pra uma venda de R$ 5.493,56).
export const TOLERANCIA_FECHAMENTO = 1;

export type SituacaoRecebimento = "SEM_CREDITO" | "PARCIAL" | "COMPLETO";

export type ResumoRecebimento = {
  recebido: number;
  falta: number; // > 0 = ainda falta; < 0 = entrou a mais
  diferenca: number; // |valor - recebido| quando já está completo mas não é exato, senão 0
  situacao: SituacaoRecebimento;
};

export function resumoRecebimento(valor: number, valoresCreditos: number[]): ResumoRecebimento {
  const centavos = (n: number) => Math.round(n * 100);
  const recebido = valoresCreditos.reduce((s, v) => s + centavos(v), 0) / 100;
  const falta = (centavos(valor) - centavos(recebido)) / 100;
  if (valoresCreditos.length === 0) return { recebido: 0, falta: valor, diferenca: 0, situacao: "SEM_CREDITO" };
  if (falta > TOLERANCIA_FECHAMENTO) return { recebido, falta, diferenca: 0, situacao: "PARCIAL" };
  return { recebido, falta, diferenca: Math.abs(falta) > 0.005 ? Math.abs(falta) : 0, situacao: "COMPLETO" };
}
