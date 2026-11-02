import xlsx from "xlsx";
import type { XLSX_JSON } from "./types";

/** Οι στήλες που είναι απαραίτητες για τις τοποθετήσεις */
export const necessary_headers = [
  "ΑΜ/ΑΦΜ",
  "ΣΧΟΛΕΙΟ",
  "ΤΟΠΟΘΕΤΗΣΗ",
  "ΑΠΟ",
  "ΕΩΣ",
];

/** Προαιρετική στήλη: αν λείπει χρησιμοποιούνται όλες οι ώρες του εκπαιδευτικού */
export const optional_headers = ["ΩΡΕΣ"];

/**
 * Οι μόνες στήλες που κρατάμε στην εγγραφή. Οποιαδήποτε άλλη στήλη του
 * αρχείου (πρόσθετες, κενές κ.λπ.) αγνοείται εντελώς.
 */
const kept_headers = [...necessary_headers, ...optional_headers];

/** Αποτέλεσμα ανάγνωσης ενός αρχείου xlsx */
export type ParsedXlsx = {
  /** Οι γραμμές του αρχείου, με μόνο τις γνωστές στήλες */
  rows: XLSX_JSON[];
  /** Οι επικεφαλίδες που βρέθηκαν στο αρχείο (περικομμένες) */
  headers: string[];
  /** Πλήθος γραμμών δεδομένων */
  rowCount: number;
};

/**
 * Διαβάζει και ελέγχει ένα αρχείο xlsx.
 *
 * Η πρώτη γραμμή του πρώτου φύλλου θεωρείται γραμμή επικεφαλίδας. Πρέπει
 * να περιέχει όλες τις απαιτούμενες στήλες· οι πλεονάζουσες στήλες αγνοούνται
 * και στην επιστρεφόμενη εγγραφή μπαίνουν μόνο τα γνωστά πεδία.
 *
 * @param {Buffer} data - Το περιεχόμενο του αρχείου xlsx.
 *
 * @throws {Error} Αν το αρχείο είναι κενό ή λείπουν απαιτούμενες στήλες.
 * @returns {ParsedXlsx} Οι γραμμές, οι επικεφαλίδες και το πλήθος τους.
 */
export function parseXlsx(data: Buffer): ParsedXlsx {
  const workBook = xlsx.read(data, {
    type: "buffer",
    cellDates: true,
    dateNF: "dd/mm/yyyy",
  });

  /* πάρε το πρώτο φύλλο */
  const workSheetName = workBook.SheetNames[0];
  const workSheet = workBook.Sheets[workSheetName];
  if (!workSheet) {
    throw new Error("Το αρχείο δεν περιέχει φύλλο δεδομένων");
  }

  // Διάβασε πρώτα τη γραμμή επικεφαλίδας, ώστε ο έλεγχος να γίνεται πάντα
  // από την πρώτη γραμμή και όχι από την πρώτη γραμμή δεδομένων.
  const matrix = xlsx.utils.sheet_to_json<unknown[]>(workSheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (!matrix.length) {
    throw new Error("Το αρχείο είναι κενό");
  }

  const headers = (matrix[0] ?? []).map((cell) => String(cell ?? "").trim());
  const missing = necessary_headers.filter(
    (header) => !headers.includes(header),
  );
  if (missing.length) {
    throw new Error(
      "Δεν βρέθηκαν οι απαραίτητες στήλες: " + missing.join(", "),
    );
  }

  const rows: XLSX_JSON[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];

    // Όλα τα γνωστά πεδία ξεκινούν κενά ώστε να υπάρχουν πάντα, ακόμη κι
    // αν η αντίστοιχη στήλη (π.χ. ΩΡΕΣ) λείπει από το αρχείο.
    const record: XLSX_JSON = {};
    for (const key of kept_headers) {
      record[key] = "";
    }

    for (const key of kept_headers) {
      const column = headers.indexOf(key);
      if (column === -1) continue;
      record[key] = String(cells[column] ?? "").trim();
    }

    // Παράλειψη γραμμών χωρίς κανένα απαιτούμενο πεδίο
    const hasValue = necessary_headers.some((key) => record[key] !== "");
    if (!hasValue) continue;

    rows.push(record);
  }

  if (!rows.length) {
    throw new Error("Το αρχείο δεν περιέχει γραμμές δεδομένων");
  }

  return { rows, headers, rowCount: rows.length };
}

/** Το αρχείο που έχει επιλεγεί από τη διεπαφή */
export type SelectedFile = {
  /** Όνομα όπως το είδε ο χρήστης */
  name: string;
  rows: XLSX_JSON[];
  rowCount: number;
};

let selected: SelectedFile | null = null;

/**
 * Αποθηκεύει το αρχείο που επέλεξε ο χρήστης.
 *
 * @param {SelectedFile | null} file - Το νέο αρχείο ή null για καθαρισμό.
 *
 * @returns {void}
 */
export function setSelectedFile(file: SelectedFile | null): void {
  selected = file;
}

/**
 * Επιστρέφει το τρέχον επιλεγμένο αρχείο.
 *
 * @returns {SelectedFile | null} Το αρχείο ή null αν δεν υπάρχει.
 */
export function getSelectedFile(): SelectedFile | null {
  return selected;
}
