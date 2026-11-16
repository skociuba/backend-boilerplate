/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+.tsx?$": ["ts-jest",{}],
  },
  // Testy integracyjne potrzebują prawdziwej bazy — mają osobną konfigurację
  // (jest.integration.config.js, `npm run test:integration`), więc zwykłe
  // `npm test` zostaje szybkie i działa bez Postgresa
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/src/tests/integration/"],
};
