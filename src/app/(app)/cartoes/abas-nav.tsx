"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AbasNav({ abas }: { abas: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="mt-4 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/15">
      {abas.map((aba) => {
        const ativa = pathname.startsWith(aba.href);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm ${
              ativa
                ? "border-blue-700 font-semibold text-blue-700 dark:border-blue-400 dark:text-blue-300"
                : "border-transparent text-foreground/60 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            }`}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
