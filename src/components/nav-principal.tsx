import Link from "next/link";
import { usuarioAtual } from "@/lib/auth";
import { GRUPOS_NAV, MODULOS, MODULOS_AVULSOS, MODULOS_RODAPE } from "@/lib/modulos";
import { sair } from "@/app/login/actions";
import { GruposMenu } from "./grupos-menu";
import type { Modulo } from "@/generated/prisma/client";

const ROTA_POR_MODULO: Record<Modulo, string> = {
  CADASTROS: "/cadastros",
  CONTAS_A_PAGAR: "/contas-a-pagar",
  CONTAS_PAGAS: "/contas-pagas",
  CONFERENCIA_DIARIA: "/conferencia-diaria",
  COMBUSTIVEIS_A_PAGAR: "/combustiveis-a-pagar",
  COMBUSTIVEIS_PAGOS: "/combustiveis-pagos",
  EXTRATOS: "/extratos",
  DESPESAS_PAGAS: "/despesas-pagas",
  CARTOES: "/cartoes",
  VENDAS_A_PRAZO: "/vendas-a-prazo",
  FLUXO_DE_CAIXA: "/fluxo-de-caixa",
  USUARIOS: "/usuarios",
};

type Usuario = NonNullable<Awaited<ReturnType<typeof usuarioAtual>>>;

function podeVerModulo(usuario: Usuario, modulo: Modulo): boolean {
  return usuario.permissoes.some((p) => p.modulo === modulo && (p.podeVisualizar || p.podeEditar));
}

function itemDoModulo(valor: Modulo) {
  const info = MODULOS.find((m) => m.valor === valor)!;
  return { valor, label: info.label, href: ROTA_POR_MODULO[valor], disponivel: info.disponivel };
}

type ItemMenu = ReturnType<typeof itemDoModulo>;

function ItemAvulso({ item }: { item: ItemMenu }) {
  if (!item.disponivel) {
    return (
      <span
        title="Ainda não construído"
        className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm text-foreground/35"
      >
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className="rounded-md px-3 py-1.5 text-sm text-foreground/80 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
    >
      {item.label}
    </Link>
  );
}

export async function NavPrincipal() {
  const usuario = await usuarioAtual();

  const grupos = usuario
    ? GRUPOS_NAV.map((grupo) => ({
        label: grupo.label,
        itens: grupo.modulos
          .map(itemDoModulo)
          .filter((item) => !item.disponivel || podeVerModulo(usuario, item.valor)),
      })).filter((grupo) => grupo.itens.length > 0)
    : [];

  const avulsos = usuario
    ? MODULOS_AVULSOS.map(itemDoModulo).filter(
        (item) => !item.disponivel || podeVerModulo(usuario, item.valor)
      )
    : [];

  const rodape = usuario
    ? MODULOS_RODAPE.map(itemDoModulo).filter(
        (item) => !item.disponivel || podeVerModulo(usuario, item.valor)
      )
    : [];

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-blue-100 bg-blue-50 print:hidden dark:border-blue-900/50 dark:bg-blue-950/40">
      <div className="px-4 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Sistema Financeiro
        </Link>
      </div>

      {usuario && (
        <div className="flex-1 overflow-y-auto px-2">
          <GruposMenu grupos={grupos} />
          {avulsos.length > 0 && (
            <nav className="mt-0.5 flex flex-col gap-0.5">
              {avulsos.map((item) => (
                <ItemAvulso key={item.valor} item={item} />
              ))}
            </nav>
          )}
          {rodape.length > 0 && (
            <nav className="mt-2 flex flex-col gap-0.5 border-t border-blue-100 pt-2 dark:border-blue-900/50">
              {rodape.map((item) => (
                <ItemAvulso key={item.valor} item={item} />
              ))}
            </nav>
          )}
        </div>
      )}

      {usuario && (
        <div className="border-t border-blue-100 px-4 py-3 text-sm dark:border-blue-900/50">
          <p className="mb-2 truncate text-foreground/60">{usuario.nome}</p>
          <form action={sair}>
            <button
              type="submit"
              className="w-full rounded-md px-3 py-1.5 text-left text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Sair
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
