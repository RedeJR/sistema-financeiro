import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { FormularioUpload } from "./formulario-upload";

// Arquivos multi-posto grandes (ex: Stone com todos os postos juntos, ~18 mil
// linhas) passam de 10s pra processar — bem em cima do limite padrão de
// função serverless. `maxDuration` na página estende o timeout de toda
// Server Action chamada a partir dela (ver importarTransacoesCartaoAction).
export const maxDuration = 60;

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
