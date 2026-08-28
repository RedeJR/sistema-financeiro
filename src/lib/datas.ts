// Soma `meses` a uma data preservando o dia, com "clamp" pro último dia do
// mês de destino quando ele não existe (ex: 31/01 + 1 mês = 28/02, não
// 02/03). Usado no parcelamento e na recorrência mensal de Contas a Pagar.
// Trabalha em UTC porque os campos são `@db.Date` no Postgres (sem hora).
export function adicionarMeses(data: Date, meses: number): Date {
  const dia = data.getUTCDate();
  const primeiroDiaDoMesAlvo = new Date(
    Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + meses, 1)
  );
  const ultimoDiaDoMesAlvo = new Date(
    Date.UTC(primeiroDiaDoMesAlvo.getUTCFullYear(), primeiroDiaDoMesAlvo.getUTCMonth() + 1, 0)
  ).getUTCDate();
  primeiroDiaDoMesAlvo.setUTCDate(Math.min(dia, ultimoDiaDoMesAlvo));
  return primeiroDiaDoMesAlvo;
}

// Soma `dias` a uma data em UTC — usado na recorrência semanal de Contas a
// Pagar (ver src/app/contas-a-pagar/recorrencia.ts).
export function adicionarDias(data: Date, dias: number): Date {
  const resultado = new Date(data);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

export function inicioDoMes(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
}

export function mesmoMes(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

// Meia-noite UTC de hoje — pra comparar com campos @db.Date sem o horário
// atual atrapalhar a comparação.
export function hojeUTC(): Date {
  const agora = new Date();
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
}
