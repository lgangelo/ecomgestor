const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Necessário em monorepos com npm workspaces: garante que o build "standalone"
  // (usado na imagem Docker) rastreie corretamente os pacotes symlinkados em
  // packages/* a partir da raiz do monorepo, não apenas de apps/web.
  // Nesta versão do Next.js a opção vive sob `experimental` (validada via config-schema.js).
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  reactStrictMode: true,
  transpilePackages: ['@ecommerce-manager/shared', '@ecommerce-manager/ui'],
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
