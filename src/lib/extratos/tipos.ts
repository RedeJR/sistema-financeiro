// Formato normalizado que todo parser de banco devolve — port do dicionário
// usado em conciliador/parsers.py. `valor` positivo = crédito/entrada,
// negativo = débito/saída. `linhaControle` marca linha de saldo do dia/saldo
// anterior (não é lançamento de verdade, serve só pra conferência de saldo —
// descartada antes de gravar no banco).
export type LancamentoParseado = {
  data: Date; // meia-noite UTC, mesma convenção de src/lib/datas.ts
  descricao: string;
  valor: number;
  saldoExtrato: number | null;
  linhaControle: boolean;
  // Id de transação do banco (campo FITID do OFX) — dedup mais confiável
  // que (data, descrição, valor) quando disponível. Ausente pra fontes que
  // não trazem isso.
  fitid?: string;
};

export type ParserBanco = (buffer: Buffer, nomeArquivo: string) => Promise<LancamentoParseado[]>;
