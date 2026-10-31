/**
 * Μετατρέπει ένα σφάλμα τύπου unknown σε ανθρώπινο αναγνώσιμο κείμενο.
 *
 * Χρησιμοποιείται για το μήνυμα στην κορυφή της διεπαφής, ώστε να μην
 * εμφανίζεται ποτέ το άχρηστο «Άγνωστο σφάλμα» όταν γνωρίζουμε την αιτία.
 *
 * @param {unknown} error - Οτιδήποτε ρίχνει μια αποτυχία (Error, κείμενο,
 *   ErrorEvent της βιβλιοθήκης ws, αντικείμενο με πεδίο error κ.λπ.).
 *
 * @returns {string} Το κείμενο του σφάλματος.
 */
export function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error?: unknown };
    if (typeof candidate.message === "string" && candidate.message) {
      return candidate.message;
    }
    // ws ErrorEvent: κρατάει το αρχικό σφάλμα μέσα στο πεδίο error
    if (candidate.error && candidate.error !== error) {
      return errorText(candidate.error);
    }
  }
  return "Άγνωστο σφάλμα";
}
