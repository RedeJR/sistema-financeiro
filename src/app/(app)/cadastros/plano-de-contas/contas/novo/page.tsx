import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioConta } from "../../formulario-conta";
import { criarPlanoConta } from "../../actions";

export default async function NovaContaPage({
  searchParams,
}: {
  searchParams: Promise<{ grupoId?: string }>;
}) {
  await exigirPermissao("CADASTROS", "editar");

  const { grupoId } = await searchParams;
  const grupos = await prisma.grupoPlanoConta.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Nova conta</h2>
      {grupos.length === 0 ? (
        <p className="text-sm text-foreground/60">
          Cadastre um grupo antes de adicionar uma conta.
        </p>
      ) : (
        <FormularioConta
          action={criarPlanoConta}
          grupos={grupos}
          valoresIniciais={grupoId ? { nome: "", grupoId } : undefined}
        />
      )}
    </div>
  );
}
