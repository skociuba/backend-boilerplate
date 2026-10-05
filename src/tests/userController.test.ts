import { Request, Response } from "express";
import UserController from "../controllers/userController";
import prisma from "../db";

// Jawna fabryka mocka zamiast gołego jest.mock("../db") — automock
// próbowałby najpierw naprawdę skonstruować PrismaClient (+ adapter pg),
// żeby poznać jego kształt. Tak od razu podstawiamy fałszywy obiekt.
jest.mock("../db", () => ({
  __esModule: true,
  default: {
    users: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe("UserController", () => {
  let userController: UserController;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let next: jest.Mock;

  beforeEach(() => {
    userController = new UserController();
    req = {};
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    res = {
      status: statusMock,
    };
    // Kontrolery są teraz owinięte w asyncHandler (patrz lib/asyncHandler.ts)
    // i zwracają RequestHandler — Express zawsze wywołuje je z trzema
    // argumentami, więc testy robią to samo. next nie jest tu nigdy
    // wywoływany (wszystkie ścieżki w tych testach kończą się sukcesem),
    // ale musi istnieć, żeby asyncHandler miał gdzie przekazać ewentualny
    // odrzucony Promise.
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should get all users", async () => {
    const mockUsers = [{ id: 1, name: "John Doe", email: "john@example.com" }];
    (prisma.users.findMany as jest.Mock).mockResolvedValue(mockUsers);

    await userController.getIndex(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(mockUsers);
  });

  it("should create a new user", async () => {
    const mockUser = { id: 1, name: "John Doe", email: "john@example.com" };
    req.body = { name: "John Doe", email: "john@example.com" };
    (prisma.users.create as jest.Mock).mockResolvedValue(mockUser);

    await userController.createUser(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({
      message: "User added successfully",
      user: mockUser,
    });
  });

  it("should get a user by ID", async () => {
    const mockUser = { id: 1, name: "John Doe", email: "john@example.com" };
    req.params = { id: "1" };
    (prisma.users.findUnique as jest.Mock).mockResolvedValue(mockUser);

    await userController.getUserById(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith([mockUser]);
  });

  it("should update a user", async () => {
    req.params = { id: "1" };
    req.body = { email: "john.new@example.com" };
    (prisma.users.update as jest.Mock).mockResolvedValue({});

    await userController.updateUser(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({
      message: "User updated successfully",
    });
  });

  it("should delete a user", async () => {
    req.params = { id: "1" };
    (prisma.users.delete as jest.Mock).mockResolvedValue({});

    await userController.deleteUser(req as Request, res as Response, next);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith({
      message: "User deleted successfully",
    });
  });
});
