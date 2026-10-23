"use client";

import { useEffect } from "react";

// O Chrome usa o título da página como nome sugerido do arquivo ao "Salvar como PDF".
// Sem isso o PDF saía sempre como "Sistema Financeiro.pdf". Aqui o título vira, por exemplo,
// "Relatório de Caixa - AVEIRO - 15-10-2026 06-00 a 16-10-2026 05-55" enquanto a página está aberta.
export function TituloArquivo({ nome }: { nome: string }) {
  useEffect(() => {
    const anterior = document.title;
    document.title = nome;
    return () => {
      document.title = anterior;
    };
  }, [nome]);
  return null;
}
