import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { BOTAO_SECUNDARIO } from "@/lib/estilo";
import { ImportadorNegociacaoCielo } from "./importador";

export const metadata = { title: "Cartões - Importar Negociação Cielo" };

export default async function ImportarNegociacaoCieloPage() {
  await exigirPermissao("CARTOES", "editar");
  const postos = await prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Importar negociação da Cielo</h2>
        <Link href="/cartoes/antecipacoes" className={`${BOTAO_SECUNDARIO} text-sm font-medium`}>
          Voltar
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-foreground/60">
        No portal da Cielo, em Negociação de recebíveis, exporte o arquivo <strong>detalhe</strong> (CSV) do posto. Ele traz quanto foi
        antecipado de cada dia, então a conciliação e o &quot;A receber&quot; descontam exatamente esses valores. O sistema acha a
        antecipação já cadastrada de cada negociação (mesmo líquido ou mesmo bruto) e a corrige; se não achar, cria uma nova com o dia em
        que o dinheiro caiu que você informar.
      </p>
      <ImportadorNegociacaoCielo postos={postos} />
    </div>
  );
}
