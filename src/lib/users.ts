import { Keypair } from "@solana/web3.js";
import type { Env } from "../types";
import { decryptBytes, encryptBytes, generateToken, importMasterKey, sha256Hex } from "./crypto";

export interface User {
  id: string;
  created_at: string;
  label: string | null;
  wallet_pubkey: string;
  wallet_enc: string;
}

/**
 * Creates a user with a fresh, isolated agent wallet. The secret key is
 * encrypted under MASTER_KEY before it touches the database; the bearer
 * token is returned once and only its hash is stored.
 */
export async function createUser(
  env: Env,
  label?: string
): Promise<{ user_id: string; token: string; deposit_address: string }> {
  if (!env.MASTER_KEY) throw new Error("MASTER_KEY secret is not set");
  const masterKey = await importMasterKey(env.MASTER_KEY);

  const keypair = Keypair.generate();
  const walletEnc = await encryptBytes(masterKey, keypair.secretKey);
  const { token, hash } = await generateToken();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO users (id, created_at, label, wallet_pubkey, wallet_enc, token_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
    .bind(id, new Date().toISOString(), label ?? null, keypair.publicKey.toBase58(), walletEnc, hash)
    .run();

  return { user_id: id, token, deposit_address: keypair.publicKey.toBase58() };
}

export async function getUserByToken(env: Env, token: string): Promise<User | null> {
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT * FROM users WHERE token_hash = ?1")
    .bind(hash)
    .first<User & { token_hash: string }>();
  if (!row) return null;
  const { token_hash: _omit, ...user } = row;
  return user;
}

/** Users that have a portfolio configured and not paused. */
export async function listActiveUsers(db: D1Database): Promise<(User & { config_user: string })[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.created_at, u.label, u.wallet_pubkey, u.wallet_enc, c.user_id AS config_user
       FROM users u JOIN config c ON c.user_id = u.id
       WHERE c.paused = 0`
    )
    .all<User & { config_user: string }>();
  return results ?? [];
}

export async function decryptWalletSecret(env: Env, user: User): Promise<Uint8Array> {
  if (!env.MASTER_KEY) throw new Error("MASTER_KEY secret is not set");
  const masterKey = await importMasterKey(env.MASTER_KEY);
  return decryptBytes(masterKey, user.wallet_enc);
}
