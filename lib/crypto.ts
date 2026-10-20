import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

// AES-256-GCM. El refresh token de Google se guarda cifrado; la llave vive
// solo en la variable TOKEN_ENCRYPTION_KEY.

function key() {
  // Deriva siempre 32 bytes, acepte la llave en base64, hex o texto.
  return createHash("sha256").update(env.tokenEncryptionKey()).digest();
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decrypt(payload: string) {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1") throw new Error("Formato de token cifrado desconocido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
