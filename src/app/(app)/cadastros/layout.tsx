import { AbasNav } from "../cartoes/abas-nav";
import { TITULO_PAGINA } from "@/lib/estilo";
import { exigirPermissao } from "@/lib/auth";

const SUBMENU = [
  { href: "/cadastros/postos", label: "Postos" },
  { href: "/cadastros/fornecedores", label: "Fornecedores" },
  { href: "/cadastros/bancos", label: "Bancos" },
  { href: "/cadastros/categorias-extrato", label: "Categorias de Extrato" },
  { href: "/cadastros/plano-de-contas", label: "Plano de Contas" },
  { href: "/cadastros/adquirentes-cartao", label: "Adquirentes de Cartão" },
  { href: "/cadastros/taxas-cartao", label: "Taxas de Cartão" },
];

export default async function CadastrosLayout({ children }: { children: React.ReactNode }) {
  await exigirPermissao("CADASTROS", "visualizar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className={TITULO_PAGINA}>Cadastros</h1>
        <AbasNav abas={SUBMENU} />
      </div>
      {children}
    </div>
  );
}
