import type { NextRequest } from "next/server";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarDespesasPagas } from "../consulta";

function formatarData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "";
}

// Escapa um campo pro formato CSV (aspas duplas quando tem separador, aspas
// ou quebra de linha dentro do valor).
function campoCsv(valor: string): string {
  if (/[;"\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export async function GET(request: NextRequest) {
  await exigirPermissao("DESPESAS_PAGAS", "visualizar");

  const params = request.nextUrl.searchParams;
  const filtros = {
    postoId: params.get("postoId") ?? undefined,
    fornecedorId: params.get("fornecedorId") ?? undefined,
    planoContaId: params.get("planoContaId") ?? undefined,
    bancoId: params.get("bancoId") ?? undefined,
    de: params.get("de") ?? undefined,
    ate: params.get("ate") ?? undefined,
  };

  const contas = await buscarDespesasPagas(filtros);

  const cabecalho = [
    "Pago em",
    "Avulsa",
    "Posto",
    "Fornecedor",
    "Plano de Contas",
    "Banco",
    "Nº Documento",
    "Descrição",
    "Valor",
  ];

  const linhas = contas.map((c) =>
    [
      formatarData(c.dataPagamento),
      c.avulsa ? "Sim" : "Não",
      c.posto.nome,
      c.fornecedor.nome,
      c.planoConta.nome,
      c.bancoPagamento?.nome ?? "",
      c.numeroDocumento ?? "",
      c.descricao ?? "",
      formatarMoeda(c.valor.toString()),
    ]
      .map(campoCsv)
      .join(";")
  );

  const csv = [cabecalho.join(";"), ...linhas].join("\r\n");
  // BOM no início: sem isso o Excel no Windows costuma interpretar acentos
  // errado num CSV UTF-8.
  const conteudo = "﻿" + csv;

  const nomeArquivo = `despesas-pagas-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(conteudo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
