import type { Modulo } from "@/generated/prisma/client";

// Lista central dos módulos do sistema (PROJETO_SISTEMA_FINANCEIRO.md, seção
// 4). Usada no menu lateral e na matriz de permissões de Usuários — mudar
// aqui reflete nos dois lugares.
export const MODULOS: { valor: Modulo; label: string; disponivel: boolean }[] = [
  { valor: "CADASTROS", label: "Cadastros", disponivel: true },
  { valor: "CONTAS_A_PAGAR", label: "Contas a Pagar", disponivel: true },
  { valor: "CONFERENCIA_DIARIA", label: "Conferência Diária", disponivel: true },
  // Novo módulo (mesma tela do botão Relatório/PDF de Contas a Pagar) — ainda
  // não construído como tela própria, aparece desabilitado no menu.
  { valor: "CONTAS_PAGAS", label: "Contas Pagas", disponivel: false },
  { valor: "COMBUSTIVEIS_A_PAGAR", label: "Combustíveis a Pagar", disponivel: true },
  { valor: "COMBUSTIVEIS_PAGOS", label: "Combustíveis Pagos", disponivel: true },
  { valor: "EXTRATOS", label: "Conciliação de Extratos", disponivel: true },
  { valor: "DESPESAS_PAGAS", label: "Despesas Pagas", disponivel: true },
  // Módulos novos pedidos no menu, ainda sem tela — desabilitados até serem
  // construídos numa fase futura.
  { valor: "CARTOES", label: "Cartões", disponivel: false },
  { valor: "VENDAS_A_PRAZO", label: "Vendas a Prazo", disponivel: false },
  { valor: "FLUXO_DE_CAIXA", label: "Fluxo de Caixa", disponivel: false },
  { valor: "USUARIOS", label: "Usuários", disponivel: true },
];

// Agrupamento do menu lateral: grupos com submenu (mostrado ao passar o
// mouse ou clicar) e módulos avulsos (sem submenu, vão direto pro link).
// A ordem aqui é a ordem de exibição no menu.
export const GRUPOS_NAV: { label: string; modulos: Modulo[] }[] = [
  { label: "Despesas", modulos: ["CONTAS_A_PAGAR", "CONFERENCIA_DIARIA", "CONTAS_PAGAS"] },
  { label: "Combustíveis", modulos: ["COMBUSTIVEIS_A_PAGAR", "COMBUSTIVEIS_PAGOS"] },
  { label: "Conciliação", modulos: ["EXTRATOS", "DESPESAS_PAGAS", "CARTOES", "VENDAS_A_PRAZO", "FLUXO_DE_CAIXA"] },
];

export const MODULOS_AVULSOS: Modulo[] = ["CADASTROS", "USUARIOS"];
