/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // odpowiednik sql/01-schema.sql — od teraz TA migracja jest źródłem prawdy
  // o tabeli users, nie plik .sql montowany do initdb.d
  //
  // W gołym Postgresie (bez node-pg-migrate) ta migracja to dosłownie:
  //
  //   CREATE TABLE "users" (
  //     "id" serial PRIMARY KEY,
  //     "name" varchar(255) NOT NULL,
  //     "email" varchar(255) UNIQUE NOT NULL
  //   );
  //
  // (to jest dokładnie to, co node-pg-migrate wypisuje i wykonuje pod spodem)
  pgm.createTable("users", {
    // PK — "id" to skrót node-pg-migrate na "serial PRIMARY KEY" (autoinkrementowana
    // liczba całkowita + ograniczenie klucza głównego w jednym). Bez skrótu:
    // id: { type: "serial", primaryKey: true }
    id: "id",
    name: { type: "varchar(255)", notNull: true },
    email: { type: "varchar(255)", notNull: true, unique: true },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("users");
};
