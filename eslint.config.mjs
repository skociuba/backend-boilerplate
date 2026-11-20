// ESLint 9 (flat config) — zalecane reguły JS i typescript-eslint. Bez
// reguł stylu: formatowanie to nie sprawa lintera, a w tym repo nie ma
// Prettiera, więc nie ma z czym go godzić.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Wygenerowane i zbudowane pliki
    ignores: ['dist/', 'coverage/', 'src/generated/', 'node_modules/']
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    languageOptions: {
      globals: globals.node
    },
    rules: {
      // Parametr celowo nieużywany (np. `_req` w handlerze Expressa, gdzie
      // liczy się pozycja argumentu) zaczyna się od podkreślnika
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ]
    }
  },

  {
    files: ['src/tests/**'],
    languageOptions: { globals: globals.jest },
    rules: {
      // Helper testów zwraca dowolny JSON (body: T = any) — asercje i tak
      // sprawdzają konkretne pola, a `unknown` wymagałby rzutowania w
      // każdym teście. W kodzie aplikacji reguła zostaje włączona.
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },

  // Konfiguracje narzędzi (jest) są w CommonJS
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  }
);
