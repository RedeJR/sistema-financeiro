import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { TITULO_PAGINA } from "@/lib/estilo";
import { FormularioBonificacao } from "../formulario-bonificacao";
import { criarBonificacao } from "../actions";

export const metadata = { title: "Bonificação Postecipada (nova)" };

export default async function NovaBonificacaoPage() {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const postos = await prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });
  return (
    <div className="space-y-4">
      <div>
        <Link href="/bonificacao-postecipada" className="text-sm text-foreground/60 underline">
          ← Voltar
        </Link>
        <h1 className={TITULO_PAGINA}>Nova bonificação postecipada</h1>
      </div>
      <FormularioBonificacao postos={postos} action={criarBonificacao} />
    </div>
  );
}
