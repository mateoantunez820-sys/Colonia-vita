// Recuperación de cuenta. El acceso normal es una clave guardada en el navegador;
// el código de recuperación permite volver a entrar desde otro dispositivo o tras
// borrar el navegador. Solo se guarda su hash.
import { randomBytes } from "node:crypto";
import { hash } from "./core.js";

// Alfabeto de Crockford: sin I, L, O ni U para que no se confundan al copiarlo.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_CHARS = 20; // 20 × 5 bits = 100 bits de azar

export function newRecoveryCode(bytes = randomBytes(CODE_CHARS)) {
  let s = "";
  for (let i = 0; i < CODE_CHARS; i++) s += ALPHABET[bytes[i] & 31];
  return s.match(/.{5}/g).join("-");
}
// Acepta minúsculas, espacios y guiones, y las letras que se confunden con números.
export function normalizeCode(input) {
  return String(input || "").toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}
export const validCode = input => new RegExp(`^[${ALPHABET}]{${CODE_CHARS}}$`).test(normalizeCode(input));
export const recoveryHash = input => hash("recuperacion:" + normalizeCode(input));
