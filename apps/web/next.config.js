const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Necessário em monorepos com npm workspaces: garante que o build "standalone"
  // (usado na imagem Docker) rastreie corretamente os pacotes symlinkados em
  // packages/* a partir da raiz do monorepo, não apenas de apps/web.
  // Desde o Next.js 15 esta opção é estável e vive no nível raiz (não mais em `experimental`).
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  transpilePackages: ['@ecommerce-manager/shared', '@ecommerce-manager/ui'],
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
