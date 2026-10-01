const express = require("express");
const path = require("path");
const dns = require("dns").promises;
const net = require("net");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname)));

const robots = [
  { id: "RB-001", name: "Atlas", status: "Working", battery: 87, zone: "A-01", task: "Picking #1042", speed: 1.8, completed: 142, x: 16, y: 22 },
  { id: "RB-002", name: "Bolt", status: "Charging", battery: 31, zone: "B-03", task: "Charging", speed: 0, completed: 119, x: 48, y: 70 },
  { id: "RB-003", name: "Cargo", status: "Working", battery: 64, zone: "C-02", task: "Transport #1045", speed: 1.5, completed: 98, x: 73, y: 36 },
  { id: "RB-004", name: "Delta", status: "Idle", battery: 96, zone: "D-01", task: "Awaiting task", speed: 0, completed: 167, x: 83, y: 78 },
  { id: "RB-005", name: "Echo", status: "Maintenance", battery: 12, zone: "M-01", task: "Motor inspection", speed: 0, completed: 74, x: 26, y: 79 },
  { id: "RB-006", name: "Falcon", status: "Working", battery: 52, zone: "A-04", task: "Picking #1048", speed: 1.2, completed: 131, x: 61, y: 17 }
];

let tasks = [
  { id: "T-1048", type: "Pick", priority: "High", item: "SKU-8842", quantity: 12, location: "A-04", assigned: "RB-006", status: "In Progress", created: Date.now() - 600000 },
  { id: "T-1045", type: "Transport", priority: "Normal", item: "SKU-1120", quantity: 8, location: "C-02", assigned: "RB-003", status: "In Progress", created: Date.now() - 900000 },
  { id: "T-1042", type: "Pick", priority: "High", item: "SKU-4418", quantity: 5, location: "A-01", assigned: "RB-001", status: "In Progress", created: Date.now() - 1200000 },
  { id: "T-1049", type: "Restock", priority: "Normal", item: "SKU-2201", quantity: 24, location: "B-07", assigned: null, status: "Queued", created: Date.now() - 120000 },
  { id: "T-1050", type: "Pick", priority: "Low", item: "SKU-9910", quantity: 3, location: "D-02", assigned: null, status: "Queued", created: Date.now() - 60000 }
];

const inventory = [
  { sku: "SKU-8842", name: "Wireless Scanner", stock: 38, reorder: 20, location: "A-04", supplier: "TechSupply" },
  { sku: "SKU-1120", name: "Packing Tape", stock: 12, reorder: 25, location: "C-02", supplier: "PackRight" },
  { sku: "SKU-4418", name: "USB-C Cable", stock: 84, reorder: 30, location: "A-01", supplier: "CableHub" },
  { sku: "SKU-2201", name: "Shipping Labels", stock: 17, reorder: 40, location: "B-07", supplier: "LabelWorks" },
  { sku: "SKU-9910", name: "Barcode Tags", stock: 126, reorder: 50, location: "D-02", supplier: "LabelWorks" },
  { sku: "SKU-5012", name: "Safety Gloves", stock: 9, reorder: 20, location: "M-01", supplier: "SafeGear" }
];

const events = [
  { time: Date.now() - 1000, type: "success", message: "RB-006 started task T-1048" },
  { time: Date.now() - 90000, type: "warning", message: "RB-002 battery below 35%" },
  { time: Date.now() - 180000, type: "info", message: "Task T-1049 added to queue" },
  { time: Date.now() - 300000, type: "danger", message: "RB-005 entered maintenance mode" }
];

function snapshot() {
  return {
    robots,
    tasks,
    inventory,
    events: events.slice(-30).reverse(),
    metrics: {
      totalRobots: robots.length,
      activeRobots: robots.filter(r => r.status === "Working").length,
      availableRobots: robots.filter(r => r.status === "Idle").length,
      lowBattery: robots.filter(r => r.battery < 35).length,
      queuedTasks: tasks.filter(t => t.status === "Queued").length,
      completedTasks: robots.reduce((sum, r) => sum + r.completed, 0),
      lowStock: inventory.filter(i => i.stock <= i.reorder).length
    }
  };
}

function addEvent(type, message) {
  events.push({ time: Date.now(), type, message });
  if (events.length > 100) events.shift();
}

function nextTaskId() {
  const nums = tasks.map(t => Number(t.id.split("-")[1])).filter(Number.isFinite);
  return `T-${Math.max(...nums, 1050) + 1}`;
}

function findRobot(id) {
  return robots.find(r => r.id === id);
}

app.get("/api/dashboard", (req, res) => res.json(snapshot()));

app.post("/api/tasks", (req, res) => {
  const { type = "Pick", priority = "Normal", item, quantity, location } = req.body;
  if (!item || !location || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
    return res.status(400).json({ error: "item, location and a positive quantity are required" });
  }

  const task = {
    id: nextTaskId(),
    type,
    priority,
    item: String(item),
    quantity: Number(quantity),
    location: String(location),
    assigned: null,
    status: "Queued",
    created: Date.now()
  };
  tasks.push(task);
  addEvent("info", `${task.id} created for ${task.location}`);
  res.status(201).json(task);
});

app.post("/api/robots/:id/assign", (req, res) => {
  const robot = findRobot(req.params.id);
  const task = tasks.find(t => t.id === req.body.taskId);

  if (!robot) return res.status(404).json({ error: "Robot not found" });
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (robot.status === "Maintenance") return res.status(409).json({ error: "Robot is in maintenance" });

  const oldRobot = task.assigned ? findRobot(task.assigned) : null;
  if (oldRobot && oldRobot.id !== robot.id) {
    oldRobot.status = "Idle";
    oldRobot.task = "Awaiting task";
  }

  tasks.forEach(t => {
    if (t.assigned === robot.id && t.status === "In Progress") {
      t.assigned = null;
      t.status = "Queued";
    }
  });

  task.assigned = robot.id;
  task.status = "In Progress";
  robot.status = "Working";
  robot.task = `${task.type} ${task.id}`;
  robot.speed = robot.speed || 1.4;

  addEvent("success", `${robot.id} assigned to ${task.id}`);
  res.json({ robot, task });
});

app.post("/api/robots/:id/action", (req, res) => {
  const robot = findRobot(req.params.id);
  if (!robot) return res.status(404).json({ error: "Robot not found" });

  const action = req.body.action;
  if (action === "charge") {
    robot.status = "Charging";
    robot.task = "Charging";
    robot.speed = 0;
    addEvent("info", `${robot.id} sent to charging station`);
  } else if (action === "idle") {
    robot.status = "Idle";
    robot.task = "Awaiting task";
    robot.speed = 0;
    tasks.forEach(t => {
      if (t.assigned === robot.id && t.status === "In Progress") {
        t.assigned = null;
        t.status = "Queued";
      }
    });
    addEvent("warning", `${robot.id} set to idle`);
  } else if (action === "maintenance") {
    robot.status = "Maintenance";
    robot.task = "Maintenance";
    robot.speed = 0;
    addEvent("danger", `${robot.id} moved to maintenance`);
  } else {
    return res.status(400).json({ error: "Unknown action" });
  }

  res.json(robot);
});

app.post("/api/tasks/:id/complete", (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  task.status = "Completed";
  const robot = task.assigned ? findRobot(task.assigned) : null;
  if (robot) {
    robot.completed += 1;
    robot.status = "Idle";
    robot.task = "Awaiting task";
    robot.speed = 0;
    robot.battery = Math.max(0, robot.battery - 2);
  }
  addEvent("success", `${task.id} completed`);
  res.json(task);
});

app.get("/api/inventory", (req, res) => res.json(inventory));

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    return p[0] === 10 ||
      p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168);
  }
  return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80");
}

async function validatePublicUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are supported");
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed");

  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) {
    throw new Error("Private/local network targets are not allowed");
  }
  return url;
}

app.post("/api/scrape", async (req, res) => {
  try {
    const url = await validatePublicUrl(req.body.url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SmartWarehouseRobotManager/1.0" }
    });
    clearTimeout(timer);

    if (!response.ok) throw new Error(`Remote server returned ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error("Target is not an HTML page");

    const html = await response.text();
    if (html.length > 2_000_000) throw new Error("Page is too large (2 MB limit)");

    const cheerio = require("cheerio");
    const $ = cheerio.load(html);
    const links = [];
    $("a[href]").each((_, el) => {
      if (links.length < 20) {
        links.push({
          text: $(el).text().trim().replace(/\s+/g, " ").slice(0, 100),
          href: new URL($(el).attr("href"), url).href
        });
      }
    });

    const result = {
      url: url.href,
      title: $("title").first().text().trim(),
      description: $('meta[name="description"]').attr("content") || "",
      headings: $("h1,h2,h3").map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 30),
      links
    };

    addEvent("info", `Supplier page scraped: ${url.hostname}`);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.name === "AbortError" ? "Scrape timed out" : error.message });
  }
});

setInterval(() => {
  robots.forEach(robot => {
    if (robot.status === "Working") {
      robot.battery = Math.max(5, robot.battery - 0.15);
      robot.x = Math.min(92, Math.max(8, robot.x + (Math.random() - 0.5) * 2));
      robot.y = Math.min(88, Math.max(12, robot.y + (Math.random() - 0.5) * 2));
      if (robot.battery <= 15) {
        robot.status = "Charging";
        robot.task = "Low battery — charging";
        robot.speed = 0;
        addEvent("warning", `${robot.id} automatically sent to charging`);
      }
    } else if (robot.status === "Charging") {
      robot.battery = Math.min(100, robot.battery + 0.5);
      if (robot.battery >= 90) {
        robot.status = "Idle";
        robot.task = "Awaiting task";
        addEvent("success", `${robot.id} finished charging`);
      }
    }
  });
}, 3000);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Smart Warehouse Robot Manager running at http://localhost:${PORT}`);
});
