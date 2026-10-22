import { exigirPermissao } from "@/lib/auth";
import { AbasNav } from "./abas-nav";
import { TITULO_PAGINA } from "@/lib/estilo";

const ABAS = [
  { href: "/cartoes/conferencia-taxas", label: "Taxas" },
  { href: "/cartoes/vendas", label: "Vendas" },
  { href: "/cartoes/conciliacao", label: "Recebimentos" },
  { href: "/cartoes/resumo-mensal", label: "Resumo mensal" },
  { href: "/cartoes/antecipacoes", label: "Antecipações" },
  { href: "/cartoes/fechamento", label: "Fechamento" },
];

export default async function CartoesLayout({ children }: { children: React.ReactNode }) {
  await exigirPermissao("CARTOES", "visualizar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`${TITULO_PAGINA} print:hidden`}>Cartões</h1>
        <p className="mt-1.5 text-sm text-foreground/60 print:hidden">
          Taxas, vendas, recebimentos e antecipações das maquininhas e vouchers.
        </p>
        <AbasNav abas={ABAS} />
      </div>
      {children}
    </div>
  );
}
