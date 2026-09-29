// Azar fijo para las pruebas. core usa Math.random (genes y vida de las células, eventos), así que
// una prueba que depende de muchos ciclos puede fallar de vez en cuando. Con el azar fijado por una
// semilla, da siempre el mismo resultado.
import { rng } from "../src/ecomundo.js";

export function conAzar(semilla, fn) {
  const antes = Math.random;
  Math.random = rng(semilla);
  try { return fn(); } finally { Math.random = antes; }
}
