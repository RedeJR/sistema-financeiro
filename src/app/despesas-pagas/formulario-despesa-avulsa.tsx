"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { SeletorPlanoConta } from "@/components/ui/seletor-plano-conta";
import { useFormKey } from "@/hooks/use-form-key";
import type { ActionState } from "@/lib/form-state";
import { criarDespesaAvulsa } from "./actions";

type Opcao = { id: string; nome: string };
type ContaComCodigo = { id: string; nome: string; codigo: string | null };
type GrupoComContas = { id: string; nome: string; contas: ContaComCodigo[] };

type Props = {
  postos: Opcao[];
  fornecedores: Opcao[];
  grupos: GrupoComContas[];
  bancos: Opcao[];
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

export function FormularioDespesaAvulsa({ postos, fornecedores, grupos, bancos }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(criarDespesaAvulsa, null);
  const formKey = useFormKey(state);
  const v = state?.values;

  return (
    <form key={formKey} action={formAction} className="max-w-2xl space-y-4">
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
          <label htmlFor="fornecedorId" className="text-sm font-medium text-foreground/80">
            Fornecedor
          </label>
          <select id="fornecedorId" name="fornecedorId" defaultValue={v?.fornecedorId ?? ""} className={campoSelect} required>
            <option value="" disabled>
              Escolha um fornecedor
            </option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SeletorPlanoConta grupos={grupos} valorInicial={v?.planoContaId} />

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
          href="/despesas-pagas"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
