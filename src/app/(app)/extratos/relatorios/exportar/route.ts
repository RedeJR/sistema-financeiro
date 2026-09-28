import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buscarRelatorioCampoExtrato } from "@/lib/extratos/relatorioCampos";

const FORMATO_MOEDA = "#,##0.00;-#,##0.00";

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export async function GET(request: NextRequest) {
  await exigirPermissao("EXTRATOS", "visualizar");

  const params = request.nextUrl.searchParams;
  const postoId = params.get("postoId") || undefined;
  const de = params.get("de");
  const ate = params.get("ate");
  const categoriaId = params.get("categoriaId");

  if (!de || !ate || !categoriaId) {
    return new Response("Escolha o campo e o período.", { status: 400 });
  }

  const categoria = await prisma.categoriaExtrato.findUnique({ where: { id: categoriaId }, select: { nome: true } });
  if (!categoria) {
    return new Response("Categoria não encontrada.", { status: 400 });
  }

  const blocos = await buscarRelatorioCampoExtrato({ categoriaId, postoId, dataInicio: dataUTC(de), dataFim: dataUTC(ate, true) });

  const cabecalho = ["Posto", "Data", "Valor", "Descrição"];
  const aoa: (string | number)[][] = [[`${categoria.nome} - ${de} a ${ate}`], cabecalho];
  for (const b of blocos) {
    for (const l of b.linhas) {
      aoa.push([b.postoNome, l.data.toISOString().slice(0, 10), l.valor, l.descricao]);
    }
    aoa.push(["", `Total ${b.postoNome}`, b.total, ""]);
  }
  const totalGeral = blocos.reduce((s, b) => s + b.total, 0);
  aoa.push(["", "Total geral", totalGeral, ""]);

  const planilha = XLSX.utils.aoa_to_sheet(aoa);
  planilha["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabecalho.length - 1 } }];

  for (let r = 2; r < aoa.length; r++) {
    const celula = planilha[XLSX.utils.encode_cell({ r, c: 2 })];
    if (celula && celula.t === "n") celula.z = FORMATO_MOEDA;
  }

  planilha["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 40 }];

  const workbook = XLSX.utils.book_new();
  // Nome de aba não aceita / \ ? * [ ] (algumas categorias têm barra, ex:
  // "TARIFAS C/C") e tem limite de 31 caracteres.
  const nomeAba = categoria.nome.replace(/[/\\?*[\]:]/g, "-").slice(0, 31);
  XLSX.utils.book_append_sheet(workbook, planilha, nomeAba);

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nomeArquivoBase = categoria.nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const nomeArquivo = `${nomeArquivoBase}-${de}-a-${ate}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
