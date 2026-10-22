import { exigirPermissao } from "@/lib/auth";
import { AbasNav } from "../cartoes/abas-nav";
import { TITULO_PAGINA } from "@/lib/estilo";

const ABAS = [
  { href: "/entre-postos", label: "Movimentações" },
  { href: "/entre-postos/relacao-devedores", label: "Relação de Devedores" },
];

export default async function EntrePostosLayout({ children }: { children: React.ReactNode }) {
  await exigirPermissao("ENTRE_POSTOS", "visualizar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className={TITULO_PAGINA}>Entre Postos</h1>
        <AbasNav abas={ABAS} />
      </div>
      {children}
    </div>
  );
}
