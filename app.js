const STORAGE_KEY = "somtec_hours_v1";
const REMOTE_PATH = "somtec-hours";
const DAY_NAMES = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

const DEFAULT_DATA = {
  employees: [
    { id: "e-julian", name: "Julian Cuenca", role: "CEO y Gerente" },
    { id: "e-salvador", name: "Salvador Bordoy", role: "Director técnico" },
    { id: "e-admin", name: "Administración", role: "Oficina" },
    { id: "e-tecnico", name: "Técnico Somtec", role: "Servicios técnicos" }
  ],
  tasks: {
    Facturación: ["Interna", "Externa", "Seguimiento cobros"],
    Proyectos: ["Planificación", "Visita técnica", "Presupuesto", "Seguimiento", "Entrega"],
    Servicios: ["Instalación", "Mantenimiento", "Reparación", "Soporte cliente"],
    Administración: ["Compras", "Gestión interna", "Llamadas"],
    Comercial: ["Contacto cliente", "Propuesta", "Reunion", "Cierre"]
  },
  records: []
};

let data = loadData();
let dialogMode = "timer";
let editingEmployeeId = null;
let configState = {};
let historyMode = "day";
let selectedDate = dateKey(new Date());
let remoteRef = null;
let applyingRemote = false;
let remoteSaveTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function loadData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored && Array.isArray(stored.employees) && stored.tasks && Array.isArray(stored.records)) {
      return stored;
    }
  } catch (_) {}
  return structuredClone(DEFAULT_DATA);
}

function isValidData(value) {
  return value && Array.isArray(value.employees) && value.tasks && Array.isArray(value.records);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setStorageStatus(remoteRef ? "Guardando" : "Local");
  if (remoteRef && !applyingRemote) {
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = setTimeout(() => {
      remoteRef.set(data)
        .then(() => setStorageStatus("Firebase"))
        .catch(() => setStorageStatus("Error sync"));
    }, 250);
  } else if (!remoteRef) {
    setTimeout(() => setStorageStatus("Local"), 900);
  }
}

function setStorageStatus(label) {
  const el = $("#storageStatus");
  if (el) el.textContent = label;
}

function initRemoteSync() {
  const config = window.SOMTEC_FIREBASE_CONFIG;
  if (!config || !config.apiKey || !config.databaseURL || !window.firebase) {
    setStorageStatus("Local");
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(config);
    remoteRef = firebase.database().ref(REMOTE_PATH);
    setStorageStatus("Conectando");
    remoteRef.on("value", (snapshot) => {
      const remoteData = snapshot.val();
      if (isValidData(remoteData)) {
        applyingRemote = true;
        data = remoteData;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        renderFilters();
        updateDialogTasks();
        render();
        applyingRemote = false;
        setStorageStatus("Firebase");
      } else {
        remoteRef.set(data).then(() => setStorageStatus("Firebase"));
      }
    }, () => setStorageStatus("Error sync"));
  } catch (error) {
    remoteRef = null;
    setStorageStatus("Local");
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date();
}

function dateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function hoursFromMs(ms) {
  return ms / 3600000;
}

function currentElapsed(record) {
  return record.elapsedMs + (record.running ? now() - new Date(record.lastStartedAt) : 0);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function getActiveRecord(employeeId) {
  return data.records.find((record) => record.employeeId === employeeId && !record.endAt) || null;
}

function completedRecords() {
  return data.records.filter((record) => record.endAt);
}

function recordHours(record) {
  return hoursFromMs(record.endAt ? record.elapsedMs : currentElapsed(record));
}

function startRecord(employeeId, category, project, task) {
  const employee = data.employees.find((item) => item.id === employeeId);
  if (!employee) return;
  if (getActiveRecord(employeeId)) return;
  data.records.push({
    id: uid("r"),
    employeeId,
    employeeName: employee.name,
    category,
    project,
    task,
    startAt: now().toISOString(),
    endAt: null,
    elapsedMs: 0,
    lastStartedAt: now().toISOString(),
    running: true,
    pauses: [],
    manual: false
  });
  saveData();
  render();
  toast("Cronometro iniciado");
}

function pauseRecord(recordId) {
  const record = data.records.find((item) => item.id === recordId);
  if (!record || !record.running) return;
  const pausedAt = now();
  record.elapsedMs = currentElapsed(record);
  record.running = false;
  record.pauses.push({ start: pausedAt.toISOString(), end: null });
  saveData();
  render();
}

function resumeRecord(recordId) {
  const record = data.records.find((item) => item.id === recordId);
  if (!record || record.running) return;
  const resumedAt = now();
  const lastPause = record.pauses[record.pauses.length - 1];
  if (lastPause && !lastPause.end) lastPause.end = resumedAt.toISOString();
  record.lastStartedAt = resumedAt.toISOString();
  record.running = true;
  saveData();
  render();
}

function finishRecord(recordId) {
  const record = data.records.find((item) => item.id === recordId);
  if (!record || record.endAt) return;
  if (record.running) record.elapsedMs = currentElapsed(record);
  record.running = false;
  record.endAt = now().toISOString();
  const lastPause = record.pauses[record.pauses.length - 1];
  if (lastPause && !lastPause.end) lastPause.end = record.endAt;
  saveData();
  render();
  toast("Registro guardado en historial");
}

function addManualRecord(employeeId, category, project, task, dateValue, startValue, hoursValue) {
  const employee = data.employees.find((item) => item.id === employeeId);
  const hours = Number(hoursValue);
  if (!employee || !dateValue || !startValue || !Number.isFinite(hours) || hours <= 0) return false;
  const startAt = new Date(`${dateValue}T${startValue}:00`);
  const elapsedMs = Math.round(hours * 3600000);
  data.records.push({
    id: uid("r"),
    employeeId,
    employeeName: employee.name,
    category,
    project,
    task,
    startAt: startAt.toISOString(),
    endAt: new Date(startAt.getTime() + elapsedMs).toISOString(),
    elapsedMs,
    lastStartedAt: null,
    running: false,
    pauses: [],
    manual: true
  });
  saveData();
  render();
  toast("Horas añadidas");
  return true;
}

function deleteRecord(recordId) {
  if (!confirm("Eliminar este registro de horas?")) return;
  data.records = data.records.filter((item) => item.id !== recordId);
  saveData();
  render();
}

function renderEmployeeGrid() {
  $("#employeeGrid").innerHTML = data.employees.map((employee) => {
    const active = getActiveRecord(employee.id);
    const timer = active ? formatTime(currentElapsed(active)) : "00:00:00";
    const state = active ? (active.running ? "running" : "paused") : "";
    const task = active
      ? `${active.category} / ${active.project}<br><strong>${active.task}</strong>`
      : "Sin tarea activa.";
    const buttons = active
      ? `<button class="secondary" data-action="${active.running ? "pause" : "resume"}" data-id="${active.id}">${active.running ? "Pausar" : "Reanudar"}</button>
         <button data-action="finish" data-id="${active.id}">Finalizar</button>`
      : `<button class="full" data-action="open-start" data-employee="${employee.id}">Empezar tarea</button>`;
    return `<article class="employee-card">
      <div class="employee-top">
        <div>
          <div class="employee-name">${escapeHtml(employee.name)}</div>
          <div class="employee-role">${escapeHtml(employee.role)}</div>
        </div>
        <div class="initials">${escapeHtml(initials(employee.name))}</div>
      </div>
      <div class="state-dot ${state}"></div>
      <div class="timer">${timer}</div>
      <div class="task-line">${task}</div>
      <div class="card-actions">${buttons}</div>
    </article>`;
  }).join("") || `<div class="empty">Añade trabajadores en Config para empezar.</div>`;
}

function renderFilters() {
  $("#dialogEmployee").innerHTML = data.employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join("");
  $("#dialogCategory").innerHTML = Object.keys(data.tasks).map((category) => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join("");
}

function filteredHistory() {
  const { from, to } = getPeriodRange();
  return recordsInRange(from, to)
    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
}

function renderHistory() {
  renderPeriodControls();
  renderCalendar();
  renderPeriodPanel();
}

function recordsInRange(from, to) {
  return completedRecords().filter((record) => {
    const started = new Date(record.startAt);
    return started >= from && started <= to;
  });
}

function getPeriodRange() {
  if (historyMode === "week") {
    const weekValue = $("#periodWeek")?.value || getWeekInputValue(new Date(selectedDate));
    const from = startOfISOWeekInput(weekValue);
    const to = endOfDay(addDays(from, 6));
    return { from, to, label: `Semana ${weekValue.split("-W")[1]} · ${formatDateShort(from)} - ${formatDateShort(to)}` };
  }
  if (historyMode === "month") {
    const monthValue = $("#periodMonth")?.value || selectedDate.slice(0, 7);
    const [year, month] = monthValue.split("-").map(Number);
    const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const to = endOfDay(new Date(year, month, 0));
    return { from, to, label: from.toLocaleDateString("es-ES", { month: "long", year: "numeric" }) };
  }
  if (historyMode === "year") {
    const year = Number($("#periodYear")?.value || new Date(selectedDate).getFullYear());
    return { from: new Date(year, 0, 1, 0, 0, 0, 0), to: endOfDay(new Date(year, 11, 31)), label: String(year) };
  }
  const dateValue = $("#periodDate")?.value || selectedDate;
  const from = new Date(`${dateValue}T00:00:00`);
  const to = endOfDay(from);
  return { from, to, label: formatDateLong(from) };
}

function renderPeriodControls() {
  $$(".period-tab").forEach((button) => button.classList.toggle("active", button.dataset.period === historyMode));
  $("#periodDateWrap").classList.toggle("hidden", historyMode !== "day");
  $("#periodWeekWrap").classList.toggle("hidden", historyMode !== "week");
  $("#periodMonthWrap").classList.toggle("hidden", historyMode !== "month");
  $("#periodYearWrap").classList.toggle("hidden", historyMode !== "year");
  $("#periodDate").value = selectedDate;
  $("#periodWeek").value = getWeekInputValue(new Date(selectedDate));
  $("#periodMonth").value = selectedDate.slice(0, 7);
  $("#periodYear").value = new Date(selectedDate).getFullYear();
}

function renderCalendar() {
  const wrap = $("#calendarWrap");
  if (!wrap) return;
  const selected = new Date(`${selectedDate}T12:00:00`);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const range = getPeriodRange();
  let html = `<div class="calendar-shell">
    <div class="calendar-head">${DAY_NAMES.map((day) => `<div>${day}</div>`).join("")}</div>
    <div class="calendar-grid">`;
  for (let i = 0; i < 42; i += 1) {
    const day = addDays(gridStart, i);
    const key = dateKey(day);
    const rows = recordsInRange(new Date(`${key}T00:00:00`), endOfDay(day));
    const total = rows.reduce((sum, record) => sum + recordHours(record), 0);
    const workerChips = summarizeByEmployee(rows).slice(0, 2).map((item) => `<span class="day-chip">${escapeHtml(initials(item.name))} ${item.hours.toFixed(1)}h</span>`).join("");
    const isSelected = day >= startOfDay(range.from) && day <= range.to;
    html += `<button class="calendar-day ${day.getMonth() !== month ? "muted-day" : ""} ${isSelected ? "selected" : ""}" data-action="select-calendar-day" data-date="${key}">
      <span class="day-number">${day.getDate()}</span>
      ${total ? `<span class="day-hours">${total.toFixed(1)}h</span>${workerChips}` : `<span class="day-hours">-</span>`}
    </button>`;
  }
  html += `</div></div>`;
  wrap.innerHTML = html;
}

function renderPeriodPanel() {
  const panel = $("#periodPanel");
  const { from, to, label } = getPeriodRange();
  const rows = recordsInRange(from, to);
  const total = rows.reduce((sum, record) => sum + recordHours(record), 0);
  const activeDays = new Set(rows.map((record) => dateKey(record.startAt))).size;
  const workerCards = data.employees.map((employee) => renderWorkerPeriodCard(employee, rows)).join("");
  panel.innerHTML = `<div class="period-panel">
    <div class="period-summary">
      <div class="period-metric"><span class="muted">Periodo</span><strong>${escapeHtml(label)}</strong></div>
      <div class="period-metric"><span class="muted">Total</span><strong>${total.toFixed(2)} h</strong></div>
      <div class="period-metric"><span class="muted">Dias con actividad</span><strong>${activeDays}</strong></div>
      <div class="period-metric"><span class="muted">Registros</span><strong>${rows.length}</strong></div>
    </div>
    <div class="worker-period-grid">${workerCards}</div>
  </div>`;
}

function renderWorkerPeriodCard(employee, periodRecords) {
  const rows = periodRecords.filter((record) => record.employeeId === employee.id);
  const total = rows.reduce((sum, record) => sum + recordHours(record), 0);
  const breakdown = new Map();
  rows.forEach((record) => {
    const key = `${record.category} / ${record.project} / ${record.task}`;
    breakdown.set(key, (breakdown.get(key) || 0) + recordHours(record));
  });
  const breakdownRows = Array.from(breakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, hours]) => `<div class="breakdown-row"><span><strong>${escapeHtml(label.split(" / ")[0])}</strong><br>${escapeHtml(label.split(" / ").slice(1).join(" / "))}</span><span class="breakdown-hours">${hours.toFixed(2)}h</span></div>`)
    .join("") || `<div class="muted">Sin horas registradas en este periodo.</div>`;
  return `<article class="worker-period-card">
    <div class="worker-period-head">
      <div><strong>${escapeHtml(employee.name)}</strong><br><span class="muted">${escapeHtml(employee.role)}</span></div>
      <div class="worker-period-total">${total.toFixed(1)}h</div>
    </div>
    <div class="breakdown-list">${breakdownRows}</div>
  </article>`;
}

function summarizeByEmployee(records) {
  const map = new Map();
  records.forEach((record) => {
    const item = map.get(record.employeeId) || { name: record.employeeName, hours: 0 };
    item.hours += recordHours(record);
    map.set(record.employeeId, item);
  });
  return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateShort(date) {
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function formatDateLong(date) {
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function getWeekInputValue(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function startOfISOWeekInput(value) {
  const [yearText, weekText] = value.split("-W");
  const year = Number(yearText);
  const week = Number(weekText);
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const monday = new Date(simple);
  if (dow <= 4) monday.setDate(simple.getDate() - ((dow + 6) % 7));
  else monday.setDate(simple.getDate() + (8 - dow));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function syncSelectedDateFromPeriodInput() {
  if (historyMode === "day") selectedDate = $("#periodDate").value || selectedDate;
  if (historyMode === "week") selectedDate = dateKey(startOfISOWeekInput($("#periodWeek").value || getWeekInputValue(new Date(selectedDate))));
  if (historyMode === "month") selectedDate = `${$("#periodMonth").value || selectedDate.slice(0, 7)}-01`;
  if (historyMode === "year") selectedDate = `${$("#periodYear").value || new Date(selectedDate).getFullYear()}-01-01`;
}

function renderConfig() {
  $("#configEmployees").innerHTML = renderEmployeesConfig();
  $("#configTasks").innerHTML = renderTasksConfig();
}

function renderEmployeesConfig() {
  const rows = data.employees.map((employee) => {
    if (configState.employee === employee.id) return employeeEditorRow(employee);
    return `<div class="table-row">
      <div><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.role)}</small></div>
      <div class="row-actions">
        <button class="secondary" data-action="edit-employee" data-id="${employee.id}">Editar</button>
        <button class="danger" data-action="delete-employee" data-id="${employee.id}">Eliminar</button>
      </div>
    </div>`;
  });
  if (configState.employee === "__new__") rows.push(employeeEditorRow());
  return rows.join("") || `<div class="empty">Sin trabajadores.</div>`;
}

function employeeEditorRow(employee = {}) {
  const isNew = !employee.id;
  return `<div class="table-row edit-row">
    <div class="edit-grid">
      <label>Nombre<input id="configEmployeeName" value="${escapeAttr(employee.name || "")}" placeholder="Nombre y apellidos"></label>
      <label>Puesto<input id="configEmployeeRole" value="${escapeAttr(employee.role || "")}" placeholder="Tecnico, oficina..."></label>
    </div>
    <div class="row-actions">
      <button data-action="save-employee" data-id="${employee.id || ""}">${isNew ? "Añadir" : "Guardar"}</button>
      <button class="secondary" data-action="cancel-config">Cancelar</button>
    </div>
  </div>`;
}

function renderTasksConfig() {
  const rows = Object.entries(data.tasks).map(([task, subtasks]) => {
    if (configState.task === task) return taskEditorRow(task, subtasks);
    return `<div class="table-row">
      <div><strong>${escapeHtml(task)}</strong><small>${subtasks.map(escapeHtml).join(", ") || "Sin subtareas"}</small></div>
      <div class="row-actions">
        <button class="secondary" data-action="edit-task" data-task="${escapeAttr(task)}">Editar</button>
        <button class="danger" data-action="delete-task" data-task="${escapeAttr(task)}">Eliminar</button>
      </div>
    </div>`;
  });
  if (configState.task === "__new__") rows.push(taskEditorRow("", []));
  return rows.join("") || `<div class="empty">Sin tareas.</div>`;
}

function taskEditorRow(task = "", subtasks = []) {
  const isNew = !task;
  return `<div class="table-row edit-row">
    <div class="edit-grid single">
      <label>Tarea principal<input id="configTaskName" value="${escapeAttr(task)}" placeholder="Facturacion"></label>
      <label>Subtareas, una por linea<textarea id="configSubtasks" placeholder="Interna&#10;Externa">${escapeHtml(subtasks.join("\n"))}</textarea></label>
    </div>
    <div class="row-actions">
      <button data-action="save-task" data-task="${escapeAttr(task)}">${isNew ? "Añadir" : "Guardar"}</button>
      <button class="secondary" data-action="cancel-config">Cancelar</button>
    </div>
  </div>`;
}

function render() {
  $("#todayLabel").textContent = now().toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" });
  renderEmployeeGrid();
  renderHistory();
  renderConfig();
}

function updateDialogTasks() {
  const category = $("#dialogCategory").value;
  $("#dialogTask").innerHTML = (data.tasks[category] || []).map((task) => `<option value="${escapeAttr(task)}">${escapeHtml(task)}</option>`).join("");
}

function openTaskDialog(employeeId = "", mode = "timer") {
  dialogMode = mode;
  editingEmployeeId = employeeId;
  $("#taskDialogForm").reset();
  $("#dialogMode").textContent = mode === "manual" ? "Ajuste manual" : "Nueva tarea";
  $("#dialogTitle").textContent = mode === "manual" ? "Añadir horas trabajadas" : "Registrar trabajo";
  $("#confirmTaskBtn").textContent = mode === "manual" ? "Guardar horas" : "Empezar";
  $("#manualFields").classList.toggle("active", mode === "manual");
  $("#dialogEmployee").disabled = Boolean(employeeId);
  $("#dialogEmployee").value = employeeId || data.employees[0]?.id || "";
  $("#dialogEmployeeId").value = employeeId;
  $("#manualDate").value = dateKey(now());
  $("#manualStart").value = "09:00";
  updateDialogTasks();
  $("#taskDialog").showModal();
}

function closeTaskDialog() {
  $("#taskDialog").close();
  $("#dialogEmployee").disabled = false;
}

function handleDialogSubmit(event) {
  event.preventDefault();
  const employeeId = editingEmployeeId || $("#dialogEmployee").value;
  const category = $("#dialogCategory").value;
  const project = $("#dialogProject").value.trim();
  const task = ($("#dialogCustomTask").value.trim() || $("#dialogTask").value).trim();
  if (!employeeId || !category || !project || !task) return;
  if (dialogMode === "manual") {
    if (!addManualRecord(employeeId, category, project, task, $("#manualDate").value, $("#manualStart").value, $("#manualHours").value)) {
      toast("Revisa fecha, hora y duracion");
      return;
    }
  } else {
    startRecord(employeeId, category, project, task);
  }
  closeTaskDialog();
}

function exportCsv() {
  const header = ["trabajador", "tarea", "proyecto_labor", "subtarea", "inicio", "fin", "horas", "manual"];
  const lines = filteredHistory().map((record) => [record.employeeName, record.category, record.project, record.task, record.startAt, record.endAt, recordHours(record).toFixed(2), record.manual ? "si" : "no"]);
  downloadFile("registro-horas-somtec.csv", [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv");
}

function exportJson() {
  downloadFile("registro-horas-somtec-backup.json", JSON.stringify(data, null, 2), "application/json");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1600);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function bindEvents() {
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => {
    $$(".tab").forEach((item) => item.classList.remove("active"));
    $$(".view").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    $(`#${tab.dataset.tab}`).classList.add("active");
  }));

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const { action, id, employee, task } = target.dataset;
    if (action === "open-start") openTaskDialog(employee, "timer");
    if (action === "pause") pauseRecord(id);
    if (action === "resume") resumeRecord(id);
    if (action === "finish") finishRecord(id);
    if (action === "delete-record") deleteRecord(id);
    if (action === "select-calendar-day") {
      selectedDate = target.dataset.date;
      historyMode = "day";
      renderHistory();
    }
    if (action === "open-add-employee") {
      configState = { employee: "__new__" };
      renderConfig();
    }
    if (action === "edit-employee") {
      configState = { employee: id };
      renderConfig();
    }
    if (action === "save-employee") saveEmployeeConfig(id);
    if (action === "delete-employee") {
      if (!confirm("Eliminar este trabajador y sus registros?")) return;
      data.employees = data.employees.filter((item) => item.id !== id);
      data.records = data.records.filter((item) => item.employeeId !== id);
      configState = {};
      saveData();
      renderFilters();
      render();
    }
    if (action === "open-add-task") {
      configState = { task: "__new__" };
      renderConfig();
    }
    if (action === "edit-task") {
      configState = { task };
      renderConfig();
    }
    if (action === "save-task") saveTaskConfig(task || "");
    if (action === "delete-task") {
      if (!confirm("Eliminar esta tarea y sus subtareas?")) return;
      delete data.tasks[task];
      configState = {};
      saveData();
      renderFilters();
      render();
    }
    if (action === "cancel-config") {
      configState = {};
      renderConfig();
    }
  });

  $("#manualEntryBtn").addEventListener("click", () => openTaskDialog("", "manual"));
  $("#cancelDialogBtn").addEventListener("click", closeTaskDialog);
  $("#taskDialogForm").addEventListener("submit", handleDialogSubmit);
  $("#dialogCategory").addEventListener("change", updateDialogTasks);
  $$(".period-tab").forEach((button) => button.addEventListener("click", () => {
    historyMode = button.dataset.period;
    syncSelectedDateFromPeriodInput();
    renderHistory();
  }));
  $("#periodDate").addEventListener("change", () => {
    selectedDate = $("#periodDate").value || selectedDate;
    renderHistory();
  });
  $("#periodWeek").addEventListener("change", () => {
    selectedDate = dateKey(startOfISOWeekInput($("#periodWeek").value));
    renderHistory();
  });
  $("#periodMonth").addEventListener("change", () => {
    const value = $("#periodMonth").value;
    if (value) selectedDate = `${value}-01`;
    renderHistory();
  });
  $("#periodYear").addEventListener("change", () => {
    const year = $("#periodYear").value || new Date().getFullYear();
    selectedDate = `${year}-01-01`;
    renderHistory();
  });
  $("#exportCsvBtn").addEventListener("click", exportCsv);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#configExportJsonBtn").addEventListener("click", exportJson);
  $("#importJsonInput").addEventListener("change", importJsonFromInput);
  $("#configImportJsonInput").addEventListener("change", importJsonFromInput);

  $("#resetDemoBtn").addEventListener("click", () => {
    if (!confirm("Reiniciar todos los datos locales?")) return;
    data = structuredClone(DEFAULT_DATA);
    configState = {};
    saveData();
    renderFilters();
    render();
  });
}

function saveEmployeeConfig(id) {
  const name = $("#configEmployeeName").value.trim();
  const role = $("#configEmployeeRole").value.trim();
  if (!name) {
    toast("El nombre es obligatorio");
    return;
  }
  if (id) {
    const employee = data.employees.find((item) => item.id === id);
    if (employee) {
      const oldName = employee.name;
      employee.name = name;
      employee.role = role;
      data.records.forEach((record) => {
        if (record.employeeId === id) record.employeeName = name || oldName;
      });
    }
  } else {
    data.employees.push({ id: uid("e"), name, role });
  }
  configState = {};
  saveData();
  renderFilters();
  render();
}

function saveTaskConfig(previousName) {
  const name = $("#configTaskName").value.trim();
  const subtasks = $("#configSubtasks").value.split("\n").map((item) => item.trim()).filter(Boolean);
  if (!name) {
    toast("La tarea principal es obligatoria");
    return;
  }
  if (previousName && previousName !== name) delete data.tasks[previousName];
  data.tasks[name] = subtasks;
  configState = {};
  saveData();
  renderFilters();
  updateDialogTasks();
  render();
}

async function importJsonFromInput(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;
    const imported = JSON.parse(await file.text());
    if (!imported.employees || !imported.tasks || !imported.records) {
      toast("Archivo JSON no valido");
      event.target.value = "";
      return;
    }
    data = imported;
    saveData();
    renderFilters();
    render();
    toast("Copia importada");
    event.target.value = "";
  } catch (error) {
    toast("No se pudo importar el archivo");
    event.target.value = "";
  }
}

renderFilters();
updateDialogTasks();
bindEvents();
render();
initRemoteSync();
setInterval(renderEmployeeGrid, 1000);
