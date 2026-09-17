import Link from "next/link";
import { exigirPermissao } from "@/lib/auth";

const ABAS = [
  { href: "/cartoes/conferencia-taxas", label: "Taxas" },
  { href: "/cartoes/conciliacao", label: "Recebimentos" },
];

export default async function CartoesLayout({ children }: { children: React.ReactNode }) {
  await exigirPermissao("CARTOES", "visualizar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cartões</h1>
        <nav className="mt-3 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/15">
          {ABAS.map((aba) => (
            <Link
              key={aba.href}
              href={aba.href}
              className="rounded-t-md px-3 py-2 text-sm text-foreground/70 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            >
              {aba.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
