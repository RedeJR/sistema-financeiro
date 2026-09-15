"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Modulo } from "@/generated/prisma/client";

type ItemMenu = { valor: Modulo; label: string; href: string; disponivel: boolean };
type GrupoMenu = { label: string; itens: ItemMenu[] };

// Grupo com submenu: abre ao passar o mouse OU ao clicar (clique fixa aberto
// até clicar de novo, mesmo tirando o mouse de cima — útil em touch/tablet).
export function GruposMenu({ grupos }: { grupos: GrupoMenu[] }) {
  const pathname = usePathname();
  const grupoComRotaAtiva = grupos.find((g) =>
    g.itens.some((item) => item.disponivel && pathname.startsWith(item.href))
  )?.label;
  const [pinado, setPinado] = useState<string | null>(grupoComRotaAtiva ?? null);
  const [emHover, setEmHover] = useState<string | null>(null);

  return (
    <nav className="flex flex-col gap-0.5">
      {grupos.map((grupo) => {
        const aberto = pinado === grupo.label || emHover === grupo.label;
        return (
          <div
            key={grupo.label}
            onMouseEnter={() => setEmHover(grupo.label)}
            onMouseLeave={() => setEmHover((atual) => (atual === grupo.label ? null : atual))}
          >
            <button
              type="button"
              onClick={() => setPinado((atual) => (atual === grupo.label ? null : grupo.label))}
              aria-expanded={aberto}
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm text-foreground/80 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            >
              {grupo.label}
              <span className={`text-xs text-foreground/40 transition-transform ${aberto ? "rotate-90" : ""}`}>
                ›
              </span>
            </button>
            {aberto && (
              <div className="ml-3 flex flex-col gap-0.5 border-l border-blue-200 py-0.5 pl-3 dark:border-blue-900/50">
                {grupo.itens.map((item) =>
                  item.disponivel ? (
                    <Link
                      key={item.valor}
                      href={item.href}
                      className={`rounded-md px-3 py-1.5 text-sm hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 ${
                        pathname.startsWith(item.href)
                          ? "bg-black/5 font-medium text-foreground dark:bg-white/10"
                          : "text-foreground/70"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      key={item.valor}
                      title="Ainda não construído"
                      className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm text-foreground/35"
                    >
                      {item.label}
                    </span>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
