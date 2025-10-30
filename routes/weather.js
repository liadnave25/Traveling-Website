const express = require("express");
const router = express.Router();
//const fetch = require("node-fetch");

router.get("/", async (req, res) => {
    const { lat, lng } = req.query;
    const apiKey = process.env.WEATHER_API_KEY;

    if (!lat || !lng) {
        return res.status(400).json({ error: "Missing lat/lng" });
    }

    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`
        );
        const data = await response.json();

        const forecast = data.list.slice(0, 24).map((entry) => ({
            datetime: entry.dt_txt,
            temp: entry.main.temp,
            weather: entry.weather[0].description,
            icon: entry.weather[0].icon, 
        }));


        res.json({ forecast });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch weather" });
    }
});

module.exports = router;
