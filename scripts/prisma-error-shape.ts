import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    await prisma.user_profiles.upsert({
      where: { user_id: 2 },
      update: { pesel: "123", date_of_birth: new Date("1995-05-05") },
      create: {
        user_id: 2,
        pesel: "123",
        date_of_birth: new Date("1995-05-05"),
      },
    });
  } catch (error) {
    console.log("constructor.name:", (error as Error).constructor.name);
    console.log("own props:", Object.getOwnPropertyNames(error));
    console.log("code:", (error as { code?: string }).code);
    console.log(
      "meta:",
      JSON.stringify((error as { meta?: unknown }).meta, null, 2)
    );
  }
}

main().finally(() => prisma.$disconnect());
