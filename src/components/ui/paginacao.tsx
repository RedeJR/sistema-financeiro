import Link from "next/link";
import { hrefLista, OPCOES_POR_PAGINA } from "@/lib/lista";

// Rodapé da lista: "Mostrando 1–25 de 87", quantidade por página (10/25/50) e
// navegação entre páginas. `qs` = filtros e ordenação atuais (sem pagina/porPagina).
export function Paginacao({
  base,
  qs,
  pagina,
  totalPaginas,
  total,
  inicio,
  mostrados,
  porPagina,
  unidade = "contas",
}: {
  base: string;
  qs: string;
  pagina: number;
  totalPaginas: number;
  total: number;
  inicio: number;
  mostrados: number;
  porPagina: number;
  unidade?: string;
}) {
  if (total === 0) return null;
  const botao =
    "rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10";
  const desativado = "pointer-events-none opacity-40";

  // Janela de números: sempre a 1ª, a última e 2 de cada lado da atual.
  const numeros: (number | "…")[] = [];
  for (let n = 1; n <= totalPaginas; n++) {
    if (n === 1 || n === totalPaginas || Math.abs(n - pagina) <= 2) numeros.push(n);
    else if (numeros[numeros.length - 1] !== "…") numeros.push("…");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
      <div className="flex flex-wrap items-center gap-3 text-foreground/60">
        <span>
          Mostrando {inicio + 1}–{inicio + mostrados} de {total} {unidade}
        </span>
        <span className="flex items-center gap-1">
          Por página:
          {OPCOES_POR_PAGINA.map((n) => (
            <Link
              key={n}
              href={hrefLista(base, qs, { porPagina: String(n), pagina: undefined })}
              className={`rounded-md px-2 py-0.5 ${
                n === porPagina ? "bg-blue-700 font-semibold text-white" : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {n}
            </Link>
          ))}
        </span>
      </div>
      {totalPaginas > 1 && (
        <nav aria-label="Páginas" className="flex flex-wrap items-center gap-1">
          <Link
            href={hrefLista(base, qs, { porPagina: String(porPagina), pagina: String(pagina - 1) })}
            className={`${botao} ${pagina <= 1 ? desativado : ""}`}
            aria-disabled={pagina <= 1}
          >
            ← Anterior
          </Link>
          {numeros.map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1 text-foreground/40">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={hrefLista(base, qs, { porPagina: String(porPagina), pagina: String(n) })}
                aria-current={n === pagina ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 ${
                  n === pagina ? "bg-blue-700 font-semibold text-white" : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {n}
              </Link>
            )
          )}
          <Link
            href={hrefLista(base, qs, { porPagina: String(porPagina), pagina: String(pagina + 1) })}
            className={`${botao} ${pagina >= totalPaginas ? desativado : ""}`}
            aria-disabled={pagina >= totalPaginas}
          >
            Próxima →
          </Link>
        </nav>
      )}
    </div>
  );
}
