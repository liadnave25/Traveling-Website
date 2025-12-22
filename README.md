# 🌍 Travel Planner (MERN + Maps + External APIs)

A full-stack trip planning web app where users can **register/login**, **plan a route on an interactive map**, automatically generate a **real drivable route**, and enrich the trip with **weather forecast** + a **landscape image**. Planned trips can be **saved to MongoDB** and later viewed in **History** and **Trip Details** pages.

The project focuses on real product-style flow: **auth → plan → validate → enrich → save → browse → view details → refresh info**.

---

## ✨ What the site does

### ✅ Auth & Protected App
- Users can **register** and **login**.
- Login returns a **JWT** which is stored client-side and used to access protected pages.
- `/plan`, `/history`, `/trip/:id` are guarded via a private route wrapper.

### 🗺️ Trip Planning on Map
- Click on the map to add waypoints (markers).
- Generate a **real route** (polyline) between points using a routing service.
- Calculate total distance using the **Haversine formula** (real geo distance in KM).

### 🧠 Smart Trip Rules (Business Logic)
- **Hiking:** validates average distance/day (5–15km/day).
- **Biking:** validates total distance (≤ 60km).

### ☀️ Weather + 🖼️ Image enrichment
- Fetches weather forecast from **OpenWeatherMap** by start coordinates.
- Fetches a landscape image from **Unsplash** using a prompt (e.g., `"Italy hiking"`).
- In Trip Details, you can **refresh** weather + image again without re-planning.

### 💾 Persisted Trips (DB)
- Save trips with:
  - name, description, type (hiking/biking)
  - route points (lat/lng)
  - totalDistanceKm
  - weatherForecast (saved snapshot)
  - imageUrl
- View all saved trips in **History**, filter by type, and search by text.

---

## 🧰 Tech Stack

### Frontend
- **React**
- **React Router** (routing + protected routes)
- **Context API** (Auth state + token persistence via `localStorage`)
- **Axios** (API calls)
- **Leaflet + react-leaflet** (interactive maps, markers, polylines)
- **OpenStreetMap tiles** (map rendering)

### Backend
- **Node.js + Express** (REST API)
- **MongoDB + Mongoose** (data persistence + schemas)
- **JWT Authentication** (`jsonwebtoken`)
- **Password hashing** with **bcrypt**
- **dotenv** (env management)
- **node-fetch / axios** for external API calls

### External APIs / Services
- **OSRM** (route generation)
- **OpenWeatherMap** (forecast)
- **Unsplash** (landscape images)

---

## 💪 Skills Demonstrated (What this project shows)

- **Full-Stack MERN development** (React + Express + MongoDB)
- **Authentication & authorization** with JWT + protected routes + server middleware
- **Secure password storage** (bcrypt hashing)
- **API design & integration** (internal REST endpoints + external APIs)
- **Geospatial logic**
  - Map click → waypoint capture
  - Route polyline rendering
  - Distance calculation with Haversine
- **Business rules & validation**
  - Constraints for hiking/biking trips
- **Data modeling**
  - Trip schema with nested sub-documents (points, forecast entries)
  - Per-user data isolation (only fetch your trips)
- **Product UX**
  - “Plan → Save → History → Details → Refresh”
  - Filtering + text search on saved content

---

## 🚀 Features

- JWT-based login + persistent session
- Interactive map planning (markers + polyline)
- Real route generation via routing API
- Distance calculation in KM
- Trip type constraints (hiking/biking)
- Weather forecast + image enrichment
- Save trips and browse history
- Trip details map + image + 3-day forecast display
- Refresh weather/image for existing trips



WEATHER_API_KEY=your_openweather_key
UNSPLASH_ACCESS_KEY=your_unsplash_key
