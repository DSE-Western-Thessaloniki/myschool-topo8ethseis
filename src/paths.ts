import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Ρίζα του project (dist/src/paths.js → ../../) */
export const rootDir = path.resolve(here, "..", "..");

/**
 * Κατάλογος όπου αποθηκεύονται τα δεδομένα της εκτέλεσης: το αρχείο
 * ρυθμίσεων και τα στιγμιότυπα οθόνης.
 *
 * Στην εφαρμογή επιφάνειας εργασίας ορίζεται από τον κύριο κώδικα του
 * Electron σε έναν εγγράψιμο φάκελο δεδομένων εκτός του asar. Στο dev
 * container παραμένει η ρίζα του project όπως πάντα.
 *
 * @returns {string} Η απόλυτη διαδρομή του φακέλου δεδομένων.
 */
export function dataDir(): string {
  return process.env.MYSCH_DATA_DIR || rootDir;
}

/**
 * Φάκελος με τα στιγμιότυπα οθόνης.
 *
 * @returns {string} Η απόλυτη διαδρομή του φακέλου img.
 */
export function imgDir(): string {
  return path.join(dataDir(), "img");
}

/**
 * Αρχείο στιγμιότυπου σφάλματος.
 *
 * @returns {string} Η απόλυτη διαδρομή του αρχείου error.png.
 */
export function errorShotPath(): string {
  return path.join(dataDir(), "error.png");
}

/**
 * Δημιουργεί τους απαραίτητους φακέλους (img/) αν δεν υπάρχουν ήδη.
 *
 * @returns {void}
 */
export function ensureDataDirs(): void {
  fs.mkdirSync(imgDir(), { recursive: true });
}
