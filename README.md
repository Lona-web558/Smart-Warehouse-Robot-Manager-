# Smart Warehouse Robot Manager

A full-stack warehouse robotics management dashboard using:

- HTML5
- CSS3
- Bootstrap 5
- Vanilla JavaScript
- Node.js 18+
- Express.js
- Cheerio for controlled HTML scraping

## Features

- Live simulated robot fleet
- Warehouse map with moving robot markers
- Robot battery monitoring
- Robot charging/idle/maintenance controls
- Task creation and completion
- Task queue and filtering
- Inventory/reorder monitoring
- Activity/event feed
- Public supplier-page HTML scraper
- SSRF protections for the scraper
- Responsive Bootstrap UI
- REST API

## Run

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run:

```bash
npm install
npm start
```

4. Open:

http://localhost:3000

For development:

```bash
npm run dev
```

## API

- `GET /api/dashboard`
- `POST /api/tasks`
- `POST /api/robots/:id/assign`
- `POST /api/robots/:id/action`
- `POST /api/tasks/:id/complete`
- `GET /api/inventory`
- `POST /api/scrape`

### Example task

```json
{
  "type": "Pick",
  "priority": "High",
  "item": "SKU-8842",
  "quantity": 12,
  "location": "A-04"
}
```

### Scraper

POST `/api/scrape`:

```json
{
  "url": "https://example.com"
}
```

The scraper only accepts HTTP/HTTPS URLs and blocks URLs resolving to private/local IP addresses. In production, also enforce outbound network policy, authentication, rate limiting, robots.txt/terms compliance, and domain allowlists where appropriate.

## Production improvements

For a production warehouse system, replace the in-memory state with PostgreSQL/MongoDB, authenticate users, add audit logs, use Socket.IO/WebSockets for telemetry, connect to real robot middleware/ROS, add a job queue, and put the application behind HTTPS and a reverse proxy.
