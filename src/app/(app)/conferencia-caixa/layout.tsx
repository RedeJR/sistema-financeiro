import Link from "next/link";
import { exigirPermissao } from "@/lib/auth";

const ABAS = [
  { href: "/conferencia-caixa/upload", label: "Upload dos Arquivos" },
  { href: "/conferencia-caixa/relatorio", label: "Relatório de Caixa" },
  { href: "/conferencia-caixa/conferencia", label: "Histórico de Conferência" },
];

export default async function ConferenciaCaixaLayout({ children }: { children: React.ReactNode }) {
  await exigirPermissao("CONFERENCIA_CAIXA", "visualizar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Conferência de Caixa</h1>
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
