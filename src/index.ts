import dotenv from "dotenv";
import consoleStamp from "console-stamp";
import puppeteer from "puppeteer-core";
import xlsx from "xlsx";
import { default as start } from "./start.js";
import type { XLSX_JSON } from "./types";

const necessary_headers = ["ΑΜ/ΑΦΜ", "ΣΧΟΛΕΙΟ", "ΤΟΠΟΘΕΤΗΣΗ", "ΑΠΟ", "ΕΩΣ"];

// Διάβασε τις ρυθμίσεις από το .env αρχείο
dotenv.config();

// Πρόσθεσε χρονοσφραγίδα στα μηνύματα του αρχείου καταγραφής
consoleStamp(console);

/**
 * Κάνει έλεγχο αν τα πεδία περιέχουν τις απαραίτητες στήλες για τις τοποθετήσεις
 *
 * @param {string[]} fields - Πίνακας με τις επικεφαλίδες που διαβάσαμε από το xlsx αρχείο.
 *
 * @returns {boolean} Επιστρέφει true αν έχει όλες τις απαραίτητες επικεφαλίδες αλλιώς false.
 */
function necessary_fields_exist(fields: string[]) {
  const found_cols = necessary_headers.slice();

  fields.forEach((field) => {
    if (found_cols.includes(field)) {
      found_cols.splice(found_cols.indexOf(field), 1);
    }
  });

  if (found_cols.length) {
    return false;
  }
  return true;
}

/**
 * Διαβάζει τα δεδομένα από το αρχείο xlsx
 *
 * @param {string} fileName - Το όνομα του αρχείου xlsx.
 *
 * @throws {Error} αν δεν υπάρχουν οι απαιτούμενες στήλες στο αρχείο.
 * @returns {XLSX_JSON[]} Επιστρέφει πίνακα με τα δεδομένα του αρχείου.
 */
function getXlsxData(fileName: string): XLSX_JSON[] {
  const workBook = xlsx.readFile(fileName, {
    type: "binary",
    cellDates: true,
    dateNF: "dd/mm/yyyy",
  });

  /* πάρε το πρώτο φύλλο */
  const workSheetName = workBook.SheetNames[0];
  const workSheet = workBook.Sheets[workSheetName];

  let xlsx_json: XLSX_JSON[] = JSON.parse(
    JSON.stringify(
      xlsx.utils.sheet_to_json(workSheet, {
        defval: "",
        raw: false,
      })
    ).replace(/"\s+|\s+"/g, '"')
  );
  let headers = Object.keys(xlsx_json[0]);

  if (!necessary_fields_exist(headers)) {
    throw new Error(
      "Δεν βρέθηκαν οι απαραίτητες στήλες: " + necessary_headers.join(", ")
    );
  }

  console.log(xlsx_json);

  return xlsx_json;
}

(async () => {
  console.log("Εκκίνηση νέας εργασίας");
  console.log("Ανάγνωση xlsx αρχείου");
  let xlsxData: XLSX_JSON[];

  try {
    xlsxData = getXlsxData("test.xlsx");
  } catch (err) {
    return Promise.reject(err);
  }

  console.log("Data", xlsxData);

  console.log("Αρχικοποίηση σύνδεσης με τον φυλλομετρητή");
  const browser = await puppeteer.connect({
    browserWSEndpoint: "ws://172.17.0.4:3000",
    ignoreHTTPSErrors: true,
  });
  const page = await browser.newPage();

  await start({ page, xlsxData });

  for (let page of await browser.pages()) {
    await page.close();
  }

  const response = await browser.close();
  return response;
})()
  .then(() => console.log("Η εργασία ολοκληρώθηκε!"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
