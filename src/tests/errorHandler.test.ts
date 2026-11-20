import * as Sentry from "@sentry/node";
import express from "express";
import { AddressInfo } from "net";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { errorHandler } from "../middleware/errorHandler";

jest.mock("@sentry/node", () => ({ captureException: jest.fn() }));

const captureException = Sentry.captureException as jest.Mock;

// Trasa rzucająca podanym błędem, za nią prawdziwy errorHandler
const request = async (error: unknown) => {
  const app = express();
  app.get("/boom", () => {
    throw error;
  });
  app.use(errorHandler);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/boom`);
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
};

// Do Sentry (i maila z alertem) ma trafiać tylko to, co jest faktycznie
// błędem w kodzie albo awarią — nie normalna praca aplikacji
describe("errorHandler → Sentry", () => {
  afterEach(() => captureException.mockClear());

  it("wysyła nieoczekiwany błąd i nie ujawnia szczegółów klientowi", async () => {
    const bug = new TypeError("Cannot read properties of undefined");

    const res = await request(bug);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Wewnętrzny błąd serwera" });
    expect(captureException).toHaveBeenCalledWith(bug);
  });

  it.each([
    ["404", new NotFoundError()],
    ["400 walidacji", new BadRequestError("Nieprawidłowe dane")],
  ])("nie wysyła oczekiwanego błędu (%s)", async (_name, error) => {
    const res = await request(error);

    expect(res.status).toBeLessThan(500);
    expect(captureException).not.toHaveBeenCalled();
  });
});
