import Link from "next/link";
import { hrefLista, type Direcao } from "@/lib/lista";

// Título de coluna clicável: uma setinha em cada título; clicar ordena por
// aquela coluna (alfabética, data mais antiga→mais nova, ou número), clicar de
// novo inverte. `qs` = filtros atuais da tela (sem ordem/pagina).
export function ThOrdenavel({
  campo,
  rotulo,
  base,
  qs,
  ordem,
  dir,
  porPagina,
  alinhar = "left",
  className = "px-4 py-2.5",
}: {
  campo: string;
  rotulo: string;
  base: string;
  qs: string;
  ordem: string;
  dir: Direcao;
  porPagina: number;
  alinhar?: "left" | "right";
  className?: string;
}) {
  const ativa = ordem === campo;
  const proxima: Direcao = ativa && dir === "asc" ? "desc" : "asc";
  const href = hrefLista(base, qs, { ordem: campo, dir: proxima, porPagina: String(porPagina) });
  return (
    <th
      className={`${className} ${alinhar === "right" ? "text-right" : "text-left"}`}
      aria-sort={ativa ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={href}
        title={ativa ? (dir === "asc" ? "Ordenado do menor/mais antigo — clique pra inverter" : "Ordenado do maior/mais novo — clique pra inverter") : "Clique pra ordenar"}
        className={`inline-flex items-center gap-1 hover:text-foreground ${ativa ? "text-foreground" : ""}`}
      >
        {rotulo}
        <svg aria-hidden="true" width="10" height="14" viewBox="0 0 10 14" className="shrink-0">
          <path d="M5 1 1.5 5.5h7z" fill="currentColor" opacity={ativa && dir === "asc" ? 1 : 0.28} />
          <path d="M5 13 1.5 8.5h7z" fill="currentColor" opacity={ativa && dir === "desc" ? 1 : 0.28} />
        </svg>
      </Link>
    </th>
  );
}
