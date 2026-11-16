import { Request, Response } from "express";
import UserProfileController from "../controllers/userProfileController";
import prisma from "../db";
import { ForbiddenError } from "../lib/errors";
import { profileSchema } from "../lib/profileValidation";

jest.mock("../db", () => ({
  __esModule: true,
  default: {
    users: { update: jest.fn(), findUnique: jest.fn() },
    user_profiles: { upsert: jest.fn() },
    $transaction: jest.fn((queries: unknown[]) => Promise.all(queries)),
  },
}));

describe("profileSchema", () => {
  it("zamienia puste pola opcjonalne na null i przycina imię", () => {
    expect(profileSchema.parse({ name: "  Jan Kowalski ", date_of_birth: "", phone: " " })).toEqual(
      { name: "Jan Kowalski", date_of_birth: null, phone: null }
    );
  });

  it("odrzuca puste imię, złą datę i datę z przyszłości", () => {
    expect(profileSchema.safeParse({ name: " " }).success).toBe(false);
    expect(profileSchema.safeParse({ name: "Jan", date_of_birth: "01.01.1990" }).success).toBe(
      false
    );
    expect(profileSchema.safeParse({ name: "Jan", date_of_birth: "2999-01-01" }).success).toBe(
      false
    );
  });

  it("nie przepuszcza pola pesel (zod obcina nieznane klucze)", () => {
    expect(profileSchema.parse({ name: "Jan", pesel: "90010112345" })).not.toHaveProperty("pesel");
  });
});

describe("UserProfileController", () => {
  const controller = new UserProfileController();
  let json: jest.Mock;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    json = jest.fn();
    res = { status: jest.fn().mockReturnValue({ json }) };
    next = jest.fn();
  });

  afterEach(() => jest.clearAllMocks());

  it("zapisuje imię w users i resztę w profilu w jednej transakcji", async () => {
    (prisma.users.update as jest.Mock).mockReturnValue(Promise.resolve({ name: "Jan Kowalski" }));
    (prisma.user_profiles.upsert as jest.Mock).mockReturnValue(
      Promise.resolve({
        date_of_birth: new Date("1990-01-01"),
        phone: "500600700",
        avatar_path: null,
        document_original_name: null,
      })
    );

    const req = {
      params: { id: "5" },
      currentUserId: 5,
      body: { name: "Jan Kowalski", date_of_birth: "1990-01-01", phone: "500600700" },
    } as unknown as Request;
    await controller.upsert(req, res as Response, next);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { name: "Jan Kowalski" },
      select: { name: true },
    });
    expect(json).toHaveBeenCalledWith({
      user_id: 5,
      name: "Jan Kowalski",
      date_of_birth: "1990-01-01",
      phone: "500600700",
      avatar_path: null,
      document_original_name: null,
    });
  });

  it("zwraca imię także wtedy, gdy profilu jeszcze nie ma", async () => {
    (prisma.users.findUnique as jest.Mock).mockResolvedValue({ name: "Ala", user_profiles: null });

    const req = { params: { id: "5" }, currentUserId: 5 } as unknown as Request;
    await controller.getByUserId(req, res as Response, next);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 5, name: "Ala", date_of_birth: null, phone: null })
    );
  });

  it("nie pozwala edytować cudzego profilu", async () => {
    const req = { params: { id: "6" }, currentUserId: 5, body: { name: "X" } } as unknown as Request;
    await controller.upsert(req, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
