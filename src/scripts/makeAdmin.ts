import "dotenv/config";

import prisma from "../db";

// Nadawanie (i odbieranie) roli admina z linii poleceń na serwerze.
//
// Dlaczego skrypt, a nie endpoint czy seed: rolę admina może nadać tylko
// ktoś, kto ma dostęp do serwera (SSH + docker) — to jest tu właściwa
// granica zaufania. Publiczny endpoint "zrób mnie adminem" musiałby mieć
// własne zabezpieczenie, a seed (prisma/seed.ts) ma hasła zapisane w repo,
// więc na produkcji dałby admina każdemu, kto przeczyta kod.
//
// Konto musi już istnieć (zwykła rejestracja przez aplikację) — skrypt
// nie tworzy użytkowników i nigdy nie dotyka haseł.
//
// Użycie:
//   produkcja: docker-compose exec app node dist/scripts/makeAdmin.js <email>
//   lokalnie:  npm run make-admin -- <email>
//   odebranie: ... <email> --revoke
const main = async (): Promise<number> => {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args.find((arg) => !arg.startsWith("--"));

  if (!email) {
    console.error("Użycie: makeAdmin <email> [--revoke]");
    return 1;
  }

  const user = await prisma.users.findUnique({
    where: { email },
    select: { id: true, role: true, email_verified_at: true },
  });

  if (!user) {
    console.error(`Nie ma konta ${email}. Najpierw zarejestruj je przez aplikację.`);
    return 1;
  }

  const role = revoke ? "user" : "admin";

  // Nadając admina, przy okazji potwierdzamy email: osoba z dostępem do
  // serwera ręczy za to konto, a bez tego admin nie zaloguje się, dopóki
  // mail aktywacyjny do niego nie dojdzie (np. leży w spamie).
  await prisma.users.update({
    where: { id: user.id },
    data: {
      role,
      ...(!revoke && !user.email_verified_at ? { email_verified_at: new Date() } : {}),
    },
  });

  console.log(`${email}: rola ${user.role} → ${role}. Zaloguj się ponownie, żeby token dostał nową rolę.`);
  return 0;
};

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
