import puppeteer from "puppeteer-core";
import type { Browser, Page } from "puppeteer-core";
import xlsx from "xlsx";
import { bus } from "./bus.js";
import { errorText } from "./errors.js";
import { attachScreencast } from "./screencast.js";
import type { ScreencastHandle } from "./screencast.js";
import { default as start } from "./start.js";
import type { XLSX_JSON } from "./types";

const necessary_headers = ["ΑΜ/ΑΦΜ", "ΣΧΟΛΕΙΟ", "ΤΟΠΟΘΕΤΗΣΗ", "ΑΠΟ", "ΕΩΣ"];

/**
 * Κάνει έλεγχο αν τα πεδία περιέχουν τις απαραίτητες στήλες για τις τοποθετήσεις
 *
 * @param {string[]} fields - Πίνακας με τις επικεφαλίδες που διαβάσαμε από το xlsx αρχείο.
 *
 * @returns {boolean} Επιστρέφει true αν έχει όλες τις απαραίτητες επικεφαλίδες αλλιώς false.
 */
function necessary_fields_exist(fields: string[]): boolean {
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

  const xlsx_json: XLSX_JSON[] = JSON.parse(
    JSON.stringify(
      xlsx.utils.sheet_to_json(workSheet, {
        defval: "",
        raw: false,
      })
    ).replace(/"\s+|\s+"/g, '"')
  );
  const headers = Object.keys(xlsx_json[0]);

  if (!necessary_fields_exist(headers)) {
    throw new Error(
      "Δεν βρέθηκαν οι απαραίτητες στήλες: " + necessary_headers.join(", ")
    );
  }

  return xlsx_json;
}

/** Τα στοιχεία μιας εκτελούμενης εργασίας */
type RunResult = { stopped: boolean } | undefined;

/**
 * Διαχειρίζεται τον κύκλο ζωής της εργασίας: σύνδεση με τον φυλλομετρητή,
 * εκτέλεση των τοποθετήσεων, καθαρισμός και αναφορά κατάστασης στο event bus.
 */
class Runner {
  private running = false;
  private stopped = false;
  private activePage: Page | null = null;
  private activeBrowser: Browser | null = null;
  private cast: ScreencastHandle | null = null;
  /** Τελευταία λήψη οθόνης για τους πελάτες που συνδέονται καθυστερημένα */
  private lastFrame = 0;

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Ξεκινά νέα εργασία. Αν μια εργασία εκτελείται ήδη κάνει τίποτα.
   *
   * @returns {Promise<void>} Ολοκληρώνεται όταν τερματίσει η εργασία.
   */
  async run(): Promise<void> {
    if (this.running) {
      console.warn("Η εργασία εκτελείται ήδη!");
      return;
    }
    this.running = true;
    this.stopped = false;
    this.lastFrame = 0;

    bus.setState("running");
    console.log("Εκκίνηση νέας εργασίας");

    let xlsxData: XLSX_JSON[];
    try {
      console.log("Ανάγνωση xlsx αρχείου");
      xlsxData = getXlsxData("file.xlsx");
      console.log("Data", xlsxData);
    } catch (err) {
      this.fail(err);
      this.running = false;
      return;
    }

    // Από εδώ και πέρα ο πίνακας προόδου γεμίζει με τις γραμμές του αρχείου
    bus.reset(xlsxData);

    try {
      console.log("Αρχικοποίηση σύνδεσης με τον φυλλομετρητή");
      const browser = await puppeteer.connect({
        browserWSEndpoint:
          process.env.BROWSER_WS_ENDPOINT || "ws://host.docker.internal:3000",
        ignoreHTTPSErrors: true,
      });
      this.activeBrowser = browser;
      const page = await browser.newPage();
      this.activePage = page;

      // Ζωντανή προβολή της σελίδας στην διεπαφή
      this.cast = await attachScreencast(page, (data) => bus.frame(data));

      if (
        process.env.SCRAPE_TEST_REMOTE_DEBUG &&
        process.env.SCRAPE_TEST_REMOTE_DEBUG === "true"
      ) {
        // https://github.com/puppeteer/puppeteer/issues/5730
        console.log(
          "Remote debugging enabled, disabling touch events before click."
        );

        page.click = (function (originalMethod, context) {
          return async function (...args) {
            const CDPSession = await context.target().createCDPSession();
            await CDPSession.send("Emulation.setEmitTouchEventsForMouse", {
              enabled: false,
            });
            await CDPSession.send("Emulation.setTouchEmulationEnabled", {
              enabled: false,
            });
            return originalMethod.apply(context, [...args]);
          };
        })(page.click, page);
      }

      const result: RunResult = await start({
        page,
        xlsxData,
        isStopped: () => this.stopped,
      });

      if (result?.stopped || this.stopped) {
        console.log("Η εργασία διακόπηκε από τον χρήστη");
        bus.setState("stopped", "Η εργασία διακόπηκε από τον χρήστη");
      } else {
        console.log("Η εργασία ολοκληρώθηκε!");
        bus.setState("done", "Η εργασία ολοκληρώθηκε!");
      }
    } catch (err) {
      if (this.stopped) {
        console.log("Η εργασία διακόπηκε από τον χρήστη");
        bus.setState("stopped", "Η εργασία διακόπηκε από τον χρήστη");
      } else {
        await this.takeErrorScreenshot();
        this.fail(err);
      }
    } finally {
      await this.cleanup();
      this.running = false;
    }
  }

  /**
   * Διακόπτει την τρέχουσα εργασία. Κλείνει την ενεργή σελίδα ώστε να
   * διακοπούν αμέσως και τα αναμοντικά βήματα (waitForSelector κ.λπ.).
   */
  stop(): void {
    if (!this.running) {
      return;
    }
    if (this.stopped) {
      return;
    }
    console.warn("Διακοπή της εργασίας από τον χρήστη...");
    this.stopped = true;
    const page = this.activePage;
    if (page) {
      page.close().catch(() => undefined);
    }
  }

  /**
   * Στέλνει ένα καρέ της τρέχουσας σελίδας στους πελάτες (χρήσιμο για
   * πελάτες που συνδέονται ενώ η σελίδα είναι ακίνητη και το screencast
   * δεν παράγει καρέ).
   */
  async requestFrame(): Promise<void> {
    const page = this.activePage;
    if (!page || Date.now() - this.lastFrame < 300) {
      return;
    }
    this.lastFrame = Date.now();
    try {
      const data = await page.screenshot({ type: "jpeg", quality: 50 });
      bus.frame(data.toString("base64"));
    } catch {
      // Η σελίδα έκλεισε εντωμεταξύ
    }
  }

  private fail(err: unknown): void {
    const message = errorText(err);
    console.error(err);
    bus.setState("error", message);
  }

  private async takeErrorScreenshot(): Promise<void> {
    const page = this.activePage;
    if (!page) return;
    try {
      await page.screenshot({ path: "error.png", fullPage: true });
      console.log("Αποθηκεύτηκε στιγμιότυπο σφάλματος στο error.png");
    } catch {
      console.warn("Δεν ήταν δυνατή η λήψη στιγμιότυπου σφάλματος");
    }
  }

  private async cleanup(): Promise<void> {
    if (this.cast) {
      await this.cast.detach();
      this.cast = null;
    }
    const browser = this.activeBrowser;
    this.activeBrowser = null;
    this.activePage = null;
    if (!browser) return;
    try {
      for (const page of await browser.pages()) {
        await page.close().catch(() => undefined);
      }
      await browser.close();
    } catch {
      // Η σύνδεση έχει ήδη κλείσει
    }
  }
}

export const runner = new Runner();
