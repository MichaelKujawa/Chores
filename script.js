const STORAGE_KEY = "choreSchedulerData_v1";
function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = getLocalDateString();


document.getElementById("today").textContent = today;

document.getElementById("addChoreBtn").onclick = addChore;
document.getElementById("addPersonBtn").onclick = addPerson;
document.getElementById("generateBtn").onclick = generateAssignments;
document.getElementById("confirmBtn").onclick = confirmAssignments;
document.getElementById("cleanupBtn").onclick = cleanupOldData;
document.getElementById("viewHistoryBtn").onclick = openHistoryModal;
document.getElementById("closeHistoryBtn").onclick = closeHistoryModal;

/* ---------- Storage ---------- */

function loadData() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
    meta: {},
    chores: [],
    people: [],
    assignmentsByDate: {}
  };
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uuid() {
  return crypto.randomUUID();
}

/* ---------- Helpers ---------- */

function getAllPersonIds(data) {
  return data.people.map(p => p.id);
}

function normalizeAvailability(data, date) {
  const day = data.assignmentsByDate[date];
  if (!day.availablePersonIds || day.availablePersonIds.length === 0) {
    day.availablePersonIds = getAllPersonIds(data);
  }
}

/* ---------- Rendering ---------- */

function renderAll() {
  const data = loadData();
  renderList("choreList", data.chores, renameChore, deleteChore);
  renderList("personList", data.people, renamePerson, deletePerson);
  renderAvailability();
  renderAssignments();
}

function renderList(id, items, renameFn, deleteFn) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    const input = document.createElement("input");
    input.value = item.name;
    input.onchange = () => renameFn(item.id, input.value);

    const btn = document.createElement("button");
    btn.textContent = "✖";
    btn.onclick = () => deleteFn(item.id);

    li.append(input, btn);
    ul.appendChild(li);
  });
}

function renderAvailability() {
  const data = loadData();
  const ul = document.getElementById("availabilityList");
  ul.innerHTML = "";

  const day =
    data.assignmentsByDate[today] ??
    (data.assignmentsByDate[today] = {
      availablePersonIds: [],
      assignments: {},
      confirmed: false
    });

  normalizeAvailability(data, today);
  saveData(data);

  data.people.forEach(p => {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = day.availablePersonIds.includes(p.id);
    cb.onchange = () => toggleAvailability(p.id, cb.checked);
    li.append(cb, " ", p.name);
    ul.appendChild(li);
  });
}

function renderAssignments() {
  const data = loadData();
  const div = document.getElementById("assignments");
  div.innerHTML = "";

  const day = data.assignmentsByDate[today];
  if (!day) return;

  data.chores.forEach(chore => {
    const row = document.createElement("div");
    row.className = "assignment";

    const label = document.createElement("strong");
    label.textContent = chore.name;

    const select = document.createElement("select");
    data.people.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = day.assignments[chore.id] === p.id;
      select.appendChild(opt);
    });

    select.onchange = () => {
      day.assignments[chore.id] = select.value;
      saveData(data);
    };

    row.append(label, select);
    div.appendChild(row);
  });
}

/* ---------- CRUD ---------- */

function addChore() {
  const input = document.getElementById("newChore");
  if (!input.value.trim()) return;

  const data = loadData();
  data.chores.push({ id: uuid(), name: input.value.trim() });
  saveData(data);
  input.value = "";
  renderAll();
}

function addPerson() {
  const input = document.getElementById("newPerson");
  if (!input.value.trim()) return;

  const data = loadData();
  data.people.push({ id: uuid(), name: input.value.trim() });
  saveData(data);
  input.value = "";
  renderAll();
}

function renameChore(id, name) {
  const data = loadData();
  data.chores.find(c => c.id === id).name = name;
  saveData(data);
}

function renamePerson(id, name) {
  const data = loadData();
  data.people.find(p => p.id === id).name = name;
  saveData(data);
}

function deleteChore(id) {
  const data = loadData();
  data.chores = data.chores.filter(c => c.id !== id);

  Object.values(data.assignmentsByDate).forEach(day => {
    delete day.assignments[id];
  });

  saveData(data);
  renderAll();
}

function deletePerson(id) {
  const data = loadData();
  data.people = data.people.filter(p => p.id !== id);

  Object.values(data.assignmentsByDate).forEach(day => {
    day.availablePersonIds = day.availablePersonIds.filter(pid => pid !== id);
    Object.keys(day.assignments).forEach(choreId => {
      if (day.assignments[choreId] === id) {
        delete day.assignments[choreId];
      }
    });
  });

  saveData(data);
  renderAll();
}

/* ---------- Availability ---------- */

function toggleAvailability(personId, available) {
  const data = loadData();
  const day = data.assignmentsByDate[today];

  if (available && !day.availablePersonIds.includes(personId)) {
    day.availablePersonIds.push(personId);
  }
  if (!available) {
    day.availablePersonIds = day.availablePersonIds.filter(id => id !== personId);
  }

  saveData(data);
}

/* ---------- Rule Engine ---------- */

function generateAssignments() {
  const data = loadData();
  const day = data.assignmentsByDate[today];
  normalizeAvailability(data, today);

  // 🔴 CRITICAL FIX: clear previous assignments
  day.assignments = {};

  const available = [...day.availablePersonIds];
  const dates = Object.keys(data.assignmentsByDate).sort().reverse().slice(1);
  const warnings = [];

  const assignedToday = new Set();
  const enforceSingleChore = available.length >= data.chores.length;

  data.chores.forEach(chore => {
    let candidates = [...available];

    // HARD RULE: one chore per person per day
    if (enforceSingleChore) {
      candidates = candidates.filter(pid => !assignedToday.has(pid));
    }

    // HARD RULE: no 3 consecutive assignment days
    candidates = candidates.filter(pid =>
      !dates.slice(0, 2).every(d =>
        Object.values(data.assignmentsByDate[d].assignments).includes(pid)
      )
    );

    // HARD RULE: same chore within last 5 days
    candidates = candidates.filter(pid =>
      !dates.slice(0, 5).some(d =>
        data.assignmentsByDate[d].assignments[chore.id] === pid
      )
    );

    if (candidates.length === 0) {
      // Relax fairness rules silently
      candidates = [...available].filter(pid =>
        !enforceSingleChore || !assignedToday.has(pid)
      );
    }

    if (candidates.length === 0) {
      // TRUE failure — user must intervene
      warnings.push(`Manual review required for "${chore.name}"`);
      return;
    }


    if (candidates.length === 0) {
      throw new Error(
        `Assignment impossible without violating daily limits for "${chore.name}"`
      );
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    day.assignments[chore.id] = pick;
    assignedToday.add(pick);

  });

  document.getElementById("warning").textContent = warnings.join(" | ");
  saveData(data);
  renderAssignments();
}

/*----------- View History -----------*/

function openHistoryModal() {
  renderHistory();
  document.getElementById("historyModal").classList.remove("hidden");
}

function closeHistoryModal() {
  document.getElementById("historyModal").classList.add("hidden");
}

function renderHistory() {
  const data = loadData();
  const container = document.getElementById("historyContent");
  container.innerHTML = "";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const dates = Object.keys(data.assignmentsByDate)
    .filter(date => new Date(date) >= cutoff)
    .sort()
    .reverse();

  if (dates.length === 0) {
    container.textContent = "No assignment history available.";
    return;
  }

  dates.forEach(date => {
    const day = data.assignmentsByDate[date];
    const dayDiv = document.createElement("div");
    dayDiv.className = "history-day";

    const dateHeader = document.createElement("div");
    dateHeader.className = "history-date";
    dateHeader.textContent = date;

    if (day.confirmed) {
      const confirmed = document.createElement("span");
      confirmed.className = "history-confirmed";
      confirmed.textContent = "(Confirmed)";
      dateHeader.appendChild(confirmed);
    }

    dayDiv.appendChild(dateHeader);

    Object.entries(day.assignments).forEach(([choreId, personId]) => {
      const chore = data.chores.find(c => c.id === choreId);
      const person = data.people.find(p => p.id === personId);

      const item = document.createElement("div");
      item.className = "history-item";
      item.textContent = `• ${chore?.name ?? "Unknown Chore"} — ${person?.name ?? "Unknown Person"}`;

      dayDiv.appendChild(item);
    });

    container.appendChild(dayDiv);
  });
}


/* ---------- Confirmation ---------- */

function confirmAssignments() {
  const data = loadData();
  if (data.assignmentsByDate[today]) {
    data.assignmentsByDate[today].confirmed = true;
    saveData(data);
    alert("Assignments confirmed for today.");
  }
}

/* ---------- Cleanup ---------- */

function cleanupOldData() {
  const data = loadData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  Object.keys(data.assignmentsByDate).forEach(date => {
    if (new Date(date) < cutoff) delete data.assignmentsByDate[date];
  });

  saveData(data);
  alert("Old assignment data deleted.");
}

renderAll();
