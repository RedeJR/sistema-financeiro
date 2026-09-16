// Uma linha já normalizada, pronta pra virar TransacaoCartao — todo parser
// de adquirente (src/lib/cartoes/parsers/*) devolve uma lista disso.
export type LinhaTransacao = {
  // Preenchido só por formatos multi-posto — a linha ignora o posto
  // escolhido na tela de upload e resolve o seu próprio (ver postos.ts).
  // Cada arquivo usa um jeito diferente de identificar o posto na linha:
  // Stone e Abastece Aí trazem CNPJ; SAQPAY e Sem Parar trazem um texto
  // livre (razão social/nome de loja). Formatos de posto único (Cielo,
  // Getnet, Pagseguro, Redecard) deixam os dois undefined e a linha usa o
  // posto escolhido na tela.
  postoCnpjSugerido?: string;
  postoTextoLivreSugerido?: string;
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
