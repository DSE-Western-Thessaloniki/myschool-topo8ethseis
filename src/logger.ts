import { format } from "node:util";
import { bus } from "./bus.js";

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";
type Original = (...args: unknown[]) => void;

/**
 * Αιχμαλωτίζει όλα τα μηνύματα της κονσόλας και τα δημοσιεύει στο
 * event bus ώστε να εμφανίζονται ζωντανά στην διεπαφή, κρατώντας παράλληλα
 * την συμπεριφορά του τερματικού (και του αρχείου down.log) αμετάβλητη.
 *
 * Πρέπει να καλείται ΜΕΤΑ το consoleStamp ώστε να αιχμαλωτίζονται τα
 * μηνύματα χωρίς την χρονοσφραγίδα (η οποία προστίθεται στο τερματικό).
 */
export function installLogger(): void {
  const methods: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];

  for (const method of methods) {
    const original: Original = console[method].bind(console);
    const level =
      method === "warn" ? "warn" : method === "error" ? "error" : "info";

    console[method] = (...args: unknown[]) => {
      try {
        bus.log(level, format(...args));
      } catch {
        // Δεν πρέπει ποτέ η καταγραφή να χαλάει την εκτέλεση
      }
      original(...args);
    };
  }
}
