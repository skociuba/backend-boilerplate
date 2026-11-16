import { execSync } from "child_process";
import { Client } from "pg";
import { assertTestDatabase } from "./guard";

// Raz przed całym zestawem: baza testowa jest budowana od zera tymi samymi
// migracjami i tą samą komendą (`prisma migrate deploy`), co na produkcji.
// Dzięki temu CI łapie migrację, która nie przechodzi na czystej bazie
// (błąd w SQL, zła kolejność, odwołanie do nieistniejącej kolumny). Nie
// łapie różnic względem starszych baz o innej historii — to wymagałoby
// testu na kopii produkcyjnej bazy.
export default async function globalSetup(): Promise<void> {
  const databaseName = assertTestDatabase();

  // Czysty schemat zwykłym SQL-em zamiast `prisma migrate reset` — reset
  // pyta o potwierdzenie i zmieniał flagi między wersjami Prismy, a tu
  // chodzi tylko o "pusta baza, potem migracje".
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env });

  console.log(`\nBaza testowa "${databaseName}" zbudowana od zera z migracji.`);
}
