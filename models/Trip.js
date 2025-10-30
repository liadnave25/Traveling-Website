const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
}, { _id: false });

const waypointSchema = new mongoose.Schema({
    name: String,
    lat: Number,
    lng: Number
}, { _id: false });

const daySchema = new mongoose.Schema({
    title: String,
    narrative: String,
    distanceKm: Number,
    waypoints: [waypointSchema],
    // ����� �� �� �� ������ �� ���� ��� (���� [lat,lng])
    geometry: {
        type: [[Number]], // [[lat, lng], ...]
        default: []
    }
}, { _id: false });

const weatherEntrySchema = new mongoose.Schema({
    datetime: String,
    temp: Number,
    weather: String,
    icon: String
}, { _id: false });

const tripSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    name: { type: String, required: true },
    description: { type: String, default: '' },     // �����/����� �� ������
    aiDescription: { type: String, default: '' },   // ����� ����� ��-AI
    country: { type: String, default: '' },         // ������ ������
    type: { type: String, enum: ['hiking', 'biking'], required: true },

    // �� ���� (����� �������� �� �� ��� ����� ����)
    points: { type: [pointSchema], required: true },

    // ����� ��� ���� (��� �-PlanPage)
    days: { type: [daySchema], default: [] },

    totalDistanceKm: { type: Number, default: 0 },
    weatherForecast: { type: [weatherEntrySchema], default: [] },
    imageUrl: { type: String, default: '' },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Trip', tripSchema);
