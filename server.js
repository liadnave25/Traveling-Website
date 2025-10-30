// 1) Env חייב לבוא ראשון
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// 2) אפליקציה ומידלוורים בסיסיים
const app = express();

// אם יש לך פרונט בריצה מקומית, אפשר גם:
// app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(cors());
app.use(express.json());

// 3) חיבור למסד
const { MONGO_URI, PORT } = process.env;
if (!MONGO_URI) {
    console.error('❌ Missing MONGO_URI in .env');
    process.exit(1);
}
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Mongo connected'))
    .catch(err => {
        console.error('❌ Mongo error:', err);
        process.exit(1);
    });

// 4) ראוטים
// שים לב: כאן רק מחברים ראוטרים. לא מגדירים סכימות/מודלים!
const geocodeRoute = require('./routes/geocode');
const weatherRoute = require('./routes/weather');
const imageRoute = require('./routes/image');
const tripsRoutes = require('./routes/trips');
const llmRoutes = require('./routes/llm');
const osrmRoutes = require('./routes/osrm');
const authRoutes = require('./routes/auth');

// בדיקת חיים
app.get('/api/test', (_req, res) => res.send('OK'));

// סדר מומלץ: קודם auth ואז השאר
app.use('/api/auth', authRoutes);
app.use('/api/geocode', geocodeRoute);
app.use('/api/weather', weatherRoute);
app.use('/api/image', imageRoute);
app.use('/api/trips', tripsRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/routes', osrmRoutes);

// 5) 404 לכל מה שלא נתפס
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// 6) error handler גלובלי (לא חובה, אבל נוח)
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// 7) הרצה
const port = PORT || 5000;
app.listen(port, () => console.log(`🚀 Server listening on http://localhost:${port}`));
