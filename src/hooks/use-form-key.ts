"use client";

import { useState } from "react";

// Gera uma key que muda toda vez que `dep` muda de identidade. Usada pra
// forçar um <form> não controlado a remontar depois de uma Server Action
// (o React limpa os inputs não controlados após a action rodar, então sem
// isso o usuário perderia o que digitou quando a validação falha).
//
// Ajusta o estado durante o render (comparando com o valor da renderização
// anterior), em vez de um useEffect — é o padrão recomendado pelo React pra
// "resetar estado quando uma prop muda", e evita uma renderização extra.
// https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
export function useFormKey(dep: unknown): number {
  const [key, setKey] = useState(0);
  const [depAnterior, setDepAnterior] = useState(dep);

  if (dep !== depAnterior && dep) {
    setDepAnterior(dep);
    setKey((k) => k + 1);
  }

  return key;
}
