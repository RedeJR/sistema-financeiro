"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormKey } from "@/hooks/use-form-key";
import { MODULOS } from "@/lib/modulos";
import type { ActionState } from "@/lib/form-state";
import type { Modulo } from "@/generated/prisma/client";

type PermissaoLinha = { modulo: Modulo; podeVisualizar: boolean; podeEditar: boolean };

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  modoEdicao?: boolean;
  valoresIniciais?: { nome: string; cpf: string; email?: string | null; permissoes: PermissaoLinha[] };
};

export function FormularioUsuario({ action, modoEdicao = false, valoresIniciais }: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);

  const nome = state?.values?.nome ?? valoresIniciais?.nome;
  const cpf = state?.values?.cpf ?? valoresIniciais?.cpf;
  const email = state?.values?.email ?? valoresIniciais?.email ?? undefined;

  const permissaoInicial = (modulo: Modulo) =>
    valoresIniciais?.permissoes.find((p) => p.modulo === modulo);

  const [permissoes, setPermissoes] = useState<Record<Modulo, { visualizar: boolean; editar: boolean }>>(
    () =>
      Object.fromEntries(
        MODULOS.map((m) => {
          const p = permissaoInicial(m.valor);
          return [m.valor, { visualizar: p?.podeVisualizar ?? false, editar: p?.podeEditar ?? false }];
        })
      ) as Record<Modulo, { visualizar: boolean; editar: boolean }>
  );

  function alternar(modulo: Modulo, campo: "visualizar" | "editar") {
    setPermissoes((atual) => {
      const linha = { ...atual[modulo] };
      linha[campo] = !linha[campo];
      if (campo === "editar" && linha.editar) linha.visualizar = true; // editar exige visualizar
      if (campo === "visualizar" && !linha.visualizar) linha.editar = false;
      return { ...atual, [modulo]: linha };
    });
  }

  return (
    <form key={formKey} action={formAction} className="max-w-lg space-y-6">
      <div className="space-y-4">
        <Campo label="Nome" name="nome" required defaultValue={nome} placeholder="Nome completo" />
        <Campo
          label="CPF"
          name="cpf"
          required
          defaultValue={cpf}
          placeholder="000.000.000-00"
          inputMode="numeric"
        />
        <Campo
          label="Email (opcional)"
          name="email"
          type="email"
          defaultValue={email}
          placeholder="nome@exemplo.com"
        />
        <p className="-mt-3 text-xs text-foreground/50">
          Sem email cadastrado, essa pessoa não consegue usar &quot;Esqueci minha senha&quot; sozinha.
        </p>
        <Campo
          label={modoEdicao ? "Nova senha (deixe em branco pra manter a atual)" : "Senha"}
          name={modoEdicao ? "novaSenha" : "senha"}
          type="password"
          required={!modoEdicao}
          placeholder="Mínimo 8 caracteres"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-foreground/80">Permissões por módulo</h3>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Módulo</th>
                <th className="px-3 py-2 text-center font-medium">Visualizar</th>
                <th className="px-3 py-2 text-center font-medium">Editar</th>
              </tr>
            </thead>
            <tbody>
              {MODULOS.map((m) => (
                <tr key={m.valor} className="border-t border-black/5 dark:border-white/10">
                  <td className="px-3 py-2">{m.label}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      name={`visualizar_${m.valor}`}
                      checked={permissoes[m.valor].visualizar}
                      onChange={() => alternar(m.valor, "visualizar")}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      name={`editar_${m.valor}`}
                      checked={permissoes[m.valor].editar}
                      onChange={() => alternar(m.valor, "editar")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href="/usuarios"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
