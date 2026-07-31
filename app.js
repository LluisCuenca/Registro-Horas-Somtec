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
    Comercial: ["Contacto cliente", "Propuesta", "Reunión", "Cierre"]
  },
  records: []
};

let data = loadData();
let dialogMode = "timer";
let editingEmployeeId = null;
let configState = {};
let historyMode = "day";
let selectedDate = dateKey(new Date());
let rangeStartDate = selectedDate;
let rangeEndDate = selectedDate;
let historyEmployeeFilter = "all";
let historyTaskFilter = "all";
let historyTypeFilter = "all";
let remoteRef = null;
let applyingRemote = false;
let remoteSaveTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function loadData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isValidData(stored)) return normalizeData(stored);
  } catch (_) {}
  return clone(DEFAULT_DATA);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isValidData(value) {
  return value && Array.isArray(value.employees) && value.tasks && Array.isArray(value.records);
}

function normalizeData(value) {
  const normalized = {
    employees: Array.isArray(value.employees) ? value.employees : [],
    tasks: value.tasks && typeof value.tasks === "object" ? value.tasks : {},
    records: Array.isArray(value.records) ? value.records : []
  };
  normalized.records = normalized.records.map(normalizeRecord).filter(Boolean);
  Object.keys(normalized.tasks).forEach((task) => {
    if (!Array.isArray(normalized.tasks[task])) normalized.tasks[task] = [];
  });
  return normalized;
}

function normalizeRecord(record) {
  if (!record) return null;
  const startAt = record.startAt || record.startTime;
  if (!startAt) return null;
  const endAt = record.endAt ?? record.endTime ?? null;
  const type = record.type || (record.overtime ? "overtime" : record.category === "Vacaciones" ? "vacation" : "normal");
  const elapsedMs = Number.isFinite(Number(record.elapsedMs))
    ? Number(record.elapsedMs)
    : endAt
      ? Math.max(0, new Date(endAt) - new Date(startAt))
      : 0;
  return {
    id: String(record.id || uid("r")),
    employeeId: String(record.employeeId || ""),
    employeeName: record.employeeName || "Trabajador",
    category: record.category || typeLabel(type),
    project: record.project || record.categoryName || (type === "vacation" ? "Vacaciones" : "Proyecto"),
    task: record.task || record.subName || (type === "vacation" ? "Vacaciones" : "General"),
    type,
    startAt: new Date(startAt).toISOString(),
    endAt: endAt ? new Date(endAt).toISOString() : null,
    elapsedMs,
    lastStartedAt: record.lastStartedAt || (endAt ? null : new Date(startAt).toISOString()),
    running: Boolean(record.running && !endAt),
    pauses: Array.isArray(record.pauses) ? record.pauses : [],
    manual: Boolean(record.manual || type !== "normal"),
    overtime: type === "overtime"
  };
}

function saveData() {
  data = normalizeData(data);
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
  if (new URLSearchParams(window.location.search).get("localOnly") === "1") {
    setStorageStatus("Local");
    return;
  }
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
        data = normalizeData(remoteData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        renderFilters();
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

function dateFromKey(key) {
  return new Date(`${key}T12:00:00`);
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatClock(value) {
  return new Date(value).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function hoursFromMs(ms) {
  return ms / 3600000;
}

function msFromHours(hours) {
  return Math.round(Number(hours) * 3600000);
}

function currentElapsed(record) {
  return Number(record.elapsedMs || 0) + (record.running ? now() - new Date(record.lastStartedAt || record.startAt) : 0);
}

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function employeeAvatar(employee, className = "avatar") {
  if (employee.photo) {
    return `<img class="${className}" src="${escapeAttr(employee.photo)}" alt="${escapeAttr(employee.name)}">`;
  }
  return `<div class="${className} initials">${escapeHtml(initials(employee.name))}</div>`;
}

function getActiveRecord(employeeId) {
  return data.records.find((record) => record.employeeId === employeeId && !record.endAt) || null;
}

function completedRecords() {
  return data.records.filter((record) => record.endAt);
}

function recordHours(record) {
  return hoursFromMs(record.endAt ? Number(record.elapsedMs || 0) : currentElapsed(record));
}

function recordType(record) {
  return record.type || (record.overtime ? "overtime" : record.category === "Vacaciones" ? "vacation" : "normal");
}

function typeLabel(type) {
  if (type === "overtime") return "Horas extras";
  if (type === "vacation") return "Vacaciones";
  return "Horas normales";
}

function typeClass(type) {
  if (type === "overtime") return "overtime";
  if (type === "vacation") return "vacation";
  return "normal";
}

function activityLabel(record) {
  if (recordType(record) === "vacation") return "Vacaciones";
  return `${record.project || "Tarea"} / ${record.task || "Subtarea"}`;
}

function taskOptions(extra = "") {
  const options = Object.keys(data.tasks);
  if (extra && !options.includes(extra)) options.push(extra);
  return options;
}

function subtaskOptionsFor(taskName, extra = "") {
  const options = [...(data.tasks[taskName] || [])];
  if (extra && !options.includes(extra)) options.push(extra);
  if (!options.length) options.push("General");
  return options;
}

function setSelectOptions(select, options, selectedValue = "") {
  if (!select) return;
  const fallback = options[0] || "";
  const value = selectedValue && options.includes(selectedValue) ? selectedValue : fallback;
  select.innerHTML = options.map((option) => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join("");
  select.value = value;
}

function updateSubtaskSelect(taskSelectId, subtaskSelectId, selectedSubtask = "") {
  const taskSelect = $(`#${taskSelectId}`);
  const subtaskSelect = $(`#${subtaskSelectId}`);
  if (!taskSelect || !subtaskSelect) return;
  setSelectOptions(subtaskSelect, subtaskOptionsFor(taskSelect.value, selectedSubtask), selectedSubtask);
}

function startRecord(employeeId, project, task) {
  const employee = data.employees.find((item) => item.id === employeeId);
  if (!employee || getActiveRecord(employeeId)) return;
  const startedAt = now().toISOString();
  data.records.push({
    id: uid("r"),
    employeeId,
    employeeName: employee.name,
    category: "Horas normales",
    project,
    task,
    type: "normal",
    startAt: startedAt,
    endAt: null,
    elapsedMs: 0,
    lastStartedAt: startedAt,
    running: true,
    pauses: [],
    manual: false,
    overtime: false
  });
  saveData();
  render();
  toast("Entrada registrada");
}

function finishRecord(recordId) {
  const record = data.records.find((item) => item.id === recordId);
  if (!record || record.endAt) return;
  record.elapsedMs = currentElapsed(record);
  record.running = false;
  record.endAt = now().toISOString();
  const lastPause = record.pauses[record.pauses.length - 1];
  if (lastPause && !lastPause.end) lastPause.end = record.endAt;
  saveData();
  render();
  toast("Salida registrada");
}

function addManualRecord(employeeId, project, task, dateValue, startValue, hoursValue, type = "normal") {
  const employee = data.employees.find((item) => item.id === employeeId);
  const hours = Number(hoursValue);
  if (!employee || !dateValue || !startValue || !Number.isFinite(hours) || hours <= 0) return false;
  const startAt = new Date(`${dateValue}T${startValue}:00`);
  const elapsedMs = msFromHours(hours);
  data.records.push({
    id: uid("r"),
    employeeId,
    employeeName: employee.name,
    category: typeLabel(type),
    project: project || typeLabel(type),
    task: task || typeLabel(type),
    type,
    startAt: startAt.toISOString(),
    endAt: new Date(startAt.getTime() + elapsedMs).toISOString(),
    elapsedMs,
    lastStartedAt: null,
    running: false,
    pauses: [],
    manual: true,
    overtime: type === "overtime"
  });
  saveData();
  render();
  toast(type === "overtime" ? "Horas extras añadidas" : "Horas añadidas");
  return true;
}

function addVacationRecords(employeeId, fromValue, toValue, hoursValue) {
  const employee = data.employees.find((item) => item.id === employeeId);
  const hours = Number(hoursValue);
  if (!employee || !fromValue || !toValue || !Number.isFinite(hours) || hours <= 0) return false;
  const from = new Date(`${fromValue}T00:00:00`);
  const to = new Date(`${toValue}T00:00:00`);
  if (to < from) return false;
  let created = 0;
  for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const key = dateKey(day);
    addManualRecord(employeeId, "Vacaciones", "Vacaciones", key, "09:00", hours, "vacation");
    created += 1;
  }
  if (!created) toast("No hay dias laborables en ese rango");
  else toast("Vacaciones añadidas");
  return created > 0;
}

function updateRecord(recordId, values) {
  const record = data.records.find((item) => item.id === recordId);
  const employee = data.employees.find((item) => item.id === values.employeeId);
  const hours = Number(values.hours);
  if (!record || !employee || !values.date || !values.start || !Number.isFinite(hours) || hours <= 0) return false;
  const startAt = new Date(`${values.date}T${values.start}:00`);
  const elapsedMs = msFromHours(hours);
  record.employeeId = employee.id;
  record.employeeName = employee.name;
  record.type = values.type;
  record.category = typeLabel(values.type);
  record.project = values.project || typeLabel(values.type);
  record.task = values.task || typeLabel(values.type);
  record.startAt = startAt.toISOString();
  record.endAt = new Date(startAt.getTime() + elapsedMs).toISOString();
  record.elapsedMs = elapsedMs;
  record.lastStartedAt = null;
  record.running = false;
  record.manual = true;
  record.overtime = values.type === "overtime";
  saveData();
  render();
  toast("Registro actualizado");
  return true;
}

function deleteRecord(recordId) {
  if (!confirm("Eliminar este registro?")) return;
  data.records = data.records.filter((item) => item.id !== recordId);
  saveData();
  render();
}

function renderEmployeeGrid() {
  $("#employeeGrid").innerHTML = data.employees.map((employee) => {
    const active = getActiveRecord(employee.id);
    const timer = active ? formatTime(currentElapsed(active)) : "00:00:00";
    const state = active ? "running" : "";
    const week = weekTotalsForEmployee(employee.id);
    const task = active
      ? `${escapeHtml(active.project)}<br><strong>${escapeHtml(active.task)}</strong>`
      : "Sin entrada activa.";
    const buttons = active
      ? `<button class="full" data-action="finish" data-id="${active.id}">Registrar salida</button>`
      : `<button class="full" data-action="open-start" data-employee="${employee.id}">Registrar entrada</button>`;
    return `<article class="employee-card">
      <div class="employee-top">
        <div>
          <div class="employee-name">${escapeHtml(employee.name)}</div>
          <div class="employee-role">${escapeHtml(employee.role)}</div>
        </div>
        ${employeeAvatar(employee, "initials")}
      </div>
      <div class="state-dot ${state}"></div>
      <div class="timer">${timer}</div>
      <div class="task-line">${task}</div>
      <div class="week-mini">
        <span>${week.normal.toFixed(1)}h normales</span>
        <span>${week.overtime.toFixed(1)}h extras</span>
        <span>${week.vacation.toFixed(1)}h vacaciones</span>
      </div>
      <div class="card-actions">${buttons}</div>
    </article>`;
  }).join("") || `<div class="empty">Añade trabajadores en Configuración para empezar.</div>`;
}

function weekTotalsForEmployee(employeeId) {
  const from = startOfISOWeekInput(getWeekInputValue(new Date()));
  const to = endOfDay(addDays(from, 6));
  const totals = { normal: 0, overtime: 0, vacation: 0 };
  recordsInRange(from, to).filter((record) => record.employeeId === employeeId).forEach((record) => {
    totals[recordType(record)] += recordHours(record);
  });
  return totals;
}

function renderFilters(selected = {}) {
  const employeeOptions = data.employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`).join("");
  ["dialogEmployee", "editEmployee", "vacationEmployee"].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.innerHTML = employeeOptions;
  });

  const dialogTask = selected.dialogProject || $("#dialogProject")?.value || "";
  const editTask = selected.editProject || $("#editProject")?.value || "";
  setSelectOptions($("#dialogProject"), taskOptions(dialogTask), dialogTask);
  setSelectOptions($("#editProject"), taskOptions(editTask), editTask);
  updateSubtaskSelect("dialogProject", "dialogTask", selected.dialogTask || $("#dialogTask")?.value || "");
  updateSubtaskSelect("editProject", "editTask", selected.editTask || $("#editTask")?.value || "");
}

function taskNamesWithRecords(records = completedRecords()) {
  const names = new Set(Object.keys(data.tasks));
  records.forEach((record) => {
    if (recordType(record) === "vacation") names.add("Vacaciones");
    else if (record.project) names.add(record.project);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, "es"));
}

function recordMatchesHistoryFilters(record) {
  if (historyEmployeeFilter !== "all" && record.employeeId !== historyEmployeeFilter) return false;
  if (historyTypeFilter !== "all" && recordType(record) !== historyTypeFilter) return false;
  if (historyTaskFilter !== "all") {
    const taskName = recordType(record) === "vacation" ? "Vacaciones" : record.project;
    if (taskName !== historyTaskFilter) return false;
  }
  return true;
}

function applyHistoryFilters(records) {
  return records.filter(recordMatchesHistoryFilters);
}

function filteredHistory() {
  const { from, to } = getPeriodRange();
  return applyHistoryFilters(recordsInRange(from, to))
    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
}

function renderHistory() {
  renderPeriodControls();
  renderHistoryFilters();
  renderCalendar();
  renderPeriodPanel();
}

function renderHistoryFilters() {
  const wrap = $("#historyFilterBar");
  if (!wrap) return;
  if (historyEmployeeFilter !== "all" && !data.employees.some((employee) => employee.id === historyEmployeeFilter)) {
    historyEmployeeFilter = "all";
  }
  const taskNames = taskNamesWithRecords();
  if (historyTaskFilter !== "all" && !taskNames.includes(historyTaskFilter)) {
    historyTaskFilter = "all";
  }
  const employeeOptions = [
    `<option value="all">Todos los trabajadores</option>`,
    ...data.employees.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`)
  ].join("");
  const taskOptionsHtml = [
    `<option value="all">Todas las tareas</option>`,
    ...taskNames.map((task) => `<option value="${escapeAttr(task)}">${escapeHtml(task)}</option>`)
  ].join("");
  wrap.innerHTML = `<div class="history-filter-bar">
    <label>Trabajador<select id="historyEmployeeFilter">${employeeOptions}</select></label>
    <label>Tarea<select id="historyTaskFilter">${taskOptionsHtml}</select></label>
    <label>Tipo<select id="historyTypeFilter">
      <option value="all">Todos los tipos</option>
      <option value="normal">Horas normales</option>
      <option value="overtime">Horas extras</option>
      <option value="vacation">Vacaciones</option>
    </select></label>
  </div>`;
  $("#historyEmployeeFilter").value = historyEmployeeFilter;
  $("#historyTaskFilter").value = historyTaskFilter;
  $("#historyTypeFilter").value = historyTypeFilter;
}

function recordsInRange(from, to) {
  return completedRecords().filter((record) => {
    const started = new Date(record.startAt);
    return started >= from && started <= to;
  });
}

function getPeriodRange() {
  const selected = dateFromKey(selectedDate);
  if (historyMode === "range") {
    const startValue = rangeStartDate || selectedDate;
    const endValue = rangeEndDate || startValue;
    const fromKey = startValue <= endValue ? startValue : endValue;
    const toKey = startValue <= endValue ? endValue : startValue;
    const from = new Date(`${fromKey}T00:00:00`);
    const to = endOfDay(new Date(`${toKey}T00:00:00`));
    return { from, to, label: `${formatDateShort(from)} - ${formatDateShort(to)}` };
  }
  if (historyMode === "week") {
    const from = startOfISOWeekInput(getWeekInputValue(selected));
    const to = endOfDay(addDays(from, 6));
    return { from, to, label: `Semana ${getWeekInputValue(selected).split("-W")[1]} · ${formatDateShort(from)} - ${formatDateShort(to)}` };
  }
  if (historyMode === "month") {
    const from = new Date(selected.getFullYear(), selected.getMonth(), 1, 0, 0, 0, 0);
    const to = endOfDay(new Date(selected.getFullYear(), selected.getMonth() + 1, 0));
    return { from, to, label: from.toLocaleDateString("es-ES", { month: "long", year: "numeric" }) };
  }
  if (historyMode === "year") {
    const year = selected.getFullYear();
    return { from: new Date(year, 0, 1, 0, 0, 0, 0), to: endOfDay(new Date(year, 11, 31)), label: String(year) };
  }
  const from = new Date(`${selectedDate}T00:00:00`);
  const to = endOfDay(from);
  return { from, to, label: formatDateLong(from) };
}

function renderPeriodControls() {
  $$(".period-tab").forEach((button) => {
    const active = button.dataset.period === historyMode;
    button.classList.toggle("active", active);
    button.style.background = active ? "#38558e" : "#fff";
    button.style.color = active ? "#fff" : "var(--blue)";
  });
  $("#periodDateWrap").classList.toggle("hidden", historyMode !== "day");
  $("#periodWeekWrap").classList.toggle("hidden", historyMode !== "week");
  $("#periodMonthWrap").classList.toggle("hidden", historyMode !== "month");
  $("#periodYearWrap").classList.toggle("hidden", historyMode !== "year");
  $("#periodRangeWrap").classList.toggle("hidden", historyMode !== "range");
  const selected = dateFromKey(selectedDate);
  $("#periodDate").value = selectedDate;
  $("#periodWeek").value = getWeekInputValue(selected);
  $("#periodMonth").value = selectedDate.slice(0, 7);
  $("#periodYear").value = selected.getFullYear();
  $("#periodRangeStart").value = rangeStartDate || selectedDate;
  $("#periodRangeEnd").value = rangeEndDate || selectedDate;
}

function renderCalendar() {
  const wrap = $("#calendarWrap");
  if (!wrap) return;
  const selected = dateFromKey(selectedDate);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const range = getPeriodRange();
  const monthLabel = first.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  let html = `<div class="calendar-shell">
    <div class="calendar-titlebar">
      <button class="secondary" data-action="prev-calendar-month">Anterior</button>
      <strong>${escapeHtml(monthLabel)}</strong>
      <button class="secondary" data-action="next-calendar-month">Siguiente</button>
    </div>
    <div class="calendar-head">${DAY_NAMES.map((day) => `<div>${day}</div>`).join("")}</div>
    <div class="calendar-grid">`;
  for (let i = 0; i < 42; i += 1) {
    const day = addDays(gridStart, i);
    const key = dateKey(day);
    const rows = recordsInRange(new Date(`${key}T00:00:00`), endOfDay(day));
    const totals = totalsByType(rows);
    const total = rows.reduce((sum, record) => sum + recordHours(record), 0);
    const workerChips = summarizeByEmployee(rows).slice(0, 2).map((item) => `<span class="day-chip">${escapeHtml(initials(item.name))} ${item.hours.toFixed(1)}h</span>`).join("");
    const isSelected = day >= startOfDay(range.from) && day <= range.to;
    html += `<button class="calendar-day ${day.getMonth() !== month ? "muted-day" : ""} ${isSelected ? "selected" : ""}" data-action="select-calendar-day" data-date="${key}">
      <span class="day-number">${day.getDate()}</span>
      ${total ? `<span class="day-hours">${total.toFixed(1)}h</span>${workerChips}${calendarTypeDots(totals)}` : `<span class="day-hours">-</span>`}
    </button>`;
  }
  html += `</div></div>`;
  wrap.innerHTML = html;
}

function calendarTypeDots(totals) {
  const items = [
    ["normal", totals.normal],
    ["overtime", totals.overtime],
    ["vacation", totals.vacation]
  ].filter((item) => item[1] > 0);
  if (!items.length) return "";
  return `<span class="calendar-dots">${items.map(([type]) => `<span class="type-dot ${typeClass(type)}"></span>`).join("")}</span>`;
}

function renderPeriodPanel() {
  const panel = $("#periodPanel");
  const { from, to, label } = getPeriodRange();
  const allRows = recordsInRange(from, to).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  const rows = applyHistoryFilters(allRows);
  const totals = totalsByType(rows);
  const total = rows.reduce((sum, record) => sum + recordHours(record), 0);
  const activeDays = new Set(rows.map((record) => dateKey(record.startAt))).size;
  const periodDays = Math.max(1, Math.round((startOfDay(to) - startOfDay(from)) / 86400000) + 1);
  const averagePerActiveDay = activeDays ? total / activeDays : 0;
  const workerCards = data.employees.map((employee) => renderWorkerPeriodCard(employee, rows)).join("");
  panel.innerHTML = `<div class="period-panel">
    <div class="period-summary">
      <div class="period-metric period-label"><span class="muted">Periodo</span><strong>${escapeHtml(label)}</strong></div>
      <div class="period-metric"><span class="muted">Total</span><strong>${total.toFixed(2)} h</strong></div>
      <div class="period-metric"><span class="muted">Horas normales</span><strong>${totals.normal.toFixed(2)} h</strong></div>
      <div class="period-metric"><span class="muted">Horas extras</span><strong>${totals.overtime.toFixed(2)} h</strong></div>
      <div class="period-metric"><span class="muted">Vacaciones</span><strong>${totals.vacation.toFixed(2)} h</strong></div>
      <div class="period-metric"><span class="muted">Días con actividad</span><strong>${activeDays}/${periodDays}</strong></div>
      <div class="period-metric"><span class="muted">Media por día activo</span><strong>${averagePerActiveDay.toFixed(2)} h</strong></div>
    </div>
    ${renderWorkerTaskMatrix(rows)}
    ${renderTaskSummary(rows)}
    <section class="history-section">
      <div class="history-section-head">
        <div><h3>Detalle por trabajador</h3><p class="muted">Horas agrupadas por tarea y tipo dentro de la vista.</p></div>
      </div>
      <div class="worker-period-grid">${workerCards}</div>
    </section>
    ${renderRecordLedger(rows)}
  </div>`;
}

function totalsByType(records) {
  const totals = { normal: 0, overtime: 0, vacation: 0 };
  records.forEach((record) => {
    totals[recordType(record)] = (totals[recordType(record)] || 0) + recordHours(record);
  });
  return totals;
}

function renderWorkerPeriodCard(employee, periodRecords) {
  const rows = periodRecords.filter((record) => record.employeeId === employee.id);
  const total = rows.reduce((sum, record) => sum + recordHours(record), 0);
  const totals = totalsByType(rows);
  const breakdown = new Map();
  rows.forEach((record) => {
    const type = recordType(record);
    const key = type === "vacation" ? "Vacaciones" : `${record.project || "Proyecto"} / ${record.task || "Subtarea"}`;
    const item = breakdown.get(key) || { hours: 0, type };
    item.hours += recordHours(record);
    breakdown.set(key, item);
  });
  const breakdownRows = Array.from(breakdown.entries())
    .sort((a, b) => b[1].hours - a[1].hours)
    .map(([label, item]) => `<div class="breakdown-row">
      <span><strong>${escapeHtml(label)}</strong><br><span class="type-pill ${typeClass(item.type)}">${escapeHtml(typeLabel(item.type))}</span></span>
      <span class="breakdown-hours">${item.hours.toFixed(2)}h</span>
    </div>`)
    .join("") || `<div class="muted">Sin horas registradas en este periodo.</div>`;
  return `<article class="worker-period-card">
    <div class="worker-period-head">
      <div><strong>${escapeHtml(employee.name)}</strong><br><span class="muted">${escapeHtml(employee.role)}</span></div>
      <div class="worker-period-total">${total.toFixed(1)}h</div>
    </div>
    <div class="worker-type-totals">
      <span>${totals.normal.toFixed(1)}h normales</span>
      <span>${totals.overtime.toFixed(1)}h extras</span>
      <span>${totals.vacation.toFixed(1)}h vacaciones</span>
    </div>
    <div class="breakdown-list">${breakdownRows}</div>
  </article>`;
}

function renderWorkerTaskMatrix(records) {
  const employees = data.employees.filter((employee) => historyEmployeeFilter === "all" || employee.id === historyEmployeeFilter);
  const taskNames = taskNamesWithRecords(records);
  if (!records.length) {
    return `<section class="history-section">
      <div class="history-section-head"><div><h3>Matriz trabajador × tarea</h3><p class="muted">Sin datos para la vista actual.</p></div></div>
    </section>`;
  }
  const headerCells = taskNames.map((task) => `<th>${escapeHtml(task)}</th>`).join("");
  const rows = employees.map((employee) => {
    const employeeRows = records.filter((record) => record.employeeId === employee.id);
    const total = employeeRows.reduce((sum, record) => sum + recordHours(record), 0);
    const cells = taskNames.map((task) => {
      const hours = employeeRows
        .filter((record) => (recordType(record) === "vacation" ? "Vacaciones" : record.project) === task)
        .reduce((sum, record) => sum + recordHours(record), 0);
      return `<td>${hours ? hours.toFixed(2) : "-"}</td>`;
    }).join("");
    return `<tr><th>${escapeHtml(employee.name)}</th>${cells}<td class="matrix-total">${total.toFixed(2)}</td></tr>`;
  }).join("");
  const footerTotal = records.reduce((sum, record) => sum + recordHours(record), 0);
  const footerCells = taskNames.map((task) => {
    const hours = records
      .filter((record) => (recordType(record) === "vacation" ? "Vacaciones" : record.project) === task)
      .reduce((sum, record) => sum + recordHours(record), 0);
    return `<td>${hours ? hours.toFixed(2) : "-"}</td>`;
  }).join("");
  return `<section class="history-section">
    <div class="history-section-head">
      <div><h3>Matriz trabajador × tarea</h3><p class="muted">Vista cruzada para comparar carga de trabajo por persona y tarea.</p></div>
    </div>
    <div class="matrix-scroll">
      <table class="history-matrix">
        <thead><tr><th>Trabajador</th>${headerCells}<th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th>Total</th>${footerCells}<td class="matrix-total">${footerTotal.toFixed(2)}</td></tr></tfoot>
      </table>
    </div>
  </section>`;
}

function renderTaskSummary(records) {
  const byTask = new Map();
  records.forEach((record) => {
    const taskName = recordType(record) === "vacation" ? "Vacaciones" : record.project || "Sin tarea";
    const subtask = recordType(record) === "vacation" ? "Vacaciones" : record.task || "Sin subtarea";
    const item = byTask.get(taskName) || { hours: 0, subtasks: new Map(), types: { normal: 0, overtime: 0, vacation: 0 } };
    const hours = recordHours(record);
    item.hours += hours;
    item.subtasks.set(subtask, (item.subtasks.get(subtask) || 0) + hours);
    item.types[recordType(record)] += hours;
    byTask.set(taskName, item);
  });
  const cards = Array.from(byTask.entries())
    .sort((a, b) => b[1].hours - a[1].hours)
    .map(([task, item]) => {
      const subRows = Array.from(item.subtasks.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([subtask, hours]) => `<div class="task-subrow"><span>${escapeHtml(subtask)}</span><strong>${hours.toFixed(2)}h</strong></div>`)
        .join("");
      return `<article class="task-summary-card">
        <div class="task-summary-top"><h4>${escapeHtml(task)}</h4><strong>${item.hours.toFixed(2)}h</strong></div>
        <div class="worker-type-totals">
          <span>${item.types.normal.toFixed(1)}h normales</span>
          <span>${item.types.overtime.toFixed(1)}h extras</span>
          <span>${item.types.vacation.toFixed(1)}h vacaciones</span>
        </div>
        <div class="task-sublist">${subRows}</div>
      </article>`;
    }).join("") || `<div class="empty">Sin tareas en esta vista.</div>`;
  return `<section class="history-section">
    <div class="history-section-head">
      <div><h3>Resumen por tarea</h3><p class="muted">Horas repartidas por tarea y subtarea.</p></div>
    </div>
    <div class="task-summary-grid">${cards}</div>
  </section>`;
}

function renderRecordLedger(records) {
  const rows = records
    .slice()
    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt))
    .map(renderRecordRow)
    .join("") || `<div class="empty">Sin registros en esta vista.</div>`;
  return `<section class="history-section">
    <div class="history-section-head">
      <div><h3>Registros editables</h3><p class="muted">Listado completo del periodo para corregir o eliminar entradas.</p></div>
    </div>
    <div class="record-list ledger-list">${rows}</div>
  </section>`;
}

function renderRecordRow(record) {
  const type = recordType(record);
  return `<div class="record-row">
    <div>
      <div class="record-title">${escapeHtml(activityLabel(record))}</div>
      <div class="record-meta">${escapeHtml(typeLabel(type))} · ${formatDateShort(new Date(record.startAt))} · ${formatClock(record.startAt)} - ${formatClock(record.endAt)}</div>
    </div>
    <div class="record-actions">
      <span class="hours">${recordHours(record).toFixed(2)}h</span>
      <button class="secondary" data-action="edit-record" data-id="${record.id}">Editar</button>
      <button class="danger" data-action="delete-record" data-id="${record.id}">Eliminar</button>
    </div>
  </div>`;
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

function shiftCalendarMonth(delta) {
  const selected = dateFromKey(selectedDate);
  const desiredDay = selected.getDate();
  const next = new Date(selected.getFullYear(), selected.getMonth() + delta, 1, 12, 0, 0, 0);
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(desiredDay, maxDay));
  selectedDate = dateKey(next);
  renderHistory();
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

function renderConfig() {
  $("#configEmployees").innerHTML = renderEmployeesConfig();
  $("#configTasks").innerHTML = renderTasksConfig();
}

function renderEmployeesConfig() {
  const rows = data.employees.map((employee) => {
    if (configState.employee === employee.id) return employeeEditorRow(employee);
    return `<div class="table-row">
      <div class="employee-config-summary">
        ${employeeAvatar(employee, "config-avatar")}
        <div><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.role)}</small></div>
      </div>
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
  const photo = configState.employeePhoto ?? employee.photo ?? "";
  return `<div class="table-row edit-row">
    <div class="photo-editor">
      ${photo ? `<img id="configEmployeePhotoPreview" class="profile-preview" src="${escapeAttr(photo)}" alt="">` : `<div id="configEmployeePhotoPreview" class="profile-preview empty-preview">${escapeHtml(initials(employee.name || "Nuevo"))}</div>`}
      <div class="photo-actions">
        <label class="secondary file-label photo-label">Subir foto<input id="configEmployeePhoto" type="file" accept="image/*"></label>
        <button type="button" class="secondary" data-action="remove-employee-photo">Quitar foto</button>
      </div>
    </div>
    <div class="edit-grid">
      <label>Nombre<input id="configEmployeeName" value="${escapeAttr(employee.name || "")}" placeholder="Nombre y apellidos"></label>
      <label>Puesto<input id="configEmployeeRole" value="${escapeAttr(employee.role || "")}" placeholder="Técnico, oficina..."></label>
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
      <label>Tarea principal<input id="configTaskName" value="${escapeAttr(task)}" placeholder="Facturación"></label>
      <label>Subtareas, una por línea<textarea id="configSubtasks" placeholder="Interna&#10;Externa">${escapeHtml(subtasks.join("\n"))}</textarea></label>
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

function openTaskDialog(employeeId = "", mode = "timer") {
  dialogMode = mode;
  editingEmployeeId = employeeId;
  $("#taskDialogForm").reset();
  const isManual = mode !== "timer";
  $("#dialogMode").textContent = mode === "overtime" ? "Horas extras" : isManual ? "Ajuste manual" : "Entrada";
  $("#dialogTitle").textContent = mode === "overtime" ? "Añadir horas extras" : isManual ? "Añadir horas trabajadas" : "Registrar entrada";
  $("#confirmTaskBtn").textContent = mode === "overtime" ? "Guardar extras" : isManual ? "Guardar horas" : "Registrar entrada";
  $("#manualFields").classList.toggle("active", isManual);
  $("#dialogEmployeeWrap").classList.toggle("hidden", !isManual);
  $("#dialogEmployee").disabled = Boolean(employeeId);
  $("#dialogEmployee").value = employeeId || data.employees[0]?.id || "";
  $("#dialogEmployeeId").value = employeeId;
  $("#manualDate").value = selectedDate || dateKey(now());
  $("#manualStart").value = "09:00";
  $("#manualHours").value = mode === "overtime" ? "1" : "";
  renderFilters();
  $("#taskDialog").showModal();
}

function closeTaskDialog() {
  $("#taskDialog").close();
  $("#dialogEmployee").disabled = false;
}

function handleDialogSubmit(event) {
  event.preventDefault();
  const employeeId = editingEmployeeId || $("#dialogEmployee").value;
  const project = $("#dialogProject").value.trim();
  const task = $("#dialogTask").value.trim();
  if (!employeeId || !project || !task) return;
  if (dialogMode === "manual" || dialogMode === "overtime") {
    const type = dialogMode === "overtime" ? "overtime" : "normal";
    if (!addManualRecord(employeeId, project, task, $("#manualDate").value, $("#manualStart").value, $("#manualHours").value, type)) {
      toast("Revisa fecha, hora y duración");
      return;
    }
  } else {
    startRecord(employeeId, project, task);
  }
  closeTaskDialog();
}

function openVacationDialog() {
  $("#vacationDialogForm").reset();
  renderFilters();
  $("#vacationEmployee").value = data.employees[0]?.id || "";
  $("#vacationFrom").value = selectedDate || dateKey(now());
  $("#vacationTo").value = selectedDate || dateKey(now());
  $("#vacationHours").value = "8";
  $("#vacationDialog").showModal();
}

function closeVacationDialog() {
  $("#vacationDialog").close();
}

function handleVacationSubmit(event) {
  event.preventDefault();
  if (!addVacationRecords($("#vacationEmployee").value, $("#vacationFrom").value, $("#vacationTo").value, $("#vacationHours").value)) {
    toast("Revisa las vacaciones");
    return;
  }
  closeVacationDialog();
}

function openRecordDialog(recordId) {
  const record = data.records.find((item) => item.id === recordId);
  if (!record || !record.endAt) return;
  renderFilters({ editProject: record.project || "", editTask: record.task || "" });
  $("#editRecordId").value = record.id;
  $("#editEmployee").value = record.employeeId;
  $("#editType").value = recordType(record);
  $("#editProject").value = record.project || "";
  updateSubtaskSelect("editProject", "editTask", record.task || "");
  $("#editDate").value = dateKey(record.startAt);
  $("#editStart").value = new Date(record.startAt).toTimeString().slice(0, 5);
  $("#editHours").value = recordHours(record).toFixed(2);
  $("#recordDialog").showModal();
}

function closeRecordDialog() {
  $("#recordDialog").close();
}

function handleRecordSubmit(event) {
  event.preventDefault();
  const ok = updateRecord($("#editRecordId").value, {
    employeeId: $("#editEmployee").value,
    type: $("#editType").value,
    project: $("#editProject").value.trim(),
    task: $("#editTask").value.trim(),
    date: $("#editDate").value,
    start: $("#editStart").value,
    hours: $("#editHours").value
  });
  if (ok) closeRecordDialog();
  else toast("Revisa el registro");
}

function readProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const size = 320;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = size;
        canvas.height = size;
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const x = (size - width) / 2;
        const y = (size - height) / 2;
        context.drawImage(image, x, y, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleEmployeePhotoChange(file) {
  if (!file) return;
  try {
    const photo = await readProfilePhoto(file);
    configState.employeePhoto = photo;
    const preview = $("#configEmployeePhotoPreview");
    if (preview) {
      preview.outerHTML = `<img id="configEmployeePhotoPreview" class="profile-preview" src="${escapeAttr(photo)}" alt="">`;
    }
    toast("Foto preparada");
  } catch (error) {
    toast("No se pudo cargar la foto");
  }
}

function exportCsv() {
  downloadRecordsCsv("registro-horas-somtec-vista.csv", filteredHistory());
}

function exportRangeCsv() {
  const startValue = rangeStartDate || selectedDate;
  const endValue = rangeEndDate || startValue;
  const fromKey = startValue <= endValue ? startValue : endValue;
  const toKey = startValue <= endValue ? endValue : startValue;
  const from = new Date(`${fromKey}T00:00:00`);
  const to = endOfDay(new Date(`${toKey}T00:00:00`));
  const rows = applyHistoryFilters(recordsInRange(from, to))
    .sort((a, b) => new Date(b.startAt) - new Date(a.startAt));
  downloadRecordsCsv(`registro-horas-somtec-${fromKey}-${toKey}.csv`, rows);
}

function downloadRecordsCsv(filename, records) {
  const header = ["trabajador", "tipo", "tarea", "subtarea", "inicio", "fin", "horas", "manual"];
  const lines = records.map((record) => [
    record.employeeName,
    typeLabel(recordType(record)),
    recordType(record) === "vacation" ? "Vacaciones" : record.project,
    record.task,
    record.startAt,
    record.endAt,
    recordHours(record).toFixed(2),
    record.manual ? "si" : "no"
  ]);
  downloadFile(filename, [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv");
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
    if (action === "finish") finishRecord(id);
    if (action === "delete-record") deleteRecord(id);
    if (action === "edit-record") openRecordDialog(id);
    if (action === "prev-calendar-month") shiftCalendarMonth(-1);
    if (action === "next-calendar-month") shiftCalendarMonth(1);
    if (action === "select-calendar-day") {
      selectedDate = target.dataset.date;
      historyMode = "day";
      renderHistory();
    }
    if (action === "open-add-employee") {
      configState = { employee: "__new__", employeePhoto: "" };
      renderConfig();
    }
    if (action === "edit-employee") {
      const employeeData = data.employees.find((item) => item.id === id);
      configState = { employee: id, employeePhoto: employeeData?.photo || "" };
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
    if (action === "remove-employee-photo") {
      configState.employeePhoto = "";
      renderConfig();
    }
  });

  document.body.addEventListener("change", (event) => {
    if (event.target.id === "configEmployeePhoto") handleEmployeePhotoChange(event.target.files?.[0]);
    if (event.target.id === "historyEmployeeFilter") {
      historyEmployeeFilter = event.target.value;
      renderHistory();
    }
    if (event.target.id === "historyTaskFilter") {
      historyTaskFilter = event.target.value;
      renderHistory();
    }
    if (event.target.id === "historyTypeFilter") {
      historyTypeFilter = event.target.value;
      renderHistory();
    }
  });

  $("#manualEntryBtn").addEventListener("click", () => openTaskDialog("", "manual"));
  $("#overtimeBtn").addEventListener("click", () => openTaskDialog("", "overtime"));
  $("#vacationBtn").addEventListener("click", openVacationDialog);
  $("#cancelDialogBtn").addEventListener("click", closeTaskDialog);
  $("#taskDialogForm").addEventListener("submit", handleDialogSubmit);
  $("#dialogProject").addEventListener("change", () => updateSubtaskSelect("dialogProject", "dialogTask"));
  $("#cancelVacationDialogBtn").addEventListener("click", closeVacationDialog);
  $("#vacationDialogForm").addEventListener("submit", handleVacationSubmit);
  $("#cancelRecordDialogBtn").addEventListener("click", closeRecordDialog);
  $("#recordDialogForm").addEventListener("submit", handleRecordSubmit);
  $("#editProject").addEventListener("change", () => updateSubtaskSelect("editProject", "editTask"));
  $$(".period-tab").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.period === "range" && historyMode !== "range") {
      rangeStartDate = selectedDate;
      rangeEndDate = selectedDate;
    }
    historyMode = button.dataset.period;
    renderHistory();
  }));
  $("#periodDate").addEventListener("change", () => {
    selectedDate = $("#periodDate").value || selectedDate;
    renderHistory();
  });
  $("#periodWeek").addEventListener("change", () => {
    const value = $("#periodWeek").value;
    if (value) selectedDate = dateKey(startOfISOWeekInput(value));
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
  $("#periodRangeStart").addEventListener("change", () => {
    rangeStartDate = $("#periodRangeStart").value || rangeStartDate;
    selectedDate = rangeStartDate || selectedDate;
    renderHistory();
  });
  $("#periodRangeEnd").addEventListener("change", () => {
    rangeEndDate = $("#periodRangeEnd").value || rangeEndDate;
    renderHistory();
  });
  $("#exportCsvBtn").addEventListener("click", exportCsv);
  $("#exportRangeCsvBtn").addEventListener("click", exportRangeCsv);
  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#configExportJsonBtn").addEventListener("click", exportJson);
  $("#importJsonInput").addEventListener("change", importJsonFromInput);
  $("#configImportJsonInput").addEventListener("change", importJsonFromInput);

  $("#resetDemoBtn").addEventListener("click", () => {
    if (!confirm("Reiniciar todos los datos locales?")) return;
    data = clone(DEFAULT_DATA);
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
      employee.photo = configState.employeePhoto || "";
      data.records.forEach((record) => {
        if (record.employeeId === id) record.employeeName = name || oldName;
      });
    }
  } else {
    data.employees.push({ id: uid("e"), name, role, photo: configState.employeePhoto || "" });
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
  render();
}

async function importJsonFromInput(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;
    const imported = JSON.parse(await file.text());
    if (!isValidData(imported)) {
      toast("Archivo JSON no válido");
      event.target.value = "";
      return;
    }
    data = normalizeData(imported);
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
bindEvents();
render();
initRemoteSync();
setInterval(renderEmployeeGrid, 1000);
