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
  // Relacja N:M — sama tabela "posts" i sama "tags" nie mogłyby się
  // bezpośrednio połączyć (jeden post ma wiele tagów, jeden tag jest na
  // wielu postach — żadna ze stron nie może trzymać cudzego id w jednej
  // kolumnie). Tabela pośrednia trzyma po jednym FK do każdej strony.
  //
  // W gołym Postgresie (dwa osobne polecenia, tak jak node-pg-migrate
  // faktycznie to wykonuje — najpierw tabela, potem złożony PK):
  //
  //   CREATE TABLE "post_tags" (
  //     "post_id" integer NOT NULL REFERENCES "posts" ON DELETE CASCADE,
  //     "tag_id" integer NOT NULL REFERENCES "tags" ON DELETE CASCADE
  //   );
  //   ALTER TABLE "post_tags"
  //     ADD CONSTRAINT "post_tags_pkey" PRIMARY KEY ("post_id", "tag_id");
  pgm.createTable("post_tags", {
    post_id: {
      // FK -> posts.id
      type: "integer",
      notNull: true,
      references: '"posts"',
      onDelete: "CASCADE",
    },
    tag_id: {
      // FK -> tags.id
      type: "integer",
      notNull: true,
      references: '"tags"',
      onDelete: "CASCADE",
    },
  });

  // PK złożony z DWÓCH kolumn naraz (post_id, tag_id) zamiast osobnego
  // "id" — wymusza, że ta sama para post+tag nie powtórzy się nigdy w
  // tabeli (bez tego nic nie stoi na przeszkodzie, żeby przypadkowo
  // wstawić ten sam tag do posta dwa razy)
  pgm.addConstraint("post_tags", "post_tags_pkey", {
    primaryKey: ["post_id", "tag_id"],
  });

  // odwrotny kierunek odpytywania ("jakie posty mają ten tag") potrzebuje
  // własnego indeksu — złożony PK powyżej optymalizuje tylko wyszukiwanie
  // po post_id jako pierwszej kolumnie
  pgm.createIndex("post_tags", "tag_id");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("post_tags");
};
