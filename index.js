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

    // ===============================================
    // 👤 USER MANAGEMENT ROUTES
    // ===============================================

    app.post('/users', async (req, res) => {
      try {
        const user = req.body;
        user.role = 'member';
        user.createdAt = new Date().toISOString();
        const email = user.email;
        const userExists = await usersCollection.findOne({ email });
        if (userExists) {
          return res.send({ message: 'user exists' });
        }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.get('/users/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }
        res.send(user);
      } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
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
  console.log(` Server running on port ${port}`);
});
