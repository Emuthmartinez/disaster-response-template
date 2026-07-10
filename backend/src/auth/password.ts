/** Hashing de contraseñas con bcrypt (12 rounds). Wrapper fino para no esparcir
 *  el coste/lib por el código. */
import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
