import { exigirPermissao } from "@/lib/auth";
import { TITULO_PAGINA } from "@/lib/estilo";

export default async function VendasAPrazoLayout({ children }: { children: React.ReactNode }) {
  await exigirPermissao("VENDAS_A_PRAZO", "visualizar");

  return (
    <div className="space-y-6">
      <h1 className={`${TITULO_PAGINA} print:hidden`}>Vendas a Prazo</h1>
      {children}
    </div>
  );
}
