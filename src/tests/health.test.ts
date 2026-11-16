import express from "express";
import { AddressInfo } from "net";
import prisma from "../db";
import healthRoutes from "../routes/health.routes";

jest.mock("../db", () => ({
  __esModule: true,
  default: { $queryRaw: jest.fn() },
}));

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;

// Prawdziwy serwer HTTP na losowym porcie zamiast wołania handlera ręcznie —
// tak samo pyta HEALTHCHECK w Dockerze (fetch na /health)
const request = async (path: string) => {
  const app = express();
  app.use(healthRoutes);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
};

describe("GET /health", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("odpowiada 200, gdy baza odpowiada", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await expect(request("/health")).resolves.toEqual({
      status: 200,
      body: { status: "ok", database: "up" },
    });
  });

  it("odpowiada 503 bez szczegółów błędu, gdy baza nie działa", async () => {
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

    const res = await request("/health");

    expect(res).toEqual({ status: 503, body: { status: "error", database: "down" } });
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
  });

  // Prawdziwy czas (~2 s), nie fałszywe timery — te nie współpracują z
  // prawdziwym serwerem HTTP, a tu liczy się dokładnie zachowanie w Dockerze
  it("odpowiada 503, gdy baza wisi dłużej niż limit", async () => {
    queryRaw.mockReturnValue(new Promise(() => {}));

    const started = Date.now();
    await expect(request("/health")).resolves.toEqual({
      status: 503,
      body: { status: "error", database: "down" },
    });
    // Krócej niż timeout HEALTHCHECK-a (5 s) — Docker dostaje 503, a nie zerwane połączenie
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
