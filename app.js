const state = { data: null };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));

function statusBadge(status) {
  const map = { Working:"success", Idle:"secondary", Charging:"warning", Maintenance:"danger", Queued:"secondary", "In Progress":"primary", Completed:"success" };
  return `<span class="badge text-bg-${map[status] || "dark"}">${escapeHtml(status)}</span>`;
}

function batteryHtml(value) {
  const cls = value < 20 ? "bg-danger" : value < 40 ? "bg-warning" : "bg-success";
  return `<div class="battery-bar"><div class="progress"><div class="progress-bar ${cls}" style="width:${value}%"></div></div><small>${Math.round(value)}%</small></div>`;
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}

function render(data) {
  state.data = data;
  $("#totalRobots").textContent = data.metrics.totalRobots;
  $("#activeRobots").textContent = data.metrics.activeRobots;
  $("#queuedTasks").textContent = data.metrics.queuedTasks;
  $("#lowStock").textContent = data.metrics.lowStock;

  const query = ($("#robotSearch").value || "").toLowerCase();
  $("#robotTable").innerHTML = data.robots.filter(r => `${r.id} ${r.name} ${r.status}`.toLowerCase().includes(query)).map(r => `
    <tr>
      <td><strong>${escapeHtml(r.id)}</strong><br><small class="text-muted">${escapeHtml(r.name)}</small></td>
      <td>${statusBadge(r.status)}</td>
      <td>${batteryHtml(r.battery)}</td>
      <td>${escapeHtml(r.zone)}</td>
      <td class="small">${escapeHtml(r.task)}</td>
      <td>
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">Manage</button>
          <ul class="dropdown-menu">
            <li><button class="dropdown-item" onclick="robotAction('${r.id}','charge')">Send to charge</button></li>
            <li><button class="dropdown-item" onclick="robotAction('${r.id}','idle')">Set idle</button></li>
            <li><button class="dropdown-item text-danger" onclick="robotAction('${r.id}','maintenance')">Maintenance</button></li>
          </ul>
        </div>
      </td>
    </tr>`).join("");

  const filter = $("#taskFilter").value;
  $("#taskTable").innerHTML = data.tasks.filter(t => filter === "All" || t.status === filter).slice().reverse().map(t => `
    <tr>
      <td><strong>${escapeHtml(t.id)}</strong></td><td>${escapeHtml(t.type)}</td>
      <td><span class="badge ${t.priority === "High" ? "text-bg-danger" : t.priority === "Low" ? "text-bg-light" : "text-bg-info"}">${escapeHtml(t.priority)}</span></td>
      <td>${escapeHtml(t.assigned || "Unassigned")}</td><td>${statusBadge(t.status)}</td>
      <td>${t.status === "In Progress" ? `<button class="btn btn-sm btn-outline-success" onclick="completeTask('${t.id}')"><i class="bi bi-check2"></i></button>` : ""}</td>
    </tr>`).join("");

  $("#inventoryTable").innerHTML = data.inventory.map(i => `
    <tr class="${i.stock <= i.reorder ? "table-warning" : ""}">
      <td><strong>${escapeHtml(i.sku)}</strong></td><td>${escapeHtml(i.name)}</td>
      <td><strong>${i.stock}</strong></td><td>${i.reorder}</td><td>${escapeHtml(i.location)}</td><td>${escapeHtml(i.supplier)}</td>
    </tr>`).join("");

  $("#eventFeed").innerHTML = data.events.map(e => `
    <div class="event-item"><span class="event-dot dot-${escapeHtml(e.type)}"></span>${escapeHtml(e.message)}<small>${formatTime(e.time)}</small></div>
  `).join("");

  renderMap(data.robots);
}

function renderMap(robots) {
  const map = $("#warehouseMap");
  map.querySelectorAll(".robot-marker").forEach(el => el.remove());
  robots.forEach(r => {
    const marker = document.createElement("div");
    marker.className = `robot-marker ${r.status.toLowerCase()}`;
    marker.style.left = `${r.x}%`;
    marker.style.top = `${r.y}%`;
    marker.title = `${r.id} — ${r.status}`;
    marker.innerHTML = `<i class="bi bi-robot"></i><span class="robot-label">${escapeHtml(r.id)}</span>`;
    marker.onclick = () => showToast(`${r.id}: ${r.status} — ${r.task}`, "info");
    map.appendChild(marker);
  });
}

async function api(url, options = {}) {
  const res = await fetch(url, { headers: {"Content-Type":"application/json"}, ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Request failed");
  return body;
}

async function load() {
  try { render(await api("/api/dashboard")); }
  catch (e) { showToast(e.message, "danger"); }
}

async function robotAction(id, action) {
  try { await api(`/api/robots/${id}/action`, {method:"POST", body:JSON.stringify({action})}); await load(); }
  catch (e) { showToast(e.message, "danger"); }
}

async function completeTask(id) {
  try { await api(`/api/tasks/${id}/complete`, {method:"POST"}); await load(); }
  catch (e) { showToast(e.message, "danger"); }
}

function showToast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.setAttribute("role", "alert");
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${escapeHtml(message)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  $("#toastContainer").appendChild(el);
  const toast = new bootstrap.Toast(el, {delay:3000});
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

$("#taskForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/tasks", {method:"POST", body:JSON.stringify({
      type: $("#taskType").value, priority: $("#priority").value, item: $("#item").value,
      quantity: Number($("#quantity").value), location: $("#location").value
    })});
    bootstrap.Modal.getInstance($("#taskModal")).hide();
    e.target.reset();
    await load();
    showToast("Task created", "success");
  } catch (err) { showToast(err.message, "danger"); }
});

$("#scrapeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const result = $("#scrapeResult");
  result.classList.remove("d-none");
  result.innerHTML = `<div class="spinner-border spinner-border-sm me-2"></div> Scraping...`;
  try {
    const data = await api("/api/scrape", {method:"POST", body:JSON.stringify({url:$("#scrapeUrl").value})});
    result.innerHTML = `
      <h6>${escapeHtml(data.title || "Untitled page")}</h6>
      <p class="small text-muted">${escapeHtml(data.description || "No meta description")}</p>
      <strong>Headings</strong><ul class="small">${data.headings.map(h => `<li>${escapeHtml(h)}</li>`).join("") || "<li>None</li>"}</ul>
      <strong>Links (${data.links.length})</strong><ul class="small">${data.links.slice(0,8).map(l => `<li><a href="${escapeHtml(l.href)}" target="_blank" rel="noopener">${escapeHtml(l.text || l.href)}</a></li>`).join("")}</ul>`;
    await load();
  } catch (err) { result.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(err.message)}</div>`; }
});

$("#robotSearch").addEventListener("input", () => state.data && render(state.data));
$("#taskFilter").addEventListener("change", () => state.data && render(state.data));

load();
setInterval(load, 3000);
