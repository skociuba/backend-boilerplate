import { Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import * as userService from "../services/userService";

class UserController {
  public getIndex = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await userService.listUsers());
  });

  public createUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, email, role } = req.body;
    const user = await userService.createUser({ name, email, role });
    res.status(200).json({ message: "User added successfully", user });
  });

  public getUserById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = await userService.getUser(parseInt(req.params.id));
    // Zawinięte w tablicę, bo istniejący frontend (osobne repo) oczekuje
    // tablicy z tego endpointu — to kontrakt HTTP, nie logika, więc tutaj
    res.status(200).json(user ? [user] : []);
  });

  public updateUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, name, role } = req.body;
    await userService.updateUser(parseInt(req.params.id), { email, name, role });
    res.status(200).json({ message: "User updated successfully" });
  });

  public deleteUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await userService.deleteUser(parseInt(req.params.id));
    res.status(200).json({ message: "User deleted successfully" });
  });

  public createUserTransaction = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      await userService.createUsersAtomically(req.body.users);
      res.status(200).json({ message: "Users added successfully" });
    }
  );
}

export default UserController;
