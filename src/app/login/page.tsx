import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";
import { FormularioLogin } from "./formulario-login";

export default async function LoginPage() {
  const usuario = await usuarioAtual();
  if (usuario) redirect("/");

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <h1 className="mb-1 text-xl font-semibold">Entrar</h1>
      <p className="mb-6 text-sm text-foreground/60">Sistema Financeiro</p>
      <FormularioLogin />
    </div>
  );
}
