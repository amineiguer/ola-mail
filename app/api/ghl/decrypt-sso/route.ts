import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ── AES decryption matching CryptoJS.AES.decrypt(data, passphrase) ───────────
// CryptoJS uses OpenSSL EVP_BytesToKey (MD5, 1 iteration) for key+IV derivation
// and stores the salt as: "Salted__" + 8-byte salt + ciphertext (base64-encoded)

function evpBytesToKey(
  password: Buffer,
  salt: Buffer,
  keyLen: number,
  ivLen: number
): { key: Buffer; iv: Buffer } {
  let derived = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (derived.length < keyLen + ivLen) {
    prev = crypto
      .createHash("md5")
      .update(Buffer.concat([prev, password, salt]))
      .digest();
    derived = Buffer.concat([derived, prev]);
  }
  return {
    key: derived.subarray(0, keyLen),
    iv: derived.subarray(keyLen, keyLen + ivLen),
  };
}

function decryptCryptoJS(encryptedBase64: string, passphrase: string): string {
  const raw = Buffer.from(encryptedBase64, "base64");

  // Validate OpenSSL "Salted__" magic header
  if (raw.subarray(0, 8).toString("ascii") !== "Salted__") {
    throw new Error("Format de données chiffré invalide (en-tête Salted__ manquant)");
  }

  const salt = raw.subarray(8, 16);
  const ciphertext = raw.subarray(16);

  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, "utf8"), salt, 32, 16);

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

// ── POST /api/ghl/decrypt-sso ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { encryptedData } = await req.json();

    if (!encryptedData || typeof encryptedData !== "string") {
      return NextResponse.json(
        { error: "encryptedData manquant ou invalide" },
        { status: 400 }
      );
    }

    const sharedSecret = process.env.GHL_APP_SHARED_SECRET;
    if (!sharedSecret) {
      return NextResponse.json(
        { error: "GHL_APP_SHARED_SECRET non configuré" },
        { status: 500 }
      );
    }

    const plaintext = decryptCryptoJS(encryptedData, sharedSecret);
    const userData = JSON.parse(plaintext) as {
      userId?: string;
      companyId?: string;
      role?: string;
      type?: string;
      activeLocation?: string;
      userName?: string;
      email?: string;
      isAgencyOwner?: boolean;
      appStatus?: string;
    };

    return NextResponse.json({
      user: {
        id: userData.userId,
        name: userData.userName,
        email: userData.email,
        role: userData.role,
        type: userData.type,
        companyId: userData.companyId,
        activeLocation: userData.activeLocation,
        isAgencyOwner: userData.isAgencyOwner,
        appStatus: userData.appStatus,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur de déchiffrement";
    console.error("[GHL SSO] Erreur déchiffrement:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
