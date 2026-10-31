import Link from "next/link";

// Barra de busca das telas de cadastro: formulário GET (a busca vai na URL, ?q=...), então funciona sem JavaScript,
// dá pra compartilhar o link e a lista já volta filtrada depois de editar ou excluir. `caminho` é a rota da própria tela.
export function BuscaCadastro({
  caminho,
  termo,
  exibidos,
  total,
  placeholder = "Buscar por nome ou CNPJ/CPF...",
}: {
  caminho: string;
  termo: string;
  exibidos: number;
  total: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <form action={caminho} method="get" role="search" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={termo}
          placeholder={placeholder}
          aria-label="Buscar"
          autoComplete="off"
          className="h-10 w-full max-w-md rounded-lg border border-black/15 bg-white px-3 text-sm outline-none focus:border-foreground/40 dark:border-white/20 dark:bg-transparent"
        />
        <button type="submit" className="h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
          Buscar
        </button>
        {termo && (
          <Link href={caminho} className="text-sm text-foreground/60 underline">
            Limpar
          </Link>
        )}
      </form>
      {termo && (
        <p className="text-sm text-foreground/60">
          {exibidos === 0 ? "Nada encontrado" : `Mostrando ${exibidos} de ${total}`} para &quot;{termo}&quot;.
        </p>
      )}
    </div>
  );
}
