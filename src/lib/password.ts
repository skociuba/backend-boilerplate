import bcrypt from "bcrypt";

// 12 = koszt haszowania (2^12 iteracji) — kompromis: wystarczająco wolne,
// żeby brute-force był niepraktyczny, wystarczająco szybkie (~150ms), żeby
// login nie zauważalnie zwalniał. bcrypt sam generuje i dokleja losową sól
// do wyniku — dlatego hashPassword("hunter2") daje za każdym razem INNY
// string, a mimo to comparePassword nadal działa (sól jest w hashu).
const SALT_ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, SALT_ROUNDS);

export const comparePassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
