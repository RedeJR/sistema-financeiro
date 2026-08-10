// Popula o banco com os dados de referência já validados: bancos e
// categorias de extrato (protótipo conciliador/config.py) e o plano de
// contas contábil (PDF "Plano de Contas" do sistema atual da usuária).
// Rode com: npx prisma db seed
//
// Idempotente: pode rodar de novo sem duplicar (usa upsert pelo campo único).

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, TipoCategoriaExtrato, type Modulo } from "../src/generated/prisma/client";

// Usa a conexão direta (não o pooler em modo transação) — é uma carga em
// lote única, e o pooler travou no meio de várias upserts sequenciais.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

// Primeiro usuário (administrador, com acesso total). CPF fixo pedido pela
// usuária; a senha é gerada aleatória a cada seed e só aparece no console —
// troque assim que entrar (Usuários > editar > "Nova senha").
const ADMIN_NOME = "Tatiana Macedo da Fonseca";
const ADMIN_CPF = "45096774805";
const TODOS_MODULOS: Modulo[] = [
  "CADASTROS",
  "CONTAS_A_PAGAR",
  "COMBUSTIVEIS_A_PAGAR",
  "CONFERENCIA_DIARIA",
  "DESPESAS_PAGAS",
  "EXTRATOS",
  "USUARIOS",
];

// Bancos já mapeados no protótipo (ver PROJETO_SISTEMA_FINANCEIRO.md, seção 2).
// "Conta3036" está com nome provisório até a usuária confirmar o nome real
// do banco (agência 3036, posto Paineira). Santander e outros entram depois,
// pela tela de Cadastros.
// Nomes em MAIÚSCULO (pedido da usuária, pra manter os cadastros com visual
// padronizado) — exceto codigoArquivo, que é usado pra reconhecer o banco
// pelo nome do arquivo importado (ver PARSERS_POR_CODIGO em importar.ts).
const BANCOS = [
  { nome: "BRADESCO", codigoArquivo: "Bradesco" },
  { nome: "PAGSEGURO", codigoArquivo: "PagSeguro" },
  { nome: "BANCO DO BRASIL", codigoArquivo: "BancoDoBrasil" },
  { nome: "CONTA3036 (NOME PENDENTE DE CONFIRMAÇÃO)", codigoArquivo: "Conta3036" },
  { nome: "STONE", codigoArquivo: "Stone" },
];

// Adquirentes: aparecem com Débito/Crédito separado na revisão manual, e
// somados numa única coluna no fechamento.
const ADQUIRENTES = ["CIELO", "GETNET", "PAGSEGURO", "REDE", "STONE"];

// Demais categorias do fechamento, na ordem definida pela usuária. Não tem
// "Investimento" separado — RENTAB.INVEST/BB Rende Fácil/rendimentos de
// aplicação caem direto em "Remuneração" (categorizer.ts), decisão da
// usuária pra não duplicar conceito.
const CATEGORIAS_PADRAO = [
  "PIX",
  "SAQPAY",
  "ABASTECE AÍ",
  "PREMMIA",
  "SEM PARAR",
  "VR",
  "PLUXEE",
  "ALELO",
  "NAIP",
  "TICKET",
  "VENDA A PRAZO",
  "TRANSF. ENTRE CONTAS",
  "COLETA",
  "REMUNERAÇÃO",
  "OUTROS",
  "CONVENIÊNCIA",
  "DESPESAS PAGAS",
  "COMBUSTÍVEIS",
  "GNV",
  "TARIFAS C/C",
  "TARIFAS PIX",
  "LIS/JUROS",
  "IOF",
  "SERV. COLETA",
];

// Plano de contas contábil (Grupo -> Contas), extraído do PDF "Plano de
// Contas" do sistema atual da usuária (relatório REL068, posto Oliveira).
// OBS: em 2 grupos (Administrativas e Colaboradores) o PDF tem uma quebra de
// página que pode ter engolido 1-2 contas — se faltar alguma, é rápido
// adicionar direto pela tela de Plano de Contas.
const PLANO_DE_CONTAS: Record<string, string[]> = {
  ADMINISTRATIVAS: [
    "AGUA", "ALCOOL GEL", "ALUGUEL", "ALUGUEL EQUIPTOS", "CARTORIO",
    "CONSULTA DE CREDITO", "CORREIOS", "CUSTAS PROCESSUAIS", "DESPESA POSTO",
    "DESPESAS DIRETORIA", "DESPESAS DIVERSAS", "ENERGIA", "EQUIP. OPERACIONAL",
    "ESCRITORIO SALA 71", "FOTOCOPIAS", "FRETE", "GRAFICA",
    "HONORARIO ADVOCATICIO", "HONORARIO CONS AUDIT", "HONORARIO CONTABEIS",
    "HONORARIO INFORMATICA", "INMETRO", "INTERNET", "MANUT EQUIPAMENTOS",
    "MANUT INFORMATICA", "MANUT. PREDIAL", "MANUT SISTEMA",
    "MAT. DE CONSTRUÇÃO", "MAT. DE ESCRITORIO", "MATERIAL CONSTRUÇÃO",
    "MATERIAL DE LIMPEZA", "MATERIAL ESCRITORIO", "MATERIAL INFORMATICA",
    "MATERIAL SEGURANÇA", "OUTRAS DESP OPERACIONAL", "RENOVAÇÃO", "RETIRADA",
    "SEG. PATRIMONIAL", "SEGURO PATRIMONIAL", "SEGURO PREDIAL",
    "SERVIÇO PESSOA JURIDICA", "SERV TERCEIRIZADOS", "SISTEMAS",
    "TAXAS DIVERSAS", "TELEFONE CELULAR", "TELEFONE FIXO",
  ],
  BANCARIAS: [
    "ADIANT. DEPOSITANTE", "CHEQUE FORM CONTINUO", "CHEQUE VALOR SUPERIOR",
    "EMPRESTIMOS", "EXCED GUICHE CAIXA", "EXCED TRANSF VIA NET",
    "FOLHA CHEQUE CAIXA", "IOF", "JUROS BANCARIOS", "PARCELA GIRO",
    "REAPRESENT CH DEVOLV", "SUSTAÇÃO/REVOGAÇÃO", "TARIFA COBRANÇA",
    "TARIFA MANUT CONTA", "TARIFA TED/DOC",
  ],
  CARTOES: ["ALUGUEL EQUIPAMENTOS", "JUROS", "TAXA ANTECIPAÇÃO", "TAXA OPERADORA"],
  COLABORADORES: [
    "13º PAGOS", "ADIANTAMENTO SALARIAL", "ADICIONAL NOTURNO", "AVISO PREVIO",
    "BENEFICIOS", "CARTAO IDENTFID", "CESTA BASICA", "COMISSAO",
    "CONTRIB ASSISTENCIA", "CONTRIBUIÇÃO URBANA", "CONV. ODONTOLOGICO",
    "CRACHA", "CREME PARA MÃOS", "DIARIAS", "DOMINGOS TRABALHADOS", "DSR",
    "DSR NOTURNO", "EQUIP SEGURANÇA", "EXAMES PERIÓDICOS", "FARMACIA",
    "FERIAS PAGAS", "FGTS", "HORAS EXTRAS", "INSS FUNCIONARIOS",
    "IRPF FUNCIONARIOS", "KIT NATALINO", "MASCARA", "MEDICAMENTOS",
    "PERICULOSIDADE", "PLANO DE SAUDE", "PREVIDENCIA PRIVADA",
    "PROCESSO TRABALHISTA", "RESCISÃO TRABALHISTA", "SALARIOS",
    "SEGURO DE VIDA FUNC.", "SINDICATOS", "TREINAMENTOS", "UNIFORMES",
    "VALE ALIMENTAÇÃO", "VALE TRANSPORTE",
  ],
  COMERCIAIS: ["BENS E PREMIAÇÕES", "EVENTOS", "LOCAÇÃO VEICULOS", "SERVIÇOS TERCEIROS", "VIAGENS"],
  GERAL: [
    "DIESEL BS-10", "DIESEL COMUM", "ETANOL", "GAS NATURAL - GNV",
    "GASOLINA ADITIVADA", "GASOLINA COMUM", "GERAL",
  ],
  TRIBUTOS: [
    "ALVARA", "COFINS", "CSLL", "DAMSP", "DARF", "DAS", "DCTF WEB", "GPS",
    "GRF", "ICMS", "ICMS - ST", "IMPOSTOS E TX DIVERSAS", "IPTU", "IRPJ",
    "IRRF", "ISS", "MULTAS FISCAIS", "PIS",
  ],
  "VEICULOS - FROTA": [
    "COMBUSTIVEIS", "DOCUMENTAÇÃO", "ESTACIONAMENTO", "FRETES",
    "IPVA E LICENCIAMENTO", "MANUT VEICULOS", "MULTAS", "PARCELA VEICULO",
    "PEDAGIO", "RASTREADOR", "SEGURO OBRIGATORIO", "SEGURO VEICULO",
  ],
  "VEICULOS - SOCIOS": [
    "COMBUSTIVEL SOCIO", "ESTACIONAMENTO", "IPVA E LICENCIAMENTO",
    "MANUT VEICULOS", "MULTAS", "PEDAGIO", "SEGURO OBRIGATORIO", "SEGURO VEICULO",
  ],
};

async function main() {
  // createMany + skipDuplicates: uma query em lote por tabela, em vez de uma
  // upsert por linha (o pooler travou no meio de ~150 upserts sequenciais).
  await prisma.banco.createMany({ data: BANCOS, skipDuplicates: true });
  console.log(`Bancos: ${BANCOS.length} ok.`);

  let ordem = 0;
  const categorias = [
    ...ADQUIRENTES.map((nome) => ({ nome, tipo: TipoCategoriaExtrato.ADQUIRENTE, ordem: ordem++ })),
    ...CATEGORIAS_PADRAO.map((nome) => ({ nome, tipo: TipoCategoriaExtrato.PADRAO, ordem: ordem++ })),
  ];
  await prisma.categoriaExtrato.createMany({ data: categorias, skipDuplicates: true });
  console.log(`Categorias de extrato: ${categorias.length} ok.`);

  const nomesGrupos = Object.keys(PLANO_DE_CONTAS);
  await prisma.grupoPlanoConta.createMany({
    data: nomesGrupos.map((nome, i) => ({ nome, ordem: i })),
    skipDuplicates: true,
  });
  const grupos = await prisma.grupoPlanoConta.findMany({
    where: { nome: { in: nomesGrupos } },
    select: { id: true, nome: true },
  });
  const idPorGrupo = new Map(grupos.map((g) => [g.nome, g.id]));

  const contas = nomesGrupos.flatMap((nomeGrupo) =>
    PLANO_DE_CONTAS[nomeGrupo].map((nome) => ({
      nome,
      grupoId: idPorGrupo.get(nomeGrupo)!,
    }))
  );
  await prisma.planoConta.createMany({ data: contas, skipDuplicates: true });
  console.log(`Plano de contas: ${nomesGrupos.length} grupos, ${contas.length} contas ok.`);

  const adminExistente = await prisma.usuario.findUnique({ where: { cpf: ADMIN_CPF } });
  if (!adminExistente) {
    const senhaTemporaria = randomBytes(9).toString("base64url");
    const senhaHash = await bcrypt.hash(senhaTemporaria, 10);
    await prisma.usuario.create({
      data: {
        nome: ADMIN_NOME,
        cpf: ADMIN_CPF,
        senhaHash,
        permissoes: {
          create: TODOS_MODULOS.map((modulo) => ({
            modulo,
            podeVisualizar: true,
            podeEditar: true,
          })),
        },
      },
    });
    console.log("\n=== Usuário administrador criado ===");
    console.log(`CPF: ${ADMIN_CPF}`);
    console.log(`Senha temporária: ${senhaTemporaria}`);
    console.log("Troque essa senha assim que entrar (Usuários > editar > \"Nova senha\").\n");
  } else {
    console.log("Usuário administrador já existe — senha não foi alterada.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
