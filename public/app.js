const API = '';
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let lists = [];
let todos = [];

// ── API Helper ──
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Auth ──
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

document.getElementById('show-register').addEventListener('click', e => {
  e.preventDefault();
  loginForm.style.display = 'none';
  registerForm.style.display = 'block';
});

document.getElementById('show-login').addEventListener('click', e => {
  e.preventDefault();
  registerForm.style.display = 'none';
  loginForm.style.display = 'block';
});

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const data = await api('POST', '/api/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value,
    });
    setAuth(data.token, data.user);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

registerForm.addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  try {
    const data = await api('POST', '/api/register', {
      username: document.getElementById('reg-username').value,
      email: document.getElementById('reg-email').value,
      password: document.getElementById('reg-password').value,
    });
    setAuth(data.token, data.user);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

function setAuth(t, user) {
  token = t;
  currentUser = user;
  localStorage.setItem('token', t);
  localStorage.setItem('user', JSON.stringify(user));
  showApp();
}

document.getElementById('logout-btn').addEventListener('click', () => {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  authScreen.style.display = 'flex';
  appScreen.style.display = 'none';
});

// ── App Init ──
async function showApp() {
  authScreen.style.display = 'none';
  appScreen.style.display = 'block';
  document.getElementById('user-greeting').textContent = `Hi, ${currentUser.username}`;
  await loadData();
  render();
}

async function loadData() {
  try {
    [lists, todos] = await Promise.all([
      api('GET', '/api/lists'),
      api('GET', '/api/todos'),
    ]);
  } catch (err) {
    if (err.message === 'Unauthorized' || err.message === 'Invalid token') {
      token = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      authScreen.style.display = 'flex';
      appScreen.style.display = 'none';
    }
  }
}

// ── Rendering ──
function render() {
  renderSchedule();
  renderLists();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.getTime() === today.getTime()) return 'TODAY';
  if (d.getTime() === tomorrow.getTime()) return 'TOMORROW';

  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function getDateLabel(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d < today) return 'Overdue';
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // If within this week
  const diff = (d - today) / (1000 * 60 * 60 * 24);
  if (diff <= 6) return days[d.getDay()];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function getDateSubtitle(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function renderSchedule() {
  const container = document.getElementById('schedule-list');

  // Group todos by date
  const datedTodos = todos.filter(t => t.due_date && !t.completed);
  const groups = {};

  datedTodos.forEach(t => {
    const label = getDateLabel(t.due_date);
    if (!groups[label]) {
      groups[label] = { label, date: t.due_date, todos: [] };
    }
    groups[label].todos.push(t);
  });

  // Sort groups by date
  const sorted = Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    container.innerHTML = '<p class="schedule-empty">No upcoming tasks with due dates</p>';
    return;
  }

  container.innerHTML = sorted.map(group => `
    <div class="schedule-section">
      <div class="schedule-section-title">${group.label}</div>
      <div class="schedule-section-date">${getDateSubtitle(group.date)}</div>
      ${group.todos.map(t => `
        <div class="schedule-todo ${t.completed ? 'completed' : ''}"
             style="background: ${t.list_color}"
             draggable="true"
             data-todo-id="${t.id}"
             data-list-id="${t.list_id}"
             onclick="openEditTodo(${t.id})">
          <div class="todo-name">${escapeHtml(t.title)}</div>
          <div class="todo-meta">
            ${t.list_emoji} ${t.list_name.toUpperCase()}
            ${t.repeat ? ` &middot; REPEATS ${t.repeat.toUpperCase()}` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  // Attach drag events to schedule todos
  container.querySelectorAll('.schedule-todo[draggable="true"]').forEach(item => {
    item.addEventListener('dragstart', function(e) {
      draggedTodoId = parseInt(this.dataset.todoId);
      draggedFromListId = parseInt(this.dataset.listId);
      this.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedTodoId);
    });
    item.addEventListener('dragend', function() {
      this.classList.remove('dragging');
      clearAllDragStyles();
      draggedTodoId = null;
      draggedFromListId = null;
    });
  });
}

function renderLists() {
  const grid = document.getElementById('lists-grid');
  grid.innerHTML = lists.map(list => {
    const listTodos = todos.filter(t => t.list_id === list.id);
    return `
      <div class="list-card">
        <div class="list-card-header" style="background: ${list.color}">
          <div class="list-card-title">
            <span>${list.emoji}</span>
            <span>${escapeHtml(list.name)}</span>
          </div>
          <div class="list-card-actions">
            <button onclick="deleteList(${list.id})" title="Delete list">&#128465;</button>
          </div>
        </div>
        <div class="list-card-body" data-list-id="${list.id}">
          ${listTodos.length === 0 ? '<div class="list-empty">No tasks yet</div>' : ''}
          ${listTodos.map(t => `
            <div class="list-todo-item" draggable="true" data-todo-id="${t.id}" data-list-id="${list.id}">
              <div class="todo-checkbox ${t.completed ? 'checked' : ''}"
                   onclick="toggleTodo(${t.id}, ${t.completed ? 0 : 1})"></div>
              <span class="todo-text ${t.completed ? 'completed' : ''}"
                    onclick="openEditTodo(${t.id})">${escapeHtml(t.title)}</span>
              ${t.due_date ? `<span class="todo-due ${isOverdue(t.due_date) ? 'overdue' : ''}">${formatDate(t.due_date)}</span>` : ''}
              ${t.repeat ? `<span class="todo-repeat-badge">${t.repeat}</span>` : ''}
              <button class="todo-delete" onclick="deleteTodo(${t.id})">&#10005;</button>
            </div>
          `).join('')}
          <div class="list-add-todo" onclick="openAddTodo(${list.id})">
            <span>+</span> Add task
          </div>
        </div>
      </div>
    `;
  }).join('');
  initDragAndDrop();
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ── Todo CRUD ──
async function toggleTodo(id, completed) {
  try {
    const updated = await api('PUT', `/api/todos/${id}`, { completed });
    const idx = todos.findIndex(t => t.id === id);
    if (idx !== -1) todos[idx] = updated;
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteTodo(id) {
  try {
    await api('DELETE', `/api/todos/${id}`);
    todos = todos.filter(t => t.id !== id);
    render();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteList(id) {
  if (!confirm('Delete this list and all its tasks?')) return;
  try {
    await api('DELETE', `/api/lists/${id}`);
    lists = lists.filter(l => l.id !== id);
    todos = todos.filter(t => t.list_id !== id);
    render();
  } catch (err) {
    alert(err.message);
  }
}

// ── Todo Modal ──
const todoModal = document.getElementById('todo-modal');
const todoForm = document.getElementById('todo-form');

function populateListSelect(selectedId) {
  const select = document.getElementById('todo-list-select');
  select.innerHTML = lists.map(l =>
    `<option value="${l.id}" ${l.id === selectedId ? 'selected' : ''}>${l.emoji} ${l.name}</option>`
  ).join('');
}

function openAddTodo(listId) {
  document.getElementById('modal-title').textContent = 'Add Task';
  document.getElementById('todo-title').value = '';
  document.getElementById('todo-due-date').value = '';
  document.getElementById('todo-repeat').value = '';
  document.getElementById('todo-edit-id').value = '';
  populateListSelect(listId);
  todoModal.style.display = 'flex';
  document.getElementById('todo-title').focus();
}

function openEditTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  document.getElementById('modal-title').textContent = 'Edit Task';
  document.getElementById('todo-title').value = todo.title;
  document.getElementById('todo-due-date').value = todo.due_date || '';
  document.getElementById('todo-repeat').value = todo.repeat || '';
  document.getElementById('todo-edit-id').value = todo.id;
  populateListSelect(todo.list_id);
  todoModal.style.display = 'flex';
  document.getElementById('todo-title').focus();
}

document.getElementById('close-todo-modal').addEventListener('click', () => {
  todoModal.style.display = 'none';
});

todoModal.addEventListener('click', e => {
  if (e.target === todoModal) todoModal.style.display = 'none';
});

todoForm.addEventListener('submit', async e => {
  e.preventDefault();
  const editId = document.getElementById('todo-edit-id').value;
  const body = {
    title: document.getElementById('todo-title').value,
    list_id: parseInt(document.getElementById('todo-list-select').value),
    due_date: document.getElementById('todo-due-date').value || null,
    repeat: document.getElementById('todo-repeat').value || null,
  };

  try {
    if (editId) {
      const updated = await api('PUT', `/api/todos/${editId}`, body);
      const idx = todos.findIndex(t => t.id === parseInt(editId));
      if (idx !== -1) todos[idx] = updated;
    } else {
      const created = await api('POST', '/api/todos', body);
      todos.push(created);
    }
    todoModal.style.display = 'none';
    render();
  } catch (err) {
    alert(err.message);
  }
});

// ── FAB ──
document.getElementById('fab-add').addEventListener('click', () => {
  openAddTodo(lists.length > 0 ? lists[0].id : null);
});

// ── List Modal ──
const listModal = document.getElementById('list-modal');
const listForm = document.getElementById('list-form');

document.getElementById('add-list-btn').addEventListener('click', () => {
  document.getElementById('list-name').value = '';
  document.getElementById('list-emoji').value = '';
  document.getElementById('list-color').value = '#5b6abf';
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  document.querySelector('.color-dot[data-color="#5b6abf"]').classList.add('selected');
  listModal.style.display = 'flex';
  document.getElementById('list-name').focus();
});

document.getElementById('close-list-modal').addEventListener('click', () => {
  listModal.style.display = 'none';
});

listModal.addEventListener('click', e => {
  if (e.target === listModal) listModal.style.display = 'none';
});

document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
    document.getElementById('list-color').value = dot.dataset.color;
  });
});

listForm.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const created = await api('POST', '/api/lists', {
      name: document.getElementById('list-name').value,
      emoji: document.getElementById('list-emoji').value,
      color: document.getElementById('list-color').value,
    });
    lists.push(created);
    listModal.style.display = 'none';
    render();
  } catch (err) {
    alert(err.message);
  }
});

// ── Drag and Drop ──
let draggedTodoId = null;
let draggedFromListId = null;

function initDragAndDrop() {
  const todoItems = document.querySelectorAll('.list-todo-item[draggable="true"]');
  const listBodies = document.querySelectorAll('.list-card-body');

  todoItems.forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleItemDragOver);
    item.addEventListener('dragleave', handleItemDragLeave);
    item.addEventListener('drop', handleItemDrop);
  });

  listBodies.forEach(body => {
    body.addEventListener('dragover', handleListDragOver);
    body.addEventListener('dragleave', handleListDragLeave);
    body.addEventListener('drop', handleListDrop);
  });
}

function handleDragStart(e) {
  draggedTodoId = parseInt(this.dataset.todoId);
  draggedFromListId = parseInt(this.dataset.listId);
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTodoId);
}

function handleDragEnd() {
  this.classList.remove('dragging');
  clearAllDragStyles();
  draggedTodoId = null;
  draggedFromListId = null;
}

function handleItemDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const dragging = document.querySelector('.dragging');
  if (this !== dragging) {
    this.classList.add('drag-over');
  }
}

function handleItemDragLeave() {
  this.classList.remove('drag-over');
}

function handleItemDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over');
  const targetTodoId = parseInt(this.dataset.todoId);
  const targetListId = parseInt(this.dataset.listId);
  if (draggedTodoId === targetTodoId) return;
  moveTodoToList(draggedTodoId, targetListId, targetTodoId);
}

function handleListDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over-list');
}

function handleListDragLeave(e) {
  // Only remove if leaving the list body entirely
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('drag-over-list');
  }
}

function handleListDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over-list');
  const targetListId = parseInt(this.dataset.listId);
  if (draggedTodoId == null) return;
  moveTodoToList(draggedTodoId, targetListId, null);
}

function clearAllDragStyles() {
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.drag-over-list').forEach(el => el.classList.remove('drag-over-list'));
}

async function moveTodoToList(todoId, newListId, beforeTodoId) {
  try {
    const updated = await api('PUT', `/api/todos/${todoId}`, { list_id: newListId });
    const idx = todos.findIndex(t => t.id === todoId);
    if (idx !== -1) todos[idx] = updated;

    // Reorder locally: place the moved todo before beforeTodoId in the array
    if (beforeTodoId != null) {
      const movedTodo = todos.find(t => t.id === todoId);
      todos = todos.filter(t => t.id !== todoId);
      const beforeIdx = todos.findIndex(t => t.id === beforeTodoId);
      if (beforeIdx !== -1) {
        todos.splice(beforeIdx, 0, movedTodo);
      } else {
        todos.push(movedTodo);
      }
    }

    render();
  } catch (err) {
    alert(err.message);
  }
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    todoModal.style.display = 'none';
    listModal.style.display = 'none';
  }
});

// ── Boot ──
if (token && currentUser) {
  showApp();
} else {
  authScreen.style.display = 'flex';
  appScreen.style.display = 'none';
}
