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

    app.get('/users/:email/role', verifyFBToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (req.decoded_email !== email) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Email mismatch',
          });
        }
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res
            .status(404)
            .json({ success: false, message: 'User not found' });
        }
        res.send({ role: user.role || 'member' });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: 'Internal server error' });
      }
    });
    app.get('/users', verifyFBToken, async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.patch('/users/:id/role', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;
        if (!role) return res.status(400).send({ message: 'Role is required' });
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } },
        );
        res.send({ modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });
    // ===============================================
    // 🏛️ CLUB MANAGEMENT ROUTES
    // NOTE: /clubs/event/:id MUST be before /clubs/:id
    // ===============================================

    app.post('/clubs', verifyFBToken, async (req, res) => {
      try {
        const clubData = req.body;
        const existingClub = await clubsCollection.findOne({
          clubName: clubData.clubName,
        });
        if (existingClub) {
          return res.status(400).send({
            success: false,
            message: 'A club with this name already exists!',
          });
        }
        const result = await clubsCollection.insertOne(clubData);
        res.status(201).send({
          success: true,
          insertedId: result.insertedId,
          message: 'Club registered successfully and pending approval.',
        });
      } catch (error) {
        console.error('Create Club Error:', error);
        res
          .status(500)
          .send({ success: false, message: 'Internal Server Error' });
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
