import { Keypair } from "@solana/web3.js";
import type { Env } from "../types";
import { decryptBytes, encryptBytes, generateToken, importMasterKey, sha256Hex } from "./crypto";

export interface User {
  id: string;
  created_at: string;
  label: string | null;
  wallet_pubkey: string;
  wallet_enc: string;
  privy_user_id: string | null;
  email: string | null;
}

const USER_COLS = "id, created_at, label, wallet_pubkey, wallet_enc, privy_user_id, email";

/**
 * Creates a user with a fresh, isolated agent wallet. The secret key is
 * encrypted under MASTER_KEY before it touches the database.
 */
export async function createUser(
  env: Env,
  opts: { label?: string; privyUserId?: string; email?: string } = {}
): Promise<User> {
  if (!env.MASTER_KEY) throw new Error("MASTER_KEY secret is not set");
  const masterKey = await importMasterKey(env.MASTER_KEY);

  const keypair = Keypair.generate();
  const walletEnc = await encryptBytes(masterKey, keypair.secretKey);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  // Legacy column; sessions carry the real credentials now.
  const { hash } = await generateToken();

  await env.DB.prepare(
    `INSERT INTO users (id, created_at, label, wallet_pubkey, wallet_enc, token_hash, privy_user_id, email)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  )
    .bind(
      id,
      createdAt,
      opts.label ?? null,
      keypair.publicKey.toBase58(),
      walletEnc,
      hash,
      opts.privyUserId ?? null,
      opts.email ?? null
    )
    .run();

  return {
    id,
    created_at: createdAt,
    label: opts.label ?? null,
    wallet_pubkey: keypair.publicKey.toBase58(),
    wallet_enc: walletEnc,
    privy_user_id: opts.privyUserId ?? null,
    email: opts.email ?? null,
  };
}

/** Issues a fresh session for a user; returns the bearer token once. */
export async function createSession(env: Env, userId: string): Promise<string> {
  const { token, hash } = await generateToken();
  await env.DB.prepare(
    "INSERT INTO sessions (user_id, token_hash, created_at) VALUES (?1, ?2, ?3)"
  )
    .bind(userId, hash, new Date().toISOString())
    .run();
  return token;
}

export async function getUserByToken(env: Env, token: string): Promise<User | null> {
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT ${USER_COLS.split(", ").map((c) => `u.${c}`).join(", ")}
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1`
  )
    .bind(hash)
    .first<User>();
  return row ?? null;
}

export async function getUserById(env: Env, id: string): Promise<User | null> {
  const row = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?1`)
    .bind(id)
    .first<User>();
  return row ?? null;
}

export async function getUserByPrivyId(env: Env, privyUserId: string): Promise<User | null> {
  const row = await env.DB.prepare(`SELECT ${USER_COLS} FROM users WHERE privy_user_id = ?1`)
    .bind(privyUserId)
    .first<User>();
  return row ?? null;
}

/** Users that have a portfolio configured and not paused. */
export async function listActiveUsers(db: D1Database): Promise<User[]> {
  const { results } = await db
    .prepare(
      `SELECT ${USER_COLS.split(", ").map((c) => `u.${c}`).join(", ")}
       FROM users u JOIN config c ON c.user_id = u.id
       WHERE c.paused = 0`
    )
    .all<User>();
  return results ?? [];
}

export async function decryptWalletSecret(env: Env, user: User): Promise<Uint8Array> {
  if (!env.MASTER_KEY) throw new Error("MASTER_KEY secret is not set");
  const masterKey = await importMasterKey(env.MASTER_KEY);
  return decryptBytes(masterKey, user.wallet_enc);
}
