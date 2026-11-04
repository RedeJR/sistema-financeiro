import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { BOTAO_SECUNDARIO } from "@/lib/estilo";
import { ImportadorVendasAPrazo } from "./importador";

export const metadata = { title: "Vendas a Prazo - Importar planilha" };

export default async function ImportarVendasAPrazoPage() {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  const postos = await prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">Importar planilha de vendas a prazo</h2>
        <div className="flex gap-2">
          <a href="/vendas-a-prazo/importar/modelo" className={`${BOTAO_SECUNDARIO} text-sm font-medium`}>
            Baixar modelo da planilha
          </a>
          <Link href="/vendas-a-prazo" className={`${BOTAO_SECUNDARIO} text-sm font-medium`}>
            Voltar
          </Link>
        </div>
      </div>
      <p className="max-w-3xl text-sm text-foreground/60">
        Envie a planilha no formato do modelo (todos os postos num arquivo só): POSTO, CLIENTE, PERÍODO DE, PERÍODO ATÉ, VALOR TOTAL e DATA DE
        PAGAMENTO. O sistema mostra o que entendeu, avisa o que já está lançado e só grava o que você confirmar. Depois de gravar, cada venda é
        ligada sozinha ao crédito do extrato quando o valor bate e só existe um candidato.
      </p>
      <ImportadorVendasAPrazo postos={postos} />
    </div>
  );
}
