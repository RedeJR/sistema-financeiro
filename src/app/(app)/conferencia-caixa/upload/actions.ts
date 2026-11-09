"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { importarTransacoesCartao, type ResultadoArquivoCartao } from "@/lib/cartoes/importar";

// Linhas gravadas por chamada — ver comentário em importarTransacoesCartao.
const LINHAS_POR_PARTE = 8000;

export type ParteImportacao = { erro: string } | { resultado: ResultadoArquivoCartao; proximo: number | null };

// Importa UMA parte de UM arquivo. A tela de upload chama de novo, com o
// `deslocamento` devolvido em `proximo`, até o arquivo acabar (proximo null).
export async function importarParteCartaoAction(formData: FormData): Promise<ParteImportacao> {
  await exigirPermissao("CONFERENCIA_CAIXA", "editar");

  const postoId = formData.get("postoId");
  const arquivo = formData.get("arquivo");
  const deslocamento = Number(formData.get("deslocamento") ?? 0);

  if (typeof postoId !== "string" || !postoId) return { erro: "Escolha um posto." };
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha um arquivo." };
  if (!Number.isInteger(deslocamento) || deslocamento < 0) return { erro: "Posição inválida." };

  const [resultado] = await importarTransacoesCartao({
    postoId,
    arquivos: [{ nome: arquivo.name, buffer: Buffer.from(await arquivo.arrayBuffer()) }],
    deslocamento,
    limite: LINHAS_POR_PARTE,
  });

  const proximo = resultado.proximoDeslocamento ?? null;
  if (proximo === null) {
    revalidatePath("/conferencia-caixa/upload");
    revalidatePath("/conferencia-caixa/relatorio");
  }

  return { resultado, proximo };
}

// Exclui uma importação: todas as vendas que um arquivo gravou num posto/adquirente. Serve pra quando o
// arquivo foi enviado no posto errado (ou é o arquivo errado) — apagar e enviar de novo é mais simples e
// seguro do que corrigir venda por venda. Só mexe nas vendas daquele posto + adquirente + arquivo; o resto
// do que já estava lá não é tocado. (Mesma ideia da exclusão em massa do extrato.)
export async function excluirImportacaoCartao(formData: FormData) {
  await exigirPermissao("CONFERENCIA_CAIXA", "editar");

  const postoId = formData.get("postoId");
  const adquirenteId = formData.get("adquirenteId");
  const arquivoOrigem = formData.get("arquivoOrigem");
  const voltarPara = formData.get("voltarPara");
  if (typeof postoId !== "string" || typeof adquirenteId !== "string" || typeof arquivoOrigem !== "string" || !postoId || !adquirenteId || !arquivoOrigem) return;

  await prisma.transacaoCartao.deleteMany({ where: { postoId, adquirenteId, arquivoOrigem } });

  revalidatePath("/conferencia-caixa/upload");
  revalidatePath("/conferencia-caixa/relatorio");
  revalidatePath("/cartoes", "layout");
  redirect(typeof voltarPara === "string" && voltarPara.startsWith("/conferencia-caixa/upload") ? voltarPara : "/conferencia-caixa/upload");
}
