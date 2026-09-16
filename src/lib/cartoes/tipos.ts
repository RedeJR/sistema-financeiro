// Uma linha já normalizada, pronta pra virar TransacaoCartao — todo parser
// de adquirente (src/lib/cartoes/parsers/*) devolve uma lista disso.
export type LinhaTransacao = {
  // Só preenchido por formato multi-posto (Stone): nome do posto resolvido
  // a partir do CNPJ da linha, ignorando o posto escolhido na tela de
  // upload — cada linha vai pro posto certo sozinha. Formatos de posto
  // único deixam undefined e a linha usa o posto escolhido na tela.
  postoNomeSugerido?: string;
  dataVenda: Date;
  horaVenda: string; // "" quando a adquirente não informa hora
  tipoVenda: string;
  valorBruto: string; // string decimal, pronta pro Prisma
  taxaRs: string | null;
  valorLiquido: string | null;
  dataPagamento: Date | null;
  // NSU/CV/Código da venda/Stone ID — null quando a adquirente não traz um
  // identificador de transação nesse arquivo (cai no dedupe por data+hora+
  // valor+tipo, ver TransacaoCartao no schema).
  identificadorExterno: string | null;
};

export type ArquivoEntrada = { nome: string; buffer: Buffer };
