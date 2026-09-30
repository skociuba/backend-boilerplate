// Odpalane przez: npx prisma db seed
// Konfiguracja: prisma7.config.ts -> migrations.seed
//
// W Prisma 7 seed NIE jest automatycznie odpalany po migracjach
// (w odróżnieniu od starszych wersji) — trzeba go wywołać jawnie.
import "dotenv/config";
import { PrismaClient } from "./../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // users — upsert po email (unique w schemacie) = bezpieczne do
  // wielokrotnego odpalania, nie tworzy duplikatów
  const alice = await prisma.users.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: { name: "Alice", email: "alice@example.com" },
  });
  const bob = await prisma.users.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: { name: "Bob", email: "bob@example.com" },
  });

  // user_profiles (1:1) — upsert po user_id, bo to jest PK tej tabeli
  await prisma.user_profiles.upsert({
    where: { user_id: alice.id },
    update: {},
    create: {
      user_id: alice.id,
      pesel: "90010112345",
      date_of_birth: new Date("1990-01-01"),
      phone: "500600700",
    },
  });

  // tags — upsert po name (unique)
  const [postgresTag, nodeTag] = await Promise.all(
    ["postgres", "node"].map((name) =>
      prisma.tags.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  // posts + post_tags (1:N i N:M) — posty nie mają naturalnego unikalnego
  // klucza biznesowego, więc zamiast upsert sprawdzamy, czy Alice już ma
  // jakiekolwiek posty z seeda i pomijamy, jeśli tak (idempotencja "z grubsza")
  const alreadySeeded = await prisma.posts.count({
    where: { user_id: alice.id },
  });

  if (alreadySeeded === 0) {
    const post = await prisma.posts.create({
      data: {
        user_id: alice.id,
        title: "Pierwszy post z seeda",
        content: "Przykładowa treść wygenerowana przez prisma/seed.ts",
      },
    });

    await prisma.post_tags.createMany({
      data: [
        { post_id: post.id, tag_id: postgresTag.id },
        { post_id: post.id, tag_id: nodeTag.id },
      ],
    });

    await prisma.posts.create({
      data: {
        user_id: bob.id,
        title: "Drugi post z seeda",
        content: "Bob też coś napisał",
      },
    });

    console.log("Utworzono przykładowe posty i przypisania tagów.");
  } else {
    console.log("Posty już istnieją — pomijam (uruchom migrate reset, żeby zacząć od zera).");
  }

  // children — do ćwiczenia paginacji/sortowania/filtrowania. Tak jak przy
  // postach: brak naturalnego klucza biznesowego, więc idempotencja przez
  // sprawdzenie licznika zamiast upsert. 12 wierszy, rozstrzelone wieki i
  // dwóch różnych rodziców — celowo dwa "Ala", żeby dało się przetestować
  // filtr ?name=ala zwracający więcej niż jeden wynik.
  const childrenAlreadySeeded = await prisma.children.count({
    where: { user_id: alice.id },
  });

  if (childrenAlreadySeeded === 0) {
    await prisma.children.createMany({
      data: [
        { user_id: alice.id, name: "Ala", age: 5, date_of_birth: new Date("2021-03-01"), notes: "lubi rysować" },
        { user_id: bob.id, name: "Bartek", age: 8, date_of_birth: new Date("2018-02-01") },
        { user_id: alice.id, name: "Celina", age: 3, date_of_birth: new Date("2023-06-01") },
        { user_id: bob.id, name: "Damian", age: 12, date_of_birth: new Date("2014-01-01") },
        { user_id: alice.id, name: "Ela", age: 7, date_of_birth: new Date("2019-05-01") },
        { user_id: bob.id, name: "Filip", age: 9, date_of_birth: new Date("2017-08-01") },
        { user_id: alice.id, name: "Gala", age: 2, date_of_birth: new Date("2024-01-01") },
        { user_id: bob.id, name: "Hela", age: 6, date_of_birth: new Date("2020-01-01") },
        { user_id: alice.id, name: "Igor", age: 10, date_of_birth: new Date("2016-01-01") },
        { user_id: bob.id, name: "Jula", age: 4, date_of_birth: new Date("2022-01-01") },
        { user_id: alice.id, name: "Kamil", age: 11, date_of_birth: new Date("2015-01-01") },
        { user_id: bob.id, name: "Ala", age: 1, date_of_birth: new Date("2025-01-01") },
      ],
    });
    console.log("Utworzono 12 przykładowych dzieci (do testów paginacji).");
  } else {
    console.log("Dzieci już istnieją — pomijam.");
  }

  console.log({ alice, bob });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
