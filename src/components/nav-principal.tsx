import Link from "next/link";
import { usuarioAtual } from "@/lib/auth";
import { GRUPOS_NAV, MODULOS, MODULOS_AVULSOS, MODULOS_RODAPE } from "@/lib/modulos";
import { sair } from "@/app/login/actions";
import { GruposMenu } from "./grupos-menu";
import { IconeMenu } from "./icone-menu";
import type { Modulo } from "@/generated/prisma/client";

const ROTA_POR_MODULO: Record<Modulo, string> = {
  CADASTROS: "/cadastros",
  CONTAS_A_PAGAR: "/contas-a-pagar",
  CONTAS_PAGAS: "/contas-pagas",
  CONFERENCIA_DIARIA: "/conferencia-diaria",
  COMBUSTIVEIS_A_PAGAR: "/combustiveis-a-pagar",
  COMBUSTIVEIS_PAGOS: "/combustiveis-pagos",
  EXTRATOS: "/extratos",
  ENTRE_POSTOS: "/entre-postos",
  DESPESAS_PAGAS: "/despesas-pagas",
  CARTOES: "/cartoes",
  VENDAS_A_PRAZO: "/vendas-a-prazo",
  FLUXO_DE_CAIXA: "/fluxo-de-caixa",
  CONFERENCIA_CAIXA: "/conferencia-caixa",
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
        className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground/35"
      >
        <IconeMenu nome={item.valor} />
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground/85 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
    >
      <IconeMenu nome={item.valor} />
      {item.label}
    </Link>
  );
}

export async function NavPrincipal() {
  const usuario = await usuarioAtual();

  const grupos = usuario
    ? GRUPOS_NAV.map((grupo) => ({
        label: grupo.label,
        itens: [
          ...grupo.modulos.map(itemDoModulo).filter((item) => !item.disponivel || podeVerModulo(usuario, item.valor)),
          // Bonificação Postecipada é uma tela dentro de Combustíveis (usa a permissão de Combustíveis a Pagar).
          ...(grupo.label === "Combustíveis" && podeVerModulo(usuario, "COMBUSTIVEIS_A_PAGAR")
            ? [{ valor: "COMBUSTIVEIS_A_PAGAR" as const, label: "Bonificação Postecipada", href: "/bonificacao-postecipada", disponivel: true }]
            : []),
        ],
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
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-black/10 bg-white print:hidden dark:border-white/10 dark:bg-neutral-950">
      <div className="px-4 py-5">
        <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-blue-700 text-[15px] text-white">
            JR
          </span>
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
            <nav className="mt-2 flex flex-col gap-0.5 border-t border-black/10 pt-2 dark:border-white/10">
              {rodape.map((item) => (
                <ItemAvulso key={item.valor} item={item} />
              ))}
            </nav>
          )}
        </div>
      )}

      {usuario && (
        <div className="border-t border-black/10 px-4 py-3 text-sm dark:border-white/10">
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
