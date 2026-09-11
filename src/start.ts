import type { Page } from "puppeteer-core";
import type { XLSX_JSON } from "./types";

async function addTeacher(page: Page, teacher: XLSX_JSON) {
  console.log(teacher);

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

  await page.$("#ctl00_ContentData_info > span").then(async (element) => {
    if (element !== null) {
      const msg = await page.evaluate((el) => el.innerHTML, element);
      console.log("Μήνυμα μετά την αποθήκευση: '" + msg + "'");
      if (msg !== "Η αποθήκευση ολοκληρώθηκε") {
        console.error(msg);
      }
    }
  });

  // Κάνε έλεγχο για κενές τιμές
  if (
    record["ΑΜ/ΑΦΜ"] === "" ||
    record["ΑΠΟ"] === "" ||
    record["ΕΩΣ"] === "" ||
    record["ΣΧΟΛΕΙΟ"] === "" ||
    record["ΤΟΠΟΘΕΤΗΣΗ"] === ""
  ) {
    console.warn("Αγνόηση γραμμής με κενές τιμές: " + teacher);
    return await Promise.resolve();
  }

  return await page
    .waitForSelector("#ctl00_ContentData_cmbWorker_I", {
      timeout: 100000,
    })
    .then(async () => {
      // Συμπλήρωσε το ΑΜ/ΑΦΜ και περίμενε για το αποτέλεσμα της αναζήτησης
      console.log("Πληκτρολόγησε το ΑΜ/ΑΦΜ του εκπαιδευτικού");
      return await page.type(
        "#ctl00_ContentData_cmbWorker_I",
        record["ΑΜ/ΑΦΜ"]
      );
    })
    .then(async () => {
      console.log("Δες αν βρέθηκε ο/η εκπαιδευτικός");
      return await page.waitForSelector(
        "#ctl00_ContentData_cmbWorker_DDD_gv_DXDataRow0",
        { visible: true }
      );
    })
    // .then(async () => {
    //   // Έλεγξε αν έχει class dxgvFocusedRow
    //   return await page
    //     .$("#ctl00_ContentData_cmbWorker_DDD_gv_DXDataRow0")
    //     .then(async (element) => {
    //       if (element) {
    //         const classNames = (
    //           (await (
    //             await element.getProperty("className")
    //           ).jsonValue()) as string
    //         ).split(/\s+/);
    //         if (classNames.includes("dxgvFocusedRow")) {
    //           return await Promise.resolve();
    //         }
    //       }

    //       return await Promise.reject(
    //         new Error("Πρόβλημα κατά την αναζήτηση του εκπαιδευτικού!")
    //       );
    //     });
    // })
    .then(async () => {
      console.log("Περίμενε να ανακτηθούν οι πληροφορίες του εκπαιδευτικού");
      await new Promise((r) => setTimeout(r, 3000));

      // Δες αν υπάρχουν γραμμές πέρα από την πρώτη που ταιριάζουν στο κείμενο
      // που εισάγαμε. Μετράει τις γραμμές πέρα από την πρώτη
      const rows = (
        await page.$$(
          "#ctl00_ContentData_cmbWorker_DDD_gv_DXMainTable tr.dxgvDataRow"
        )
      ).length;
      console.log(`Βρέθηκαν ${rows} επιπλέον γραμμές πλην της κύριας`);

      let am = await page.$eval(
        "#ctl00_ContentData_cmbWorker_DDD_gv_DXDataRow0 td:nth-child(1)",
        (el) => el.textContent
      );
      let afm = await page.$eval(
        "#ctl00_ContentData_cmbWorker_DDD_gv_DXDataRow0 td:nth-child(2)",
        (el) => el.textContent
      );
      if (am != record["ΑΜ/ΑΦΜ"] && afm != record["ΑΜ/ΑΦΜ"]) {
        console.log("Λάθος ΑΜ στην πρώτη γραμμή!");
      } else {
        return await Promise.resolve(0);
      }

      for (let i = 0; i < rows; i++) {
        let am = await page.$eval(
          `#ctl00_ContentData_cmbWorker_DDD_gv_DXDataRow${
            i + 1
          } td:nth-child(1)`,
          (el) => el.textContent
        );
        let afm = await page.$eval(
          `#ctl00_ContentData_cmbWorker_DDD_gv_DXDataRow${
            i + 1
          } td:nth-child(2)`,
          (el) => el.textContent
        );
        if (am != record["ΑΜ/ΑΦΜ"] && afm != record["ΑΜ/ΑΦΜ"]) {
          console.log(`Λάθος ΑΜ στην ${i + 1}η γραμμή!`);
        } else {
          return await Promise.resolve(i + 1);
        }
      }

      console.log("Δεν βρέθηκε εκπαιδευτικός με αυτό το ΑΜ/ΑΦΜ");
      return await Promise.reject();
    })
    .then(async (value) => {
      // Κάνε κλικ στον εκπαιδευτικό
      console.log("Κάνε κλικ στον εκπαιδευτικό");
      return await page
        .$(`#ctl00_ContentData_cmbWorker_DDD_gv_DXDataRow${value}`)
        .then(async (element) => {
          if (element) {
            return await element.click();
          }

          return await Promise.reject(
            new Error("Δεν μπορώ να κάνω κλικ στον εκπαιδευτικό!")
          );
        });
    })
    .then(async () => {
      console.log("Περίμενε μέχρι να περαστεί το ωράριο του/της εκπαιδευτικού");
      return await page.waitForSelector(
        "span.dxeIRadioButton.dxEditors_edtRadioButtonChecked"
      );
    })
    .then(async () => {
      console.log("Πληκτρολόγησε τον κωδικό του σχολείου");
      return await Promise.all([
        page.type("#ctl00_ContentData_cmbUnit_I", record["ΣΧΟΛΕΙΟ"]),
      ]);
    })
    .then(async () => {
      console.log("Δες αν βρέθηκε το σχολείο");
      await page.waitForSelector(
        "table#ctl00_ContentData_cmbUnit_DDD_L_LBT > tbody > tr > td.dxeFTM.dxeListBoxItemSelected"
      );
      await new Promise((r) => setTimeout(r, 2000));
      const sch = await page.$eval(
        "table#ctl00_ContentData_cmbUnit_DDD_L_LBT > tbody > tr > td.dxeFTM.dxeListBoxItemSelected:nth-child(1)",
        (el) => el.textContent
      );
      if (sch != record["ΣΧΟΛΕΙΟ"]) {
        console.log(sch);
        console.log(record["ΣΧΟΛΕΙΟ"]);
        console.log("Λάθος κωδικός σχολείου στην πρώτη γραμμή!");
        await Promise.reject();
      }

      return Promise.resolve();
    })
    .then(async () => {
      // Κάνε κλικ στο σχολείο
      console.log("Κάνε κλικ στο σχολείο");
      return await page
        .$(
          "table#ctl00_ContentData_cmbUnit_DDD_L_LBT > tbody > tr > td.dxeFTM.dxeListBoxItemSelected"
        )
        .then(async (element) => {
          if (element) {
            return await element.click();
          }

          return await Promise.reject(
            new Error("Δεν μπορώ να κάνω κλικ στο σχολείο!")
          );
        });
    })
    .then(async () => {
      console.log("Περίμενε για ανάκτηση δεδομένων τύπων τοποθέτησης");
      return await new Promise((r) => setTimeout(r, 2000));
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
      console.log(categories.map((c) => c.name));

      // Κάνε έλεγχο αν ο τύπος τοποθέτησης είναι έγκυρος
      if (!categories.map((c) => c.name).includes(record["ΤΟΠΟΘΕΤΗΣΗ"])) {
        return await Promise.reject(
          new Error(
            "Εσφαλμένος τύπος τοποθέτησης για " +
              record["ΑΜ/ΑΦΜ"] +
              ' τοποθέτηση: "' +
              record["ΤΟΠΟΘΕΤΗΣΗ"] +
              '"'
          )
        );
      }

      let found_id = "";
      for (const category of categories) {
        if (category.name === record["ΤΟΠΟΘΕΤΗΣΗ"]) {
          found_id = category.id;
        }
      }
      if (found_id) {
        return await page.click("#" + found_id);
      } else {
        return await Promise.reject(
          new Error("Δεν βρέθηκε το id της τοποθέτησης!")
        );
      }
    })
    .then(async () => {
      // Συμπλήρωσε την έναρξη τοποθέτησης
      console.log(
        "Συμπλήρωση την ημερομηνία έναρξης τοποθέτησης (" + record["ΑΠΟ"] + ")"
      );
      // return await page.evaluate(`async () => {
      //   const el = document.getElementById("ctl00_ContentData_dateFrom_I");
      //   if (el instanceof HTMLInputElement) {
      //     el.value = ${record["ΑΠΟ"]};
      //     return await Promise.resolve();
      //   } else {
      //     return await Promise.reject(
      //       new Error(
      //         "Δεν βρέθηκε το πεδίο την ημερομηνία έναρξης ισχύος τοποθέτησης!"
      //       )
      //     );
      //   }
      // }`);
      // const input = await page.waitForSelector("#ctl00_ContentData_dateFrom_I");
      // if (input !== null) {
      //   return await page
      //     .click("#ctl00_ContentData_dateFrom_I")
      //     .then(async () => {
      //       return await page.keyboard.down("Control");
      //     })
      //     .then(async () => {
      //       return await page.keyboard.press("A");
      //     })
      //     .then(async () => {
      //       return await page.keyboard.up("Control");
      //     })
      //     .then(async () => {
      //       return await page.keyboard.press("Backspace");
      //     })
      //     .then(async () => {
      //       console.log("WTF? ", record["ΑΠΟ"]);
      //       return await page.keyboard.type(record["ΑΠΟ"], { delay: 100 });
      //     })
      //     .then(async () => {
      //       // Πατάμε enter για να αλλάξουν οι ημέρες της εβδομάδας σε "Άγνωστο"
      //       return await page.keyboard.press("Enter");
      //     });
      // } else {
      //   return await Promise.reject(
      //     new Error(
      //       "Δεν βρέθηκε το πεδίο την ημερομηνία έναρξης ισχύος τοποθέτησης!"
      //     )
      //   );
      // }
      const input = await page.waitForSelector("#ctl00_ContentData_dateFrom_I");
      if (input !== null) {
        await page.click("#ctl00_ContentData_dateFrom_I", {
          delay: 1000, // Χρειάζεται αλλιώς δεν παίζει σωστά
          clickCount: 3,
        });
        await page.type("#ctl00_ContentData_dateFrom_I", record["ΑΠΟ"], {
          delay: 100,
        });
        // Πατάμε enter για να αλλάξουν οι ημέρες της εβδομάδας σε "Άγνωστο"
        return await page.keyboard.press("Enter");
      } else {
        return await Promise.reject(
          new Error(
            "Δεν βρέθηκε το πεδίο την ημερομηνία έναρξης ισχύος τοποθέτησης!"
          )
        );
      }
    })
    .then(async () => {
      // Συμπλήρωσε την λήξη τοποθέτησης
      console.log(
        "Συμπλήρωση την ημερομηνία λήξης τοποθέτησης (" + record["ΕΩΣ"] + ")"
      );
      const input = await page.waitForSelector("#ctl00_ContentData_dateTo_I");
      if (input !== null) {
        await page.click("#ctl00_ContentData_dateTo_I", {
          delay: 1000,
          clickCount: 3,
        });
        await page.type("#ctl00_ContentData_dateTo_I", record["ΕΩΣ"], {
          delay: 100,
        });
        return await page.keyboard.press("Enter");
      } else {
        return await Promise.reject(
          new Error(
            "Δεν βρέθηκε το πεδίο την ημερομηνία λήξης ισχύος τοποθέτησης!"
          )
        );
      }
    })
    .then(async () => {
      console.log("Συμπλήρωσε τις απαιτούμενες ώρες (" + record["ΩΡΕΣ"] + ")");
      if (record["ΩΡΕΣ"]) {
        const hours = parseInt(record["ΩΡΕΣ"]);
        const radioButton = await page.$(
          "#ctl00_ContentData_lbEditHours_RB" + (hours - 1) + "_I_D"
        );
        if (radioButton) {
          return await radioButton.click();
        } else {
          return await Promise.reject(
            new Error("Δεν βρέθηκε το radioButton για την επιλογή των ωρών.")
          );
        }
      } else {
        return await Promise.resolve();
      }
    })
    .then(async () => {
      console.log("Αποθήκευσε την τοποθέτηση");
      await page.screenshot({
        path: "img/" + record["ΑΜ/ΑΦΜ"] + ".png",
        fullPage: true,
      });
      // return Promise.resolve();
      return await Promise.all([
        page.click("#ctl00_ContentData_savePlacement"),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);
    })
    .then(async () => {
      console.log("Καθάρισε τα στοιχεία τοποθέτησης");
      return await Promise.all([
        page.click("#ctl00_ContentData_btnClear"),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);
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
  await page.goto("https://app.myschool.sch.gr", { waitUntil: "networkidle2" });

  if (
    typeof process.env.MYSCH_USERNAME === "undefined" ||
    typeof process.env.MYSCH_PASSWORD === "undefined"
  ) {
    console.log("MYSCH_USERNAME και MYSCH_PASSWORD είναι κενά!");
    return;
  }
  await page.waitForSelector("#username");
  await page.waitForSelector("#password");
  await page.type("#username", process.env.MYSCH_USERNAME);
  await page.type("#password", process.env.MYSCH_PASSWORD);
  console.log("Κάνε login");
  await Promise.all([page.click("#loginButton"), page.waitForNavigation()]);
  console.log("Κάνε logout");
  await Promise.all([page.click("li.logout > a"), page.waitForNavigation()]);
  await page.waitForSelector("#username");
  await page.waitForSelector("#password");
  await page.type("#username", process.env.MYSCH_USERNAME);
  await page.type("#password", process.env.MYSCH_PASSWORD);
  console.log("Κάνε login");
  await Promise.all([page.click("#loginButton"), page.waitForNavigation()]);

  // ---------------

  // ---------------
  // Άλλαξε τη σχολική χρονιά
  // await page
  //   .waitForSelector("#ctl00_ContentData_cmbActiveAcadYear_B-1")
  //   .then(async () => {
  //     // Άνοιξε την λίστα των σχολικών ετών
  //     return await page.click("#ctl00_ContentData_cmbActiveAcadYear_B-1", {
  //       delay: 1000,
  //     });
  //   })
  //   .then(async () => {
  //     return await page.waitForSelector(
  //       "#ctl00_ContentData_cmbActiveAcadYear_DDD_L_LBT"
  //     );
  //   })
  //   .then(async () => {
  //     // Διάλεξε την πρώτη επιλογή
  //     return await page.click(
  //       "#ctl00_ContentData_cmbActiveAcadYear_DDD_L_LBI0T0",
  //       {
  //         delay: 1000,
  //       }
  //     );
  //   })
  //   .then(async () => {
  //     return await page.waitForNavigation();
  //   });

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
          await page.screenshot({ path: "error.png", fullPage: true });
          console.log("Error!");
          break;
        }
        // });
      }
      if (errorFound) {
        return await Promise.reject();
      }

      return await Promise.resolve();
    })
    .finally(() => {
      console.log("Τέλος");
    });
  // ---------------
}
