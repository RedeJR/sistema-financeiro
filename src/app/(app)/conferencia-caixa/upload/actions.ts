"use server";

import { revalidatePath } from "next/cache";
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
