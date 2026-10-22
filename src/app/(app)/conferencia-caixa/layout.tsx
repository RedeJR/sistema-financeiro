import { AbasNav } from "../cartoes/abas-nav";
import { TITULO_PAGINA } from "@/lib/estilo";
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
        <h1 className={`${TITULO_PAGINA} print:hidden`}>Conferência de Caixa</h1>
        <AbasNav abas={ABAS} />
      </div>
      {children}
    </div>
  );
}
