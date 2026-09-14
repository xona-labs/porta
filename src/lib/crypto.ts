/**
 * Wallet-secret encryption and token hashing, all WebCrypto.
 *
 * Agent wallet secrets are encrypted with AES-256-GCM under MASTER_KEY
 * (a 32-byte base64 Worker secret). Ciphertext format: base64(iv || ct).
 */

export async function importMasterKey(masterKeyB64: string): Promise<CryptoKey> {
  const raw = fromBase64(masterKeyB64);
  if (raw.length !== 32) throw new Error("MASTER_KEY must be 32 bytes, base64-encoded");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64(out);
}

export async function decryptBytes(key: CryptoKey, encB64: string): Promise<Uint8Array> {
  const buf = fromBase64(encB64);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
}

/** Random bearer token (hex) and its SHA-256 hash for storage. */
export async function generateToken(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toHex(bytes);
  return { token, hash: await sha256Hex(token) };
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
