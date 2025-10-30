// routes/image.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

const UNSPLASH_BASE = 'https://api.unsplash.com';

// --- simple in-memory cache (6h TTL) ---
const cache = new Map(); // key => { url, ts, source, credit, title }
const TTL_MS = 6 * 60 * 60 * 1000;

// Build a set of good queries for a representative photo
function buildQueries(country, tripType) {
    const theme = tripType === 'biking' ? 'cycling' :
        tripType === 'hiking' ? 'hiking' : 'travel';
    return [
        `${country} landmark`,
        `${country} skyline`,
        `${country} famous building`,
        `${country} street view`,
        `${country} ${theme}`,
        `${country} landscape`,
        `${country} city center`,
        `${country} tourism`,
    ];
}

// filter: avoid flags/maps/icons/etc
const BAD_WORDS = [
    'flag', 'coat of arms', 'emblem', 'crest', 'badge', 'map',
    'passport', 'icon', 'vector', 'illustration', 'clipart'
];

function looksLikeFlagish(photo) {
    const texts = [
        photo.description,
        photo.alt_description,
        ...(photo.tags || []).map(t => t.title)
    ].join(' ').toLowerCase();
    return BAD_WORDS.some(w => texts.includes(w));
}

function scorePhoto(p) {
    const GOOD = ['city', 'skyline', 'landscape',
        'mountains', 'coast', 'historic', 'monument', 'street'];
    const tags = (p.tags || []).map(t => (t.title || '').toLowerCase());
    return tags.reduce((s, t) => s + (GOOD.includes(t) ? 2 : 0), 0) + (p.likes || 0) / 50;
}

function pickRandomGood(results) {
    const filtered = (results || []).filter(p => !looksLikeFlagish(p));
    if (!filtered.length) return null;
    // מיין לפי ציון טוב, ואז בחר אקראית בטופ 10 כדי לקבל מגוון איכותי
    const sorted = filtered.sort((a, b) => scorePhoto(b) - scorePhoto(a));
    const pool = sorted.slice(0, Math.min(sorted.length, 10));
    return pool[Math.floor(Math.random() * pool.length)];
}

router.post('/generate', async (req, res) => {
    const { country, tripType, prompt, force, randomize } = req.body || {};
    const qCountry = (country || prompt || '').toString().trim();
    if (!qCountry) return res.status(400).json({ error: 'Missing country/prompt' });

    // cache key
    const cacheKey = `${qCountry.toLowerCase()}:${(tripType || '').toLowerCase()}`;

    // use cache unless force=true
    const hit = cache.get(cacheKey);
    if (!force && hit && Date.now() - hit.ts < TTL_MS) {
        return res.json({ imageUrl: hit.url, title: hit.title, credit: hit.credit, source: hit.source });
    }

    // Try Unsplash (needs UNSPLASH_ACCESS_KEY)
    if (process.env.UNSPLASH_ACCESS_KEY) {
        try {
            const queries = buildQueries(qCountry, tripType);
            let bestPhoto = null;

            for (const q of queries) {
                // אם randomize=true נסה גם עמוד אקראי קטן למגוון
                const page = randomize ? (1 + Math.floor(Math.random() * 3)) : 1;

                const r = await axios.get(`${UNSPLASH_BASE}/search/photos`, {
                    params: {
                        query: q,
                        per_page: 30,
                        page,
                        orientation: 'landscape',
                        order_by: 'relevant',
                        content_filter: 'high'
                    },
                    headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
                    timeout: 10000
                });

                // בחר תמונה אקראית איכותית מתוך התוצאות
                const candidate = pickRandomGood(r.data.results || []);
                if (candidate) { bestPhoto = candidate; break; }
            }

            if (bestPhoto) {
                const payload = {
                    imageUrl: bestPhoto.urls?.regular,
                    title: bestPhoto.alt_description || bestPhoto.description || `${qCountry}`,
                    credit: bestPhoto.user?.name,
                    source: 'unsplash'
                };
                // שמור בקאש רק אם force=false (כדי לא "לנעול" תמונה אקראית)
                if (!force) {
                    cache.set(cacheKey, { url: payload.imageUrl, ts: Date.now(), source: payload.source, credit: payload.credit, title: payload.title });
                }
                return res.json(payload);
            }
        } catch (e) {
            console.error('Unsplash error:', e.response?.status, e.message);
            // continue to fallback
        }
    }

    // Fallback: Wikipedia (always same for given country)
    try {
        const page = encodeURIComponent(qCountry.replace(/_/g, ' '));
        const wik = await axios.get(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${page}`,
            { timeout: 10000 }
        );
        const img = wik.data?.originalimage?.source || wik.data?.thumbnail?.source;
        const title = wik.data?.title || qCountry;
        if (img) {
            if (!force) cache.set(cacheKey, { url: img, ts: Date.now(), source: 'wikipedia', credit: null, title });
            return res.json({ imageUrl: img, source: 'wikipedia', title });
        }
    } catch (e) {
        console.error('Wikipedia fallback failed:', e.message);
    }

    return res.status(502).json({ error: 'Could not find an image' });
});

module.exports = router;
