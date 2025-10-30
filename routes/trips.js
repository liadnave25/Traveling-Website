// routes/trips.js
const express = require('express');
const router = express.Router();

const Trip = require('../models/Trip');
const auth = require('../authMiddleware');

// ---------- helpers ----------
function normalizePoints(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .map(p => Array.isArray(p) ? { lat: p[0], lng: p[1] } : p)
        .filter(p => typeof p?.lat === 'number' && typeof p?.lng === 'number');
}

function pointsFromDays(days) {
    if (!Array.isArray(days)) return [];
    const out = [];
    for (const d of days) {
        if (Array.isArray(d?.geometry)) {
            for (const pair of d.geometry) {
                if (Array.isArray(pair) && pair.length === 2) {
                    const [lat, lng] = pair;
                    if (typeof lat === 'number' && typeof lng === 'number') {
                        out.push({ lat, lng });
                    }
                }
            }
        }
    }
    return out;
}

function summarizeDays(days) {
    if (!Array.isArray(days) || !days.length) return "";
    return days.map((d, i) => {
        const title = d?.title || `Day ${i + 1}`;
        const dist = d?.distanceKm ?? d?.distance_km;
        const distTxt = typeof dist === 'number' ? ` (${dist.toFixed(1)} km)` : '';
        const narr = (d?.narrative && d.narrative.trim()) ? d.narrative.trim() : '';
        return `${title}${distTxt}${narr ? ` — ${narr}` : ''}`;
    }).join('\n');
}

// ---------- routes ----------

// Save trip
router.post('/', auth, async (req, res) => {
    try {
        const {
            name,
            description,
            aiDescription,
            country,
            type,
            points,
            days,
            totalDistanceKm,
            weatherForecast,
            imageUrl
        } = req.body || {};

        // normalize points / fallback from days
        let normalizedPoints = normalizePoints(points);
        if (normalizedPoints.length < 2 && Array.isArray(days) && days.length) {
            normalizedPoints = pointsFromDays(days);
        }

        if (!name || !type || normalizedPoints.length < 2) {
            return res.status(400).json({ error: 'Missing required fields (name/type/points)' });
        }

        const safeDays = Array.isArray(days) ? days.map(d => ({
            title: d?.title || '',
            narrative: d?.narrative || '',
            distanceKm: typeof d?.distanceKm === 'number' ? d.distanceKm :
                typeof d?.distance_km === 'number' ? d.distance_km : undefined,
            waypoints: Array.isArray(d?.waypoints) ? d.waypoints.map(w => ({
                name: w?.name || '',
                lat: w?.lat ?? w?.latitude,
                lng: w?.lng ?? w?.lon ?? w?.longitude
            })) : [],
            geometry: Array.isArray(d?.geometry) ? d.geometry : []
        })) : [];

        const finalAi = (aiDescription && aiDescription.trim())
            ? aiDescription.trim()
            : summarizeDays(safeDays);

        const trip = await Trip.create({
            userId: req.user.userId,
            name: name.trim(),
            description: (description || '').trim(),
            aiDescription: finalAi,
            country: (country || '').trim(),
            type,
            points: normalizedPoints,
            days: safeDays,
            totalDistanceKm: Number(totalDistanceKm) || 0,
            weatherForecast: Array.isArray(weatherForecast) ? weatherForecast : [],
            imageUrl: imageUrl || ''
        });

        res.json({ success: true, tripId: trip._id, trip });
    } catch (err) {
        console.error('POST /api/trips error:', err);
        res.status(500).json({ error: 'Failed to save trip' });
    }
});

// List trips of current user
router.get('/', auth, async (req, res) => {
    try {
        const trips = await Trip.find({ userId: req.user.userId }).sort({ createdAt: -1 });
        res.json({ trips });
    } catch (err) {
        console.error('GET /api/trips error:', err);
        res.status(500).json({ error: 'Failed to load trips' });
    }
});

// Get single trip
router.get('/:id', auth, async (req, res) => {
    try {
        const trip = await Trip.findOne({ _id: req.params.id, userId: req.user.userId });
        if (!trip) return res.status(404).json({ error: 'Trip not found' });
        res.json({ trip });
    } catch (err) {
        console.error('GET /api/trips/:id error:', err);
        res.status(500).json({ error: 'Failed to load trip' });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Trip.findOneAndDelete({ _id: id, userId: req.user.userId });
        if (!deleted) return res.status(404).json({ error: 'Trip not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/trips/:id error:', err);
        res.status(500).json({ error: 'Failed to delete trip' });
    }
});

module.exports = router;
