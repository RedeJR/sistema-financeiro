"use client";

import { useEffect, useRef } from "react";

// Evento disparado por quem marca/desmarca várias caixas de uma vez sem passar pelo clique de cada uma
// (ver SelecionarTodos): cada caixa lembrada relê o próprio estado e grava de novo.
export const EVENTO_SELECAO_LEMBRADA = "selecao-lembrada:sincronizar";

function ler(chave: string): Set<string> {
  try {
    const bruto = sessionStorage.getItem(chave);
    const lista = bruto ? JSON.parse(bruto) : [];
    return new Set(Array.isArray(lista) ? lista.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function gravar(chave: string, ids: Set<string>) {
  try {
    sessionStorage.setItem(chave, JSON.stringify([...ids]));
  } catch {
    // Sem armazenamento (janela privada, bloqueado): a caixa só não é lembrada.
  }
}

// Checkbox de linha cuja marcação sobrevive a sair da tela (ex: abrir "Editar" e voltar) — fica no
// sessionStorage da aba, por `chave`. Só guarda o que a usuária marcou/desmarcou nas linhas que aparecem,
// então a seleção de outra página da lista continua guardada. Continua uma caixa comum de <form> externo
// (name/value/form), então a Server Action recebe os ids como antes.
export function CaixaSelecaoLembrada({
  chave,
  id,
  formId,
  nome = "ids",
}: {
  chave: string;
  id: string;
  formId: string;
  nome?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current && ler(chave).has(id)) ref.current.checked = true;
  }, [chave, id]);

  useEffect(() => {
    const salvar = () => {
      if (!ref.current) return;
      const ids = ler(chave);
      if (ref.current.checked) ids.add(id);
      else ids.delete(id);
      gravar(chave, ids);
    };
    window.addEventListener(EVENTO_SELECAO_LEMBRADA, salvar);
    return () => window.removeEventListener(EVENTO_SELECAO_LEMBRADA, salvar);
  }, [chave, id]);

  return (
    <input
      ref={ref}
      type="checkbox"
      name={nome}
      value={id}
      form={formId}
      onChange={(e) => {
        const ids = ler(chave);
        if (e.target.checked) ids.add(id);
        else ids.delete(id);
        gravar(chave, ids);
      }}
    />
  );
}
