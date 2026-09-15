// Skrypt demonstracyjny — NIE podpięty do aplikacji, tylko do porównania
// z ręcznym SQL w src/controllers/postController.ts (getIndex).
// Odpalenie: npx ts-node scripts/prisma-demo.ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 wymaga jawnego "driver adapter" zamiast dawnego automatycznego
// łączenia po samym DATABASE_URL — adapter opakowuje ten sam pakiet "pg",
// którego już używamy w src/db.ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const posts = await prisma.posts.findMany({
    include: {
      users: true, // JOIN do autora (1:N)
      post_tags: { include: { tags: true } }, // przez tabelę pośrednią (N:M)
    },
    orderBy: { created_at: "desc" },
  });

  console.log(JSON.stringify(posts, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
