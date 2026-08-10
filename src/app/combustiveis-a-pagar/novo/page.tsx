import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioCombustivel } from "../formulario-combustivel";
import { criarCombustivelAPagar } from "../actions";

export default async function NovoCombustivelPage() {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");

  const [postos, fornecedores] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/combustiveis-a-pagar" className="text-sm text-foreground/60 underline">
          ← Voltar
        </Link>
        <h1 className="text-2xl font-semibold">Novo combustível a pagar</h1>
      </div>
      <FormularioCombustivel postos={postos} fornecedores={fornecedores} action={criarCombustivelAPagar} />
    </div>
  );
}
