import { Pool, types } from "pg";

// node-postgres domyślnie parsuje kolumny typu DATE (OID 1082) na obiekt
// JS Date o północy czasu lokalnego, a JSON.stringify() serializuje Date
// zawsze przez UTC — więc np. 1995-05-05 w Warszawie (latem, UTC+2) wraca
// do klienta jako "1995-05-04T22:00:00.000Z" (dzień wcześniej!). Wyłączamy
// tę konwersję i zostawiamy DATE jako czysty string "YYYY-MM-DD" — dokładnie
// to, co i tak jest w bazie i czego oczekuje <input type="date">.
types.setTypeParser(1082, (value) => value);

// W kontenerze (docker-compose.yml) DATABASE_URL wskazuje na serwis "db".
// Lokalnie (poza dockerem) DATABASE_URL w .env wskazuje na localhost:5433
// (port wystawiony przez docker-compose.override.yml).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;
