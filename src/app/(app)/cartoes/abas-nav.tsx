"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AbasNav({ abas }: { abas: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="mt-3 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/15">
      {abas.map((aba) => {
        const ativa = pathname.startsWith(aba.href);
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={`rounded-t-md px-3 py-2 text-sm ${
              ativa
                ? "border-b-2 border-foreground font-medium text-foreground"
                : "text-foreground/70 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            }`}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
