const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
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

    const db = client.db('MyAppDB');

    // Example collections
    const usersCollection = db.collection('users');
    const postsCollection = db.collection('posts');

    // ========================
    // BASIC ROUTES
    // ========================

    app.get('/', (req, res) => {
      res.send('🚀 Server is running');
    });

    // ---------- USERS ----------
    app.get('/users', async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // ---------- POSTS ----------
    app.get('/posts', async (req, res) => {
      const posts = await postsCollection.find().toArray();
      res.send(posts);
    });

    app.post('/posts', async (req, res) => {
      const post = req.body;
      const result = await postsCollection.insertOne(post);
      res.send(result);
    });

    console.log('✅ Routes loaded');
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

// ========================
// SERVER START
// ========================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
