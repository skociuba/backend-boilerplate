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

  console.log({ alice, bob });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
