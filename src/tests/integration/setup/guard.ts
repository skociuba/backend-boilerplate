// Testy integracyjne czyszczą tabele (TRUNCATE) przed każdym testem.
// Pomyłka w DATABASE_URL (np. wczytany zwykły .env z bazą deweloperską
// albo, co gorsza, produkcyjną) skończyłaby się utratą danych — więc
// zanim cokolwiek się wykona, nazwa bazy MUSI zawierać "test".
export const assertTestDatabase = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Brak DATABASE_URL. Testy integracyjne potrzebują osobnej bazy testowej — patrz CLAUDE.md (npm run test:integration)."
    );
  }

  const databaseName = new URL(url).pathname.replace(/^\//, "");
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      `Odmawiam uruchomienia testów integracyjnych na bazie "${databaseName}" — nazwa bazy musi zawierać "test", bo testy czyszczą wszystkie tabele.`
    );
  }

  return databaseName;
};
