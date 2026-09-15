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
  // Relacja 1:1 z users — kanoniczny wzorzec: user_id jest jednocześnie
  // kluczem głównym I kluczem obcym (żaden osobny "id" nie jest potrzebny,
  // bo nie da się mieć dwóch profili dla jednego usera — to właśnie
  // wymusza 1:1, w odróżnieniu od 1:N, gdzie user_id byłby zwykłym FK).
  //
  // W gołym Postgresie:
  //
  //   CREATE TABLE "user_profiles" (
  //     "user_id" integer PRIMARY KEY NOT NULL REFERENCES "users" ON DELETE CASCADE,
  //     "pesel" varchar(11) UNIQUE NOT NULL CHECK (pesel ~ '^[0-9]{11}$'),
  //     "date_of_birth" date NOT NULL,
  //     "phone" varchar(20)
  //   );
  pgm.createTable("user_profiles", {
    // PK + FK naraz — "primaryKey: true" tutaj to odpowiednik "PRIMARY KEY"
    // dopisanego wprost przy kolumnie (nie osobny SERIAL, bo wartość i tak
    // przychodzi z users.id, nie jest generowana tutaj)
    user_id: {
      type: "integer",
      primaryKey: true,
      notNull: true,
      references: '"users"', // FK -> users.id
      onDelete: "CASCADE", // usunięcie usera kasuje jego profil
    },
    pesel: {
      type: "varchar(11)",
      notNull: true,
      unique: true, // dwóch userów nie może mieć tego samego (fake) peselu
      check: "pesel ~ '^[0-9]{11}$'", // 11 cyfr — sama forma, bez sumy kontrolnej
    },
    date_of_birth: { type: "date", notNull: true },
    phone: { type: "varchar(20)" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("user_profiles");
};
