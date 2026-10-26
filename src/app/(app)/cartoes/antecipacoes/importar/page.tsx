import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { ImportadorAntecipacoes } from "./importador";
import { BOTAO_SECUNDARIO } from "@/lib/estilo";

export default async function ImportarAntecipacoesPage() {
  await exigirPermissao("CARTOES", "editar");

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Importar antecipações</h2>
        <div className="flex gap-2">
          <a href="/cartoes/antecipacoes/importar/modelo" className={`${BOTAO_SECUNDARIO} text-sm font-medium`}>
            Baixar modelo da planilha
          </a>
          <Link href="/cartoes/antecipacoes" className={`${BOTAO_SECUNDARIO} text-sm font-medium`}>
            Voltar
          </Link>
        </div>
      </div>
      <p className="max-w-3xl text-sm text-foreground/60">
        Envie a planilha de antecipações (todos os postos e adquirentes num arquivo só). O sistema mostra o que entendeu,
        avisa o que já está cadastrado e só grava o que você confirmar. O que não tiver posto ou adquirente reconhecido
        você escolhe na própria tela.
      </p>
      <ImportadorAntecipacoes postos={postos} adquirentes={adquirentes} />
    </div>
  );
}
