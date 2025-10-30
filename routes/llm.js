// routes/llm.js
// OSRM-only planner: Walking loops around a landmark; Biking city-to-city with hard limits.
// Exposes POST /api/llm/plan -> { days: [...] }

const express = require('express');
const axios = require('axios');
const router = express.Router();

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.1-8b-instant';

const OSRM_PROFILE_WALK = process.env.OSRM_PROFILE_WALK || 'foot';
const OSRM_PROFILE_BIKE = process.env.OSRM_PROFILE_BIKE || 'bike';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function km(m) { return m / 1000; }
function minutes(s) { return s / 60; }
function isFiniteCoord(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) &&
        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// destination from (lat,lon) by distance (m) & bearing (deg)
function destinationPoint(lat, lon, distanceMeters, bearingDeg) {
    const R = 6371000;
    const δ = distanceMeters / R;
    const θ = (bearingDeg * Math.PI) / 180;
    const φ1 = (lat * Math.PI) / 180;
    const λ1 = (lon * Math.PI) / 180;
    const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
    const sinδ = Math.sin(δ), cosδ = Math.cos(δ);
    const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
    const φ2 = Math.asin(clamp(sinφ2, -1, 1));
    const y = Math.sin(θ) * sinδ * cosφ1;
    const x = cosδ - sinφ1 * sinφ2;
    const λ2 = λ1 + Math.atan2(y, x);
    return { lat: (φ2 * 180) / Math.PI, lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180 };
}

/* ---------- OSRM helpers ---------- */
async function osrmNearestRaw(profile, coord) {
    const url = `${OSRM_BASE_URL}/nearest/v1/${profile}/${coord.lon},${coord.lat}`;
    const { data } = await axios.get(url, { timeout: 15000 });
    if (!data || data.code !== 'Ok' || !data.waypoints?.length) {
        throw new Error(`OSRM nearest failed (${profile})`);
    }
    const wp = data.waypoints[0];
    return { lat: wp.location[1], lon: wp.location[0] };
}
async function osrmRouteRaw(profile, coords) {
    const coordStr = coords.map(c => `${c.lon},${c.lat}`).join(';');
    const params = 'geometries=geojson&overview=full&steps=false';
    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${coordStr}?${params}`;
    const { data } = await axios.get(url, { timeout: 30000 });
    if (!data || data.code !== 'Ok' || !data.routes?.[0]) {
        throw new Error(`OSRM route failed (${profile})`);
    }
    const r = data.routes[0];
    return { distance: r.distance, duration: r.duration, geometry: r.geometry };
}
async function osrmNearest(profiles, coord) {
    let lastErr;
    for (const p of profiles) {
        try { return await osrmNearestRaw(p, coord); } catch (e) { lastErr = e; }
    }
    throw lastErr;
}
async function osrmRoute(profiles, coords) {
    let lastErr;
    for (const p of profiles) {
        try { return await osrmRouteRaw(p, coords); } catch (e) { lastErr = e; }
    }
    throw lastErr;
}
const P_WALK = [OSRM_PROFILE_WALK, 'walking', 'foot'];
const P_BIKE = [OSRM_PROFILE_BIKE, 'cycling', 'bike'];

/* ---------- Groq prompt (no טבע-only bias) ---------- */
async function askGroqForPlan(country, tripType, dayCount = 1, opts = {}) {
    const isHike = /hike|walk|walking|foot/i.test(tripType);
    const { maxPerDayKm, totalMaxKm } = opts;
    const system = {
        role: 'system',
        content:
            'You are a precise trip planner. Return STRICT JSON only (no extra text). ' +
            'Use well-known, routable places inside the specified country. ' +
            'For walking, choose diverse, named urban POIs (museums, art galleries, markets/bazaars, food halls, historic squares/plazas, old city gates/clock towers, libraries, universities/campuses, city halls/courthouses, theaters/opera houses/concert halls, cultural centers, religious sites (synagogues/churches/mosques/temples), monuments/statues/memorials, landmark bridges, observation decks/viewpoints, waterfront promenades/piers, central train/bus stations, iconic hotels, stadiums/arenas, science centers/aquariums/zoos, botanical gardens/greenhouses, covered arcades/passages, street-art alleys, notable neighborhoods/streets), not only parks. ' +
            'All coordinates must be plausible decimal lat/lon inside the country.',
    };

    const userWalking = {
        role: 'user',
        content:
            `Country: ${country}\n` +
            `Trip type: walking loops\n` +
            `Days: ${dayCount}\n` +
            `Return JSON ONLY:\n` +
            `{\n` +
            `  "tripType":"hike","country":"${country}",\n` +
            `  "days":[{"day":1,"target":{"name":"<famous landmark/building>","lat":..,"lon":..}}` +
            (dayCount > 1 ? `,{"day":2,"target":{"name":"<landmark>","lat":..,"lon":..}}` : ``) +
            `]}\n`,
    };

    const userBiking = {
        role: 'user',
        content:
            `Country: ${country}\n` +
            `Trip type: biking city-to-city\n` +
            `Days: ${dayCount}\n` +
            `Constraint: choose pairs of cities where the bicycle road distance is ~${Math.max(30, Math.floor((maxPerDayKm || 60) * 0.8))}-${maxPerDayKm || 60} km per day. ` +
            (dayCount > 1 && totalMaxKm ? `Total across days should be ≤ ${totalMaxKm} km. ` : ``) +
            `Avoid border crossings. Return JSON ONLY:\n` +
            `{\n` +
            `  "tripType":"bike","country":"${country}",\n` +
            `  "days":[{"day":1,"from":{"name":"<city>","lat":..,"lon":..},"to":{"name":"<city>","lat":..,"lon":..}}` +
            (dayCount > 1 ? `,{"day":2,"from":{"name":"<city>","lat":..,"lon":..},"to":{"name":"<city>","lat":..,"lon":..}}` : ``) +
            `]}\n`,
    };

    const payload = {
        model: GROQ_MODEL,
        messages: [system, isHike ? userWalking : userBiking],
        temperature: 0.25,
        response_format: { type: 'json_object' },
    };

    const { data } = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        payload,
        {
            headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            timeout: 30000,
        }
    );

    const txt = data?.choices?.[0]?.message?.content?.trim() || '{}';
    try { return JSON.parse(txt); } catch { throw new Error('Groq returned non-JSON'); }
}

/* ---------- Day builders ---------- */
async function buildWalkingLoopDay(target, { minKm = 5, maxKm = 15, maxTries = 10 } = {}) {
    if (!isFiniteCoord(target.lat, target.lon)) throw new Error(`Invalid target coords for walking: ${target.name}`);

    let best = null;
    for (let i = 0; i < maxTries; i++) {
        const radius = 1500 + Math.random() * 4500; // 1.5–6 km
        const bearing = Math.random() * 360;
        const start = destinationPoint(target.lat, target.lon, radius, bearing);

        try {
            const s = await osrmNearest(P_WALK, start);
            const t = await osrmNearest(P_WALK, { lat: target.lat, lon: target.lon });
            const r = await osrmRoute(P_WALK, [s, t, s]);
            const distKm = km(r.distance);
            const durMin = minutes(r.duration);

            const day = {
                waypoints: [
                    { name: `Loop Start near ${target.name}`, lat: s.lat, lon: s.lon },
                    { name: target.name, lat: t.lat, lon: t.lon },
                    { name: `Loop Start near ${target.name}`, lat: s.lat, lon: s.lon },
                ],
                profile: 'foot',
                distanceKm: Number(distKm.toFixed(2)),
                durationMin: Number(durMin.toFixed(1)),
                geometry: r.geometry,
            };

            if (distKm >= minKm && distKm <= maxKm) return day;
            const score = Math.abs(distKm - (minKm + maxKm) / 2);
            if (!best || score < best.score) best = { score, day };
        } catch { /* try another start */ }
    }
    if (best) return best.day;
    throw new Error('Failed to build a walking loop within range');
}

async function buildBikingDay(from, to) {
    if (!isFiniteCoord(from.lat, from.lon) || !isFiniteCoord(to.lat, to.lon)) {
        throw new Error('Invalid city coordinates for biking');
    }
    const s = await osrmNearest(P_BIKE, { lat: from.lat, lon: from.lon });
    const t = await osrmNearest(P_BIKE, { lat: to.lat, lon: to.lon });
    const r = await osrmRoute(P_BIKE, [s, t]);

    return {
        waypoints: [
            { name: from.name, lat: s.lat, lon: s.lon },
            { name: to.name, lat: t.lat, lon: t.lon },
        ],
        profile: 'bike',
        distanceKm: Number(km(r.distance).toFixed(2)),
        durationMin: Number(minutes(r.duration).toFixed(1)),
        geometry: r.geometry,
    };
}

/* ---------- Planner with hard limits ---------- */
async function planTrip({ country, tripType, days = 1, walkingMinKm = 5, walkingMaxKm = 15, bikeMaxPerDayKm = 60, bikeTotalMaxKm = 120 }) {
    if (!country) throw new Error('country is required');
    if (!tripType) throw new Error('tripType is required');

    const isHike = /hike|walk|walking|foot/i.test(tripType);
    const dayCount = Math.max(1, Math.min(2, Number(days) || 1));

    // up to N replans if biking distances violate limits
    const MAX_REPLANS = 4;

    for (let attempt = 1; attempt <= MAX_REPLANS; attempt++) {
        const seed = await askGroqForPlan(country, tripType, dayCount, {
            maxPerDayKm: isHike ? undefined : bikeMaxPerDayKm,
            totalMaxKm: isHike ? undefined : (dayCount > 1 ? bikeTotalMaxKm : undefined),
        });

        const result = { tripType: isHike ? 'hike' : 'bike', country, days: [] };
        let totalBikeKm = 0;
        let violated = false;

        for (const d of seed.days || []) {
            const idx = Number(d.day) || (result.days.length + 1);

            if (isHike) {
                const t = d.target;
                if (!t || !isFiniteCoord(t.lat, t.lon)) continue;
                const loop = await buildWalkingLoopDay(
                    { name: t.name, lat: t.lat, lon: t.lon },
                    { minKm: walkingMinKm, maxKm: walkingMaxKm, maxTries: 10 }
                );
                result.days.push({ day: idx, ...loop });
            } else {
                const from = d.from, to = d.to;
                if (!from || !to) continue;
                const bikeDay = await buildBikingDay(
                    { name: from.name, lat: from.lat, lon: from.lon },
                    { name: to.name, lat: to.lat, lon: to.lon }
                );

                // 🔒 HARD LIMITS
                if (bikeDay.distanceKm > bikeMaxPerDayKm) {
                    violated = true;
                }
                totalBikeKm += bikeDay.distanceKm;
                result.days.push({ day: idx, ...bikeDay });
            }
        }

        if (!result.days.length) {
            // nothing usable—try again if we can
            if (!isHike && attempt < MAX_REPLANS) continue;
            throw new Error('No valid days produced');
        }

        if (!isHike) {
            const totalLimit = dayCount > 1 ? bikeTotalMaxKm : bikeMaxPerDayKm;
            if (violated || totalBikeKm > totalLimit) {
                // Try to re-ask Groq for a better matching set
                if (attempt < MAX_REPLANS) continue;
                // final attempt failed — error out
                throw new Error(`bike_distance_limits_exceeded`);
            }
        }

        // success
        return result;
    }

    // Should never reach here
    throw new Error('planning_failed');
}

/* ---------- ROUTE: POST /api/llm/plan ---------- */
router.post('/plan', async (req, res) => {
    try {
        const { country, tripType, limits } = req.body || {};
        const days = limits?.maxDays ?? 2;

        // Walking limits as לפני
        const walkingMinKm = limits?.min ?? 5;
        const walkingMaxKm = limits?.max ?? 15;

        // Biking hard limits (ברירת מחדל 60/120)
        const bikeMaxPerDayKm = Number(limits?.maxPerDayKm ?? 60);
        const bikeTotalMaxKm = Number(limits?.totalMax ?? 120);

        const plan = await planTrip({
            country,
            tripType,
            days,
            walkingMinKm,
            walkingMaxKm,
            bikeMaxPerDayKm,
            bikeTotalMaxKm,
        });

        res.json({ days: plan.days });
    } catch (err) {
        console.error('plan error:', err?.message || err);
        res.status(500).json({ error: 'planning_failed' });
    }
});

module.exports = router;
