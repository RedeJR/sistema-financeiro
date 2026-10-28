import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { TITULO_PAGINA } from "@/lib/estilo";
import { FormularioBonificacao } from "../../formulario-bonificacao";
import { atualizarBonificacao } from "../../actions";

export const metadata = { title: "Bonificação Postecipada (editar)" };

function paraDataInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function EditarBonificacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const { id } = await params;
  const [b, postos] = await Promise.all([
    prisma.bonificacaoPostecipada.findUnique({ where: { id } }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!b) notFound();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/bonificacao-postecipada" className="text-sm text-foreground/60 underline">
          ← Voltar
        </Link>
        <h1 className={TITULO_PAGINA}>Editar bonificação postecipada</h1>
      </div>
      <FormularioBonificacao
        postos={postos}
        action={atualizarBonificacao.bind(null, id)}
        valoresIniciais={{
          bandeira: b.bandeira,
          postoId: b.postoId,
          periodoDe: paraDataInput(b.periodoDe),
          periodoAte: paraDataInput(b.periodoAte),
          valor: Number(b.valor).toFixed(2).replace(".", ","),
          observacao: b.observacao,
        }}
      />
    </div>
  );
}
