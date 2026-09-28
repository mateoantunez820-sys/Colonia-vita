import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { newRecoveryCode, normalizeCode, recoveryHash, validCode } from "../src/cuentas.js";
import { legalInfo, legalPage, VIT_NOTICE } from "../src/legal.js";

test("el código de recuperación tiene 20 caracteres claros en grupos de 5 y no se repite", () => {
  const codes = new Set();
  for (let i = 0; i < 2000; i++) {
    const c = newRecoveryCode();
    assert.match(c, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
    codes.add(c);
  }
  assert.equal(codes.size, 2000);
});

test("el código se acepta con minúsculas, espacios y letras que parecen números", () => {
  const c = newRecoveryCode(Buffer.from(Array.from({ length: 20 }, (_, i) => i * 13)));
  const sloppy = c.toLowerCase().replace(/-/g, " ").replace(/0/g, "o").replace(/1/g, "l");
  assert.equal(normalizeCode(sloppy), c.replace(/-/g, ""));
  assert.equal(recoveryHash(sloppy), recoveryHash(c));
  assert.notEqual(recoveryHash(c), recoveryHash(newRecoveryCode()));
  assert.ok(validCode(sloppy));
  assert.ok(!validCode("ABCDE-12345"), "un código corto no vale");
  assert.ok(!validCode(c.replace(/^./, "U")), "la U no está en el alfabeto");
});

test("términos y privacidad llevan el aviso de VIT y escapan los datos del titular", () => {
  const info = legalInfo({ LEGAL_TITULAR: "Ana <b>", LEGAL_CONTACTO: "ana@example.com" });
  assert.equal(info.completo, true);
  const t = legalPage("terminos", info);
  assert.ok(t.includes(VIT_NOTICE));
  assert.ok(t.includes("Ana &lt;b&gt;") && !t.includes("Ana <b>"));
  assert.ok(t.includes("ana@example.com"));
  assert.ok(legalPage("privacidad", info).includes("Qué datos se guardan"));
  assert.equal(legalPage("otra", info), null);
  const sinDatos = legalInfo({});
  assert.equal(sinDatos.completo, false);
  assert.ok(!legalPage("terminos", sinDatos).includes("Contacto:"), "sin contacto no se inventa uno");
});

test("la web muestra el mismo aviso de VIT que los términos", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.ok(html.includes(VIT_NOTICE));
  assert.ok(html.includes('href="/terminos"') && html.includes('href="/privacidad"'));
});
