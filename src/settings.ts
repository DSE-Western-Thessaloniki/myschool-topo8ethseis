import fs from "node:fs";
import path from "node:path";
import type { SafeStorage } from "electron";
import { dataDir } from "./paths.js";

/** Στοιχεία σύνδεσης στο σύστημα myschool */
export type Credentials = { username: string; password: string };

/** Πού βρίσκονται τα τρέχοντα στοιχεία σύνδεσης */
export type CredentialsSource = "settings" | "env" | "none";

/** Πώς έχουν αποθηκευτεί στο αρχείο ρυθμίσεων */
export type CredentialsEncryption = "os-keychain" | "plain";

/** Περιγραφή της τρέχουσας κατάστασης των στοιχείων σύνδεσης */
export type CredentialsInfo = {
  username: string;
  hasPassword: boolean;
  source: CredentialsSource;
  encryption: CredentialsEncryption;
  /** Η διαδρομή του αρχείου ρυθμίσεων (για ενημέρωση του χρήστη) */
  path: string;
};

/** Μορφή του αρχείου credentials.json */
type StoredCredentials = {
  v: 1;
  /** Κρυπτογραφημένο (base64) JSON {username, password} */
  enc?: string;
  /** Απλό JSON — χρησιμοποιείται όταν δεν υπάρχει κλειδοθήκης συστήματος */
  plain?: Credentials;
};

const FILE_NAME = "credentials.json";

/**
 * Η πλήρης διαδρομή του αρχείου ρυθμίσεων.
 *
 * @returns {string} Η απόλυτη διαδρομή του credentials.json.
 */
function file(): string {
  return path.join(dataDir(), FILE_NAME);
}

/**
 * Αν εκτελείται μέσα στο Electron (δηλ. ως εφαρμογή επιφάνειας εργασίας).
 *
 * @returns {boolean} true μόνο μέσα στο Electron.
 */
function inElectron(): boolean {
  return typeof process.versions.electron === "string";
}

/**
 * Επιστρέφει το safeStorage του Electron ή null όταν τρέχουμε σε καθαρό
 * Node (dev container) ή όταν η βιβλιοθήκη δεν είναι διαθέσιμη.
 *
 * @returns {Promise<SafeStorage | null>} Το safeStorage ή null.
 */
async function getSafeStorage(): Promise<SafeStorage | null> {
  if (!inElectron()) {
    return null;
  }
  try {
    const electron = await import("electron");
    return electron.safeStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Διαβάζει το αρχείο ρυθμίσεων αν υπάρχει.
 *
 * @returns {StoredCredentials | null} Το περιεχόμενο ή null αν δεν υπάρχει.
 */
function readStored(): StoredCredentials | null {
  try {
    const raw = fs.readFileSync(file(), "utf8");
    const parsed = JSON.parse(raw) as StoredCredentials;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Αποκρυπτογραφεί το αρχείο ρυθμίσεων.
 *
 * @param {StoredCredentials} stored - Το αποθηκευμένο αντικείμενο.
 *
 * @returns {Promise<Credentials | null>} Τα στοιχεία ή null αν αποτύχει.
 */
async function decode(stored: StoredCredentials): Promise<Credentials | null> {
  if (stored.enc) {
    const safeStorage = await getSafeStorage();
    if (!safeStorage) {
      return null;
    }
    try {
      const buffer = Buffer.from(stored.enc, "base64");
      // Στο Electron ≥ 45 τα σύγχρονα methods είναι τα async· τα παλιά
      // (σύγχρονα) παραμένουν διαθέσιμα ως εφεδρική επιλογή.
      const decrypted =
        typeof safeStorage.decryptStringAsync === "function"
          ? (await safeStorage.decryptStringAsync(buffer)).result
          : safeStorage.decryptString(buffer);
      const creds = JSON.parse(decrypted) as Credentials;
      return creds && typeof creds === "object" ? creds : null;
    } catch {
      return null;
    }
  }
  if (stored.plain && typeof stored.plain === "object") {
    return stored.plain;
  }
  return null;
}

/**
 * Επιστρέφει τα στοιχεία σύνδεσης.
 *
 * Η σειρά προτεραιότητας είναι: αρχείο ρυθμίσεων (π.χ. από το παράθυρο
 * «Ρυθμίσεις») και, αν δεν υπάρχει, οι μεταβλητές περιβάλλοντος του .env.
 *
 * @returns {Promise<Credentials>} Το όνομα χρήστη και ο κωδικός.
 */
export async function getCredentials(): Promise<Credentials> {
  const stored = readStored();
  if (stored) {
    const decoded = await decode(stored);
    if (decoded && (decoded.username || decoded.password)) {
      return {
        username: decoded.username ?? "",
        password: decoded.password ?? "",
      };
    }
  }
  return {
    username: process.env.MYSCH_USERNAME ?? "",
    password: process.env.MYSCH_PASSWORD ?? "",
  };
}

/**
 * Περιγραφή της τρέχουσας κατάστασης των στοιχείων σύνδεσης για τη διεπαφή.
 *
 * Ο κωδικός δεν επιστρέφει ποτέ — μόνο αν υπάρχει.
 *
 * @returns {Promise<CredentialsInfo>} Η περιγραφή των στοιχείων.
 */
export async function describeCredentials(): Promise<CredentialsInfo> {
  const stored = readStored();
  const decoded = stored ? await decode(stored) : null;
  const fromSettings = !!decoded && (!!decoded.username || !!decoded.password);
  const envUser = process.env.MYSCH_USERNAME ?? "";
  const envPass = process.env.MYSCH_PASSWORD ?? "";

  return {
    username: fromSettings ? (decoded!.username ?? "") : envUser,
    hasPassword: fromSettings ? !!decoded!.password : !!envPass,
    source: fromSettings ? "settings" : envUser || envPass ? "env" : "none",
    encryption: stored?.enc ? "os-keychain" : "plain",
    path: file(),
  };
}

/**
 * Αποθηκεύει τα στοιχεία σύνδεσης.
 *
 * Μέσα στο Electron κρυπτογραφούνται μέσω του κλειδοθήκης του συστήματος
 * (safeStorage). Αν η κρυπτογράφηση δεν είναι διαθέσιμη (π.χ. Linux χωρίς
 * keyring) ή αν τρέχουμε σε καθαρό Node, αποθηκεύονται ως απλό κείμενο —
 * ίδιο επίπεδο ασφάλειας με το αρχείο .env.
 *
 * @param {Credentials} credentials - Τα νέα στοιχεία σύνδεσης.
 *
 * @returns {Promise<{encryption: CredentialsEncryption}>} Πώς αποθηκεύτηκαν.
 */
export async function saveCredentials(
  credentials: Credentials,
): Promise<{ encryption: CredentialsEncryption }> {
  const safeStorage = await getSafeStorage();
  // Στο Electron ≥ 45 το isAsyncEncryptionAvailable αντικαθιστά το
  // παλιό isEncryptionAvailable (το οποίο παραμένει ως εφεδρική επιλογή).
  const useKeychain =
    !!safeStorage &&
    (typeof safeStorage.isAsyncEncryptionAvailable === "function"
      ? await safeStorage.isAsyncEncryptionAvailable()
      : safeStorage.isEncryptionAvailable());

  let stored: StoredCredentials;
  if (useKeychain && safeStorage) {
    const plain = JSON.stringify(credentials);
    // Τα async methods είναι τα προτεινόμενα στο Electron ≥ 45
    const encrypted =
      typeof safeStorage.encryptStringAsync === "function"
        ? await safeStorage.encryptStringAsync(plain)
        : safeStorage.encryptString(plain);
    stored = { v: 1, enc: encrypted.toString("base64") };
  } else {
    stored = { v: 1, plain: credentials };
  }

  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(stored, null, 2), { mode: 0o600 });

  return { encryption: useKeychain ? "os-keychain" : "plain" };
}
