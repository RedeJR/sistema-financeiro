// Port de conciliador/categorizer.py: sugestão automática de categoria por
// lançamento, por banco. Primeira regra que bater na descrição vence. Quando
// nada bate, cai pra revisão manual (categoria fica em branco).
//
// IMPORTANTE (decisão da usuária, PROJETO_SISTEMA_FINANCEIRO.md seção 2):
// transferências entre contas do próprio posto NÃO têm regra automática
// ainda — ficam pra revisão manual até acumular histórico suficiente pra
// ensinar o sistema com segurança. Nomes de terceiros também sempre vão pra
// revisão manual.
import type { CodigoParser } from "./bancos";

export type SugestaoCategoria = {
  categoriaNome: string;
  // Só relevante quando a categoria é do tipo ADQUIRENTE (Cielo, GetNet,
  // Pagseguro, Rede, Stone) — diz se foi lançamento de débito ou crédito.
  tipoAdquirente: "DEBITO" | "CREDITO" | null;
} | null;

type Regra = { padrao: RegExp; categoria: string; tipoAdquirente?: "DEBITO" | "CREDITO" };

const REGRAS_POR_BANCO: Record<CodigoParser, Regra[]> = {
  BRADESCO: [
    { padrao: /CIELO VDA CREDITO/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /CIELO VDA DEBITO/i, categoria: "CIELO", tipoAdquirente: "DEBITO" },
    { padrao: /CIELO AMEX/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /COMPRA CARTAO.*CIELO/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /VENDA CARTAO DE CREDITO/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /TARIFA BANCARIA.*PIX/i, categoria: "TARIFAS PIX" },
    { padrao: /TARIFA BANCARIA/i, categoria: "TARIFAS C/C" },
    // Vouchers/benefícios — fáceis de identificar pelo nome do programa na
    // descrição, apareça como remetente de PIX, fornecedor de recebimento
    // ou qualquer outra formatação que o banco use.
    { padrao: /SAQPAY/i, categoria: "SAQPAY" },
    { padrao: /SEM\s*PARAR/i, categoria: "SEM PARAR" },
    { padrao: /ABASTECE\s*A[IÍ]/i, categoria: "ABASTECE AÍ" },
    { padrao: /PREMMIA/i, categoria: "PREMMIA" },
    { padrao: /\bVR\s*BENEF|BANCO\s*VR\b/i, categoria: "VR" },
    { padrao: /PLUXEE/i, categoria: "PLUXEE" },
    { padrao: /ALELO/i, categoria: "ALELO" },
    { padrao: /\bNAIP\b/i, categoria: "NAIP" },
    { padrao: /\bTICKET\b/i, categoria: "TICKET" },
    // Depósito em dinheiro via rede "Mais Varejo" — é coleta de numerário,
    // não venda/PIX.
    { padrao: /DEP\s*DIN\s*MAIS\s*VAREJO/i, categoria: "COLETA" },
    { padrao: /RENTAB\.?\s*INVEST\s*FACILCRED/i, categoria: "REMUNERAÇÃO" },
    { padrao: /^IOF\b/i, categoria: "IOF" },
    { padrao: /JUROS|LIS\b/i, categoria: "LIS/JUROS" },
  ],
  PAGSEGURO: [
    { padrao: /^Vendas - Disponivel CREDITO/i, categoria: "PAGSEGURO", tipoAdquirente: "CREDITO" },
    { padrao: /^Vendas - Disponivel DEBITO/i, categoria: "PAGSEGURO", tipoAdquirente: "DEBITO" },
    { padrao: /^Vendas - Disponivel PIX/i, categoria: "PIX" },
    { padrao: /^Rendimento/i, categoria: "REMUNERAÇÃO" },
  ],
  BANCO_DO_BRASIL: [
    { padrao: /Cielo Vendas Crédito/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /Pix - Recebido.*CIELO S\.?A/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /BB Rende Fácil/i, categoria: "REMUNERAÇÃO" },
  ],
  ITAU: [
    { padrao: /PIX QR CODE RECEBIDO/i, categoria: "PIX" },
    { padrao: /RECEBIMENTO REDE\b/i, categoria: "REDE", tipoAdquirente: "CREDITO" },
    { padrao: /GETNET\s/i, categoria: "GETNET", tipoAdquirente: "CREDITO" },
    { padrao: /RECEBIMENTO CIELO/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /DIF DEP COLETA/i, categoria: "COLETA" },
    { padrao: /REND PAGO APLIC/i, categoria: "REMUNERAÇÃO" },
  ],
  STONE: [
    { padrao: /Recebimento vendas.*\|\s*Crédito\s*$/i, categoria: "STONE", tipoAdquirente: "CREDITO" },
    { padrao: /Recebimento vendas.*\|\s*Débito\s*$/i, categoria: "STONE", tipoAdquirente: "DEBITO" },
    { padrao: /^Tarifa\b/i, categoria: "TARIFAS PIX" },
    { padrao: /\|\s*Pix\s*\|\s*Maquininha/i, categoria: "PIX" },
  ],
  SANTANDER: [
    { padrao: /Antecipacao Getnet/i, categoria: "GETNET", tipoAdquirente: "CREDITO" },
    { padrao: /Pix Recebido/i, categoria: "PIX" },
    { padrao: /Iof\b/i, categoria: "IOF" },
    { padrao: /Juros\b/i, categoria: "LIS/JUROS" },
    { padrao: /Tarifa Mensalidade/i, categoria: "TARIFAS C/C" },
    { padrao: /Rendimento Liquido/i, categoria: "REMUNERAÇÃO" },
  ],
};

// Quando o extrato do banco não distingue débito/crédito no texto do
// lançamento, o padrão é categorizar como Crédito (regra da usuária — ela
// ajusta manual se precisar). Só se aplica a regras de adquirente que não
// especificaram tipoAdquirente explicitamente.
export function sugerirCategoria(codigo: CodigoParser, descricao: string): SugestaoCategoria {
  const regras = REGRAS_POR_BANCO[codigo] ?? [];
  for (const regra of regras) {
    if (regra.padrao.test(descricao)) {
      return {
        categoriaNome: regra.categoria,
        tipoAdquirente: regra.tipoAdquirente ?? null,
      };
    }
  }
  return null;
}
