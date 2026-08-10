"use client";

import { useMemo, useState } from "react";

type Conta = { id: string; nome: string; codigo: string | null };
type Grupo = { id: string; nome: string; contas: Conta[] };

type Props = {
  grupos: Grupo[];
  valorInicial?: string; // planoContaId, pra edição — pré-seleciona grupo/conta/código
  nomeCampo?: string; // nome do <input hidden> submetido, default "planoContaId"
};

const campoInput =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

// Grupo + Conta num select só (com optgroup) ficava difícil de navegar
// quando tinha muita conta — separar em dois selects reduz a lista visível
// de cada vez, e o campo de código dá um atalho direto pra quem já sabe o
// número (como no sistema antigo da usuária: digita "105", a conta
// "Combustível" já aparece selecionada, sem precisar abrir grupo nenhum).
export function SeletorPlanoConta({ grupos, valorInicial, nomeCampo = "planoContaId" }: Props) {
  const todasContas = useMemo(
    () => grupos.flatMap((g) => g.contas.map((c) => ({ ...c, grupoId: g.id }))),
    [grupos]
  );
  const contaInicial = useMemo(
    () => todasContas.find((c) => c.id === valorInicial),
    [todasContas, valorInicial]
  );

  const [grupoId, setGrupoId] = useState(contaInicial?.grupoId ?? "");
  const [contaId, setContaId] = useState(valorInicial ?? "");
  const [codigo, setCodigo] = useState(contaInicial?.codigo ?? "");

  const contasDoGrupo = grupos.find((g) => g.id === grupoId)?.contas ?? [];

  function aoDigitarCodigo(valor: string) {
    setCodigo(valor);
    const alvo = valor.trim().toLowerCase();
    if (!alvo) return;
    const encontrada = todasContas.find((c) => c.codigo && c.codigo.toLowerCase() === alvo);
    if (encontrada) {
      setGrupoId(encontrada.grupoId);
      setContaId(encontrada.id);
    }
  }

  function aoMudarGrupo(novoGrupoId: string) {
    setGrupoId(novoGrupoId);
    setContaId("");
    setCodigo("");
  }

  function aoMudarConta(novaContaId: string) {
    setContaId(novaContaId);
    const conta = todasContas.find((c) => c.id === novaContaId);
    setCodigo(conta?.codigo ?? "");
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-foreground/80">Plano de contas</label>
      <div className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr]">
        <input
          value={codigo}
          onChange={(e) => aoDigitarCodigo(e.target.value)}
          placeholder="Código"
          className={campoInput}
        />
        <select value={grupoId} onChange={(e) => aoMudarGrupo(e.target.value)} className={campoInput}>
          <option value="" disabled>
            Grupo
          </option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nome}
            </option>
          ))}
        </select>
        <select
          value={contaId}
          onChange={(e) => aoMudarConta(e.target.value)}
          disabled={!grupoId}
          className={campoInput}
        >
          <option value="" disabled>
            {grupoId ? "Escolha a conta" : "Escolha o grupo primeiro"}
          </option>
          {contasDoGrupo.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-foreground/50">
        Sabe o código da conta? Digite ele — o grupo e a conta certa já aparecem selecionados.
      </p>
      {/* "required" não funciona de verdade num hidden — validação real fica
          por conta do zod no servidor, igual o resto do formulário. */}
      <input type="hidden" name={nomeCampo} value={contaId} />
    </div>
  );
}
