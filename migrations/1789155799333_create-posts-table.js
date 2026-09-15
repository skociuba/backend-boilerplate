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
  // Relacja 1:N z users — w odróżnieniu od user_profiles, user_id NIE jest
  // tu kluczem głównym (nie ma "unique"), więc jeden user może mieć wiele
  // wierszy w tej tabeli. Osobny "id" jest właśnie po to, żeby odróżniać te
  // wiele wierszy między sobą.
  //
  // W gołym Postgresie:
  //
  //   CREATE TABLE "posts" (
  //     "id" serial PRIMARY KEY,
  //     "user_id" integer NOT NULL REFERENCES "users" ON DELETE CASCADE,
  //     "title" varchar(255) NOT NULL,
  //     "content" text,
  //     "created_at" timestamp DEFAULT now() NOT NULL
  //   );
  //   CREATE INDEX "posts_user_id_index" ON "posts" ("user_id");
  pgm.createTable("posts", {
    id: "id",                      // PK — klucz główny (serial primary key)
    user_id: {                    // FK -> users.id
      type: "integer",
      notNull: true,
      references: '"users"',
      onDelete: "CASCADE", // usunięcie usera kasuje jego posty
    },
    title: { type: "varchar(255)", notNull: true },
    content: { type: "text" },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // indeks na user_id — bez niego "SELECT * FROM posts WHERE user_id = ..."
  // (czyli "pokaż wpisy tego usera") robiłoby pełne skanowanie tabeli
  pgm.createIndex("posts", "user_id");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("posts");
};
