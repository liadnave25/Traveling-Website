// routes/geocode.js
const express = require('express');
const router = express.Router();

router.get('/reverse', async (req, res) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) return res.status(400).json({ error: 'lat,lng required' });

        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=14&addressdetails=1`;

        const r = await fetch(url, { headers: { 'User-Agent': 'travel-planner-demo' } });
        if (!r.ok) return res.status(502).json({ error: 'geocoder failed' });
        const data = await r.json();

        const name = data.display_name || '';
        res.json({ name });
    } catch (e) {
        console.error('geocode error', e);
        res.status(500).json({ error: 'geocode server error' });
    }
});

module.exports = router;
