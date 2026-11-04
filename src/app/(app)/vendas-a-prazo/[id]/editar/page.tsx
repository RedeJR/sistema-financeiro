import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioVendaAPrazo } from "../../formulario-venda-a-prazo";
import { atualizarVendaAPrazo } from "../../actions";

export const metadata = { title: "Vendas a Prazo (editar)" };

function paraDataInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function EditarVendaAPrazoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  const { id } = await params;
  const [v, postos, clientes] = await Promise.all([
    prisma.vendaAPrazo.findUnique({ where: { id } }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.vendaAPrazo.findMany({ distinct: ["cliente"], select: { cliente: true }, orderBy: { cliente: "asc" } }),
  ]);
  if (!v) notFound();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/vendas-a-prazo" className="text-sm text-foreground/60 underline">
          ← Voltar
        </Link>
        <h2 className="text-lg font-bold tracking-tight">Editar venda a prazo</h2>
      </div>
      <FormularioVendaAPrazo
        postos={postos}
        clientes={clientes.map((c) => c.cliente)}
        action={atualizarVendaAPrazo.bind(null, id)}
        valoresIniciais={{
          postoId: v.postoId,
          cliente: v.cliente,
          periodoDe: paraDataInput(v.periodoDe),
          periodoAte: paraDataInput(v.periodoAte),
          valor: Number(v.valor).toFixed(2).replace(".", ","),
          dataPagamento: paraDataInput(v.dataPagamento),
          observacao: v.observacao,
        }}
      />
    </div>
  );
}
