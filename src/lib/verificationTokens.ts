import { randomBytes, createHash } from "crypto";
import prisma from "../db";
import { TokenPurpose } from "../generated/prisma/enums";

const EXPIRY_HOURS: Record<TokenPurpose, number> = {
  password_reset: 1,
  account_activation: 24,
};

// Osobna, lokalna funkcja hash — NIE import z lib/jwt.ts. To nie jest JWT,
// to zwykły losowy token (jak refresh token), jwt.ts ma zostać poświęcone
// wyłącznie JWT-om.
const hash = (raw: string): string => createHash("sha256").update(raw).digest("hex");

// Zwraca RAW token (do wklejenia w link w mailu) — w bazie ląduje TYLKO
// hash, identycznie jak przy refresh tokenie: wyciek bazy nie daje nikomu
// tokena użytecznego do kliknięcia.
export const createVerificationToken = async (
  userId: number,
  purpose: TokenPurpose
): Promise<string> => {
  const raw = randomBytes(32).toString("hex");
  const expires_at = new Date(Date.now() + EXPIRY_HOURS[purpose] * 60 * 60 * 1000);

  await prisma.verification_tokens.create({
    data: { user_id: userId, token_hash: hash(raw), purpose, expires_at },
  });

  return raw;
};

// Zwraca user_id jeśli token istnieje, ma właściwy purpose, nie jest
// jeszcze użyty i nie wygasł — inaczej null. updateMany z warunkiem w
// WHERE konsumuje token ATOMOWO razem ze sprawdzeniem, żeby dwa równoległe
// kliknięcia tego samego linku nie zdążyły obie przejść.
export const consumeVerificationToken = async (
  rawToken: string,
  purpose: TokenPurpose
): Promise<number | null> => {
  const token_hash = hash(rawToken);

  const result = await prisma.verification_tokens.updateMany({
    where: { token_hash, purpose, used_at: null, expires_at: { gt: new Date() } },
    data: { used_at: new Date() },
  });

  if (result.count === 0) return null;

  const token = await prisma.verification_tokens.findUnique({ where: { token_hash } });
  return token?.user_id ?? null;
};
