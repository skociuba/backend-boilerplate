import prisma from "../db";
import { createChild, listChildren } from "../services/childService";

// Serwis nie zna Expressa, więc test woła go jak zwykłą funkcję — bez
// fałszywych req/res. Mockujemy tylko Prismę (jak w pozostałych testach).
jest.mock("../db", () => ({
  __esModule: true,
  default: {
    children: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockedPrisma = prisma as unknown as {
  children: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};

const baseOptions = { skip: 0, take: 10, sortBy: "id" as const, order: "asc" as const };

describe("childService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createChild", () => {
    it("zapisuje dziecko z user_id z argumentu", async () => {
      const dob = new Date("2020-01-01");
      mockedPrisma.children.create.mockResolvedValue({ id: 1 });

      await createChild(7, { name: "Ala", age: 5, date_of_birth: dob });

      expect(mockedPrisma.children.create).toHaveBeenCalledWith({
        data: { user_id: 7, name: "Ala", age: 5, date_of_birth: dob },
      });
    });
  });

  describe("listChildren", () => {
    beforeEach(() => {
      mockedPrisma.$transaction.mockResolvedValue([[{ id: 1 }], 1]);
    });

    it("zawsze zawęża do dzieci danego użytkownika", async () => {
      const result = await listChildren(7, baseOptions);

      expect(mockedPrisma.children.findMany).toHaveBeenCalledWith({
        where: { user_id: 7 },
        orderBy: { id: "asc" },
        skip: 0,
        take: 10,
      });
      expect(mockedPrisma.children.count).toHaveBeenCalledWith({ where: { user_id: 7 } });
      expect(result).toEqual({ items: [{ id: 1 }], total: 1 });
    });

    it("dokłada filtry tylko dla podanych parametrów", async () => {
      await listChildren(7, { ...baseOptions, name: "ala", minAge: 3 });

      expect(mockedPrisma.children.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            user_id: 7,
            name: { contains: "ala", mode: "insensitive" },
            age: { gte: 3 },
          },
        })
      );
    });

    // 0 to poprawna wartość filtra — nie może zniknąć jak "brak parametru"
    it("traktuje maxAge = 0 jako filtr", async () => {
      await listChildren(7, { ...baseOptions, maxAge: 0 });

      expect(mockedPrisma.children.count).toHaveBeenCalledWith({
        where: { user_id: 7, age: { lte: 0 } },
      });
    });
  });
});
