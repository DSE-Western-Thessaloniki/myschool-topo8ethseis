import type { XLSX_JSON } from "./types";

/** Επίπεδο καταγραφής ενός μηνύματος */
export type LogLevel = "info" | "warn" | "error";

/** Η κατάσταση της τρέχουσας εργασίας */
export type RunState = "idle" | "running" | "done" | "error" | "stopped";

/** Η κατάσταση μιας γραμμής του αρχείου xlsx */
export type RowStatus = "pending" | "processing" | "ok" | "error";

/** Πληροφορίες για μια γραμμή του αρχείου xlsx */
export type RowInfo = {
  index: number;
  record: XLSX_JSON;
  status: RowStatus;
  error?: string;
  /** Αρχειο με το στιγμιότυπο της οθόνης (π.χ. "img/123456.png" ή "error.png") */
  screenshot?: string;
};

/** Μήνυμα καταγραφής */
export type LogEvent = {
  type: "log";
  level: LogLevel;
  text: string;
  time: number;
};

/** Όλα τα μηνύματα που στέλνονται στους πελάτες του web socket */
export type ServerEvent =
  | LogEvent
  | { type: "state"; state: RunState; message?: string; time: number }
  /** Ξεκαθαρίζει τον πίνακα προόδου και τοποθετεί τις νέες γραμμές */
  | { type: "reset"; rows: RowInfo[]; time: number }
  | { type: "row"; row: RowInfo; time: number }
  | { type: "screenshot"; index: number; file: string; time: number }
  /** Καρέ από την ζωντανή προβολή της απομακρυσμένης σελίδας (base64 jpeg) */
  | { type: "frame"; data: string };

/** Αρχικοποίηση που στέλνεται στους πελάτες όταν συνδέονται */
export type Snapshot = {
  type: "snapshot";
  state: RunState;
  message?: string;
  rows: RowInfo[];
  logs: LogEvent[];
};

type Listener = (event: ServerEvent) => void;

const listeners = new Set<Listener>();

/** Μέγιστο πλήθος μηνυμάτων καταγραφής που κρατάμε στην μνήμη */
const MAX_LOGS = 500;

let state: RunState = "idle";
let message: string | undefined;
let rows: RowInfo[] = [];
const logs: LogEvent[] = [];

function publish(event: ServerEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      // Αγνόησε σφάλματα ενός πελάτη ώστε να μην επηρεάζουν τους υπόλοιπους
      console.error("Σφάλμα αποστολής μηνύματος στον πελάτη:", err);
    }
  }
}

/**
 * Εγγράφει έναν ακροατή για να λαμβάνει όλα τα μηνύματα της εργασίας.
 *
 * @param {Listener} listener - Η συνάρτηση που θα καλείται για κάθε μήνυμα.
 *
 * @returns {() => void} Συνάρτηση που αφαιρεί τον ακροατή.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Καταγράφει ένα μήνυμα και το δημοσιεύει στους πελάτες */
function log(level: LogLevel, ...args: unknown[]): void {
  const text = args
    .map((arg) => (typeof arg === "string" ? arg : safeInspect(arg)))
    .join(" ");
  const event: LogEvent = { type: "log", level, text, time: Date.now() };
  logs.push(event);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  publish(event);
}

function safeInspect(value: unknown): string {
  try {
    return typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);
  } catch {
    return String(value);
  }
}

/** Αλλάζει την κατάσταση της εργασίας */
function setState(next: RunState, nextMessage?: string): void {
  state = next;
  message = nextMessage;
  publish({ type: "state", state: next, message: nextMessage, time: Date.now() });
}

/**
 * Ξεκαθαρίζει τον πίνακα προόδου και βάζει τις γραμμές του νέου αρχείου.
 *
 * @param {XLSX_JSON[]} [records] - Τα δεδομένα του αρχείου xlsx. Αν δεν δοθεί
 *   ο πίνακας αδειάζει.
 */
function reset(records?: XLSX_JSON[]): void {
  rows = (records ?? []).map((record, index) => ({
    index,
    record,
    status: "pending" as RowStatus,
  }));
  message = undefined;
  publish({ type: "reset", rows, time: Date.now() });
}

/** Μια γραμμή άρχισε να επεξεργάζεται */
function rowStart(index: number): void {
  const row = rows[index];
  if (!row) return;
  row.status = "processing";
  publish({ type: "row", row: { ...row }, time: Date.now() });
}

/** Μια γραμμή ολοκληρώθηκε επιτυχώς */
function rowOk(index: number): void {
  const row = rows[index];
  if (!row) return;
  row.status = "ok";
  publish({ type: "row", row: { ...row }, time: Date.now() });
}

/** Μια γραμμή απέτυχε */
function rowError(index: number, error: string): void {
  const row = rows[index];
  if (!row) return;
  row.status = "error";
  row.error = error;
  publish({ type: "row", row: { ...row }, time: Date.now() });
}

/** Αποθηκεύτηκε στιγμιότυπο οθόνης για μια γραμμή */
function screenshot(index: number, file: string): void {
  const row = rows[index];
  if (row) {
    row.screenshot = file;
  }
  publish({ type: "screenshot", index, file, time: Date.now() });
}

/** Αποστολή καρέ από την ζωντανή προβολή */
function frame(data: string): void {
  publish({ type: "frame", data });
}

/** Τρέχουσα εικόνα της εργασίας (για πελάτες που συνδέονται στο μεσοδιάστημα) */
function snapshot(): Snapshot {
  return {
    type: "snapshot",
    state,
    message,
    rows: rows.map((row) => ({ ...row })),
    logs: logs.slice(),
  };
}

export const bus = {
  subscribe,
  log,
  setState,
  reset,
  rowStart,
  rowOk,
  rowError,
  screenshot,
  frame,
  snapshot,
  getState: (): RunState => state,
};
