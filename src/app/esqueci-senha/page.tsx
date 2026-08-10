import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { FormularioEsqueciSenha } from "./formulario-esqueci-senha";

export default async function EsqueciSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string }>;
}) {
  const usuario = await usuarioAtual();
  if (usuario) redirect("/");

  const { enviado } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <h1 className="mb-1 text-xl font-semibold">Esqueci minha senha</h1>
      <p className="mb-6 text-sm text-foreground/60">
        Digite seu CPF — se tiver um email cadastrado, mandamos um link pra você escolher uma senha nova.
      </p>

      {enviado ? (
        <div className="space-y-4">
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-400">
            Se esse CPF tiver um email cadastrado, o link de recuperação já foi enviado. Confira sua caixa
            de entrada (e o spam) — ele vale por 1 hora.
          </p>
          <p className="text-sm text-foreground/60">
            Não recebeu? Sem email cadastrado nesse usuário, alguém com acesso a Usuários precisa resetar
            sua senha manualmente.
          </p>
        </div>
      ) : (
        <FormularioEsqueciSenha />
      )}

      <Link href="/login" className="mt-6 text-sm text-foreground/60 underline">
        ← Voltar pro login
      </Link>
    </div>
  );
}
