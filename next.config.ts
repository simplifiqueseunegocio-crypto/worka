import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite gerar o build em outra pasta (NEXT_DIST_DIR=.next-build) sem
  // corromper o cache do servidor de desenvolvimento, que usa .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // Leitura de ficha ponto: o pdf.js carrega o worker e o canvas nativo em tempo
  // de execução; ficam fora do bundle do servidor.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  experimental: {
    // PDFs da folha de adiantamento (até 4 MB cada, lib/adiantamento.ts) + o
    // envelope do multipart. A Vercel não aceita corpos acima de 4,5 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
