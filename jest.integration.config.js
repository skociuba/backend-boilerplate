/** @type {import('ts-jest').JestConfigWithTsJest} **/
// Testy integracyjne: prawdziwy Express + prawdziwy Postgres (bez mocków
// Prismy). Wymagają DATABASE_URL wskazującego na bazę testową — patrz
// src/tests/integration/setup/guard.ts i komenda w CLAUDE.md.
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+.tsx?$": ["ts-jest", {}],
  },
  testMatch: ["<rootDir>/src/tests/integration/**/*.test.ts"],
  // Raz przed wszystkimi plikami: zabezpieczenie + migracje od zera
  globalSetup: "<rootDir>/src/tests/integration/setup/globalSetup.ts",
  // Przed każdym plikiem, ZANIM zaimportuje aplikację (jwt.ts czyta
  // sekrety przy imporcie)
  setupFiles: ["<rootDir>/src/tests/integration/setup/env.ts"],
  // Jedna baza dla wszystkich plików — równoległe pliki czyściłyby sobie
  // nawzajem tabele w trakcie testu
  maxWorkers: 1,
};
