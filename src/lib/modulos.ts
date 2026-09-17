import type { Modulo } from "@/generated/prisma/client";

// Lista central dos módulos do sistema (PROJETO_SISTEMA_FINANCEIRO.md, seção
// 4). Usada no menu lateral e na matriz de permissões de Usuários — mudar
// aqui reflete nos dois lugares.
export const MODULOS: { valor: Modulo; label: string; disponivel: boolean }[] = [
  { valor: "CADASTROS", label: "Cadastros", disponivel: true },
  { valor: "CONTAS_A_PAGAR", label: "Contas a Pagar", disponivel: true },
  { valor: "CONFERENCIA_DIARIA", label: "Conferência Diária", disponivel: true },
  // Mesma tela/consulta do botão Relatório (PDF) de Contas a Pagar, com
  // situação sempre fixa em "paga" — ver src/app/(app)/contas-pagas.
  { valor: "CONTAS_PAGAS", label: "Contas Pagas", disponivel: true },
  { valor: "COMBUSTIVEIS_A_PAGAR", label: "Combustíveis a Pagar", disponivel: true },
  { valor: "COMBUSTIVEIS_PAGOS", label: "Combustíveis Pagos", disponivel: true },
  { valor: "EXTRATOS", label: "Conciliação de Extratos", disponivel: true },
  { valor: "DESPESAS_PAGAS", label: "Despesas Pagas", disponivel: true },
  // Primeira aba (Conferência de Taxas) construída — o upload e o
  // relatório por adquirente que moravam aqui antes saíram pro módulo
  // CONFERENCIA_CAIXA, abaixo. Mais abas (conciliação venda x extrato)
  // ainda vêm.
  { valor: "CARTOES", label: "Cartões", disponivel: true },
  // Módulo novo pedido no menu, ainda sem tela — desabilitado até ser
  // construído numa fase futura.
  { valor: "VENDAS_A_PRAZO", label: "Vendas a Prazo", disponivel: false },
  { valor: "FLUXO_DE_CAIXA", label: "Fluxo de Caixa", disponivel: true },
  { valor: "CONFERENCIA_CAIXA", label: "Conferência de Caixa", disponivel: true },
  { valor: "USUARIOS", label: "Usuários", disponivel: true },
];

// Agrupamento do menu lateral: grupos com submenu (mostrado ao passar o
// mouse ou clicar) e módulos avulsos (sem submenu, vão direto pro link).
// A ordem aqui é a ordem de exibição no menu.
export const GRUPOS_NAV: { label: string; modulos: Modulo[] }[] = [
  { label: "Despesas", modulos: ["CONTAS_A_PAGAR", "CONFERENCIA_DIARIA", "CONTAS_PAGAS"] },
  { label: "Combustíveis", modulos: ["COMBUSTIVEIS_A_PAGAR", "COMBUSTIVEIS_PAGOS"] },
  { label: "Conciliação", modulos: ["EXTRATOS", "DESPESAS_PAGAS", "CARTOES", "VENDAS_A_PRAZO"] },
];

// Fluxo de Caixa e Conferência de Caixa ficam de fora do grupo Conciliação,
// como botões avulsos logo abaixo dele — pedido explícito da usuária.
export const MODULOS_AVULSOS: Modulo[] = ["CONFERENCIA_CAIXA", "FLUXO_DE_CAIXA"];

// Cadastros/Usuários formam um bloco à parte no fim do menu, com uma linha
// separadora acima só dele (não do Fluxo de Caixa).
export const MODULOS_RODAPE: Modulo[] = ["CADASTROS", "USUARIOS"];
