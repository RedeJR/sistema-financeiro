import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioCombustivel } from "../../formulario-combustivel";
import { atualizarCombustivelAPagar } from "../../actions";

function paraDataInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function EditarCombustivelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");

  const { id } = await params;
  const [conta, postos, fornecedores] = await Promise.all([
    prisma.contaAPagar.findUnique({ where: { id } }),
    prisma.posto.findMany({ orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" } }),
  ]);
  if (!conta || !conta.combustivel) notFound();

  if (conta.paga) {
    return (
      <div className="space-y-4">
        <Link href="/combustiveis-a-pagar" className="text-sm text-foreground/60 underline">
          ← Voltar
        </Link>
        <h1 className="text-2xl font-semibold">Editar combustível a pagar</h1>
        <p className="text-sm text-foreground/60">
          Essa conta já foi baixada automaticamente pela conciliação com o extrato — não dá mais pra
          editar por aqui.
        </p>
      </div>
    );
  }

  const acaoComId = atualizarCombustivelAPagar.bind(null, id);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/combustiveis-a-pagar" className="text-sm text-foreground/60 underline">
          ← Voltar
        </Link>
        <h1 className="text-2xl font-semibold">Editar combustível a pagar</h1>
      </div>
      <FormularioCombustivel
        action={acaoComId}
        postos={postos}
        fornecedores={fornecedores}
        valoresIniciais={{
          postoId: conta.postoId,
          fornecedorId: conta.fornecedorId,
          dataDescarga: conta.dataDescarga ? paraDataInput(conta.dataDescarga) : "",
          dataVencimento: paraDataInput(conta.dataVencimento),
          valor: conta.valor.toString(),
          observacao: conta.descricao,
        }}
      />
    </div>
  );
}
