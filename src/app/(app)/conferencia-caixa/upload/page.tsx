import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { FormularioUpload } from "./formulario-upload";

export default async function UploadCartoesPage() {
  const podeEditar = await podeEditarModulo("CONFERENCIA_CAIXA");

  const postos = await prisma.posto.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/60">
        Upload dos arquivos de venda das adquirentes — alimenta o Relatório de Caixa e, mais pra frente, a
        Conciliação de Cartões.
      </p>

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
