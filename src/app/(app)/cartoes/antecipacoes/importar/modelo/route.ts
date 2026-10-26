import ExcelJS from "exceljs";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Modelo da planilha de antecipações: aba "Antecipações" (onde ela preenche, com
// listas suspensas de posto/adquirente) + aba "Listas" (de onde as listas vêm) +
// aba "Como preencher". DESCONTO e % são fórmulas só pra conferência; o sistema
// lê só os valores bruto e líquido.
export async function GET() {
  await exigirPermissao("CARTOES", "editar");

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { nome: true } }),
  ]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Antecipações");
  const listas = wb.addWorksheet("Listas");
  const ajuda = wb.addWorksheet("Como preencher");

  ws.columns = [
    { header: "POSTO", key: "posto", width: 22 },
    { header: "ADQUIRENTE", key: "adquirente", width: 18 },
    { header: "DATA EM QUE CAIU", key: "caiu", width: 18 },
    { header: "PERÍODO DE", key: "de", width: 14 },
    { header: "PERÍODO ATÉ", key: "ate", width: 14 },
    { header: "VALOR BRUTO", key: "bruto", width: 16 },
    { header: "VALOR LÍQUIDO", key: "liquido", width: 16 },
    { header: "DESCONTO (automático)", key: "desconto", width: 22 },
    { header: "% (automático)", key: "pct", width: 14 },
    { header: "OBSERVAÇÃO", key: "obs", width: 44 },
  ];
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  listas.getCell("A1").value = "POSTOS";
  listas.getCell("B1").value = "ADQUIRENTES";
  for (const c of ["A1", "B1"]) listas.getCell(c).font = { bold: true, name: "Arial", size: 10 };
  postos.forEach((p, i) => (listas.getCell(i + 2, 1).value = p.nome));
  adquirentes.forEach((a, i) => (listas.getCell(i + 2, 2).value = a.nome));
  listas.getColumn(1).width = 26;
  listas.getColumn(2).width = 22;

  const LINHAS = 200;
  for (let r = 2; r <= LINHAS + 1; r++) {
    ws.getCell(r, 1).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Listas!$A$2:$A$${Math.max(2, postos.length + 1)}`] };
    ws.getCell(r, 2).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Listas!$B$2:$B$${Math.max(2, adquirentes.length + 1)}`] };
    for (const c of [3, 4, 5]) ws.getCell(r, c).numFmt = "dd/mm/yyyy";
    for (const c of [6, 7, 8]) ws.getCell(r, c).numFmt = "#,##0.00";
    ws.getCell(r, 9).numFmt = "0.00%";
    ws.getCell(r, 8).value = { formula: `IF(AND(ISNUMBER(F${r}),ISNUMBER(G${r})),F${r}-G${r},"")` };
    ws.getCell(r, 9).value = { formula: `IF(AND(ISNUMBER(F${r}),ISNUMBER(G${r}),F${r}>0),(F${r}-G${r})/F${r},"")` };
    ws.getCell(r, 8).font = { color: { argb: "FF7F7F7F" }, name: "Arial", size: 10 };
    ws.getCell(r, 9).font = { color: { argb: "FF7F7F7F" }, name: "Arial", size: 10 };
  }

  const texto = [
    "COMO PREENCHER",
    "",
    "Uma linha por antecipação. Todos os postos e adquirentes podem ficar na mesma planilha.",
    "POSTO: o posto que antecipou.",
    "ADQUIRENTE: quem pagou antes (CIELO, STONE, ABASTECE AÍ...).",
    "DATA EM QUE CAIU: o dia em que o dinheiro entrou no banco (dd/mm/aaaa). Nas de Abastece Aí é o \"CAI DIA\".",
    "PERÍODO DE / ATÉ: as datas em que esses recebíveis pagariam normalmente (dd/mm/aaaa) — é esse intervalo que o sistema abate dos recebimentos futuros.",
    "VALOR BRUTO: o valor dos recebíveis antecipados, antes do desconto. Só o número, ex: 249999,99.",
    "VALOR LÍQUIDO: o que realmente caiu no banco, depois do desconto.",
    "DESCONTO e %: calculados sozinhos pela planilha, só pra você conferir (o sistema calcula de novo).",
    "OBSERVAÇÃO (opcional): texto livre.",
    "",
    "As colunas de posto e adquirente têm lista suspensa (aba Listas), mas dá pra digitar.",
    "O sistema mostra o que leu antes de gravar, avisa o que já estiver cadastrado e só grava o que você confirmar.",
    "",
    "Exemplo de linha:  SINERGIA | CIELO | 06/10/2026 | 03/11/2026 | 05/11/2026 | 148265,74 | 144339,90",
  ];
  texto.forEach((t, i) => {
    const c = ajuda.getCell(i + 1, 1);
    c.value = t;
    c.font = { name: "Arial", size: 10, bold: i === 0 };
  });
  ajuda.getColumn(1).width = 150;

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-antecipacoes.xlsx"',
    },
  });
}
