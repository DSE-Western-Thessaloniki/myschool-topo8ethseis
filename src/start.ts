import type { Page } from "puppeteer-core";
import type { XLSX_JSON } from "./types";

async function addTeacher(page: Page, teacher: XLSX_JSON) {
  console.log(page, teacher);

  let record = {
    "ΑΜ/ΑΦΜ":
      typeof teacher["ΑΜ/ΑΦΜ"] === "string"
        ? teacher["ΑΜ/ΑΦΜ"]
        : teacher["ΑΜ/ΑΦΜ"].toString(),
    ΣΧΟΛΕΙΟ:
      typeof teacher["ΣΧΟΛΕΙΟ"] === "string"
        ? teacher["ΣΧΟΛΕΙΟ"]
        : teacher["ΣΧΟΛΕΙΟ"].toString(),
    ΤΟΠΟΘΕΤΗΣΗ:
      typeof teacher["ΤΟΠΟΘΕΤΗΣΗ"] === "string"
        ? teacher["ΤΟΠΟΘΕΤΗΣΗ"]
        : teacher["ΤΟΠΟΘΕΤΗΣΗ"].toString(),
    ΑΠΟ:
      typeof teacher["ΑΠΟ"] === "string"
        ? teacher["ΑΠΟ"]
        : teacher["ΑΠΟ"].toString(),
    ΕΩΣ:
      typeof teacher["ΕΩΣ"] === "string"
        ? teacher["ΕΩΣ"]
        : teacher["ΕΩΣ"].toString(),
    ΩΡΕΣ:
      typeof teacher["ΩΡΕΣ"] === "string"
        ? teacher["ΩΡΕΣ"]
        : teacher["ΩΡΕΣ"].toString(),
  };

  // Κάνε έλεγχο για κενές τιμές
  if (
    record["ΑΜ/ΑΦΜ"] === "" ||
    record["ΑΠΟ"] === "" ||
    record["ΕΩΣ"] === "" ||
    record["ΣΧΟΛΕΙΟ"] === "" ||
    record["ΤΟΠΟΘΕΤΗΣΗ"] === ""
  ) {
    console.warn("Αγνόηση γραμμής με κενές τιμές: " + teacher);
    return Promise.resolve();
  }

  return await page
    .waitForSelector("#ctl00_ContentData_cmbWorker_I")
    .then(async () => {
      // Συμπλήρωσε το ΑΜ/ΑΦΜ και περίμενε για το αποτέλεσμα της αναζήτησης
      console.log("Πληκτρολόγησε το ΑΜ/ΑΦΜ του εκπαιδευτικού");
      return await page.type(
        "#ctl00_ContentData_cmbWorker_I",
        record["ΑΜ/ΑΦΜ"]
      );
    })
    .then(async () => {
      console.log("Περίμενε να ανακτηθούν οι πληροφορίες του εκπαιδευτικού");
      return await page.waitForNetworkIdle({ idleTime: 3000 });
    })
    .then(async () => {
      console.log("Δες αν βρέθηκε ο/η εκπαιδευτικός");
      await page.screenshot({ path: "teacher.png" });
      return await page.waitForSelector(
        "#ctl00_ContentData_cmbWorker_DDD_gv_DXDataRow0",
        { visible: true }
      );
    })
    .then(async () => {
      // Έλεγξε αν έχει class dxgvFocusedRow
      await page.screenshot({ path: "search.png" });
      return await page
        .$("#ctl00_ContentData_cmbWorker_DDD_gv_DXDataRow0")
        .then(async (element) => {
          if (element) {
            const classNames = (
              await (await element.getProperty("className")).jsonValue()
            ).split(/\s+/);
            if (classNames.includes("dxgvFocusedRow")) {
              return Promise.resolve();
            }
          }

          return Promise.reject(
            new Error("Πρόβλημα κατά την αναζήτηση του εκπαιδευτικού!")
          );
        });
    })
    .then(async () => {
      // Κάνε κλικ στον εκπαιδευτικό
      console.log("Κάνε κλικ στον εκπαιδευτικό");
      return await page
        .$("#ctl00_ContentData_cmbWorker_I")
        .then(async (element) => {
          if (element) {
            return await element.click();
          }

          return Promise.reject(
            new Error("Δεν μπορώ να κάνω κλικ στον εκπαιδευτικό!")
          );
        });
    })
    .then(() => {
      console.log("Πληκτρολόγησε τον κωδικό του σχολείου");
      return page.type("#ctl00_ContentData_cmbUnit_I", record["ΣΧΟΛΕΙΟ"]);
    })
    .then(async () => {
      console.log("Περίμενε για ανάκτηση δεδομένων");
      return await page.waitForNetworkIdle({ idleTime: 1000 });
    })
    .then(() => {
      console.log("Δες αν βρέθηκε το σχολείο");
      return page.waitForSelector("#ctl00_ContentData_cmbUnit_DDD_L_LBI0T0");
    })
    .then(async () => {
      // Έλεγξε αν έχει class dxeListBoxItemSelected
      return await page
        .$("#ctl00_ContentData_cmbUnit_DDD_L_LBI0T0")
        .then(async (element) => {
          if (element) {
            const classNames = (
              await (await element.getProperty("className")).jsonValue()
            ).split(/\s+/);
            console.log("Class:", classNames);
            if (classNames.includes("dxeListBoxItemSelected")) {
              return Promise.resolve();
            }
          }

          return Promise.reject(
            new Error("Πρόβλημα κατά την αναζήτηση του σχολείου!")
          );
        });
    })
    .then(async () => {
      // Κάνε κλικ στο σχολείο
      console.log("Κάνε κλικ στο σχολείο");
      return await page
        .$("#ctl00_ContentData_cmbUnit_DDD_L_LBI0T0")
        .then(async (element) => {
          if (element) {
            return await element.click();
          }

          return Promise.reject(
            new Error("Δεν μπορώ να κάνω κλικ στο σχολείο!")
          );
        });
    })
    .then(async () => {
      console.log("Περίμενε για ανάκτηση δεδομένων τύπων τοποθέτησης");
      return await page.waitForNetworkIdle({ idleTime: 3000 });
    })
    .then(async () => {
      console.log("Διάβασε τους τύπους τοποθέτησης και επέλεξε τον κατάλληλο");
      const elements = await page.$$(
        "#ctl00_ContentData_cbpEmploymentType_lbEmploymentType_LBT td"
      );
      console.log(elements.length);
      let categories: Array<{ id: string; name: string }> = [];
      for (const element of elements) {
        categories.push({
          id: (await page.evaluate((el) => el.id, element)) ?? "null",
          name:
            (await page.evaluate((el) => el.textContent, element)) ?? "null",
        });
      }

      // Κάνε έλεγχο αν ο τύπος τοποθέτησης είναι έγκυρος
      if (!categories.map((c) => c.name).includes(record["ΤΟΠΟΘΕΤΗΣΗ"])) {
        Promise.reject(
          new Error(
            "Εσφαλμένος τύπος τοποθέτησης για " +
              record["ΑΜ/ΑΦΜ"] +
              ' τοποθέτηση: "' +
              record["ΤΟΠΟΘΕΤΗΣΗ"] +
              '"'
          )
        );
      }

      for (const category of categories) {
        if (category.name === record["ΤΟΠΟΘΕΤΗΣΗ"]) {
          return await page.click("#" + category.id);
        }
      }
    })
    .then(async () => {
      // Συμπλήρωσε την έναρξη τοποθέτησης
      const input = await page.$("#ctl00_ContentData_dateFrom_I");
      if (input) {
        await input.click({ clickCount: 3 });
        await input.type(record["ΑΠΟ"]);
        // Πατάμε enter για να αλλάξουν οι ημέρες της εβδομάδας σε "Άγνωστο"
        return await page.keyboard.press("Enter");
      } else {
        Promise.reject(
          new Error(
            "Δεν βρέθηκε το πεδίο την ημερομηνία έναρξης ισχύος τοποθέτησης!"
          )
        );
      }
    })
    .then(async () => {
      // Συμπλήρωσε την λήξη τοποθέτησης
      const input = await page.$("#ctl00_ContentData_dateTo_I");
      if (input) {
        await input.click({ clickCount: 3 });
        return await input.type(record["ΕΩΣ"]);
      } else {
        Promise.reject(
          new Error(
            "Δεν βρέθηκε το πεδίο την ημερομηνία λήξης ισχύος τοποθέτησης!"
          )
        );
      }
    })
    .then(async () => {
      console.log("Συμπλήρωσε τις απαιτούμενες ώρες");
      // ctl00_ContentData_lbEditHours_RB0 >
    })
    .then(async () => {
      await page.screenshot({ path: "complete.png" });
      console.log("Αποθήκευσε την τοποθέτηση");
      await Promise.all([
        page.click("#ctl00_ContentData_savePlacement"),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);
      return await page.screenshot({ path: "complete2.png" });
    })
    .then(async () => {
      console.log("Καθάρισε τα στοιχεία τοποθέτησης");
      await Promise.all([
        page.click("#ctl00_ContentData_btnClear"),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);
      return await page.screenshot({ path: "clear.png" });
    });
}

export default async function start({
  page,
  xlsxData,
}: {
  page: Page;
  xlsxData: XLSX_JSON[];
}): Promise<void> {
  // ---------------
  // Κάνε login στο σύστημα
  console.log("Εμφάνισε αρχική σελίδα");
  await page.goto("https://app.myschool.sch.gr", { waitUntil: "networkidle0" });

  if (
    typeof process.env.MYSCH_USERNAME === "undefined" ||
    typeof process.env.MYSCH_PASSWORD === "undefined"
  ) {
    console.log("MYSCH_USERNAME και MYSCH_PASSWORD είναι κενά!");
    return;
  }
  await page.type("#username", process.env.MYSCH_USERNAME);
  await page.type("#password", process.env.MYSCH_PASSWORD);
  console.log("Κάνε login");
  await Promise.all([page.click("#loginButton"), page.waitForNavigation()]);
  // ---------------

  // ---------------
  // Πήγαινε στις τοποθετήσεις εκπαιδευτικών
  console.log("Πήγαινε στις τοποθετήσεις εκπαιδευτικών");
  await Promise.all([
    page.goto("https://app.myschool.sch.gr/Management.list.Act.Placement.aspx"),
    page.waitForNavigation(),
  ]);
  await page
    .waitForSelector("#ctl00_ContentData_gridActsTemp_header0_new")
    .then(async (response) => {
      console.log("Πάτησε για προσθήκη απόφασης τοποθέτησης");
      return await Promise.all([
        page.click("#ctl00_ContentData_gridActsTemp_header0_new"),
        page.waitForNavigation({ waitUntil: "networkidle0" }),
      ]);
    })
    .then(async (response) => {
      // Πρέπει για κάθε γραμμή του πίνακα να προσθέσουμε εκπαιδευτικό
      await page.screenshot({ path: "topo8.png" });
      let errorFound = false;
      let errorMsg = "";
      for (const teacher of xlsxData) {
        console.log("Νέα γραμμή");
        await addTeacher(page, teacher).catch((error) => {
          console.log(error);
          errorFound = true;
          errorMsg = error.message;
        });

        // Στην περίπτωση σφάλματος πρέπει να σταματήσουμε την καταχώρηση
        if (errorFound) {
          console.log("Error!");
          break;
        }
        // });
      }
      if (errorFound) {
        return Promise.reject();
      }

      return Promise.resolve();
    })
    .finally(() => {
      console.log("Τέλος");
    });
  // ---------------
}
