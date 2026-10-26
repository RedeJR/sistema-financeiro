// Saldo que o banco informa dentro do arquivo (LEDGERBAL), levado pro FIM do último dia fechado.
//
// O arquivo costuma ser baixado com o dia de hoje ainda aberto, e o sistema não importa esse dia —
// então tira do saldo as linhas posteriores ao último dia fechado. Só que o saldo do arquivo vale
// até a data de referência dele (o dia da exportação): linhas com data DEPOIS disso são
// lançamentos futuros (ex: DARF agendado pra 30/10, recebimento previsto pra 27/10) que o banco
// lista no extrato mas não entram no saldo — descontá-las também errava o saldo (visto no
// Bradesco do Barramares, 26/10/2026: saldo guardado 3.600,52 acima do real).
export function saldoNoUltimoDiaFechado(params: {
  saldoArquivo: { saldo: number; data: Date | null };
  linhas: { data: Date; valor: number }[];
  ontem: Date;
}): { data: Date; saldo: number } {
  const { saldoArquivo, linhas, ontem } = params;
  const ultimaLinha = linhas.reduce((m, l) => (l.data > m ? l.data : m), linhas[0]?.data ?? ontem);
  const dataRef = saldoArquivo.data ?? ultimaLinha;
  const data = dataRef < ontem ? dataRef : ontem;
  const entreOCorteEaReferencia = linhas.filter((l) => l.data > data && l.data <= dataRef).reduce((s, l) => s + l.valor, 0);
  return { data, saldo: Math.round((saldoArquivo.saldo - entreOCorteEaReferencia) * 100) / 100 };
}
