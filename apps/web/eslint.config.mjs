import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Frontend injection guards (ASVS V3.2.2, V3.2.3; threat T-08). Agency text,
    // TOR text and AI summaries are untrusted, so nothing may turn a string into
    // markup or code, and nothing may lean on named access to the DOM.
    rules: {
      'react/no-danger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        ...['forms', 'all', 'images', 'links', 'anchors', 'embeds', 'scripts'].map((property) => ({
          object: 'document',
          property,
          message:
            'Named access to these collections is what DOM clobbering abuses. Query a scoped ref instead.',
        })),
        {
          object: 'window',
          property: 'name',
          message: 'window.name is attacker-settable across navigations and is not a safe store.',
        },
        ...['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({
          property,
          message: 'Never turn a string into markup: render it as a React text child.',
        })),
        {
          object: 'document',
          property: 'write',
          message: 'Never turn a string into markup: render it as a React text child.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        // `.expression` covers a cast such as `(window as unknown as Foo).bar = 1`,
        // the only way TypeScript lets code assign an undeclared property to a
        // global.
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression']:matches([left.object.name='window'], [left.object.expression.name='window'], [left.object.expression.expression.name='window'])",
          message: 'Do not hang state on window: a global is clobberable. Use module scope.',
        },
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression']:matches([left.object.name='document'], [left.object.expression.name='document'], [left.object.expression.expression.name='document']):not([left.property.name=/^(cookie|title)$/])",
          message: 'Do not hang state on document: a global is clobberable. Use module scope.',
        },
      ],
    },
  },
  {
    // Tests stub browser globals (matchMedia, ResizeObserver...) and plant markup
    // on purpose, to show the guards above can fail.
    files: ['**/*.test.{ts,tsx}', 'vitest.setup.ts', 'e2e/**'],
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-properties': 'off' },
  },
  {
    // The one place dangerouslySetInnerHTML is allowed: shadcn's generated chart
    // primitive, which builds a <style> block from developer-defined chart
    // configs only (constants such as `var(--primary)`); no API or user data
    // reaches it. It is generated, so it is exempted here rather than edited.
    files: ['src/components/ui/chart.tsx'],
    rules: { 'react/no-danger': 'off' },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
