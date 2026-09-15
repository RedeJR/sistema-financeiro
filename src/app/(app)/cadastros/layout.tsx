import Link from "next/link";
import { exigirPermissao } from "@/lib/auth";

const SUBMENU = [
  { href: "/cadastros/postos", label: "Postos" },
  { href: "/cadastros/fornecedores", label: "Fornecedores" },
  { href: "/cadastros/bancos", label: "Bancos" },
  { href: "/cadastros/categorias-extrato", label: "Categorias de Extrato" },
  { href: "/cadastros/plano-de-contas", label: "Plano de Contas" },
];

export default async function CadastrosLayout({ children }: { children: React.ReactNode }) {
  await exigirPermissao("CADASTROS", "visualizar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cadastros</h1>
        <nav className="mt-3 flex flex-wrap gap-1 border-b border-black/10 dark:border-white/15">
          {SUBMENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-t-md px-3 py-2 text-sm text-foreground/70 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
