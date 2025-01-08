/*******************************************************
 *  TaskMaster SPA with:
 *    - Relationship Modal (instead of prompt)
 *    - Task Title dropdown instead of ID
 *    - Hard Delete from tasks[] => stored in IndexedDB
 *******************************************************/

// ===============================
// UTILITY / CONFIG
// ===============================
let db = null;
const DB_NAME = 'TaskMasterDB';
const DB_VERSION = 1;
const STORE_WORKSPACES = 'taskMasters';

// Generate a short ID
function generateShortId() {
  return 'xxxxxxxx'.replace(/x/g, () => {
    return (Math.random() * 16 | 0).toString(16);
  }).slice(0,6).toUpperCase();
}

// Default workspace template
const workspaceTemplate = {
  id: generateShortId(),
  name: "DefaultWorkspace",
  config: {
    beginState: "created-at",
    endStates: ["completed","abandoned"],
    states: {
      "created-at":   ["in-progress","back-burner","on-hold"],
      "in-progress":  ["back-burner","on-hold","completed","abandoned"],
      "back-burner":  ["in-progress","abandoned"],
      "on-hold":      ["in-progress","abandoned"],
      "completed":    [],
      "abandoned":    []
    }
  },
  defaults: {
    priority: -1,
    urgency: 3,
    importance: 3
  },
  tasks: [],
  relationships: []
};

let currentWorkspace = null;
let selectedTaskId = null;

// ===============================
// INDEXEDDB HELPERS
// ===============================
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_WORKSPACES)) {
        db.createObjectStore(STORE_WORKSPACES, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => reject(e);
  });
}

function getAllWorkspaces() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKSPACES, 'readonly');
    const store = tx.objectStore(STORE_WORKSPACES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function addOrUpdateWorkspace(workspace) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKSPACES, 'readwrite');
    const store = tx.objectStore(STORE_WORKSPACES);
    const req = store.put(workspace);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function getWorkspaceById(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKSPACES, 'readonly');
    const store = tx.objectStore(STORE_WORKSPACES);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

// ===============================
// ON DOM LOADED
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  await openDatabase();
  const all = await getAllWorkspaces();

  if (all.length === 0) {
    // Insert template if none
    await addOrUpdateWorkspace(workspaceTemplate);
    currentWorkspace = workspaceTemplate;
  } else {
    currentWorkspace = all[0];
  }
  
  populateWorkspaceSelector(all);
  setupEventHandlers();
  refreshUI();
});

/*******************************************************
 *  WORKSPACE MANAGEMENT
 *******************************************************/
function populateWorkspaceSelector(workspaces) {
  const wsSelector = document.getElementById('workspaceSelector');
  wsSelector.innerHTML = '';
  workspaces.forEach(ws => {
    const opt = document.createElement('option');
    opt.value = ws.id;
    opt.textContent = `${ws.name} (${ws.id})`;
    wsSelector.appendChild(opt);
  });
  if (wsSelector.options.length > 0) {
    wsSelector.value = currentWorkspace.id;
  }
}

async function onWorkspaceChange() {
  const wsId = document.getElementById('workspaceSelector').value;
  if (!wsId) return;
  const chosen = await getWorkspaceById(wsId);
  if (chosen) {
    currentWorkspace = chosen;
    refreshUI();
  }
}

async function addNewWorkspace() {
  const name = prompt("Enter new workspace name:");
  if (!name) return;
  const newWS = JSON.parse(JSON.stringify(workspaceTemplate));
  newWS.id = generateShortId();
  newWS.name = name;
  await addOrUpdateWorkspace(newWS);
  currentWorkspace = newWS;

  const all = await getAllWorkspaces();
  populateWorkspaceSelector(all);
  document.getElementById('workspaceSelector').value = newWS.id;
  refreshUI();
}

/*******************************************************
 *  UI SETUP & EVENT HANDLERS
 *******************************************************/
function setupEventHandlers() {
  // Workspace
  document.getElementById('workspaceSelector').addEventListener('change', onWorkspaceChange);
  document.getElementById('btnAddWorkspace').addEventListener('click', addNewWorkspace);

  // Tasks
  document.getElementById('btnAddTask').addEventListener('click', addTask);
  document.getElementById('btnDeleteTask').addEventListener('click', deleteSelectedTask);

  // Export / Import
  document.getElementById('btnExport').addEventListener('click', exportWorkspace);
  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('fileImport').click();
  });
  document.getElementById('fileImport').addEventListener('change', handleImportFile);

  // Search & Filters
  document.getElementById('searchBox').addEventListener('input', refreshTaskList);
  document.getElementById('viewMode').addEventListener('change', refreshTaskList);
  document.getElementById('toggleFiltersBtn').addEventListener('click', () => {
    document.getElementById('filterBar').classList.toggle('hidden');
  });
  // Filter sliders
  ['filterPriority','filterUrgency','filterImportance'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      document.getElementById(id + 'Val').textContent = document.getElementById(id).value;
      refreshTaskList();
    });
  });
  // Filter text
  document.getElementById('filterTags').addEventListener('input', refreshTaskList);
  document.getElementById('filterStatus').addEventListener('input', refreshTaskList);
  // Clear
  document.getElementById('btnClearFilters').addEventListener('click', clearFilters);

  // Main panel changes => real-time save
  document.getElementById('titleInput').addEventListener('input', onTaskFieldChange);
  document.getElementById('descriptionInput').addEventListener('input', onTaskFieldChange);
  document.getElementById('tagsInput').addEventListener('input', onTaskFieldChange);
  document.getElementById('statusNext').addEventListener('change', onStatusTransition);
  document.getElementById('priorityInput').addEventListener('input', onTaskFieldChange);
  document.getElementById('urgencyInput').addEventListener('input', onTaskFieldChange);
  document.getElementById('importanceInput').addEventListener('input', onTaskFieldChange);
  document.getElementById('dueDateInput').addEventListener('change', onTaskFieldChange);

  // Notes
  document.getElementById('btnAddNote').addEventListener('click', addNoteToCurrentTask);

  // Relationships
  document.getElementById('btnAddRelationship').addEventListener('click', openRelationshipModal);
  document.getElementById('btnRelationshipOk').addEventListener('click', onRelationshipOk);
  document.getElementById('btnRelationshipCancel').addEventListener('click', closeRelationshipModal);
}

/*******************************************************
 *  REFRESH UI
 *******************************************************/
function refreshUI() {
  refreshTaskList();
  populateTaskDetails(null);
}

/*******************************************************
 *  TASK LIST RENDERING
 *******************************************************/
function refreshTaskList() {
  const container = document.getElementById('sidebarContent');
  container.innerHTML = '';
  if (!currentWorkspace) return;

  const filtered = applyFilters(currentWorkspace.tasks);

  const mode = document.getElementById('viewMode').value;
  if (mode === 'tree') {
    const tree = buildTaskTree(filtered, currentWorkspace.relationships);
    tree.forEach(rootNode => {
      renderTreeNode(rootNode, container, 0);
    });
  } else {
    filtered.forEach(t => {
      container.appendChild(renderTaskItem(t));
    });
  }
}

function renderTaskItem(task) {
  const div = document.createElement('div');
  div.className = 'taskItem';
  if (task.id === selectedTaskId) {
    div.classList.add('selected');
  }
  div.textContent = `${task.title} (${getCurrentStatus(task)})`;
  div.addEventListener('click', () => {
    selectedTaskId = task.id;
    populateTaskDetails(task.id);
    refreshTaskList();
  });
  return div;
}

/*******************************************************
 *  BUILD TREE VIEW
 *******************************************************/
function buildTaskTree(tasks, relationships) {
  const childMap = {};
  tasks.forEach(t => { childMap[t.id] = []; });

  relationships.forEach(rel => {
    if (rel.type === '') {  // child-of
      if (childMap[rel.idY] && tasks.find(tt => tt.id === rel.idX)) {
        childMap[rel.idY].push(rel.idX);
      }
    }
  });

  // find root tasks
  const allChildren = new Set(relationships.filter(r => r.type === '').map(r => r.idX));
  const rootTasks = tasks.filter(t => !allChildren.has(t.id));

  function buildNode(task) {
    return {
      task,
      children: childMap[task.id].map(chId => {
        const chTask = tasks.find(tt => tt.id === chId);
        return buildNode(chTask);
      })
    };
  }
  return rootTasks.map(buildNode);
}

function renderTreeNode(node, container, level) {
  const div = renderTaskItem(node.task);
  div.style.marginLeft = (level * 20) + 'px';
  container.appendChild(div);
  node.children.forEach(childNode => {
    renderTreeNode(childNode, container, level + 1);
  });
}

/*******************************************************
 *  FILTERS
 *******************************************************/
function applyFilters(tasks) {
  const searchVal = document.getElementById('searchBox').value.trim().toLowerCase();
  const filterTags = document.getElementById('filterTags').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filterStatus = document.getElementById('filterStatus').value.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const filterPriority = parseInt(document.getElementById('filterPriority').value, 10); // -1 => skip
  const filterUrgency = parseInt(document.getElementById('filterUrgency').value, 10);  // 0 => skip
  const filterImportance = parseInt(document.getElementById('filterImportance').value, 10); // 0 => skip

  return tasks.filter(t => {
    // Title search
    if (searchVal && !t.title.toLowerCase().includes(searchVal)) return false;
    // Tags => OR
    if (filterTags.length > 0) {
      const ttags = t.tags.map(x => x.toLowerCase());
      const matchesTag = filterTags.some(ft => ttags.includes(ft));
      if (!matchesTag) return false;
    }
    // Status => OR
    if (filterStatus.length > 0) {
      const currStatus = getCurrentStatus(t).toLowerCase();
      const matchesStatus = filterStatus.some(fs => fs === currStatus);
      if (!matchesStatus) return false;
    }
    // Priority
    if (filterPriority !== -1 && t.priority !== filterPriority) return false;
    // Urgency (min)
    if (filterUrgency > 0 && t.urgency < filterUrgency) return false;
    // Importance (min)
    if (filterImportance > 0 && t.importance < filterImportance) return false;
    return true;
  });
}

function clearFilters() {
  document.getElementById('searchBox').value = '';
  document.getElementById('filterTags').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterPriority').value = -1;
  document.getElementById('filterPriorityVal').textContent = '-1';
  document.getElementById('filterUrgency').value = 0;
  document.getElementById('filterUrgencyVal').textContent = '0';
  document.getElementById('filterImportance').value = 0;
  document.getElementById('filterImportanceVal').textContent = '0';

  refreshTaskList();
}

/*******************************************************
 *  TASK DETAILS / MAIN PANEL
 *******************************************************/
function populateTaskDetails(taskId) {
  const task = currentWorkspace?.tasks.find(t => t.id === taskId) || null;
  selectedTaskId = task ? task.id : null;

  document.getElementById('taskIdLabel').textContent = task?.id || '—';
  document.getElementById('titleInput').value = task?.title || '';
  document.getElementById('descriptionInput').value = task?.description || '';
  document.getElementById('tagsInput').value = task ? task.tags.join(' ') : '';

  // Current / Next status
  const curr = getCurrentStatus(task);
  document.getElementById('statusCurrent').textContent = curr || '—';
  const selNext = document.getElementById('statusNext');
  selNext.innerHTML = '';
  if (task) {
    const allowed = currentWorkspace.config.states[curr] || [];
    allowed.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      selNext.appendChild(opt);
    });
  }

  // Priority / Urgency / Importance
  const prio = document.getElementById('priorityInput');
  const prioVal = document.getElementById('priorityVal');
  const urg = document.getElementById('urgencyInput');
  const urgVal = document.getElementById('urgencyVal');
  const imp = document.getElementById('importanceInput');
  const impVal = document.getElementById('importanceVal');

  prio.value = task ? task.priority : currentWorkspace.defaults.priority;
  prioVal.textContent = prio.value;
  urg.value = task ? task.urgency : currentWorkspace.defaults.urgency;
  urgVal.textContent = urg.value;
  imp.value = task ? task.importance : currentWorkspace.defaults.importance;
  impVal.textContent = imp.value;

  // Due Date
  const dd = document.getElementById('dueDateInput');
  if (task?.dueDate) {
    dd.value = new Date(task.dueDate).toISOString().slice(0,16);
  } else {
    dd.value = '';
  }

  // Notes
  const notesDiv = document.getElementById('notesList');
  notesDiv.innerHTML = '';
  if (task?.notes) {
    task.notes.forEach((note, idx) => {
      const nd = document.createElement('div');
      nd.className = 'noteItem';
      nd.innerHTML = `
        <div>${note.text}</div>
        <div style="font-size:0.8em;color:#555;">Created: ${new Date(note.createdAt).toLocaleString()}</div>
      `;
      const controls = document.createElement('div');
      controls.className = 'noteControls';

      const btnEdit = document.createElement('button');
      btnEdit.textContent = 'Edit';
      btnEdit.onclick = () => {
        const newText = prompt("Edit note text:", note.text);
        if (newText !== null) {
          note.text = newText;
          saveWorkspace();
          populateTaskDetails(task.id);
        }
      };
      controls.appendChild(btnEdit);

      const btnDel = document.createElement('button');
      btnDel.textContent = 'Delete';
      btnDel.onclick = () => {
        task.notes.splice(idx,1);
        saveWorkspace();
        populateTaskDetails(task.id);
      };
      controls.appendChild(btnDel);

      nd.appendChild(controls);
      notesDiv.appendChild(nd);
    });
  }

  // Relationships
  const relDiv = document.getElementById('relationshipsList');
  relDiv.innerHTML = '';
  if (task) {
    const relevant = currentWorkspace.relationships.filter(r => r.idX === task.id || r.idY === task.id);
    relevant.forEach(r => {
      const otherId = (r.idX === task.id) ? r.idY : r.idX;
      const otherTask = currentWorkspace.tasks.find(tt => tt.id === otherId);
      const otherTitle = otherTask ? otherTask.title : `(${otherId}?)`;
      const rType = (r.type === '' ? 'child-of' : r.type);

      const rd = document.createElement('div');
      rd.className = 'relationshipItem';
      rd.innerHTML = `
        <div>Type: <strong>${rType}</strong>, Task: <strong>${otherTitle}</strong> [${otherId}]</div>
      `;
      relDiv.appendChild(rd);
    });
  }
}

function getCurrentStatus(task) {
  if (!task?.statuses || task.statuses.length === 0) return '—';
  return task.statuses[task.statuses.length - 1].status;
}

/*******************************************************
 *  REAL-TIME TASK EDITS
 *******************************************************/
function onTaskFieldChange() {
  if (!selectedTaskId) return;
  const task = currentWorkspace.tasks.find(t => t.id === selectedTaskId);
  if (!task) return;

  task.title = document.getElementById('titleInput').value.trim();
  task.description = document.getElementById('descriptionInput').value;
  task.tags = document.getElementById('tagsInput').value.trim().split(/\s+/).filter(Boolean);

  task.priority = parseInt(document.getElementById('priorityInput').value, 10);
  document.getElementById('priorityVal').textContent = task.priority;

  task.urgency = parseInt(document.getElementById('urgencyInput').value, 10);
  document.getElementById('urgencyVal').textContent = task.urgency;

  task.importance = parseInt(document.getElementById('importanceInput').value, 10);
  document.getElementById('importanceVal').textContent = task.importance;

  const ddVal = document.getElementById('dueDateInput').value;
  task.dueDate = ddVal ? new Date(ddVal).toISOString() : null;

  saveWorkspace();
}

function onStatusTransition() {
  if (!selectedTaskId) return;
  const task = currentWorkspace.tasks.find(t => t.id === selectedTaskId);
  if (!task) return;

  const sel = document.getElementById('statusNext');
  if (!sel.value) return;
  const newStatus = sel.value;

  task.statuses.push({
    status: newStatus,
    dateTime: new Date().toISOString()
  });

  saveWorkspace();
  populateTaskDetails(task.id);
  refreshTaskList();
}

/*******************************************************
 *  ADD / DELETE TASK
 *******************************************************/
async function addTask() {
  if (!currentWorkspace) return;
  const shortId = generateShortId();
  const initStatus = currentWorkspace.config.beginState || 'created-at';

  const newTask = {
    id: shortId,
    title: "New Task",
    description: "",
    tags: [],
    statuses: [
      { status: initStatus, dateTime: new Date().toISOString() }
    ],
    priority: currentWorkspace.defaults.priority,
    urgency: currentWorkspace.defaults.urgency,
    importance: currentWorkspace.defaults.importance,
    dueDate: null,
    notes: []
  };
  currentWorkspace.tasks.push(newTask);
  selectedTaskId = newTask.id;
  await saveWorkspace();
  refreshUI();
  populateTaskDetails(newTask.id);
}

async function deleteSelectedTask() {
  if (!selectedTaskId || !currentWorkspace) return;
  const idx = currentWorkspace.tasks.findIndex(t => t.id === selectedTaskId);
  if (idx >= 0) {
    if (!confirm("Permanently delete this task?")) return;
    // Remove it from tasks
    currentWorkspace.tasks.splice(idx, 1);
    // Remove relationships referencing it
    currentWorkspace.relationships = currentWorkspace.relationships.filter(r => 
      r.idX !== selectedTaskId && r.idY !== selectedTaskId
    );
    selectedTaskId = null;
    await saveWorkspace();
    refreshUI();
  }
}

/*******************************************************
 *  NOTES
 *******************************************************/
function addNoteToCurrentTask() {
  if (!selectedTaskId) return;
  const task = currentWorkspace.tasks.find(t => t.id === selectedTaskId);
  if (!task) return;

  const text = prompt("Note text:");
  if (text !== null) {
    task.notes.push({
      text,
      createdAt: new Date().toISOString()
    });
    saveWorkspace();
    populateTaskDetails(task.id);
  }
}

/*******************************************************
 *  RELATIONSHIP MODAL
 *******************************************************/
function openRelationshipModal() {
  if (!selectedTaskId || !currentWorkspace) return;
  const task = currentWorkspace.tasks.find(t => t.id === selectedTaskId);
  if (!task) return;

  const modal = document.getElementById('relationshipModal');
  modal.classList.remove('hidden');

  // Populate relationship types
  const typeSelect = document.getElementById('relationshipTypeSelect');
  typeSelect.innerHTML = '';
  [
    { value: "", label: "child-of" },
    { value: "depends-upon", label: "depends-upon" },
    { value: "peer", label: "peer" },
    { value: "none", label: "Remove relationship" }
  ].forEach(optData => {
    const opt = document.createElement('option');
    opt.value = optData.value;
    opt.textContent = optData.label;
    typeSelect.appendChild(opt);
  });

  // Populate tasks
  const taskSelect = document.getElementById('relationshipTaskSelect');
  taskSelect.innerHTML = '';
  currentWorkspace.tasks.forEach(t => {
    if (t.id !== selectedTaskId) { // skip the current task
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.title} [${t.id}]`;
      taskSelect.appendChild(opt);
    }
  });
}

function closeRelationshipModal() {
  const modal = document.getElementById('relationshipModal');
  modal.classList.add('hidden');
}

function onRelationshipOk() {
  const relType = document.getElementById('relationshipTypeSelect').value;
  const otherTaskId = document.getElementById('relationshipTaskSelect').value;
  if (!selectedTaskId || !otherTaskId) {
    closeRelationshipModal();
    return;
  }

  // If user selected "none", remove existing relationship
  if (relType === 'none') {
    currentWorkspace.relationships = currentWorkspace.relationships.filter(r => {
      if ((r.idX === selectedTaskId && r.idY === otherTaskId) ||
          (r.idX === otherTaskId && r.idY === selectedTaskId)) {
        return false;
      }
      return true;
    });
    saveWorkspace();
    populateTaskDetails(selectedTaskId);
    closeRelationshipModal();
    return;
  }

  // Remove any existing relationship for the same pair
  currentWorkspace.relationships = currentWorkspace.relationships.filter(r => {
    if ((r.idX === selectedTaskId && r.idY === otherTaskId) ||
        (r.idX === otherTaskId && r.idY === selectedTaskId)) {
      return false;
    }
    return true;
  });

  // Add new
  currentWorkspace.relationships.push({
    idX: selectedTaskId,
    idY: otherTaskId,
    type: relType
  });

  saveWorkspace();
  populateTaskDetails(selectedTaskId);
  closeRelationshipModal();
}

/*******************************************************
 *  SAVE WORKSPACE
 *******************************************************/
async function saveWorkspace() {
  if (!currentWorkspace) return;
  await addOrUpdateWorkspace(currentWorkspace);
}

/*******************************************************
 *  IMPORT / EXPORT
 *******************************************************/
function exportWorkspace() {
  if (!currentWorkspace) return;
  const dataStr = JSON.stringify(currentWorkspace, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `taskmaster_${currentWorkspace.name}_${currentWorkspace.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const imported = JSON.parse(evt.target.result);
      if (!imported.id) {
        imported.id = generateShortId();
      }
      await addOrUpdateWorkspace(imported);
      alert(`Imported workspace: ${imported.name} (${imported.id})`);

      const all = await getAllWorkspaces();
      populateWorkspaceSelector(all);
    } catch (ex) {
      console.error(ex);
      alert("Failed to import JSON.");
    }
  };
  reader.readAsText(file);
  e.target.value = null;
}
