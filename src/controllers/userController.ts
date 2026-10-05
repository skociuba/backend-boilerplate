import { Request, Response } from "express";
import prisma from "../db";
import { asyncHandler } from "../lib/asyncHandler";

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
  public getIndex = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const users = await prisma.users.findMany({ select: PUBLIC_USER_FIELDS });
    res.status(200).json(users);
  });

  public createUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, email, role } = req.body;
    // .create() zawsze zwraca utworzony wiersz — stary raw SQL robił
    // INSERT bez RETURNING, więc "user" w odpowiedzi zawsze było undefined.
    // role: undefined (nie wysłane) = Prisma stosuje @default(user) ze
    // schematu, nie trzeba tego osobno obsługiwać. P2002 (email zajęty)
    // leci do errorHandlera jako generyczny "Zasób o tych danych już istnieje".
    const user = await prisma.users.create({
      data: { name, email, role },
      select: PUBLIC_USER_FIELDS,
    });
    res.status(200).json({ message: "User added successfully", user });
  });

  public getUserById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    const user = await prisma.users.findUnique({
      where: { id },
      select: PUBLIC_USER_FIELDS,
    });
    // findUnique zwraca pojedynczy obiekt albo null — zawijamy w tablicę,
    // bo istniejący frontend (osobne repo) oczekuje tablicy z tego endpointu
    res.status(200).json(user ? [user] : []);
  });

  // P2025 ("Record to update does not exist") leci do errorHandlera i
  // wraca jako 404 — bez osobnego sprawdzania tutaj.
  public updateUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    const { email, name, role } = req.body;
    await prisma.users.update({ where: { id }, data: { email, name, role } });
    res.status(200).json({ message: "User updated successfully" });
  });

  public deleteUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    await prisma.users.delete({ where: { id } });
    res.status(200).json({ message: "User deleted successfully" });
  });

  // https://www.prisma.io/docs/orm/prisma-client/queries/transactions —
  // odpowiednik ręcznego BEGIN/Promise.all/COMMIT: $transaction albo się
  // uda w całości, albo nic się nie zapisze
  public createUserTransaction = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const users: { name: string; email: string }[] = req.body.users;
      await prisma.$transaction(
        users.map((user) =>
          prisma.users.create({
            data: { name: user.name, email: user.email },
          })
        )
      );
      res.status(200).json({ message: "Users added successfully" });
    }
  );
}

export default UserController;
