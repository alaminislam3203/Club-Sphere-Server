const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// ========================
// MIDDLEWARE
// ========================
app.use(cors());
app.use(express.json());

// ========================
// MONGO DB CONNECTION
// ========================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log('✅ MongoDB Connected');

    const db = client.db('ClubSphereDB');

    // ========================
    // COLLECTIONS
    // ========================
    const usersCollection = db.collection('users');
    const clubsCollection = db.collection('clubs');
    const eventsCollection = db.collection('events');
    const eventRegistrationsCollection = db.collection('eventRegistrations');
    const clubMembershipCollection = db.collection('clubMembership');
    const paymentCollection = db.collection('payments');
    const PlanMembershipCollection = db.collection('planMemberships');

    // ========================
    // BASIC ROUTES
    // ========================

    // ---------- USERS ----------
    app.get('/users', async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.post('/users', async (req, res) => {
      const result = await usersCollection.insertOne(req.body);
      res.send(result);
    });

    // ---------- CLUBS ----------
    app.get('/clubs', async (req, res) => {
      const clubs = await clubsCollection.find().toArray();
      res.send(clubs);
    });

    app.post('/clubs', async (req, res) => {
      const result = await clubsCollection.insertOne(req.body);
      res.send(result);
    });

    // ---------- EVENTS ----------
    app.get('/events', async (req, res) => {
      const events = await eventsCollection.find().toArray();
      res.send(events);
    });

    app.post('/events', async (req, res) => {
      const result = await eventsCollection.insertOne(req.body);
      res.send(result);
    });

    // ---------- EVENT REGISTRATIONS ----------
    app.get('/event-registrations', async (req, res) => {
      const registrations = await eventRegistrationsCollection.find().toArray();
      res.send(registrations);
    });

    app.post('/event-registrations', async (req, res) => {
      const result = await eventRegistrationsCollection.insertOne(req.body);
      res.send(result);
    });

    // ---------- CLUB MEMBERSHIP ----------
    app.get('/club-memberships', async (req, res) => {
      const memberships = await clubMembershipCollection.find().toArray();
      res.send(memberships);
    });

    app.post('/club-memberships', async (req, res) => {
      const result = await clubMembershipCollection.insertOne(req.body);
      res.send(result);
    });

    // ---------- PAYMENTS ----------
    app.get('/payments', async (req, res) => {
      const payments = await paymentCollection.find().toArray();
      res.send(payments);
    });

    app.post('/payments', async (req, res) => {
      const result = await paymentCollection.insertOne(req.body);
      res.send(result);
    });

    // ---------- PLAN MEMBERSHIPS ----------
    app.get('/plan-memberships', async (req, res) => {
      const plans = await PlanMembershipCollection.find().toArray();
      res.send(plans);
    });

    app.post('/plan-memberships', async (req, res) => {
      const result = await PlanMembershipCollection.insertOne(req.body);
      res.send(result);
    });

    console.log('✅ Routes loaded');
  } catch (err) {
    console.error('❌ MongoDB Error:', err);
  }
}

run().catch(console.dir);

// ========================
// SERVER START
// ========================
app.get('/', (req, res) => res.send('🚀 Server is running'));

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
