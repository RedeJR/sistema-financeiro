import type { NextConfig } from "next";

// Cabeçalhos de segurança aplicados a toda resposta — defesa em profundidade
// além da autenticação em si (que já bloqueia toda página/ação, ver
// src/lib/auth.ts). Nenhum deles muda comportamento visível do sistema.
const CABECALHOS_SEGURANCA = [
  // Barra o site de ser carregado dentro de um <iframe> de outro domínio —
  // sem isso, uma página maliciosa poderia embutir o sistema por cima e
  // enganar cliques (clickjacking) num usuário logado.
  { key: "X-Frame-Options", value: "DENY" },
  // Impede o navegador de "adivinhar" o tipo de um arquivo pelo conteúdo em
  // vez do Content-Type declarado — evita que um upload seja interpretado
  // como script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Não manda a URL completa (que pode ter dados do sistema) como referrer
  // pra outro site; manda só a origem, e só em navegação HTTPS->HTTPS.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desliga APIs de navegador que esse sistema nunca usa.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Não anuncia "X-Powered-By: Next.js" — não ajuda em nada quem usa o
  // sistema, só dá de graça pra quem for atacar qual framework mirar.
  poweredByHeader: false,
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
  async headers() {
    return [{ source: "/:path*", headers: CABECALHOS_SEGURANCA }];
  },
};

export default nextConfig;
