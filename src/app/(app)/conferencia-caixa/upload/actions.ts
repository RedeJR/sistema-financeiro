"use server";

import { revalidatePath } from "next/cache";
import { exigirPermissao } from "@/lib/auth";
import { importarTransacoesCartao, type ResultadoArquivoCartao } from "@/lib/cartoes/importar";

export type ImportarCartaoState = { erro?: string; resultados?: ResultadoArquivoCartao[] } | null;

export async function importarTransacoesCartaoAction(
  _prev: ImportarCartaoState,
  formData: FormData
): Promise<ImportarCartaoState> {
  await exigirPermissao("CONFERENCIA_CAIXA", "editar");

  const postoId = formData.get("postoId");
  const arquivos = formData.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);

  if (typeof postoId !== "string" || !postoId) return { erro: "Escolha um posto." };
  if (arquivos.length === 0) return { erro: "Escolha ao menos um arquivo." };

  const arquivosBuffer = await Promise.all(
    arquivos.map(async (f) => ({ nome: f.name, buffer: Buffer.from(await f.arrayBuffer()) }))
  );

  const resultados = await importarTransacoesCartao({ postoId, arquivos: arquivosBuffer });

  revalidatePath("/conferencia-caixa/upload");
  revalidatePath("/conferencia-caixa/relatorio");

  return { resultados };
}
