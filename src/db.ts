import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 wymaga jawnego "driver adapter" zamiast starego automatycznego
// łączenia po samym DATABASE_URL — adapter i tak pod spodem używa "pg",
// tego samego pakietu co wcześniej.
//
// W kontenerze (docker-compose.yml) DATABASE_URL wskazuje na serwis "db".
// Lokalnie (poza dockerem) DATABASE_URL w .env wskazuje na localhost:5433
// (port wystawiony przez docker-compose.override.yml).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export default prisma;
