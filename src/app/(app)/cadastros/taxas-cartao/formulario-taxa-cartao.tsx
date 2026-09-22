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
  bancos: Opcao[];
  valoresIniciais?: {
    postoId: string;
    adquirenteId: string;
    taxaDebito: string | null;
    prazoDebitoDias: number;
    taxaCreditoVista: string | null;
    prazoCreditoVistaDias: number;
    taxaCreditoParcelado: string | null;
    prazoCreditoParceladoDias: number;
    taxaPix: string | null;
    prazoPixDias: number;
    taxaCreditoPrePago: string | null;
    prazoCreditoPrePagoDias: number;
    domicilioBancoId: string | null;
    observacao: string | null;
    grupoConciliacao: string | null;
    antecipacaoAutomatica: boolean;
  };
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

function paraTextoEditavel(valor: string | null): string | undefined {
  if (valor === null) return undefined;
  return Number(valor).toFixed(2).replace(".", ",");
}

export function FormularioTaxaCartao({ postos, adquirentes, bancos, valoresIniciais, action }: Props) {
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

      <div className="flex flex-col gap-1">
        <label htmlFor="domicilioBancoId" className="text-sm font-medium text-foreground/80">
          Domicílio bancário{" "}
          <span className="font-normal text-foreground/50">(banco que recebe o repasse, opcional)</span>
        </label>
        <select
          id="domicilioBancoId"
          name="domicilioBancoId"
          defaultValue={v?.domicilioBancoId ?? ""}
          className={campoSelect}
        >
          <option value="">Não informado</option>
          {bancos.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <p className="mb-3 text-sm font-medium text-foreground/80">
          Débito à vista <span className="font-normal text-foreground/50">(deixe a taxa em branco se não usa)</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Taxa (%)"
            name="taxaDebito"
            defaultValue={paraTextoEditavel(v?.taxaDebito ?? null)}
            placeholder="0,00"
            inputMode="decimal"
          />
          <Campo
            label="Prazo (dias)"
            name="prazoDebitoDias"
            type="number"
            min={0}
            defaultValue={v?.prazoDebitoDias ?? 1}
          />
        </div>
      </div>

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <p className="mb-3 text-sm font-medium text-foreground/80">
          Crédito à vista <span className="font-normal text-foreground/50">(deixe a taxa em branco se não usa)</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Taxa (%)"
            name="taxaCreditoVista"
            defaultValue={paraTextoEditavel(v?.taxaCreditoVista ?? null)}
            placeholder="0,00"
            inputMode="decimal"
          />
          <Campo
            label="Prazo (dias)"
            name="prazoCreditoVistaDias"
            type="number"
            min={0}
            defaultValue={v?.prazoCreditoVistaDias ?? 1}
          />
        </div>
      </div>

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <p className="mb-3 text-sm font-medium text-foreground/80">
          Crédito parcelado{" "}
          <span className="font-normal text-foreground/50">(deixe a taxa em branco se não usa)</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Taxa (%)"
            name="taxaCreditoParcelado"
            defaultValue={paraTextoEditavel(v?.taxaCreditoParcelado ?? null)}
            placeholder="0,00"
            inputMode="decimal"
          />
          <Campo
            label="Prazo (dias)"
            name="prazoCreditoParceladoDias"
            type="number"
            min={0}
            defaultValue={v?.prazoCreditoParceladoDias ?? 30}
          />
        </div>
      </div>

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <p className="mb-3 text-sm font-medium text-foreground/80">
          PIX{" "}
          <span className="font-normal text-foreground/50">
            (deixe a taxa em branco se não usa — só se aplica em Cielo, Pagseguro, Rede, Stone e Getnet)
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Taxa (%)"
            name="taxaPix"
            defaultValue={paraTextoEditavel(v?.taxaPix ?? null)}
            placeholder="0,00"
            inputMode="decimal"
          />
          <Campo label="Prazo (dias)" name="prazoPixDias" type="number" min={0} defaultValue={v?.prazoPixDias ?? 1} />
        </div>
      </div>

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
        <p className="mb-3 text-sm font-medium text-foreground/80">
          Crédito pré-pago{" "}
          <span className="font-normal text-foreground/50">
            (deixe a taxa em branco se não usa — cartão de crédito recarregável, ex: Pagseguro)
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Taxa (%)"
            name="taxaCreditoPrePago"
            defaultValue={paraTextoEditavel(v?.taxaCreditoPrePago ?? null)}
            placeholder="0,00"
            inputMode="decimal"
          />
          <Campo
            label="Prazo (dias)"
            name="prazoCreditoPrePagoDias"
            type="number"
            min={0}
            defaultValue={v?.prazoCreditoPrePagoDias ?? 1}
          />
        </div>
      </div>

      <Campo
        label="Observação (opcional)"
        name="observacao"
        defaultValue={v?.observacao ?? undefined}
        placeholder='Ex: "SEM USO", "CRÉDITO: TURNO 2"'
      />

      <label className="flex items-start gap-2 text-sm text-foreground/80">
        <input
          type="checkbox"
          name="antecipacaoAutomatica"
          defaultChecked={v?.antecipacaoAutomatica === true || v?.antecipacaoAutomatica === "on"}
          className="mt-1"
        />
        <span>
          Crédito: usar a taxa e o prazo do cadastro
          <span className="block text-xs text-foreground/50">
            Vale a taxa e o prazo de crédito cadastrados acima (não os do arquivo) no líquido e na data de
            pagamento das vendas de crédito. Ex: Getnet com antecipação automática — o arquivo traz 30 dias e só
            1,33%, mas cai em 1 dia com 2,58% (1,33% + 1,25% de antecipação). Prazo até 5 dias conta em dias
            úteis; acima disso, em dias corridos.
          </span>
        </span>
      </label>

      <Campo
        label="Grupo de conciliação (opcional)"
        name="grupoConciliacao"
        defaultValue={v?.grupoConciliacao ?? undefined}
        placeholder='Ex: "CONTA STONE"'
      />
      <p className="-mt-2 text-xs text-foreground/50">
        Adquirentes do mesmo posto com o mesmo texto aqui são conciliadas juntas na aba Recebimentos (uma linha
        só). Use quando o repasse de uma cai na conta de outra — ex: no Paineira, Stone, Getnet e Rede caem na
        conta Stone.
      </p>

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href="/cadastros/taxas-cartao"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
