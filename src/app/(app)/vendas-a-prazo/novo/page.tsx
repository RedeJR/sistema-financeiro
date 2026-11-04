import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioVendaAPrazo } from "../formulario-venda-a-prazo";
import { criarVendaAPrazo } from "../actions";

export const metadata = { title: "Vendas a Prazo (nova)" };

export default async function NovaVendaAPrazoPage() {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  const [postos, clientes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.vendaAPrazo.findMany({ distinct: ["cliente"], select: { cliente: true }, orderBy: { cliente: "asc" } }),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/vendas-a-prazo" className="text-sm text-foreground/60 underline">
          ← Voltar
        </Link>
        <h2 className="text-lg font-bold tracking-tight">Nova venda a prazo</h2>
      </div>
      <FormularioVendaAPrazo postos={postos} clientes={clientes.map((c) => c.cliente)} action={criarVendaAPrazo} />
    </div>
  );
}
