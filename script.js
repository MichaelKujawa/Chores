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
  let day = data.assignmentsByDate[date];

  // Create day if missing
  if (!day) {
    const lastDay = getLastWorkday(data, date);

    day = data.assignmentsByDate[date] = {
      availablePersonIds:
        lastDay && lastDay.availablePersonIds.length
          ? [...lastDay.availablePersonIds]
          : [],
      assignments: {},
      confirmed: false
    };

    saveData(data);
    return;
  }

  // Sanitize existing day
  if (!Array.isArray(day.availablePersonIds)) {
    day.availablePersonIds = [];
  }

  if (day.availablePersonIds.length === 0) {
    const lastDay = getLastWorkday(data, date);
    if (lastDay?.availablePersonIds?.length) {
      day.availablePersonIds = [...lastDay.availablePersonIds];
    }
  }

  // Remove deleted people
  day.availablePersonIds = day.availablePersonIds.filter(pid =>
    data.people.some(p => p.id === pid)
  );

  saveData(data);
}


function getLastWorkday(data, beforeDate) {
  const dates = Object.keys(data.assignmentsByDate)
    .filter(d => d < beforeDate)
    .sort()
    .reverse();

  return dates.length ? data.assignmentsByDate[dates[0]] : null;
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
    btn.onclick = () => {
    const confirmed = confirm(`Delete "${item.name}"?`);
    if (!confirmed) return;
    deleteFn(item.id);
};


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
      const personId = select.value;

      // HARD RULE: availability
      if (!day.availablePersonIds.includes(personId)) {
        alert("This person is marked unavailable.");
        renderAssignments();
        return;
      }

      // HARD RULE: one chore per day
      const alreadyAssigned = Object.values(day.assignments)
        .filter(id => id === personId).length;

      if (alreadyAssigned >= 1) {
        alert("This person already has a chore today.");
        renderAssignments();
        return;
      }

      day.assignments[chore.id] = personId;
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

  if (!day) return;

  if (day.confirmed) {
    alert("Assignments are already confirmed for today.");
    return;
  }

  const warningsEl = document.getElementById("warning");
  warningsEl.textContent = "";

  const available = [...day.availablePersonIds];
  const chores = data.chores;

  /* ---------- HARD BLOCKS ---------- */

  if (!available.length) {
    warningsEl.textContent =
      "No available people selected. Please select availability before generating assignments.";
    return;
  }

  if (available.length < chores.length) {
    warningsEl.textContent =
      "Not enough available people for all chores. Please adjust availability or assign manually.";
    return;
  }

  /* ---------- HISTORY ---------- */

  const dates = Object.keys(data.assignmentsByDate)
    .filter(d => d < today)
    .sort()
    .reverse();

  const enforceSingleChore = available.length >= chores.length;

  /* ---------- PHASE 1: STRICT FAIRNESS ---------- */

  let newAssignments = {};
  let assignedToday = new Set();
  let success = true;

  for (const chore of chores) {
    let candidates = [...available];

    if (enforceSingleChore) {
      candidates = candidates.filter(pid => !assignedToday.has(pid));
    }

    // No 3 consecutive assignment days
    candidates = candidates.filter(pid =>
      !dates.slice(0, 2).every(d =>
        Object.values(data.assignmentsByDate[d]?.assignments || {}).includes(pid)
      )
    );

    // Same chore cooldown (5 days)
    candidates = candidates.filter(pid =>
      !dates.slice(0, 5).some(d =>
        data.assignmentsByDate[d]?.assignments?.[chore.id] === pid
      )
    );

    if (!candidates.length) {
      success = false;
      break;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    newAssignments[chore.id] = pick;
    assignedToday.add(pick);
  }

  /* ---------- PHASE 2: RELAX FAIRNESS ---------- */

  if (!success) {
    newAssignments = {};
    assignedToday = new Set();

    for (const chore of chores) {
      let candidates = [...available];

      if (enforceSingleChore) {
        candidates = candidates.filter(pid => !assignedToday.has(pid));
      }

      if (!candidates.length) {
        warningsEl.textContent =
          "Assignment impossible without violating daily limits. Manual review required.";
        return;
      }

      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      newAssignments[chore.id] = pick;
      assignedToday.add(pick);
    }

    warningsEl.textContent =
      "Fairness rules were relaxed for some chores. Manual review recommended.";
  }

  /* ---------- COMMIT ATOMICALLY ---------- */

  day.assignments = newAssignments;
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

    const status = document.createElement("span");

    if (day.confirmed) {
      status.className = "history-confirmed";
      status.textContent = " (Confirmed)";
    } else {
      status.className = "history-unconfirmed";
      status.textContent = " (Unconfirmed)";
    }

    dateHeader.appendChild(status);


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

/* ---- Add Chore Modal Logic (UI Only) ---- */

const openAddChoreModalBtn = document.getElementById("openAddChoreModal");
const addChoreModal = document.getElementById("addChoreModal");
const modalChoreInput = document.getElementById("modalChoreInput");
const confirmAddChoreBtn = document.getElementById("confirmAddChore");
const cancelAddChoreBtn = document.getElementById("cancelAddChore");

openAddChoreModalBtn.onclick = () => {
  modalChoreInput.value = "";
  addChoreModal.classList.remove("hidden");
  modalChoreInput.focus();
};

cancelAddChoreBtn.onclick = () => {
  addChoreModal.classList.add("hidden");
};

confirmAddChoreBtn.onclick = () => {
  const hiddenInput = document.getElementById("newChore");

  hiddenInput.value = modalChoreInput.value.trim();
  if (!hiddenInput.value) return;

  // Trigger existing logic
  document.getElementById("addChoreBtn").click();

  addChoreModal.classList.add("hidden");
};

/* ---- Add Person Modal Logic (UI Only) ---- */

const openAddPersonModalBtn = document.getElementById("openAddPersonModal");
const addPersonModal = document.getElementById("addPersonModal");
const modalPersonInput = document.getElementById("modalPersonInput");
const confirmAddPersonBtn = document.getElementById("confirmAddPerson");
const cancelAddPersonBtn = document.getElementById("cancelAddPerson");

openAddPersonModalBtn.onclick = () => {
  modalPersonInput.value = "";
  addPersonModal.classList.remove("hidden");
  modalPersonInput.focus();
};

cancelAddPersonBtn.onclick = () => {
  addPersonModal.classList.add("hidden");
};

confirmAddPersonBtn.onclick = () => {
  const hiddenInput = document.getElementById("newPerson");

  hiddenInput.value = modalPersonInput.value.trim();
  if (!hiddenInput.value) return;

  // Trigger existing logic
  document.getElementById("addPersonBtn").click();

  addPersonModal.classList.add("hidden");
};


renderAll();
