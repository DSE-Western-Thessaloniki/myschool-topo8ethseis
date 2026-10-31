import type { RowInfo, RunState, ServerEvent, Snapshot } from "../src/bus.js";

/** Βρίσκει ένα στοιχείο της σελίδας ή ρίχνει σφάλμα αν δεν υπάρχει */
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error("Δεν βρέθηκε το στοιχείο: #" + id);
  }
  return node as T;
}

const els = {
  badge: el<HTMLSpanElement>("state-badge"),
  message: el<HTMLSpanElement>("message"),
  run: el<HTMLButtonElement>("btn-run"),
  stop: el<HTMLButtonElement>("btn-stop"),
  clear: el<HTMLButtonElement>("btn-clear"),
  conn: el<HTMLSpanElement>("conn"),
  frame: el<HTMLImageElement>("frame"),
  placeholder: el<HTMLDivElement>("placeholder"),
  rows: el<HTMLTableSectionElement>("rows"),
  empty: el<HTMLElement>("empty"),
  counts: el<HTMLSpanElement>("counts"),
  logPane: el<HTMLDivElement>("log-pane"),
  autoscroll: el<HTMLInputElement>("autoscroll"),
};

const stateLabels: Record<RunState, string> = {
  idle: "Αδρανής",
  running: "Εκτελείται",
  done: "Ολοκληρώθηκε",
  error: "Σφάλμα",
  stopped: "Διακόπηκε",
};

const statusLabels: Record<RowInfo["status"], string> = {
  pending: "Αναμονή",
  processing: "Σε εκτέλεση",
  ok: "Ολοκληρώθηκε",
  error: "Σφάλμα",
};

/** Μέγιστο πλήθος μηνυμάτων στο παράθυρο καταγραφής */
const MAX_LOG_NODES = 1000;

const rowElements = new Map<number, HTMLTableRowElement>();

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTime(time: number): string {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

function value(record: RowInfo["record"], key: string): string {
  const found = record[key];
  return typeof found === "undefined" ? "" : String(found);
}

/* ---------------- Κατάσταση εργασίας ---------------- */

function setState(state: RunState, message?: string): void {
  const running = state === "running";
  els.badge.textContent = stateLabels[state];
  els.badge.className = "badge " + state;
  els.run.disabled = running;
  els.stop.disabled = !running;
  els.message.textContent = message ?? "";
}

/* ---------------- Πίνακας προόδου ---------------- */

function setScreenshot(index: number, file: string): void {
  const tr = rowElements.get(index);
  if (!tr) return;
  const cell = tr.cells[4];
  const name = file.split("/").pop() ?? file;
  // Το t= αποφεύγει την κρυφή αποθήκευση παλιών στιγμιότυπων
  const url = `/shots/${encodeURIComponent(name)}?t=${Date.now()}`;
  cell.replaceChildren();
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.title = "Άνοιγμα στιγμιότυπου σε νέο παράθυρο";
  const img = document.createElement("img");
  img.className = "thumb";
  img.src = url;
  img.alt = "Στιγμιότυπο";
  link.appendChild(img);
  cell.appendChild(link);
}

function renderRow(row: RowInfo): void {
  let tr = rowElements.get(row.index);

  if (!tr) {
    tr = document.createElement("tr");
    for (let i = 0; i < 5; i++) {
      tr.appendChild(document.createElement("td"));
    }
    rowElements.set(row.index, tr);
    els.rows.appendChild(tr);
  }

  tr.className = row.status;
  tr.cells[0].textContent = value(row.record, "ΑΜ/ΑΦΜ");
  tr.cells[1].textContent = value(row.record, "ΣΧΟΛΕΙΟ");
  tr.cells[2].textContent = value(row.record, "ΤΟΠΟΘΕΤΗΣΗ");
  tr.cells[3].className = "status";
  tr.cells[3].textContent = row.error
    ? `${statusLabels[row.status]}: ${row.error}`
    : statusLabels[row.status];
  tr.cells[3].title = row.error ?? "";

  if (row.screenshot) {
    setScreenshot(row.index, row.screenshot);
  }

  els.empty.classList.toggle("hidden", rowElements.size > 0);
  updateCounts();
}

function clearRows(rows: RowInfo[]): void {
  rowElements.clear();
  els.rows.replaceChildren();
  els.empty.classList.toggle("hidden", rows.length > 0);
  for (const row of rows) {
    renderRow(row);
  }
  updateCounts();
}

function updateCounts(): void {
  let ok = 0;
  let errors = 0;
  let processing = false;

  rowElements.forEach((tr) => {
    if (tr.classList.contains("ok")) ok++;
    else if (tr.classList.contains("error")) errors++;
    else if (tr.classList.contains("processing")) processing = true;
  });

  const total = rowElements.size;
  if (total === 0) {
    els.counts.textContent = "";
    return;
  }

  const parts = [`${ok} / ${total}`];
  if (errors) parts.push(`${errors} σφάλμ${errors === 1 ? "α" : "ατα"}`);
  if (processing) parts.push("επεξεργασία…");
  els.counts.textContent = parts.join(" · ");
}

/* ---------------- Καταγραφή ---------------- */

function appendLog(level: string, text: string, time: number): void {
  const entry = document.createElement("div");
  entry.className = "log " + level;

  const timeEl = document.createElement("span");
  timeEl.className = "time";
  timeEl.textContent = formatTime(time);

  const textEl = document.createElement("span");
  textEl.className = "text";
  textEl.textContent = text;

  entry.appendChild(timeEl);
  entry.appendChild(textEl);
  els.logPane.appendChild(entry);

  while (els.logPane.childElementCount > MAX_LOG_NODES) {
    els.logPane.firstElementChild?.remove();
  }

  if (els.autoscroll.checked) {
    els.logPane.scrollTop = els.logPane.scrollHeight;
  }
}

function clearLogs(): void {
  els.logPane.replaceChildren();
}

/* ---------------- Ζωντανή προβολή ---------------- */

function showFrame(data: string): void {
  els.frame.src = "data:image/jpeg;base64," + data;
  if (!els.frame.classList.contains("visible")) {
    els.frame.classList.add("visible");
    els.placeholder.classList.add("hidden");
  }
}

/* ---------------- Μηνύματα από τον διακομιστή ---------------- */

function applySnapshot(snapshot: Snapshot): void {
  clearLogs();
  for (const log of snapshot.logs) {
    appendLog(log.level, log.text, log.time);
  }
  clearRows(snapshot.rows);
  setState(snapshot.state, snapshot.message);
}

function handle(event: ServerEvent | Snapshot): void {
  switch (event.type) {
    case "snapshot":
      applySnapshot(event);
      break;
    case "log":
      appendLog(event.level, event.text, event.time);
      break;
    case "state":
      setState(event.state, event.message);
      break;
    case "reset":
      clearRows(event.rows);
      break;
    case "row":
      renderRow(event.row);
      break;
    case "screenshot":
      setScreenshot(event.index, event.file);
      break;
    case "frame":
      showFrame(event.data);
      break;
  }
}

/* ---------------- Σύνδεση web socket ---------------- */

let socket: WebSocket | null = null;

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${location.host}/ws`);
  socket = ws;

  ws.onopen = () => {
    els.conn.className = "conn on";
    els.conn.title = "Συνδεδεμένος με τον διακομιστή";
  };

  ws.onmessage = (message) => {
    try {
      handle(JSON.parse(message.data));
    } catch (err) {
      console.error("Μη αναγνώρισιμο μήνυμα από τον διακομιστή", err);
    }
  };

  ws.onclose = () => {
    els.conn.className = "conn off";
    els.conn.title = "Αποσυνδεδεμένος — νέα προσπάθεια…";
    if (socket === ws) {
      setTimeout(connect, 1500);
    }
  };

  ws.onerror = () => {
    ws.close();
  };
}

/* ---------------- Ενέργειες ---------------- */

async function post(url: string): Promise<void> {
  try {
    const response = await fetch(url, { method: "POST" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      alert(body?.error ?? "Αποτυχία ενέργειας");
    }
  } catch {
    alert("Δεν υπάρχει σύνδεση με τον διακομιστή");
  }
}

els.run.addEventListener("click", () => {
  void post("/api/run");
});

els.stop.addEventListener("click", () => {
  if (confirm("Σίγουρα θέλεις να διακοπεί η εργασία;")) {
    void post("/api/stop");
  }
});

els.clear.addEventListener("click", clearLogs);

connect();
