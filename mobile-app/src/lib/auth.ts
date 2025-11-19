export interface AuthUser {
  id: number;
  nickname: string;
}

export function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = (hash * 31 + password.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function verifyPassword(password: string, hashed: string): boolean {
  return hashPassword(password) === hashed;
}
