import Link from "next/link";

export default function SemPermissaoPage() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center text-center">
      <h1 className="text-xl font-semibold">Sem permissão</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Você não tem permissão pra acessar esse módulo. Fale com quem cuida
        dos usuários do sistema pra liberar o acesso, se precisar.
      </p>
      <Link href="/" className="mt-6 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">
        Voltar ao início
      </Link>
    </div>
  );
}
