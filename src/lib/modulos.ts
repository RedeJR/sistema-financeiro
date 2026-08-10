import type { Modulo } from "@/generated/prisma/client";

// Lista central dos módulos do sistema (PROJETO_SISTEMA_FINANCEIRO.md, seção
// 4). Usada no menu principal e na matriz de permissões de Usuários — mudar
// aqui reflete nos dois lugares.
export const MODULOS: { valor: Modulo; label: string; disponivel: boolean }[] = [
  { valor: "CADASTROS", label: "Cadastros", disponivel: true },
  { valor: "CONTAS_A_PAGAR", label: "Contas a Pagar", disponivel: true },
  { valor: "COMBUSTIVEIS_A_PAGAR", label: "Combustíveis a Pagar", disponivel: true },
  { valor: "CONFERENCIA_DIARIA", label: "Conferência Diária", disponivel: true },
  { valor: "DESPESAS_PAGAS", label: "Despesas Pagas", disponivel: true },
  { valor: "EXTRATOS", label: "Conciliação de Extratos", disponivel: true },
  { valor: "USUARIOS", label: "Usuários", disponivel: true },
];
