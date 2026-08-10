import Link from "next/link";
import { usuarioAtual } from "@/lib/auth";
import { MODULOS } from "@/lib/modulos";
import { sair } from "@/app/login/actions";

const ROTA_POR_MODULO: Record<string, string> = {
  CADASTROS: "/cadastros",
  CONTAS_A_PAGAR: "/contas-a-pagar",
  COMBUSTIVEIS_A_PAGAR: "/combustiveis-a-pagar",
  CONFERENCIA_DIARIA: "/conferencia-diaria",
  DESPESAS_PAGAS: "/despesas-pagas",
  EXTRATOS: "/extratos",
  USUARIOS: "/usuarios",
};

export async function NavPrincipal() {
  const usuario = await usuarioAtual();

  return (
    <header className="border-b border-black/10 dark:border-white/15 print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <Link href="/" className="mr-4 font-semibold tracking-tight">
            Sistema Financeiro
          </Link>
          {usuario && (
            <nav className="flex flex-wrap gap-1">
              {MODULOS.map((item) => {
                const href = ROTA_POR_MODULO[item.valor];
                if (!item.disponivel) {
                  return (
                    <span
                      key={item.valor}
                      title="Ainda não construído"
                      className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm text-foreground/35"
                    >
                      {item.label}
                    </span>
                  );
                }
                const podeVer = usuario.permissoes.some(
                  (p) => p.modulo === item.valor && (p.podeVisualizar || p.podeEditar)
                );
                if (!podeVer) return null;
                return (
                  <Link
                    key={item.valor}
                    href={href}
                    className="rounded-md px-3 py-1.5 text-sm text-foreground/80 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {usuario && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground/60">{usuario.nome}</span>
            <form action={sair}>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
              >
                Sair
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
