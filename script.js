/* ========================================
   CONSTANTS & CONFIGURATION
   ======================================== */

const STORAGE_KEY = "choreSchedulerData_v1";
const SAME_CHORE_COOLDOWN_DAYS = 7; // Rule 2: same chore within a week
const CONSECUTIVE_ASSIGNMENT_LIMIT = 2; // Rule 1: no 3 days in a row
const HISTORY_RETENTION_DAYS = 30;

/* ========================================
   UTILITY FUNCTIONS
   ======================================== */

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = getLocalDateString();

function showError(message) {
  const el = document.getElementById("warning");
  if (el) {
    el.textContent = message;
    el.style.color = "";
    el.style.background = "";
    el.style.borderColor = "";
  }
}

function showSuccess(message) {
  const el = document.getElementById("warning");
  if (el) {
    el.textContent = message;
    el.style.color = "#15803d";
    el.style.background = "#dcfce7";
    el.style.borderColor = "#86efac";
    setTimeout(() => {
      el.textContent = "";
      el.style.color = "";
      el.style.background = "";
      el.style.borderColor = "";
    }, 3000);
  }
}

function clearError() {
  const el = document.getElementById("warning");
  if (el) {
    el.textContent = "";
    el.style.color = "";
    el.style.background = "";
    el.style.borderColor = "";
  }
}

/* ========================================
   STORAGE FUNCTIONS
   ======================================== */

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const data = stored ? JSON.parse(stored) : {};
    return {
      meta: data.meta || {},
      chores: data.chores || [],
      people: data.people || [],
      assignmentsByDate: data.assignmentsByDate || {},
      // inactiveChoreIds: set of chore IDs that are toggled OFF
      inactiveChoreIds: data.inactiveChoreIds || []
    };
  } catch (error) {
    console.error("Error loading data:", error);
    showError("Error loading data. Please refresh the page.");
    return { meta: {}, chores: [], people: [], assignmentsByDate: {}, inactiveChoreIds: [] };
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving data:", error);
    showError("Error saving data. Your changes may not persist.");
  }
}

/* ========================================
   HISTORY HELPERS
   ======================================== */

function getPastDatesWithAssignments(data, beforeDate) {
  return Object.keys(data.assignmentsByDate)
    .filter(d => d < beforeDate && Object.keys(data.assignmentsByDate[d]?.assignments || {}).length > 0)
    .sort()
    .reverse();
}

/**
 * Rule 1: Returns true if person worked the last CONSECUTIVE_ASSIGNMENT_LIMIT days.
 */
function workedConsecutiveDays(data, personId, beforeDate) {
  const dates = getPastDatesWithAssignments(data, beforeDate);
  if (dates.length < CONSECUTIVE_ASSIGNMENT_LIMIT) return false;
  const lastN = dates.slice(0, CONSECUTIVE_ASSIGNMENT_LIMIT);
  return lastN.every(d =>
    Object.values(data.assignmentsByDate[d]?.assignments || {}).includes(personId)
  );
}

/**
 * Rule 2: Returns true if person did this specific chore within the last N days.
 */
function didChoreThisWeek(data, personId, choreId, beforeDate) {
  const dates = getPastDatesWithAssignments(data, beforeDate);
  const recentDays = dates.slice(0, SAME_CHORE_COOLDOWN_DAYS);
  return recentDays.some(d =>
    data.assignmentsByDate[d]?.assignments?.[choreId] === personId
  );
}

/* ========================================
   DATA NORMALIZATION
   ======================================== */

function getMostRecentDay(data, beforeDate) {
  const dates = Object.keys(data.assignmentsByDate)
    .filter(d => d < beforeDate).sort().reverse();
  return dates.length ? data.assignmentsByDate[dates[0]] : null;
}

function normalizeAvailability(data, date) {
  let day = data.assignmentsByDate[date];
  if (!day) {
    const lastDay = getMostRecentDay(data, date);
    day = data.assignmentsByDate[date] = {
      availablePersonIds: (lastDay?.availablePersonIds?.length) ? [...lastDay.availablePersonIds] : [],
      assignments: {},
      confirmed: false
    };
    return day;
  }
  if (!Array.isArray(day.availablePersonIds)) day.availablePersonIds = [];
  if (day.availablePersonIds.length === 0) {
    const lastDay = getMostRecentDay(data, date);
    if (lastDay?.availablePersonIds?.length) day.availablePersonIds = [...lastDay.availablePersonIds];
  }
  day.availablePersonIds = day.availablePersonIds.filter(pid => data.people.some(p => p.id === pid));
  return day;
}

/* ========================================
   RENDERING
   ======================================== */

function renderAll() {
  const data = loadData();
  renderChoreList(data);
  renderPersonList(data);
  renderAvailability();
  renderAssignments();
}

/**
 * Renders chore list with active/inactive toggles (Rule 4).
 */
function renderChoreList(data) {
  const ul = document.getElementById("choreList");
  if (!ul) return;
  ul.innerHTML = "";

  data.chores.forEach(chore => {
    const isActive = !data.inactiveChoreIds.includes(chore.id);
    const li = document.createElement("li");
    if (!isActive) li.classList.add("chore-inactive");

    // Toggle switch (Rule 4)
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "toggle";
    toggle.checked = isActive;
    toggle.title = isActive ? "Active — click to disable" : "Inactive — click to enable";
    toggle.onchange = () => {
      const d = loadData();
      if (toggle.checked) {
        d.inactiveChoreIds = d.inactiveChoreIds.filter(id => id !== chore.id);
      } else {
        if (!d.inactiveChoreIds.includes(chore.id)) d.inactiveChoreIds.push(chore.id);
      }
      saveData(d);
      renderAll();
    };

    // Name input
    const input = document.createElement("input");
    input.type = "text";
    input.value = chore.name;
    input.size = Math.max(chore.name.length, 8);
    input.onchange = () => {
      const trimmed = input.value.trim();
      if (!trimmed) { showError("Name cannot be empty."); input.value = chore.name; return; }
      renameChore(chore.id, trimmed);
    };
    input.oninput = () => { input.size = Math.max(input.value.length, 8); };

    const btn = document.createElement("button");
    btn.textContent = "✖";
    btn.onclick = () => { if (confirm(`Delete "${chore.name}"?`)) deleteChore(chore.id); };

    li.append(toggle, input, btn);
    ul.appendChild(li);
  });
}

/**
 * Renders people list.
 */
function renderPersonList(data) {
  const ul = document.getElementById("personList");
  if (!ul) return;
  ul.innerHTML = "";

  data.people.forEach(person => {
    const li = document.createElement("li");

    const input = document.createElement("input");
    input.type = "text";
    input.value = person.name;
    input.size = Math.max(person.name.length, 8);
    input.onchange = () => {
      const trimmed = input.value.trim();
      if (!trimmed) { showError("Name cannot be empty."); input.value = person.name; return; }
      renamePerson(person.id, trimmed);
    };
    input.oninput = () => { input.size = Math.max(input.value.length, 8); };

    const btn = document.createElement("button");
    btn.textContent = "✖";
    btn.onclick = () => { if (confirm(`Delete "${person.name}"?`)) deletePerson(person.id); };

    li.append(input, btn);
    ul.appendChild(li);
  });
}

function renderList(id, items, renameFn, deleteFn) {
  // Legacy helper used externally — route through new renderers
  const data = loadData();
  if (id === "choreList") renderChoreList(data);
  else if (id === "personList") renderPersonList(data);
}

function renderAvailability() {
  const data = loadData();
  const ul = document.getElementById("availabilityList");
  if (!ul) return;
  ul.innerHTML = "";
  const day = normalizeAvailability(data, today);
  saveData(data);

  data.people.forEach(p => {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = day.availablePersonIds.includes(p.id);
    cb.onchange = () => toggleAvailability(p.id, cb.checked);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = p.name;
    nameSpan.style.flex = "1";

    li.append(nameSpan, cb);
    ul.appendChild(li);
  });
}

/**
 * Renders assignment selects with colored option highlights (Rules 1, 2, 3).
 */
function renderAssignments() {
  const data = loadData();
  const div = document.getElementById("assignments");
  if (!div) return;
  div.innerHTML = "";

  const day = data.assignmentsByDate[today];
  if (!day) return;

  // Only show active chores (Rule 4)
  const activeChores = data.chores.filter(c => !data.inactiveChoreIds.includes(c.id));

  // Rule 3: find available people who have no chore assigned today
  const assignedPersonIds = new Set(Object.values(day.assignments || {}));

  activeChores.forEach(chore => {
    const row = document.createElement("div");
    row.className = "assignment";

    const label = document.createElement("strong");
    label.textContent = chore.name;

    const select = document.createElement("select");

    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "— Select —";
    select.appendChild(emptyOpt);

    const assignedPersonId = day.assignments?.[chore.id];

    data.people.forEach(p => {
      const isAssigned = assignedPersonId === p.id;
      const isAvailable = day.availablePersonIds.includes(p.id);
      if (!isAvailable && !isAssigned) return;

      const opt = document.createElement("option");
      opt.value = p.id;
      opt.selected = isAssigned;

      // Rule 1: would be 3rd consecutive day
      const tooManyDays = workedConsecutiveDays(data, p.id, today);
      // Rule 2: did this exact chore this week
      const repeatedChore = didChoreThisWeek(data, p.id, chore.id, today);
      // Rule 3: available but no chore yet
      const freeAndAvailable = isAvailable && !assignedPersonIds.has(p.id) && !isAssigned;

      let label_text = p.name;
      if (!isAvailable && isAssigned) label_text += " (unavailable)";
      else if (freeAndAvailable) label_text += " (available)";

      opt.textContent = label_text;

      if (tooManyDays) {
        opt.className = "opt-red";
        opt.textContent += " ⚠ 2 days in a row";
      } else if (repeatedChore) {
        opt.className = "opt-yellow";
        opt.textContent += " ⚠ did this recently";
      } else if (freeAndAvailable) {
        opt.className = "opt-green";
      }

      select.appendChild(opt);
    });

    // Status badge next to select for the currently assigned person
    let statusBadge = null;
    if (assignedPersonId) {
      const tooManyDays = workedConsecutiveDays(data, assignedPersonId, today);
      const repeatedChore = didChoreThisWeek(data, assignedPersonId, chore.id, today);
      if (tooManyDays) {
        statusBadge = document.createElement("span");
        statusBadge.className = "assign-status red";
        statusBadge.textContent = "2 days in a row";
      } else if (repeatedChore) {
        statusBadge = document.createElement("span");
        statusBadge.className = "assign-status yellow";
        statusBadge.textContent = "repeated chore";
      }
    }

    select.onchange = () => {
      const personId = select.value;
      if (!personId) {
        delete day.assignments[chore.id];
        saveData(data);
        renderAssignments();
        return;
      }
      if (!day.availablePersonIds.includes(personId)) {
        showError("This person is marked unavailable.");
        renderAssignments();
        return;
      }
      const alreadyAssigned = Object.entries(day.assignments)
        .filter(([cId, pId]) => pId === personId && cId !== chore.id).length;
      if (alreadyAssigned >= 1) {
        showError("This person already has a chore today.");
        renderAssignments();
        return;
      }
      clearError();
      day.assignments[chore.id] = personId;
      saveData(data);
      renderAssignments();
    };

    row.append(label, select);
    if (statusBadge) row.appendChild(statusBadge);
    div.appendChild(row);
  });
}

/* ========================================
   CRUD OPERATIONS
   ======================================== */

function addChore(choreName = null) {
  const name = choreName || document.getElementById("newChore")?.value;
  const trimmed = name?.trim();
  if (!trimmed) { showError("Chore name cannot be empty."); return; }
  const data = loadData();
  if (data.chores.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
    showError("A chore with this name already exists."); return;
  }
  data.chores.push({ id: uuid(), name: trimmed });
  saveData(data);
  const input = document.getElementById("newChore");
  if (input) input.value = "";
  clearError();
  renderAll();
}

function addPerson(personName = null) {
  const name = personName || document.getElementById("newPerson")?.value;
  const trimmed = name?.trim();
  if (!trimmed) { showError("Person name cannot be empty."); return; }
  const data = loadData();
  if (data.people.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
    showError("A person with this name already exists."); return;
  }
  data.people.push({ id: uuid(), name: trimmed });
  saveData(data);
  const input = document.getElementById("newPerson");
  if (input) input.value = "";
  clearError();
  renderAll();
}

function renameChore(id, name) {
  const data = loadData();
  const chore = data.chores.find(c => c.id === id);
  if (!chore) return;
  const trimmed = name.trim();
  if (!trimmed) { showError("Chore name cannot be empty."); renderAll(); return; }
  if (data.chores.some(c => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) {
    showError("A chore with this name already exists."); renderAll(); return;
  }
  chore.name = trimmed;
  saveData(data);
  clearError();
  renderAssignments();
}

function renamePerson(id, name) {
  const data = loadData();
  const person = data.people.find(p => p.id === id);
  if (!person) return;
  const trimmed = name.trim();
  if (!trimmed) { showError("Person name cannot be empty."); renderAll(); return; }
  if (data.people.some(p => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase())) {
    showError("A person with this name already exists."); renderAll(); return;
  }
  person.name = trimmed;
  saveData(data);
  clearError();
  renderAssignments();
  renderAvailability();
}

function deleteChore(id) {
  const data = loadData();
  data.chores = data.chores.filter(c => c.id !== id);
  data.inactiveChoreIds = (data.inactiveChoreIds || []).filter(cid => cid !== id);
  Object.values(data.assignmentsByDate).forEach(day => { delete day.assignments[id]; });
  saveData(data);
  clearError();
  renderAll();
}

function deletePerson(id) {
  const data = loadData();
  data.people = data.people.filter(p => p.id !== id);
  Object.values(data.assignmentsByDate).forEach(day => {
    day.availablePersonIds = day.availablePersonIds.filter(pid => pid !== id);
    Object.keys(day.assignments).forEach(choreId => {
      if (day.assignments[choreId] === id) delete day.assignments[choreId];
    });
  });
  saveData(data);
  clearError();
  renderAll();
}

/* ========================================
   AVAILABILITY MANAGEMENT
   ======================================== */

function toggleAvailability(personId, available) {
  const data = loadData();
  const day = data.assignmentsByDate[today];
  if (!day) return;
  if (available && !day.availablePersonIds.includes(personId)) {
    day.availablePersonIds.push(personId);
  }
  if (!available) {
    day.availablePersonIds = day.availablePersonIds.filter(id => id !== personId);
    Object.keys(day.assignments).forEach(choreId => {
      if (day.assignments[choreId] === personId) delete day.assignments[choreId];
    });
  }
  saveData(data);
  renderAssignments();
}

/* ========================================
   ASSIGNMENT GENERATION
   ======================================== */

function generateAssignments() {
  const data = loadData();
  const day = normalizeAvailability(data, today);
  saveData(data);

  if (day.confirmed) { showError("Assignments are already confirmed for today."); return; }
  clearError();

  const available = [...day.availablePersonIds];
  // Only generate for active chores (Rule 4)
  const chores = data.chores.filter(c => !data.inactiveChoreIds.includes(c.id));

  if (!available.length) {
    showError("No available people. Please mark availability first."); return;
  }
  if (available.length < chores.length) {
    showError("Not enough available people for all active chores. Adjust availability or toggle off some chores."); return;
  }

  const dates = getPastDatesWithAssignments(data, today);
  const enforceSingleChore = available.length >= chores.length;

  /* Phase 1: Strict fairness */
  let newAssignments = {};
  let assignedToday = new Set();
  let success = true;

  for (const chore of chores) {
    let candidates = [...available];
    if (enforceSingleChore) candidates = candidates.filter(pid => !assignedToday.has(pid));
    candidates = candidates.filter(pid => !workedConsecutiveDays(data, pid, today));
    candidates = candidates.filter(pid => !didChoreThisWeek(data, pid, chore.id, today));

    if (!candidates.length) { success = false; break; }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    newAssignments[chore.id] = pick;
    assignedToday.add(pick);
  }

  /* Phase 2: Relax fairness */
  if (!success) {
    newAssignments = {};
    assignedToday = new Set();
    for (const chore of chores) {
      let candidates = [...available];
      if (enforceSingleChore) candidates = candidates.filter(pid => !assignedToday.has(pid));
      if (!candidates.length) {
        showError("Assignment impossible without violating daily limits. Manual review required.");
        return;
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      newAssignments[chore.id] = pick;
      assignedToday.add(pick);
    }
    showError("⚠ Fairness rules relaxed for some chores — manual review recommended.");
  }

  day.assignments = newAssignments;
  saveData(data);
  renderAssignments();
}

/* ========================================
   HISTORY MODAL
   ======================================== */

function openHistoryModal() {
  renderHistory();
  const modal = document.getElementById("historyModal");
  if (modal) modal.classList.remove("hidden");
}

function closeHistoryModal() {
  const modal = document.getElementById("historyModal");
  if (modal) modal.classList.add("hidden");
}

function renderHistory() {
  const data = loadData();
  const container = document.getElementById("historyContent");
  if (!container) return;
  container.innerHTML = "";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);

  const dates = Object.keys(data.assignmentsByDate)
    .filter(date => new Date(date) >= cutoff)
    .sort().reverse();

  if (dates.length === 0) {
    container.textContent = "No assignment history available."; return;
  }

  dates.forEach(date => {
    const day = data.assignmentsByDate[date];
    const dayDiv = document.createElement("div");
    dayDiv.className = "history-day";

    const dateHeader = document.createElement("div");
    dateHeader.className = "history-date";
    dateHeader.textContent = date;

    const status = document.createElement("span");
    status.className = day.confirmed ? "history-confirmed" : "history-unconfirmed";
    status.textContent = day.confirmed ? " ✔ Confirmed" : " (Unconfirmed)";
    dateHeader.appendChild(status);
    dayDiv.appendChild(dateHeader);

    const assignments = Object.entries(day.assignments || {});
    if (assignments.length === 0) {
      const item = document.createElement("div");
      item.className = "history-item";
      item.textContent = "• No assignments";
      dayDiv.appendChild(item);
    } else {
      assignments.forEach(([choreId, personId]) => {
        const chore = data.chores.find(c => c.id === choreId);
        const person = data.people.find(p => p.id === personId);
        const item = document.createElement("div");
        item.className = "history-item";
        item.textContent = `• ${chore?.name ?? "Unknown Chore"} — ${person?.name ?? "Unknown Person"}`;
        dayDiv.appendChild(item);
      });
    }

    container.appendChild(dayDiv);
  });
}

/* ========================================
   CONFIRMATION & CLEANUP
   ======================================== */

function confirmAssignments() {
  const data = loadData();
  const day = data.assignmentsByDate[today];
  if (!day) { showError("No assignments for today."); return; }
  if (day.confirmed) { showError("Assignments are already confirmed for today."); return; }
  day.confirmed = true;
  saveData(data);
  clearError();
  showSuccess("✔ Assignments confirmed for today.");
}

function cleanupOldData() {
  const data = loadData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);
  let count = 0;
  Object.keys(data.assignmentsByDate).forEach(date => {
    if (new Date(date) < cutoff) { delete data.assignmentsByDate[date]; count++; }
  });
  saveData(data);
  showSuccess(`✔ Deleted ${count} old record(s).`);
}

/* ========================================
   MODAL SETUP
   ======================================== */

function setupAddChoreModal() {
  const openBtn = document.getElementById("openAddChoreModal");
  const modal = document.getElementById("addChoreModal");
  const input = document.getElementById("modalChoreInput");
  const confirmBtn = document.getElementById("confirmAddChore");
  const cancelBtn = document.getElementById("cancelAddChore");
  if (!openBtn || !modal || !input || !confirmBtn || !cancelBtn) return;

  openBtn.onclick = () => { input.value = ""; modal.classList.remove("hidden"); input.focus(); };
  cancelBtn.onclick = () => modal.classList.add("hidden");
  confirmBtn.onclick = () => {
    const trimmed = input.value.trim();
    if (trimmed) { addChore(trimmed); modal.classList.add("hidden"); }
  };
  input.onkeypress = e => { if (e.key === "Enter") confirmBtn.click(); };
}

function setupAddPersonModal() {
  const openBtn = document.getElementById("openAddPersonModal");
  const modal = document.getElementById("addPersonModal");
  const input = document.getElementById("modalPersonInput");
  const confirmBtn = document.getElementById("confirmAddPerson");
  const cancelBtn = document.getElementById("cancelAddPerson");
  if (!openBtn || !modal || !input || !confirmBtn || !cancelBtn) return;

  openBtn.onclick = () => { input.value = ""; modal.classList.remove("hidden"); input.focus(); };
  cancelBtn.onclick = () => modal.classList.add("hidden");
  confirmBtn.onclick = () => {
    const trimmed = input.value.trim();
    if (trimmed) { addPerson(trimmed); modal.classList.add("hidden"); }
  };
  input.onkeypress = e => { if (e.key === "Enter") confirmBtn.click(); };
}

/* ========================================
   INITIALIZATION
   ======================================== */

function initialize() {
  const todayEl = document.getElementById("today");
  if (todayEl) todayEl.textContent = today;

  document.getElementById("addChoreBtn")?.addEventListener("click", () => addChore());
  document.getElementById("addPersonBtn")?.addEventListener("click", () => addPerson());
  document.getElementById("generateBtn")?.addEventListener("click", generateAssignments);
  document.getElementById("confirmBtn")?.addEventListener("click", confirmAssignments);
  document.getElementById("cleanupBtn")?.addEventListener("click", cleanupOldData);
  document.getElementById("viewHistoryBtn")?.addEventListener("click", openHistoryModal);
  document.getElementById("closeHistoryBtn")?.addEventListener("click", closeHistoryModal);

  setupAddChoreModal();
  setupAddPersonModal();
  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}