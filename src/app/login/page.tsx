import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { FormularioLogin } from "./formulario-login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ "senha-redefinida"?: string }>;
}) {
  const usuario = await usuarioAtual();
  if (usuario) redirect("/");

  const { "senha-redefinida": senhaRedefinida } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
      <p className="mb-6 text-sm text-foreground/60">Sistema Financeiro</p>
      {senhaRedefinida && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-400">
          Senha redefinida! Já pode entrar com a senha nova.
        </p>
      )}
      <FormularioLogin />
      <Link href="/esqueci-senha" className="mt-4 text-center text-sm text-foreground/60 underline">
        Esqueci minha senha
      </Link>
    </div>
  );
}
