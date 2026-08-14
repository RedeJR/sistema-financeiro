import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Padrão do Next é 1MB — pouco pra extrato de verdade. O PagSeguro,
      // por exemplo, exporta um <STMTTRN> por venda (não agrupado por dia),
      // então um período de duas semanas já passa de 1MB em OFX puro. A
      // importação aceita vários arquivos de uma vez (ver
      // extratos/importar/formulario-importar.tsx, input multiple), então o
      // limite precisa cobrir a soma deles, não só um arquivo — 20mb dá
      // bastante folga sem deixar o limite genuinamente ilimitado.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
