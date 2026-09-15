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
  // Samodzielna encja — na tym etapie nic nie wie o users ani o posts.
  // Dopiero post_tags połączy ją z posts. Brak FK — sama tabela nie ma
  // żadnej kolumny odnoszącej się do innej tabeli.
  //
  // W gołym Postgresie:
  //
  //   CREATE TABLE "tags" (
  //     "id" serial PRIMARY KEY,
  //     "name" varchar(50) UNIQUE NOT NULL
  //   );
  pgm.createTable("tags", {
    id: "id", // PK — klucz główny (serial primary key)
    name: { type: "varchar(50)", notNull: true, unique: true },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("tags");
};
