const STORAGE_KEY = "somtec_hours_v1";

const DEFAULT_DATA = {
  employees: [
    { id: "e-julian", name: "Julian Cuenca", role: "CEO y Gerente" },
    { id: "e-salvador", name: "Salvador Bordoy", role: "Director Tecnico" },
    { id: "e-admin", name: "Administracion", role: "Oficina" },
    { id: "e-tecnico", name: "Tecnico Somtec", role: "Servicios tecnicos" }
  ],
  tasks: {
    Facturacion: ["Interna", "Externa", "Seguimiento cobros"],
    Proyectos: ["Planificacion", "Visita tecnica", "Presupuesto", "Seguimiento", "Entrega"],
    Servicios: ["Instalacion", "Mantenimiento", "Reparacion", "Soporte cliente"],
    Administracion: ["Compras", "Gestion interna", "Llamadas"],
    Comercial: ["Contacto cliente", "Propuesta", "Reunion", "Cierre"]
  },
  records: []
};

let data = loadData();
let dialogMode = "timer";
let editingEmployeeId = null;
let configState = {};

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

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  $("#storageStatus").textContent = "Guardado";
  setTimeout(() => { $("#storageStatus").textContent = "Local"; }, 900);
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
  $("#employeeFilter").innerHTML = `<option value="">Todos</option>` + data.employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join("");
  $("#categoryFilter").innerHTML = `<option value="">Todas</option>` + Object.keys(data.tasks).map((category) => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join("");
  $("#dialogEmployee").innerHTML = data.employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join("");
  $("#dialogCategory").innerHTML = Object.keys(data.tasks).map((category) => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join("");
}

function filteredHistory() {
  const employeeId = $("#employeeFilter").value;
  const category = $("#categoryFilter").value;
  const from = $("#fromFilter").value;
  const to = $("#toFilter").value;
  return completedRecords()
    .filter((record) => !employeeId || record.employeeId === employeeId)
    .filter((record) => !category || record.category === category)
    .filter((record) => !from || dateKey(record.startAt) >= from)
    .filter((record) => !to || dateKey(record.startAt) <= to)
    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
}

function renderHistory() {
  const rows = filteredHistory();
  $("#historyList").innerHTML = rows.map((record) => `<div class="table-row">
    <div><strong>${escapeHtml(record.employeeName)}</strong><small>${formatDateTime(record.startAt)}${record.manual ? " · manual" : ""}</small></div>
    <div><strong>${escapeHtml(record.project)}</strong><small>${escapeHtml(record.category)} / ${escapeHtml(record.task)}</small></div>
    <div class="hours">${recordHours(record).toFixed(2)} h</div>
    <div class="row-actions"><button class="danger" data-action="delete-record" data-id="${record.id}">Eliminar</button></div>
  </div>`).join("") || `<div class="empty">Sin registros para estos filtros.</div>`;
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
      <div></div><div></div>
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
      <div></div><div></div>
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
  ["employeeFilter", "categoryFilter", "fromFilter", "toFilter"].forEach((id) => $(`#${id}`).addEventListener("change", renderHistory));
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
setInterval(renderEmployeeGrid, 1000);
