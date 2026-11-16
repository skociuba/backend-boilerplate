import { assertTestDatabase } from "./guard";

// Uruchamiane przed każdym plikiem testów, zanim cokolwiek zaimportuje
// aplikację. Zabezpieczenie powtarzamy tutaj, bo globalSetup działa w
// osobnym procesie, a ten plik w tym, który faktycznie łączy się z bazą.
assertTestDatabase();

// Sekrety tylko dla testów — w CI nie ma żadnego .env, a lib/jwt.ts czyta
// je przy imporcie. Prawdziwe wartości z otoczenia mają pierwszeństwo.
process.env.JWT_ACCESS_SECRET ??= "integration-test-access-secret";
process.env.JWT_REFRESH_SECRET ??= "integration-test-refresh-secret";
process.env.FRONTEND_URL ??= "http://localhost:3001";
