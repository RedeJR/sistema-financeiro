import { createHash } from "node:crypto";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { FormularioRedefinirSenha } from "./formulario-redefinir-senha";
import { redefinirSenha } from "./actions";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export default async function RedefinirSenhaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Só uma checagem pra decidir o que mostrar (não marca como usado aqui —
  // isso só acontece de verdade dentro de redefinirSenha, na hora de trocar
  // a senha). Evita mostrar o formulário pra um link já morto.
  const registro = await prisma.recuperacaoSenha.findUnique({ where: { id: hashToken(token) } });
  const valido = !!registro && !registro.usado && registro.expiresAt > new Date();

  const acaoComToken = redefinirSenha.bind(null, token);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <h1 className="mb-1 text-xl font-semibold">Redefinir senha</h1>

      {valido ? (
        <>
          <p className="mb-6 text-sm text-foreground/60">Escolha uma senha nova (mínimo 8 caracteres).</p>
          <FormularioRedefinirSenha action={acaoComToken} />
        </>
      ) : (
        <div className="space-y-4">
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-400">
            Esse link não é mais válido — pode ter expirado (vale por 1 hora) ou já ter sido usado.
          </p>
          <Link href="/esqueci-senha" className="text-sm text-foreground/60 underline">
            Pedir um novo link →
          </Link>
        </div>
      )}
    </div>
  );
}
