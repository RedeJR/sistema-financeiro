"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import type { ActionState } from "@/lib/form-state";

type Opcao = { id: string; nome: string };

type Props = {
  postos: Opcao[];
  adquirentes: Opcao[];
  valoresIniciais?: {
    postoId: string;
    adquirenteId: string;
    dataRecebimento: string;
    periodoDe: string;
    periodoAte: string;
    valorFace: string;
    valorLiquido: string;
    observacao: string | null;
  };
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

export function FormularioAntecipacao({ postos, adquirentes, valoresIniciais, action }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const v = state?.values ?? valoresIniciais;

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
          <label htmlFor="adquirenteId" className="text-sm font-medium text-foreground/80">
            Adquirente
          </label>
          <select
            id="adquirenteId"
            name="adquirenteId"
            defaultValue={v?.adquirenteId ?? ""}
            className={campoSelect}
            required
          >
            <option value="" disabled>
              Escolha uma adquirente
            </option>
            {adquirentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Campo
        label="Data em que o dinheiro caiu"
        name="dataRecebimento"
        type="date"
        defaultValue={v?.dataRecebimento}
        required
      />

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <p className="mb-3 text-sm font-medium text-foreground/80">
          Período dos recebíveis antecipados{" "}
          <span className="font-normal text-foreground/50">(datas em que esses recebíveis pagariam)</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="De" name="periodoDe" type="date" defaultValue={v?.periodoDe} required />
          <Campo label="Até" name="periodoAte" type="date" defaultValue={v?.periodoAte} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo
          label="Valor dos recebíveis (R$)"
          name="valorFace"
          defaultValue={v?.valorFace}
          placeholder="0,00"
          inputMode="decimal"
          required
        />
        <Campo
          label="Líquido recebido (R$)"
          name="valorLiquido"
          defaultValue={v?.valorLiquido}
          placeholder="0,00"
          inputMode="decimal"
          required
        />
      </div>
      <p className="-mt-2 text-xs text-foreground/50">
        O desconto (custo da antecipação) é a diferença entre os dois valores. O líquido é o que caiu no banco.
      </p>

      <Campo label="Observação (opcional)" name="observacao" defaultValue={v?.observacao ?? undefined} />

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href="/cartoes/antecipacoes"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
