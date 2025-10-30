// routes/osrm.js — add snapping + loop tolerance
const express = require("express");
const axios = require("axios");
const router = express.Router();

const OSRM_BASE = process.env.OSRM_BASE || "https://router.project-osrm.org";

function haversineKm(a, b) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

async function snap(lat, lng, profile) {
    const url = `${OSRM_BASE}/nearest/v1/${profile}/${lng},${lat}?number=1`;
    try {
        const { data } = await axios.get(url, { timeout: 15000 });
        const loc = data?.waypoints?.[0]?.location; // [lon,lat]
        if (Array.isArray(loc)) return [loc[1], loc[0]];
    } catch { }
    return [lat, lng];
}

router.post("/osrm", async (req, res) => {
    try {
        const { profile = "foot", waypoints = [], loop = false } = req.body || {};
        if (!Array.isArray(waypoints) || waypoints.length < 2) {
            return res.json({ distanceKm: null, geometry: [] });
        }

        // snap all waypoints
        const snapped = [];
        for (const p of waypoints) {
            const [lat, lng] = await snap(p.lat, p.lng, profile);
            snapped.push([lat, lng]);
        }

        // enforce loop with ~30m tolerance
        let coords = snapped.map(([lat, lng]) => [lng, lat]);
        const start = snapped[0], end = snapped[snapped.length - 1];
        if (loop && haversineKm(start, end) > 0.03) {
            coords = [...coords, [coords[0][0], coords[0][1]]];
        }

        const coordStr = coords.map(([lon, lat]) => `${lon},${lat}`).join(";");
        const url = `${OSRM_BASE}/route/v1/${profile}/${coordStr}?overview=full&geometries=geojson`;
        const { data } = await axios.get(url, { timeout: 30000 });
        const route = data?.routes?.[0];
        if (!route) return res.json({ distanceKm: null, geometry: [] });

        const distanceKm = route.distance ? route.distance / 1000 : null;
        const geometry = Array.isArray(route.geometry?.coordinates)
            ? route.geometry.coordinates.map(([lon, lat]) => [lat, lon])
            : [];

        res.json({ distanceKm, geometry });
    } catch (err) {
        console.error("OSRM route error:", err?.response?.status, err?.response?.data || err.message);
        res.json({ distanceKm: null, geometry: [] });
    }
});

module.exports = router;
