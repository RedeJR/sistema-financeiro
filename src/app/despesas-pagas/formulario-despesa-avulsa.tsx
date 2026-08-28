"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { SeletorPlanoConta } from "@/components/ui/seletor-plano-conta";
import { useFormKey } from "@/hooks/use-form-key";
import { formatarDocumento } from "@/lib/documento";
import type { ActionState } from "@/lib/form-state";
import { criarFornecedorRapido } from "../contas-a-pagar/actions";
import { criarDespesaAvulsa } from "./actions";

type Opcao = { id: string; nome: string };
type ContaComCodigo = { id: string; nome: string; codigo: string | null };
type GrupoComContas = { id: string; nome: string; contas: ContaComCodigo[] };

type Props = {
  postos: Opcao[];
  fornecedores: Opcao[];
  grupos: GrupoComContas[];
  bancos: Opcao[];
  // fornecedorId -> planoContaId mais usado historicamente por ele — ver
  // src/lib/sugestao-plano-conta.ts e o mesmo mecanismo em
  // formulario-conta-a-pagar.tsx.
  sugestaoPlanoContaPorFornecedor?: Record<string, string>;
  // URL da lista de onde a usuária veio, com o filtro aplicado — volta pra
  // lá depois de salvar. Ver actions.ts (criarDespesaAvulsa).
  voltarPara?: string;
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

export function FormularioDespesaAvulsa({
  postos,
  fornecedores: fornecedoresIniciais,
  grupos,
  bancos,
  sugestaoPlanoContaPorFornecedor = {},
  voltarPara,
}: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(criarDespesaAvulsa, null);
  const formKey = useFormKey(state);
  const v = state?.values;

  // Fornecedor: lista local + cadastro rápido sem sair da tela — mesmo
  // mecanismo do formulário de Contas a Pagar.
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  // Sugestão de plano de contas ao trocar de fornecedor (despesa avulsa
  // nasce sempre "nova", sem modo edição) — mesmo mecanismo do formulário de
  // Contas a Pagar: só atualiza quando existe sugestão de verdade, pra não
  // apagar uma escolha manual ao trocar pra um fornecedor sem histórico.
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState(v?.fornecedorId ?? "");
  const [planoContaSugerido, setPlanoContaSugerido] = useState<string | undefined>(undefined);

  function aoMudarFornecedor(novoFornecedorId: string) {
    setFornecedorSelecionado(novoFornecedorId);
    const sugestao = sugestaoPlanoContaPorFornecedor[novoFornecedorId];
    if (sugestao) setPlanoContaSugerido(sugestao);
  }

  const [mostrarNovoFornecedor, setMostrarNovoFornecedor] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoDocumento, setNovoDocumento] = useState("");
  const [erroFornecedor, setErroFornecedor] = useState<string | null>(null);
  const [criandoFornecedor, startTransition] = useTransition();

  function handleCriarFornecedor() {
    setErroFornecedor(null);
    startTransition(async () => {
      const resultado = await criarFornecedorRapido(novoNome, novoDocumento || null);
      if ("error" in resultado) {
        setErroFornecedor(resultado.error);
        return;
      }
      setFornecedores((atual) => [...atual, resultado].sort((a, b) => a.nome.localeCompare(b.nome)));
      aoMudarFornecedor(resultado.id);
      setMostrarNovoFornecedor(false);
      setNovoNome("");
      setNovoDocumento("");
    });
  }

  return (
    <form key={formKey} action={formAction} className="max-w-2xl space-y-4">
      {voltarPara && <input type="hidden" name="voltarPara" value={voltarPara} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-sm font-medium text-foreground/80">
            Posto
          </label>
          <select id="postoId" name="postoId" defaultValue={v?.postoId ?? ""} className={campoSelect} required>
            <option value="" disabled>
              Escolha um posto
            </option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="fornecedorId" className="text-sm font-medium text-foreground/80">
              Fornecedor
            </label>
            <button
              type="button"
              onClick={() => setMostrarNovoFornecedor((s) => !s)}
              className="text-xs text-foreground/60 underline"
            >
              {mostrarNovoFornecedor ? "Cancelar" : "+ Novo fornecedor"}
            </button>
          </div>
          <select
            id="fornecedorId"
            name="fornecedorId"
            value={fornecedorSelecionado}
            onChange={(e) => aoMudarFornecedor(e.target.value)}
            className={campoSelect}
            required
          >
            <option value="" disabled>
              Escolha um fornecedor
            </option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          {mostrarNovoFornecedor && (
            <div className="mt-1 space-y-2 rounded-md border border-black/10 p-3 dark:border-white/15">
              <input
                placeholder="Nome do fornecedor"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                className={`${campoSelect} w-full`}
              />
              <input
                placeholder="CNPJ ou CPF (opcional)"
                value={novoDocumento}
                onChange={(e) => setNovoDocumento(formatarDocumento(e.target.value))}
                className={`${campoSelect} w-full`}
              />
              {erroFornecedor && <p className="text-xs text-red-600 dark:text-red-400">{erroFornecedor}</p>}
              <button
                type="button"
                disabled={criandoFornecedor}
                onClick={handleCriarFornecedor}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {criandoFornecedor ? "Salvando..." : "Adicionar fornecedor"}
              </button>
            </div>
          )}
        </div>
      </div>

      <SeletorPlanoConta
        key={planoContaSugerido ?? "sem-sugestao"}
        grupos={grupos}
        valorInicial={planoContaSugerido ?? v?.planoContaId}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="bancoId" className="text-sm font-medium text-foreground/80">
            Pago no banco
          </label>
          <select id="bancoId" name="bancoId" defaultValue={v?.bancoId ?? ""} className={campoSelect} required>
            <option value="" disabled>
              Escolha o banco
            </option>
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </div>
        <Campo
          label="Data do pagamento"
          name="dataPagamento"
          type="date"
          required
          defaultValue={v?.dataPagamento}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="postoPagamentoId" className="text-sm font-medium text-foreground/80">
          Pago pelo posto <span className="font-normal text-foreground/50">(só se for diferente do Posto acima)</span>
        </label>
        <select
          id="postoPagamentoId"
          name="postoPagamentoId"
          defaultValue={v?.postoPagamentoId ?? ""}
          className={campoSelect}
        >
          <option value="">Mesmo posto acima</option>
          {postos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Valor" name="valor" required defaultValue={v?.valor} placeholder="0,00" inputMode="decimal" />
        <Campo
          label="Número do documento (opcional)"
          name="numeroDocumento"
          defaultValue={v?.numeroDocumento ?? undefined}
        />
      </div>

      <Campo label="Descrição / observações (opcional)" name="descricao" defaultValue={v?.descricao ?? undefined} />

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href={voltarPara || "/despesas-pagas"}
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
