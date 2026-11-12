import { baseConfig } from '@torfun/config/eslint/base.mjs';

/**
 * Layer boundaries, enforced rather than documented.
 *
 * Dependencies point one way — routes -> services -> repositories -> core —
 * so a handler cannot reach past its service into storage, and a service
 * cannot take on HTTP concerns.
 */
export default [
  ...baseConfig,
  {
    files: ['src/routes/**/*.ts'],
    ignores: ['src/routes/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/repositories/*', '**/core/mongo'],
              allowTypeImports: true,
              message:
                'Routes must not reach storage directly. Call a service on the Fastify instance (app.<name>Service).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/services/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'fastify',
              importNames: ['FastifyRequest', 'FastifyReply', 'FastifyInstance'],
              message:
                'Services must stay framework-free so they are testable without a server. Take plain arguments and throw errors from core/errors.',
            },
          ],
        },
      ],
    },
  },
];
