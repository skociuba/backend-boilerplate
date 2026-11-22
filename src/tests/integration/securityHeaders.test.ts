import prisma from "../../db";
import { startServer } from "./helpers";

// Nagłówki z helmet (app.ts) na prawdziwej aplikacji — także na /health,
// który stoi przed resztą middleware'ów, i na odpowiedzi 404. Gdyby ktoś
// przeniósł helmet niżej w łańcuchu albo go usunął, ten test to wyłapie.
describe("nagłówki bezpieczeństwa", () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    server = await startServer();
  });
  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
  });

  it.each(["/health", "/posts", "/nie-ma-takiej-trasy"])("są ustawione na %s", async (path) => {
    const res = await fetch(`${server.baseUrl}${path}`);

    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    // API nie zdradza, na czym stoi
    expect(res.headers.get("x-powered-by")).toBeNull();
    // HSTS ustawia nginx dla całej domeny, nie aplikacja
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });
});
