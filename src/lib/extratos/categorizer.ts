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
    // PIX recebido diretamente da Cielo (repasse de vendas) — igual ao
    // padrão já usado no Banco do Brasil pra essa mesma situação.
    { padrao: /PIX RECEBIDO REM:\s*CIELO S\.?A/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    // Redecard — o texto sempre traz "DEBITO"/"CREDITO" logo antes de
    // "REDECARD S A" (ex: "REDE ELO DEBITO REDECARD S A", "CABAL DEBITO
    // REDECARD S A"), então basta ancorar nisso pra pegar qualquer bandeira.
    { padrao: /DEBITO REDECARD S A/i, categoria: "REDE", tipoAdquirente: "DEBITO" },
    { padrao: /CREDITO REDECARD S A/i, categoria: "REDE", tipoAdquirente: "CREDITO" },
    { padrao: /TARIFA BANCARIA.*PIX/i, categoria: "TARIFAS PIX" },
    { padrao: /TARIFA BANCARIA/i, categoria: "TARIFAS C/C" },
    // Vouchers/benefícios — fáceis de identificar pelo nome do programa na
    // descrição, apareça como remetente de PIX, fornecedor de recebimento
    // ou qualquer outra formatação que o banco use.
    { padrao: /SAQPAY/i, categoria: "SAQPAY" },
    // PIX recebido da AlphaCorp Tecnologia — é quem processa o SaqPay.
    { padrao: /PIX RECEBIDO REM:\s*ALPHACORP TECNOLOGIA/i, categoria: "SAQPAY" },
    { padrao: /SEM\s*PARAR/i, categoria: "SEM PARAR" },
    { padrao: /ABASTECE\s*A[IÍ]/i, categoria: "ABASTECE AÍ" },
    { padrao: /PREMMIA/i, categoria: "PREMMIA" },
    // PIX recebido da Vibra Energia — repasse do programa Premmia.
    { padrao: /PIX RECEBIDO REM:\s*VIBRA ENERGIA/i, categoria: "PREMMIA" },
    { padrao: /\bVR\s*BENEF|BANCO\s*VR\b/i, categoria: "VR" },
    { padrao: /PLUXEE/i, categoria: "PLUXEE" },
    { padrao: /ALELO/i, categoria: "ALELO" },
    { padrao: /\bNAIP\b/i, categoria: "NAIP" },
    { padrao: /\bTICKET\b/i, categoria: "TICKET" },
    { padrao: /IPIRANGA/i, categoria: "COMBUSTÍVEIS" },
    // Boleto pago por código de combustível (ex: "PAGTO ELETRON COBRANCA
    // REF 10 GAS", "REF 15 ETA", "REF 10 GAS 5 S10") — "PAGTO ELETRON
    // COBRANCA" sozinho é genérico demais (cobre de exame médico a cesta
    // básica), mas com um número seguido de GAS/ETA/S10 é sempre
    // combustível nos dados vistos. Fora "D2" de propósito: nos dados reais
    // "D2" também aparece como abreviação de "de 2" em parcela (ex: "PARC 2
    // D2" = parcela 2 de 2), o que categorizava parcela comum como
    // Combustíveis por engano.
    { padrao: /PAGTO ELETRON.*COBRANCA.*\d+\s*(GAS|ETA|S10)\b/i, categoria: "COMBUSTÍVEIS" },
    // Formatos de código de combustível fora do padrão \d+GAS/ETA/S10 acima
    // (vistos só 1x cada, mas específicos o bastante pra valer a pena).
    { padrao: /PAGTO ELETRON.*COBRANCA.*REF 5D S10/i, categoria: "COMBUSTÍVEIS" },
    { padrao: /PAGTO ELETRON.*COBRANCA.*FORNECIMENTO DE GAS/i, categoria: "COMBUSTÍVEIS" },
    // Investimento e "PAG COBRANCA NET EMPRESA" — exceções específicas que
    // precisam ficar ANTES do catch-all de "PAGTO ELETRON" mais abaixo.
    { padrao: /PAGTO ELETRON.*COBRANCA.*ONE7 FUNDO DE INVESTIMENTO/i, categoria: "OUTROS" },
    { padrao: /PAGTO ELETRON.*COBRANCA.*PAG COBRANCA NET EMPRESA/i, categoria: "OUTROS" },
    // Depósito em dinheiro — "Mais Varejo" (rede de correspondentes) e
    // direto em ATM/agência são canais diferentes, mas ambos são coleta de
    // numerário, não venda/PIX.
    { padrao: /DEP\s*DIN\s*MAIS\s*VAREJO/i, categoria: "COLETA" },
    // Uma máquina específica (AG01788, tanto MAQ065775 quanto MAQ065854) é
    // sempre lançada na categoria própria "DIN. SINERGIA", não em COLETA —
    // checa isso antes da regra genérica abaixo.
    { padrao: /^DEP DINHEIRO ATM AG01788/i, categoria: "DIN. SINERGIA" },
    { padrao: /^DEP DINHEIRO (ATM|INTER)/i, categoria: "COLETA" },
    { padrao: /RENTAB\.?\s*INVEST\s*FACILCRED/i, categoria: "REMUNERAÇÃO" },
    { padrao: /^IOF\b/i, categoria: "IOF" },
    { padrao: /JUROS|LIS\b/i, categoria: "LIS/JUROS" },
    { padrao: /^PGTO SALARIO VIA NET EMP/i, categoria: "OUTROS" },
    { padrao: /^PAGAMENTO FUNCIONARIOS/i, categoria: "DESPESAS PAGAS" },
    // Conta de concessionária (água/telefone/etc) via débito automático —
    // formato "CONTA DE X INTERNET --FORNECEDOR" é sempre uma despesa paga
    // de verdade nos dados vistos.
    { padrao: /^CONTA DE .* INTERNET --/i, categoria: "DESPESAS PAGAS" },
    // Catch-all de boleto pago ("PAGTO ELETRON(ICO) COBRANCA/TRIBUTO...") —
    // de ~70 variações vistas, só combustível (regra acima, checada antes)
    // e o investimento ONE7 (regra acima) fogem de Despesas Pagas. Fica por
    // último de propósito: só pega o que nenhuma regra mais específica de
    // "PAGTO ELETRON" já capturou.
    { padrao: /^PAGTO ELETRON/i, categoria: "DESPESAS PAGAS" },
    // Tarifas de conta corrente com nome variado ("TARIFA LCTO CRED CONTA",
    // "TARIFA OPERACAO CREDITO", "ESTORNO TARIFAS") — deixado por último
    // pra não atropelar as regras de TARIFA BANCARIA (PIX) mais específicas
    // acima.
    { padrao: /\bTARIFAS?\b/i, categoria: "TARIFAS C/C" },
  ],
  PAGSEGURO: [
    { padrao: /^Vendas - Disponivel CREDITO/i, categoria: "PAGSEGURO", tipoAdquirente: "CREDITO" },
    { padrao: /^Vendas - Disponivel DEBITO/i, categoria: "PAGSEGURO", tipoAdquirente: "DEBITO" },
    { padrao: /^Vendas - Disponivel PIX/i, categoria: "PIX" },
    { padrao: /^Rendimento/i, categoria: "REMUNERAÇÃO" },
    { padrao: /IPIRANGA/i, categoria: "COMBUSTÍVEIS" },
    // PIX enviado/recebido em nome do próprio posto (Oliveira) — parece ser
    // o jeito do PagSeguro nomear a movimentação entre o saldo da maquininha
    // e a conta bancária vinculada, não um pagamento/recebimento de
    // terceiro de verdade.
    { padrao: /^Pix (enviado|recebido) - Auto Posto De Servicos Oliveira Ltda/i, categoria: "TRANSF. ENTRE CONTAS" },
  ],
  BANCO_DO_BRASIL: [
    { padrao: /Cielo Vendas Crédito/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /Pix - Recebido.*CIELO S\.?A/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /BB Rende Fácil/i, categoria: "REMUNERAÇÃO" },
  ],
  ITAU: [
    { padrao: /PIX QR CODE RECEBIDO/i, categoria: "PIX" },
    // Stone via Itaú traz um código de referência que começa com "DB"
    // (débito) ou "AT" (crédito/antecipação) logo depois da bandeira — ex:
    // "RECEBIMENTO STONE VISA DB0183539557...", "...AT0183539557" — 100%
    // consistente nos dados vistos (21/21 DB=Débito, 4/4 AT=Crédito).
    { padrao: /RECEBIMENTO STONE\b.*\bDB\d/i, categoria: "STONE", tipoAdquirente: "DEBITO" },
    { padrao: /RECEBIMENTO STONE\b.*\bAT\d/i, categoria: "STONE", tipoAdquirente: "CREDITO" },
    // Rede via Itaú usa "CD" (crédito) de forma confiável (nenhuma exceção
    // vista), mas "DB" NÃO é confiável — o mesmo código de referência com
    // "DB" apareceu tanto como Débito quanto Crédito dependendo da bandeira
    // (ex: "REDE ELO DB0095269517" sempre Crédito, "REDE VISA DB0008968365"
    // sempre Débito, mas "REDE VISA DB0095269517" apareceu dos dois jeitos).
    // Sem um sinal confiável no texto pra decidir, "DB" da Rede fica sem
    // regra — melhor deixar pra revisão manual do que arriscar errado.
    { padrao: /RECEBIMENTO REDE\b.*\bCD\d/i, categoria: "REDE", tipoAdquirente: "CREDITO" },
    { padrao: /GETNET\s/i, categoria: "GETNET", tipoAdquirente: "CREDITO" },
    { padrao: /RECEBIMENTO CIELO/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    { padrao: /DIF DEP COLETA/i, categoria: "COLETA" },
    { padrao: /^DEP DIN (ATM|CX|ETV)/i, categoria: "COLETA" },
    { padrao: /REND PAGO APLIC/i, categoria: "REMUNERAÇÃO" },
    { padrao: /SEMPARAR|SEM PARAR/i, categoria: "SEM PARAR" },
    { padrao: /ABASTECE AI/i, categoria: "ABASTECE AÍ" },
    { padrao: /IPIRANGA/i, categoria: "COMBUSTÍVEIS" },
    { padrao: /PLUXEE/i, categoria: "PLUXEE" },
    { padrao: /\b99 TECNOLOGIA/i, categoria: "99" },
    { padrao: /^SISPAG SALARIOS/i, categoria: "DESPESAS PAGAS" },
    { padrao: /TRANSFER[ÊE]NCIA AUTOM\. ENVIADA (0078\.99845-7|IRDI)/i, categoria: "TRANSF. ENTRE CONTAS" },
    // Tarifa de coleta é categoria própria (SERV. COLETA) — checa antes da
    // regra genérica de "TAR " abaixo, senão cairia em TARIFAS C/C.
    { padrao: /TAR SERV COLETA/i, categoria: "SERV. COLETA" },
    { padrao: /^TAR\b/i, categoria: "TARIFAS C/C" },
    { padrao: /^IOF\b/i, categoria: "IOF" },
    { padrao: /JUROS/i, categoria: "LIS/JUROS" },
  ],
  STONE: [
    // "Recebimento vendas - <bandeira> | Crédito/Débito" — cobre qualquer
    // bandeira sem precisar listar uma por uma.
    { padrao: /Recebimento vendas.*\|\s*Crédito\s*$/i, categoria: "STONE", tipoAdquirente: "CREDITO" },
    { padrao: /Recebimento vendas.*\|\s*Débito\s*$/i, categoria: "STONE", tipoAdquirente: "DEBITO" },
    // "Recebimento vendas - Antecipação" sem o sufixo "| Crédito" — mesmo
    // caso das duas regras acima, só que o Stone não repete o tipo nesse
    // formato específico.
    { padrao: /Recebimento vendas.*Antecipa[çc][ãa]o\s*$/i, categoria: "STONE", tipoAdquirente: "CREDITO" },
    { padrao: /Parcela\s*\|\s*Empr[ée]stimo/i, categoria: "PARCELA EMPRÉSTIMO" },
    { padrao: /^Tarifa\b/i, categoria: "TARIFAS PIX" },
    // Maquininha: o hífen vem ANTES de "Pix" (ex: "Fulano - Pix |
    // Maquininha"), não uma barra — a regra antiga procurava barra e nunca
    // batia.
    { padrao: /-\s*Pix\s*\|\s*Maquininha/i, categoria: "PIX" },
    { padrao: /IPIRANGA/i, categoria: "COMBUSTÍVEIS" },
    // PIX/Transferência recebido de contrapartes conhecidas — mesma lógica
    // das regras "PIX RECEBIDO REM: X" dos outros bancos, adaptada pro
    // formato "X - Transferência | Pix" do Stone.
    { padrao: /^CENTRO AUTOMOTIVO SINERGIA LTDA.*Transfer/i, categoria: "PIX" },
    { padrao: /^VIBRA ENERGIA S\.?A.*Transfer/i, categoria: "PREMMIA" },
    { padrao: /^ALPHACORP TECNOLOGIA E PAGAMENTOS.*Transfer/i, categoria: "SAQPAY" },
    { padrao: /^CIELO S\.?A - INSTITUICAO DE PAGAMENTO.*Transfer/i, categoria: "CIELO", tipoAdquirente: "CREDITO" },
    // Transferência entre os próprios postos do grupo — só pros nomes que
    // já mostraram histórico consistente pra essa categoria (ver análise
    // antes desse commit); nome de terceiro continua manual.
    {
      padrao: /^(POSTO GOODBYE|JARDIM TORINO - COMERCIO VAREJISTA DE COMBUSTIVEIS|POSTO CANTAREIRA|POSTO PAINEIRA|POSTO SUL AMERICA) LTDA.*Transfer/i,
      categoria: "TRANSF. ENTRE CONTAS",
    },
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
