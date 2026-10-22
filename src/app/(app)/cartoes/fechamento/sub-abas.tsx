"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SUB_ABAS = [
  { href: "/cartoes/fechamento", label: "Taxas pagas" },
  { href: "/cartoes/fechamento/a-receber", label: "Vendas a receber" },
];

export function SubAbasFechamento() {
  const pathname = usePathname();

  return (
    <div className="flex gap-2 text-sm print:hidden">
      {SUB_ABAS.map((aba) => {
        const ativa = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={`rounded-full border px-3 py-1 ${
              ativa
                ? "border-blue-700 bg-[#EAF1FF] font-semibold text-blue-700 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-300"
                : "border-black/15 bg-white text-foreground/70 hover:bg-black/5 dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10"
            }`}
          >
            {aba.label}
          </Link>
        );
      })}
    </div>
  );
}
