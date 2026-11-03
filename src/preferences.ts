import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.js";

/** Προτιμήσεις της εφαρμομοκής (όχι τα στοιχεία σύνδεσης) */
export type Preferences = {
  /**
   * Εμφάνιση του παραθύρου εργασίας κατά την αυτόματη εκτέλεση (debug).
   * Από προεπιλογή το παράθυρο είναι κρυφό, ώστε ο χρήστης να μην μπορεί
   * να ανακατέψει την εκτέλεση με ποντίκι/πληκτρολόγιο.
   */
  debugShowAutomation: boolean;
};

const FILE_NAME = "preferences.json";
const DEFAULTS: Preferences = { debugShowAutomation: false };

type Listener = (preferences: Preferences) => void;

/** Ενορχηστρωτές αλλαγών (χρησιμοποιείται από τον κύριο κώδικα του Electron
 *  ώστε η αλλαγή να εφαρμόζεται άμεσα σε ανοιχτό παράθυρο εργασίας) */
const listeners = new Set<Listener>();

/**
 * Η διαδρομή του αρχείου προτιμήσεων.
 *
 * @returns {string} Η απόλυτη διαδρομή του preferences.json.
 */
function file(): string {
  return path.join(dataDir(), FILE_NAME);
}

/**
 * Διαβάζει τις προτιμήσεις (με προεπιλογές αν το αρχείο λείπει ή είναι κακό).
 *
 * @returns {Preferences} Οι τρέχουσες προτιμήσεις.
 */
export function getPreferences(): Preferences {
  try {
    const raw = fs.readFileSync(file(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      debugShowAutomation:
        typeof parsed.debugShowAutomation === "boolean"
          ? parsed.debugShowAutomation
          : DEFAULTS.debugShowAutomation,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Ενημερώνει προτιμήσεις, γράφει το αρχείο και ενημερώνει τους ακροατές.
 *
 * @param {Partial<Preferences>} patch - Οι τιμές που αλλάζουν.
 *
 * @throws {Error} αν αποτύχει η εγγραφή του αρχείου.
 * @returns {Preferences} Οι νέες προτιμήσεις.
 */
export function setPreferences(patch: Partial<Preferences>): Preferences {
  const next: Preferences = { ...getPreferences(), ...patch };
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2), { mode: 0o600 });
  for (const listener of listeners) {
    listener(next);
  }
  return next;
}

/**
 * Εγγράφει έναν ακροατή αλλαγών προτιμήσεων.
 *
 * @param {Listener} listener - Η συνάρτηση που καλείται σε κάθε αλλαγή.
 *
 * @returns {() => void} Συνάρτηση αποεγγραφής.
 */
export function onPreferencesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
