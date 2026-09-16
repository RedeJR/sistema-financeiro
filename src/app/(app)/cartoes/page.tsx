import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { FormularioUpload } from "./formulario-upload";

export default async function CartoesPage() {
  await exigirPermissao("CARTOES", "visualizar");
  const podeEditar = await podeEditarModulo("CARTOES");

  const postos = await prisma.posto.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cartões</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Upload dos arquivos de venda das adquirentes — base pra Conferência de Caixa e Conciliação de
          Cartões (ainda em construção).
        </p>
      </div>

      {podeEditar ? (
        <FormularioUpload postos={postos} />
      ) : (
        <p className="rounded-lg border border-black/10 px-4 py-6 text-center text-sm text-foreground/50 dark:border-white/15">
          Você não tem permissão pra importar arquivos de cartão.
        </p>
      )}
    </div>
  );
}
