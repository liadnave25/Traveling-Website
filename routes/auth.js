const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');  
const auth = require('../authMiddleware');

const router = express.Router();

function signToken(user) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('Missing JWT_SECRET');
    const payload = { userId: user._id.toString(), email: user.email, name: user.name };
    return jwt.sign(payload, secret, { expiresIn: '2h' });
}

router.post('/register', async (req, res) => {
    try {
        let { name, email, password, favoriteLandscape } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password required' });
        }
        email = String(email).trim().toLowerCase();

        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'User already exists' });

        const passwordHash = await bcrypt.hash(String(password), 10);
        const user = await User.create({ name, email: email.toLowerCase().trim(), passwordHash, favoriteLandscape });


        const token = jwt.sign({ userId: user._id.toString(), email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '2h' });
        return res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        console.error('register error:', err.stack || err);
        return res.status(500).json({ error: 'Server error' });
    }
});


router.post('/login', async (req, res) => {
    try {
        let { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        email = String(email).trim().toLowerCase();

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const storedHash = user.passwordHash || user.password;

        if (!storedHash || typeof storedHash !== 'string' || !storedHash.length) {
            console.error('Login: missing stored hash for user', { userId: user._id, email: user.email });
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const ok = await bcrypt.compare(String(password), user.passwordHash);
        if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

        const secret = process.env.JWT_SECRET;
        if (!secret) return res.status(500).json({ error: 'Server misconfigured' });

        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email, name: user.name },
            secret,
            { expiresIn: '2h' }
        );

        return res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        console.error('login error:', err.stack || err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user: { id: user._id, name: user.name, email: user.email } });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load profile' });
    }
});

module.exports = router;
