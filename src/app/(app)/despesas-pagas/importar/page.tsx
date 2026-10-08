import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { ImportadorDespesas } from "./importador";

export default async function ImportarDespesasPage() {
  await exigirPermissao("DESPESAS_PAGAS", "editar");

  const [postos, fornecedores, grupos] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.grupoPlanoConta.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Importar despesas de caixa</h1>
        <div className="flex gap-2">
          <a
            href="/despesas-pagas/importar/modelo"
            className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Baixar modelo da planilha
          </a>
          <Link
            href="/despesas-pagas"
            className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Voltar
          </Link>
        </div>
      </div>
      <p className="max-w-3xl text-sm text-foreground/60">
        Envie a planilha com as saídas em dinheiro do mês (todos os postos num arquivo só). O sistema mostra o que
        entendeu, avisa o que já está lançado e só grava o que você confirmar. As despesas entram como pagas no banco
        DINHEIRO, do mesmo jeito que uma despesa avulsa feita à mão.
      </p>
      <ImportadorDespesas
        postos={postos}
        fornecedores={fornecedores}
        planos={grupos.flatMap((g) => g.contas.map((c) => ({ id: c.id, nome: c.nome, grupo: g.nome })))}
      />
    </div>
  );
}
