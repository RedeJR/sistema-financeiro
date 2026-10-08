import ExcelJS from "exceljs";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Modelo da planilha de despesas de caixa: aba "Despesas" (onde ela preenche,
// com listas suspensas de posto/fornecedor/plano de contas) + aba "Listas" (de
// onde as listas vêm) + aba "Como preencher".
export async function GET() {
  await exigirPermissao("DESPESAS_PAGAS", "editar");

  const [postos, fornecedores, planos] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { nome: true } }),
    prisma.planoConta.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { nome: true } }),
  ]);
  const nomesPlanos = [...new Set(planos.map((p) => p.nome))];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Despesas");
  const listas = wb.addWorksheet("Listas");
  const ajuda = wb.addWorksheet("Como preencher");

  ws.columns = [
    { header: "POSTO PAGADOR", key: "posto", width: 22 },
    { header: "DATA", key: "data", width: 13 },
    { header: "VALOR", key: "valor", width: 14 },
    { header: "FORNECEDOR", key: "fornecedor", width: 38 },
    { header: "DESCRIÇÃO", key: "descricao", width: 52 },
    { header: "PLANO DE CONTAS", key: "plano", width: 28 },
  ];
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  listas.getCell("A1").value = "POSTOS";
  listas.getCell("B1").value = "FORNECEDORES";
  listas.getCell("C1").value = "PLANO DE CONTAS";
  for (const c of ["A1", "B1", "C1"]) listas.getCell(c).font = { bold: true, name: "Arial", size: 10 };
  postos.forEach((p, i) => (listas.getCell(i + 2, 1).value = p.nome));
  fornecedores.forEach((f, i) => (listas.getCell(i + 2, 2).value = f.nome));
  nomesPlanos.forEach((n, i) => (listas.getCell(i + 2, 3).value = n));
  listas.getColumn(1).width = 26;
  listas.getColumn(2).width = 50;
  listas.getColumn(3).width = 32;

  const LINHAS = 500;
  for (let r = 2; r <= LINHAS + 1; r++) {
    ws.getCell(r, 1).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Listas!$A$2:$A$${Math.max(2, postos.length + 1)}`] };
    ws.getCell(r, 4).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Listas!$B$2:$B$${Math.max(2, fornecedores.length + 1)}`] };
    ws.getCell(r, 6).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Listas!$C$2:$C$${Math.max(2, nomesPlanos.length + 1)}`] };
    ws.getCell(r, 2).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 3).numFmt = "#,##0.00";
  }

  const texto = [
    "COMO PREENCHER",
    "",
    "Uma linha por saída de dinheiro do caixa. Todos os postos podem ficar na mesma planilha.",
    "POSTO PAGADOR: o posto de cujo caixa saiu o dinheiro.",
    "DATA: dia da saída (dd/mm/aaaa).",
    "VALOR: só o número, ex: 1600 ou 449,61.",
    "FORNECEDOR: quem recebeu. Se for outro posto (ex: POSTO AVEIRO), a despesa fica no posto dele e sai do caixa do posto pagador.",
    "DESCRIÇÃO: texto livre (ex: RETIRADO DO CAIXA REF. SEGURANÇA - CARLOS).",
    "PLANO DE CONTAS: a conta do plano de contas (ex: DESPESA POSTO).",
    "",
    "As colunas têm lista suspensa (aba Listas), mas dá pra digitar. Nome diferente do cadastro não é problema:",
    "o sistema mostra o que não reconheceu, você escolhe o cadastro certo uma vez e ele lembra nas próximas planilhas.",
    "",
    "Exemplo de linha:  CANTAREIRA | 02/09/2026 | 1700 | POSTO AVEIRO | RETIRADO DO CAIXA REF. SEGURANÇA AVEIRO - CARLOS | DESPESA POSTO",
  ];
  texto.forEach((t, i) => {
    const c = ajuda.getCell(i + 1, 1);
    c.value = t;
    c.font = { name: "Arial", size: 10, bold: i === 0 };
  });
  ajuda.getColumn(1).width = 130;

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-despesas-de-caixa.xlsx"',
    },
  });
}
