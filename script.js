/* ========================================
   CONSTANTS & CONFIGURATION
   ======================================== */

const STORAGE_KEY = "choreSchedulerData_v1";
const SAME_CHORE_COOLDOWN_DAYS = 5;
const CONSECUTIVE_ASSIGNMENT_LIMIT = 2;
const HISTORY_RETENTION_DAYS = 30;

/* ========================================
   UTILITY FUNCTIONS
   ======================================== */

/**
 * Generates a unique identifier
 * Falls back to a custom implementation for non-secure contexts
 */
function uuid() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-HTTPS contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Gets current date as YYYY-MM-DD string in local timezone
 */
function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = getLocalDateString();

/**
 * Displays an error message in the UI
 */
function showError(message) {
  const warningsEl = document.getElementById("warning");
  if (warningsEl) {
    warningsEl.textContent = message;
  }
}

/**
 * Clears error messages from the UI
 */
function clearError() {
  const warningsEl = document.getElementById("warning");
  if (warningsEl) {
    warningsEl.textContent = "";
  }
}

/* ========================================
   STORAGE FUNCTIONS
   ======================================== */

/**
 * Loads data from localStorage
 * Returns default structure if no data exists
 */
function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {
      meta: {},
      chores: [],
      people: [],
      assignmentsByDate: {}
    };
  } catch (error) {
    console.error("Error loading data:", error);
    showError("Error loading data. Please refresh the page.");
    return {
      meta: {},
      chores: [],
      people: [],
      assignmentsByDate: {}
    };
  }
}

/**
 * Saves data to localStorage
 */
function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving data:", error);
    showError("Error saving data. Your changes may not persist.");
  }
}

/* ========================================
   DATA NORMALIZATION
   ======================================== */

/**
 * Gets the most recent day before the given date
 */
function getMostRecentDay(data, beforeDate) {
  const dates = Object.keys(data.assignmentsByDate)
    .filter(d => d < beforeDate)
    .sort()
    .reverse();

  return dates.length ? data.assignmentsByDate[dates[0]] : null;
}

/**
 * Ensures availability data exists and is valid for a given date
 * Creates new day entry if needed, inheriting from previous day
 */
function normalizeAvailability(data, date) {
  let day = data.assignmentsByDate[date];

  // Create day if missing
  if (!day) {
    const lastDay = getMostRecentDay(data, date);

    day = data.assignmentsByDate[date] = {
      availablePersonIds:
        lastDay && lastDay.availablePersonIds.length
          ? [...lastDay.availablePersonIds]
          : [],
      assignments: {},
      confirmed: false
    };

    return day;
  }

  // Sanitize existing day
  if (!Array.isArray(day.availablePersonIds)) {
    day.availablePersonIds = [];
  }

  if (day.availablePersonIds.length === 0) {
    const lastDay = getMostRecentDay(data, date);
    if (lastDay?.availablePersonIds?.length) {
      day.availablePersonIds = [...lastDay.availablePersonIds];
    }
  }

  // Remove deleted people
  day.availablePersonIds = day.availablePersonIds.filter(pid =>
    data.people.some(p => p.id === pid)
  );

  return day;
}

/* ========================================
   RENDERING FUNCTIONS
   ======================================== */

/**
 * Renders all UI sections
 */
function renderAll() {
  const data = loadData();
  renderList("choreList", data.chores, renameChore, deleteChore);
  renderList("personList", data.people, renamePerson, deletePerson);
  renderAvailability();
  renderAssignments();
}

/**
 * Renders a generic list (chores or people)
 */
function renderList(id, items, renameFn, deleteFn) {
  const ul = document.getElementById(id);
  if (!ul) return;
  
  ul.innerHTML = "";

  items.forEach(item => {
    const li = document.createElement("li");
    
    const input = document.createElement("input");
    input.value = item.name;
    input.onchange = () => {
      const trimmed = input.value.trim();
      if (!trimmed) {
        showError("Name cannot be empty.");
        input.value = item.name;
        return;
      }
      renameFn(item.id, trimmed);
    };

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

/**
 * Renders the availability checklist for today
 */
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
    li.append(p.name, " ", cb);
    ul.appendChild(li);
  });
}

/**
 * Renders the assignment dropdowns for today
 */
function renderAssignments() {
  const data = loadData();
  const div = document.getElementById("assignments");
  if (!div) return;
  
  div.innerHTML = "";

  const day = data.assignmentsByDate[today];
  if (!day) return;

  data.chores.forEach(chore => {
    const row = document.createElement("div");
    row.className = "assignment";

    const label = document.createElement("strong");
    label.textContent = chore.name;

    const select = document.createElement("select");
    
    // Add empty option
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "-- Select --";
    select.appendChild(emptyOpt);

    const assignedPersonId = day.assignments[chore.id];

    data.people.forEach(p => {
      const isAssigned = assignedPersonId === p.id;
      const isAvailable = day.availablePersonIds.includes(p.id);

      // Show person if they're available OR currently assigned
      if (!isAvailable && !isAssigned) return;

      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = isAssigned;

      if (!isAvailable && isAssigned) {
        opt.textContent += " (Unavailable)";
      }

      select.appendChild(opt);
    });

    select.onchange = () => {
      const personId = select.value;
      
      // Allow unassigning
      if (!personId) {
        delete day.assignments[chore.id];
        saveData(data);
        return;
      }

      // Validate availability
      if (!day.availablePersonIds.includes(personId)) {
        showError("This person is marked unavailable.");
        renderAssignments();
        return;
      }

      // Validate one chore per person per day
      const alreadyAssigned = Object.entries(day.assignments)
        .filter(([cId, pId]) => pId === personId && cId !== chore.id)
        .length;

      if (alreadyAssigned >= 1) {
        showError("This person already has a chore today.");
        renderAssignments();
        return;
      }

      clearError();
      day.assignments[chore.id] = personId;
      saveData(data);
    };

    row.append(label, select);
    div.appendChild(row);
  });
}

/* ========================================
   CRUD OPERATIONS
   ======================================== */

/**
 * Adds a new chore
 */
function addChore(choreName = null) {
  const name = choreName || document.getElementById("newChore")?.value;
  const trimmed = name?.trim();
  
  if (!trimmed) {
    showError("Chore name cannot be empty.");
    return;
  }

  const data = loadData();
  
  // Check for duplicates
  if (data.chores.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
    showError("A chore with this name already exists.");
    return;
  }

  data.chores.push({ id: uuid(), name: trimmed });
  saveData(data);
  
  const input = document.getElementById("newChore");
  if (input) input.value = "";
  
  clearError();
  renderList("choreList", data.chores, renameChore, deleteChore);
  renderAssignments();
}

/**
 * Adds a new person
 */
function addPerson(personName = null) {
  const name = personName || document.getElementById("newPerson")?.value;
  const trimmed = name?.trim();
  
  if (!trimmed) {
    showError("Person name cannot be empty.");
    return;
  }

  const data = loadData();
  
  // Check for duplicates
  if (data.people.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
    showError("A person with this name already exists.");
    return;
  }

  data.people.push({ id: uuid(), name: trimmed });
  saveData(data);
  
  const input = document.getElementById("newPerson");
  if (input) input.value = "";
  
  clearError();
  renderList("personList", data.people, renamePerson, deletePerson);
  renderAvailability();
}

/**
 * Renames a chore
 */
function renameChore(id, name) {
  const data = loadData();
  const chore = data.chores.find(c => c.id === id);
  
  if (!chore) {
    console.error("Chore not found:", id);
    return;
  }
  
  const trimmed = name.trim();
  if (!trimmed) {
    showError("Chore name cannot be empty.");
    renderAll();
    return;
  }
  
  // Check for duplicates (excluding current chore)
  if (data.chores.some(c => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) {
    showError("A chore with this name already exists.");
    renderAll();
    return;
  }
  
  chore.name = trimmed;
  saveData(data);
  clearError();
  renderAssignments();
}

/**
 * Renames a person
 */
function renamePerson(id, name) {
  const data = loadData();
  const person = data.people.find(p => p.id === id);
  
  if (!person) {
    console.error("Person not found:", id);
    return;
  }
  
  const trimmed = name.trim();
  if (!trimmed) {
    showError("Person name cannot be empty.");
    renderAll();
    return;
  }
  
  // Check for duplicates (excluding current person)
  if (data.people.some(p => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase())) {
    showError("A person with this name already exists.");
    renderAll();
    return;
  }
  
  person.name = trimmed;
  saveData(data);
  clearError();
  renderAssignments();
  renderAvailability();
}

/**
 * Deletes a chore and all its assignments
 */
function deleteChore(id) {
  const data = loadData();
  data.chores = data.chores.filter(c => c.id !== id);

  // Clean up assignments
  Object.values(data.assignmentsByDate).forEach(day => {
    delete day.assignments[id];
  });

  saveData(data);
  clearError();
  renderAll();
}

/**
 * Deletes a person and all their assignments
 */
function deletePerson(id) {
  const data = loadData();
  data.people = data.people.filter(p => p.id !== id);

  // Clean up availability and assignments
  Object.values(data.assignmentsByDate).forEach(day => {
    day.availablePersonIds = day.availablePersonIds.filter(pid => pid !== id);
    Object.keys(day.assignments).forEach(choreId => {
      if (day.assignments[choreId] === id) {
        delete day.assignments[choreId];
      }
    });
  });

  saveData(data);
  clearError();
  renderAll();
}

/* ========================================
   AVAILABILITY MANAGEMENT
   ======================================== */

/**
 * Toggles a person's availability for today
 */
function toggleAvailability(personId, available) {
  const data = loadData();
  const day = data.assignmentsByDate[today];
  if (!day) return;

  if (available && !day.availablePersonIds.includes(personId)) {
    day.availablePersonIds.push(personId);
  }
  if (!available) {
    day.availablePersonIds = day.availablePersonIds.filter(id => id !== personId);
    
    // Remove assignments for unavailable person
    Object.keys(day.assignments).forEach(choreId => {
      if (day.assignments[choreId] === personId) {
        delete day.assignments[choreId];
      }
    });
  }

  saveData(data);
  renderAssignments();
}

/* ========================================
   ASSIGNMENT GENERATION
   ======================================== */

/**
 * Generates random assignments based on fairness rules
 */
function generateAssignments() {
  const data = loadData();
  const day = normalizeAvailability(data, today);
  saveData(data);

  if (day.confirmed) {
    showError("Assignments are already confirmed for today.");
    return;
  }

  clearError();

  const available = [...day.availablePersonIds];
  const chores = data.chores;

  /* ---------- VALIDATION ---------- */

  if (!available.length) {
    showError("No available people selected. Please select availability before generating assignments.");
    return;
  }

  if (available.length < chores.length) {
    showError("Not enough available people for all chores. Please adjust availability or assign manually.");
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

    // One chore per person
    if (enforceSingleChore) {
      candidates = candidates.filter(pid => !assignedToday.has(pid));
    }

    // No more than N consecutive assignment days
    candidates = candidates.filter(pid =>
      !dates.slice(0, CONSECUTIVE_ASSIGNMENT_LIMIT).every(d =>
        Object.values(data.assignmentsByDate[d]?.assignments || {}).includes(pid)
      )
    );

    // Same chore cooldown
    candidates = candidates.filter(pid =>
      !dates.slice(0, SAME_CHORE_COOLDOWN_DAYS).some(d =>
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
        showError("Assignment impossible without violating daily limits. Manual review required.");
        return;
      }

      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      newAssignments[chore.id] = pick;
      assignedToday.add(pick);
    }

    showError("Fairness rules were relaxed for some chores. Manual review recommended.");
  }

  /* ---------- COMMIT ---------- */

  day.assignments = newAssignments;
  saveData(data);
  renderAssignments();
}

/* ========================================
   HISTORY MODAL
   ======================================== */

/**
 * Opens the history modal
 */
function openHistoryModal() {
  renderHistory();
  const modal = document.getElementById("historyModal");
  if (modal) modal.classList.remove("hidden");
}

/**
 * Closes the history modal
 */
function closeHistoryModal() {
  const modal = document.getElementById("historyModal");
  if (modal) modal.classList.add("hidden");
}

/**
 * Renders assignment history for the past 30 days
 */
function renderHistory() {
  const data = loadData();
  const container = document.getElementById("historyContent");
  if (!container) return;
  
  container.innerHTML = "";

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);

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
    status.className = day.confirmed ? "history-confirmed" : "history-unconfirmed";
    status.textContent = day.confirmed ? " (Confirmed)" : " (Unconfirmed)";

    dateHeader.appendChild(status);
    dayDiv.appendChild(dateHeader);

    const assignments = Object.entries(day.assignments);
    
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

/**
 * Confirms today's assignments
 */
function confirmAssignments() {
  const data = loadData();
  const day = data.assignmentsByDate[today];
  
  if (!day) {
    showError("No assignments for today.");
    return;
  }
  
  if (day.confirmed) {
    showError("Assignments are already confirmed for today.");
    return;
  }
  
  day.confirmed = true;
  saveData(data);
  clearError();
  
  // Use UI feedback instead of alert
  const warningsEl = document.getElementById("warning");
  if (warningsEl) {
    warningsEl.textContent = "✓ Assignments confirmed for today.";
    warningsEl.style.color = "green";
    setTimeout(() => {
      warningsEl.textContent = "";
      warningsEl.style.color = "";
    }, 3000);
  }
}

/**
 * Deletes assignment data older than 30 days
 */
function cleanupOldData() {
  const data = loadData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);

  let deletedCount = 0;
  Object.keys(data.assignmentsByDate).forEach(date => {
    if (new Date(date) < cutoff) {
      delete data.assignmentsByDate[date];
      deletedCount++;
    }
  });

  saveData(data);
  
  // Use UI feedback instead of alert
  const warningsEl = document.getElementById("warning");
  if (warningsEl) {
    warningsEl.textContent = `✓ Deleted ${deletedCount} old assignment record(s).`;
    warningsEl.style.color = "green";
    setTimeout(() => {
      warningsEl.textContent = "";
      warningsEl.style.color = "";
    }, 3000);
  }
}

/* ========================================
   MODAL LOGIC
   ======================================== */

/**
 * Sets up Add Chore modal
 */
function setupAddChoreModal() {
  const openBtn = document.getElementById("openAddChoreModal");
  const modal = document.getElementById("addChoreModal");
  const input = document.getElementById("modalChoreInput");
  const confirmBtn = document.getElementById("confirmAddChore");
  const cancelBtn = document.getElementById("cancelAddChore");

  if (!openBtn || !modal || !input || !confirmBtn || !cancelBtn) return;

  openBtn.onclick = () => {
    input.value = "";
    modal.classList.remove("hidden");
    input.focus();
  };

  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
  };

  confirmBtn.onclick = () => {
    const trimmed = input.value.trim();
    if (trimmed) {
      addChore(trimmed);
      modal.classList.add("hidden");
    }
  };

  // Allow Enter key to submit
  input.onkeypress = (e) => {
    if (e.key === "Enter") {
      confirmBtn.click();
    }
  };
}

/**
 * Sets up Add Person modal
 */
function setupAddPersonModal() {
  const openBtn = document.getElementById("openAddPersonModal");
  const modal = document.getElementById("addPersonModal");
  const input = document.getElementById("modalPersonInput");
  const confirmBtn = document.getElementById("confirmAddPerson");
  const cancelBtn = document.getElementById("cancelAddPerson");

  if (!openBtn || !modal || !input || !confirmBtn || !cancelBtn) return;

  openBtn.onclick = () => {
    input.value = "";
    modal.classList.remove("hidden");
    input.focus();
  };

  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
  };

  confirmBtn.onclick = () => {
    const trimmed = input.value.trim();
    if (trimmed) {
      addPerson(trimmed);
      modal.classList.add("hidden");
    }
  };

  // Allow Enter key to submit
  input.onkeypress = (e) => {
    if (e.key === "Enter") {
      confirmBtn.click();
    }
  };
}

/* ========================================
   INITIALIZATION
   ======================================== */

/**
 * Sets up all event listeners and initializes the app
 */
function initialize() {
  // Display today's date
  const todayEl = document.getElementById("today");
  if (todayEl) todayEl.textContent = today;

  // Set up basic button handlers
  const addChoreBtn = document.getElementById("addChoreBtn");
  const addPersonBtn = document.getElementById("addPersonBtn");
  const generateBtn = document.getElementById("generateBtn");
  const confirmBtn = document.getElementById("confirmBtn");
  const cleanupBtn = document.getElementById("cleanupBtn");
  const viewHistoryBtn = document.getElementById("viewHistoryBtn");
  const closeHistoryBtn = document.getElementById("closeHistoryBtn");

  if (addChoreBtn) addChoreBtn.onclick = () => addChore();
  if (addPersonBtn) addPersonBtn.onclick = () => addPerson();
  if (generateBtn) generateBtn.onclick = generateAssignments;
  if (confirmBtn) confirmBtn.onclick = confirmAssignments;
  if (cleanupBtn) cleanupBtn.onclick = cleanupOldData;
  if (viewHistoryBtn) viewHistoryBtn.onclick = openHistoryModal;
  if (closeHistoryBtn) closeHistoryBtn.onclick = closeHistoryModal;

  // Set up modals
  setupAddChoreModal();
  setupAddPersonModal();

  // Initial render
  renderAll();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}