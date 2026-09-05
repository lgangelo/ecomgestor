import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslintPlugin from '@typescript-eslint/eslint-plugin';

// Nota: propositalmente NÃO incluímos `eslint-config-next/typescript` aqui — o `.eslintrc.json`
// original (pré-Next 16) só estendia `next/core-web-vitals`, sem as regras completas do
// `@typescript-eslint` (que trariam `no-explicit-any`/`no-require-imports` como erro, nunca
// habilitadas neste projeto). Registramos o plugin manualmente só para poder usar a mesma regra
// pontual de antes (`no-unused-vars`), sem herdar o conjunto `recommended` inteiro.
const eslintConfig = defineConfig([
  ...nextVitals,
  {
    plugins: {
      '@typescript-eslint': tseslintPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // `eslint-config-next` 16 pulou de `eslint-plugin-react-hooks` ^4 pra ^7, que passou a tratar
      // `setState` síncrono dentro de `useEffect` como erro (regra nova, não existia antes). Isso
      // acende em ~10 componentes pré-existentes deste projeto (padrão comum de "sincronizar form
      // state quando o dialog abre"), que funcionam bem em produção hoje. Rebaixado pra warning de
      // propósito: corrigir cada ocorrência é uma refatoração de comportamento por componente, não
      // uma mudança mecânica da migração do Next.js — decisão de produto que fica para revisão
      // separada, não decidida aqui.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // Overrides default ignores of eslint-config-next.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
