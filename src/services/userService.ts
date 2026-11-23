import * as Sentry from "@sentry/node";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";
import logger from "../lib/logger";
import { sendAccountSetupEmail } from "../lib/mailer";
import { createVerificationToken } from "../lib/verificationTokens";

// Bez password_hash — moduł admina nie ma powodu go znać, a wysyłanie go
// na front (nawet zahashowanego) to niepotrzebnie rozszerzona powierzchnia
// ataku, gdyby kiedyś coś po drodze go zalogowało.
const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

type UserData = Pick<Prisma.usersCreateInput, "name" | "email" | "role">;

export function listUsers() {
  return prisma.users.findMany({ select: PUBLIC_USER_FIELDS });
}

export function getUser(id: number) {
  return prisma.users.findUnique({ where: { id }, select: PUBLIC_USER_FIELDS });
}

// Konto zakładane przez admina. role: undefined (nie wysłane) = Prisma
// stosuje @default(user) ze schematu. P2002 (email zajęty) leci do
// errorHandlera jako generyczny "Zasób o tych danych już istnieje".
export async function createUser({ name, email, role }: UserData) {
  const user = await prisma.users.create({
    data: { name, email, role },
    select: PUBLIC_USER_FIELDS,
  });

  // Konto admin-utworzone NIE ma hasła (password_hash: null — patrz
  // komentarz przy tej kolumnie w schema.prisma) — bez tego maila user
  // nigdy nie dostałby się na własne konto. Błąd wysyłki nie blokuje
  // utworzenia konta (ten sam wzorzec co rejestracja w authService).
  try {
    const token = await createVerificationToken(user.id, "password_reset");
    await sendAccountSetupEmail(email, token);
  } catch (error) {
    // Konto powstało, ale mail nie wyszedł — do Sentry, bo to znak, że
    // wysyłka maili w ogóle nie działa (np. wygasłe dane SMTP)
    logger.error({ err: error }, "Nie udało się wysłać maila z ustawieniem konta");
    Sentry.captureException(error);
  }

  return user;
}

// P2025 ("Record to update does not exist") leci do errorHandlera i
// wraca jako 404 — bez osobnego sprawdzania tutaj.
export async function updateUser(id: number, { name, email, role }: Partial<UserData>) {
  await prisma.users.update({ where: { id }, data: { email, name, role } });
}

export async function deleteUser(id: number) {
  await prisma.users.delete({ where: { id } });
}

// https://www.prisma.io/docs/orm/prisma-client/queries/transactions —
// odpowiednik ręcznego BEGIN/Promise.all/COMMIT: $transaction albo się
// uda w całości, albo nic się nie zapisze
export async function createUsersAtomically(users: { name: string; email: string }[]) {
  await prisma.$transaction(
    users.map((user) => prisma.users.create({ data: { name: user.name, email: user.email } }))
  );
}
