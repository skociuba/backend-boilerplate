import { Request, Response } from "express";
import prisma from "../db";
import { Prisma } from "../generated/prisma/client";

// Prisma nie rzuca "SQL error" na chybił trafił — dla znanych sytuacji
// (naruszenie ograniczenia, brak rekordu...) rzuca PrismaClientKnownRequestError
// z konkretnym kodem. P2025 = "Record to update/delete does not exist" —
// czego stary, ręczny SQL (UPDATE/DELETE bez sprawdzenia rowCount) w ogóle
// nie wykrywał: zwracał 200 "updated successfully" nawet dla nieistniejącego id.
const isNotFoundError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2025";

// Bez password_hash — ten endpoint (moduł admina) nie ma powodu go znać,
// a wysyłanie go na front (nawet zahashowanego) to niepotrzebnie
// rozszerzona powierzchnia ataku, gdyby kiedyś coś po drodze go zalogowało.
const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

class UserController {
  public async getIndex(req: Request, res: Response): Promise<void> {
    try {
      const users = await prisma.users.findMany({ select: PUBLIC_USER_FIELDS });
      res.status(200).json(users);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  public async createUser(req: Request, res: Response): Promise<void> {
    try {
      const { name, email } = req.body;
      // .create() zawsze zwraca utworzony wiersz — stary raw SQL robił
      // INSERT bez RETURNING, więc "user" w odpowiedzi zawsze było undefined
      const user = await prisma.users.create({
        data: { name, email },
        select: PUBLIC_USER_FIELDS,
      });
      res.status(200).json({ message: "User added successfully", user });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  public async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const user = await prisma.users.findUnique({
        where: { id },
        select: PUBLIC_USER_FIELDS,
      });
      // findUnique zwraca pojedynczy obiekt albo null — zawijamy w tablicę,
      // bo istniejący frontend (osobne repo) oczekuje tablicy z tego endpointu
      res.status(200).json(user ? [user] : []);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  public async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { email, name } = req.body;
      await prisma.users.update({ where: { id }, data: { email, name } });
      res.status(200).json({ message: "User updated successfully" });
    } catch (error) {
      if (isNotFoundError(error)) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  public async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      await prisma.users.delete({ where: { id } });
      res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
      if (isNotFoundError(error)) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // https://www.prisma.io/docs/orm/prisma-client/queries/transactions —
  // odpowiednik ręcznego BEGIN/Promise.all/COMMIT: $transaction albo się
  // uda w całości, albo nic się nie zapisze
  public async createUserTransaction(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const users: { name: string; email: string }[] = req.body.users;
      await prisma.$transaction(
        users.map((user) =>
          prisma.users.create({
            data: { name: user.name, email: user.email },
          })
        )
      );
      res.status(200).json({ message: "Users added successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export default UserController;
