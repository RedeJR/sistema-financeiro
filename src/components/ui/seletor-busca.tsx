"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Item = { id: string; nome: string };

type Props = {
  nome: string;
  itens: Item[];
  // Valor inicial (não controlado) ou valor controlado — se `valor` vier,
  // o pai manda; senão o componente guarda o próprio estado.
  valorInicial?: string;
  valor?: string;
  onChange?: (id: string) => void;
  placeholder?: string;
  // Quando preenchido, a primeira opção é "limpar" (id vazio) com esse
  // rótulo — usado em filtro ("Todos os fornecedores"). Em formulário
  // obrigatório, deixe sem.
  rotuloVazio?: string;
  required?: boolean;
  id?: string;
  className?: string;
};

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Select com busca por nome (pedido da usuária: são muitos fornecedores, e
// rolar uma lista nativa é lento). Digita pra filtrar — ignora acento e
// maiúscula —, clica pra escolher. O id escolhido vai num <input hidden
// name=...>, então funciona igual a um <select> dentro de form/server action.
export function SeletorBusca({
  nome,
  itens,
  valorInicial = "",
  valor,
  onChange,
  placeholder = "Buscar pelo nome...",
  rotuloVazio,
  required,
  id,
  className,
}: Props) {
  const [interno, setInterno] = useState(valorInicial);
  const atual = valor ?? interno;
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selecionado = itens.find((i) => i.id === atual);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca("");
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return itens;
    return itens.filter((i) => normalizar(i.nome).includes(termo));
  }, [itens, busca]);

  function escolher(novo: string) {
    setInterno(novo);
    onChange?.(novo);
    setAberto(false);
    setBusca("");
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input type="hidden" name={nome} value={atual} />
      {/* Campo invisível só pra o navegador validar "obrigatório" (o hidden
          acima não valida) — sem isso o form deixava enviar vazio. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={atual}
          onChange={() => {}}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      )}
      <input
        id={id}
        ref={inputRef}
        type="text"
        autoComplete="off"
        value={aberto ? busca : (selecionado?.nome ?? "")}
        placeholder={aberto ? placeholder : (rotuloVazio ?? "Escolha...")}
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && aberto) {
            e.preventDefault();
            if (filtrados.length > 0) escolher(filtrados[0].id);
          } else if (e.key === "Escape") {
            setAberto(false);
            setBusca("");
          }
        }}
        className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20"
      />
      {aberto && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-black/15 bg-background text-sm shadow-lg dark:border-white/20">
          {rotuloVazio !== undefined && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher("")}
                className="w-full px-3 py-2 text-left text-foreground/60 hover:bg-black/5 dark:hover:bg-white/10"
              >
                {rotuloVazio}
              </button>
            </li>
          )}
          {filtrados.length === 0 ? (
            <li className="px-3 py-2 text-foreground/50">Nada encontrado.</li>
          ) : (
            filtrados.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(i.id)}
                  className={`w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10 ${
                    i.id === atual ? "font-medium" : ""
                  }`}
                >
                  {i.nome}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
