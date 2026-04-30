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
    app.get('/clubs', async (req, res) => {
      try {
        const query = {};
        const { category, location, managerEmail } = req.query;
        if (category) query.category = category;
        if (location) query.location = location;
        if (managerEmail) query.managerEmail = managerEmail;
        const result = await clubsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch clubs' });
      }
    });

    app.get('/clubs/event/:id', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid Event ID' });
        }
        const result = await eventsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!result) {
          return res.status(404).send({ message: 'Event not found' });
        }
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Error fetching event details', error });
      }
    });

    app.get('/clubs/:id', async (req, res) => {
      try {
        const clubId = req.params.id;
        if (!ObjectId.isValid(clubId)) {
          return res
            .status(400)
            .json({ success: false, message: 'Invalid Club ID' });
        }
        const club = await clubsCollection.findOne({
          _id: new ObjectId(clubId),
        });
        if (!club)
          return res
            .status(404)
            .json({ success: false, message: 'Club not found' });
        res.status(200).json(club);
      } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    app.patch('/clubs/:id', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        const result = await clubsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData },
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.delete('/clubs/:id', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await clubsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 1) {
          res.send({ success: true, message: 'Club deleted successfully' });
        } else {
          res.status(404).send({ success: false, message: 'Club not found' });
        }
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: 'Internal Server Error' });
      }
    });

    // ===============================================
    // 📅 EVENT MANAGEMENT ROUTES
    // ===============================================

    app.post('/events', async (req, res) => {
      try {
        const eventData = req.body;
        const result = await eventsCollection.insertOne(eventData);
        res.status(201).send(result);
      } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });
    app.get('/events/upcoming', async (req, res) => {
      try {
        const query = {};
        const { clubId, isPaid, location } = req.query;
        if (clubId) query.clubId = clubId;
        if (isPaid !== undefined) query.isPaid = isPaid === 'true';
        if (location) query.location = location;
        const nowISO = new Date().toISOString();
        query.eventDate = { $gte: nowISO };
        const events = await eventsCollection
          .find(query)
          .sort({ eventDate: 1 })
          .toArray();
        res.send(events);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch upcoming events' });
      }
    });

    app.get('/events', async (req, res) => {
      try {
        const managerEmail = req.query.managerEmail;
        const query = managerEmail ? { managerEmail } : {};
        const result = await eventsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.patch('/events/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updatedEvent = req.body;
        const result = await eventsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedEvent },
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.delete('/events/:id', async (req, res) => {
      try {
        const result = await eventsCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    // ===============================================
    // 📋 EVENT REGISTRATION ROUTES
    // ✅ FIX: eventTitle সহ সব field save হচ্ছে (free & paid)
    // ===============================================

    app.post('/event-registrations', verifyFBToken, async (req, res) => {
      try {
        const registration = req.body;
        const { eventId, userEmail } = registration;

        if (!eventId || !userEmail)
          return res.status(400).send({ message: 'Missing required fields.' });

        const existing = await eventRegistrationsCollection.findOne({
          eventId,
          userEmail,
        });
        if (existing)
          return res.status(409).send({ message: 'Already registered.' });

        let eventTitle = registration.eventTitle || '';
        if (!eventTitle && ObjectId.isValid(eventId)) {
          const eventDoc = await eventsCollection.findOne({
            _id: new ObjectId(eventId),
          });
          eventTitle = eventDoc?.eventTitle || eventDoc?.title || '';
        }

        const registrationData = {
          ...registration,
          eventTitle, // ✅ eventTitle সহ save
          registeredAt: registration.registeredAt || new Date().toISOString(),
          paymentType: registration.paymentType || 'free', // ✅ free বা paid
        };

        const result =
          await eventRegistrationsCollection.insertOne(registrationData);
        res.send({
          success: true,
          message: 'Event registered successfully!',
          data: result,
        });
      } catch (error) {
        res.status(500).send({ message: 'Internal server error', error });
      }
    });

    app.get('/event-registrations', verifyFBToken, async (req, res) => {
      try {
        const result = await eventRegistrationsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Server error' });
      }
    });

    app.get(
      '/event-registrations/:eventId',
      verifyFBToken,
      async (req, res) => {
        try {
          const eventId = req.params.eventId;
          const registrations = await eventRegistrationsCollection
            .find({ eventId })
            .sort({ registeredAt: -1 })
            .toArray();
          res.send(registrations);
        } catch (error) {
          console.error('Error fetching attendee list:', error);
          res.status(500).send({ message: 'Internal Server Error', error });
        }
      },
    );

    // ===============================================
    // 👥 CLUB MEMBERSHIP ROUTES
    // ===============================================
    app.post(
      '/payment-club-membership-free',
      verifyFBToken,
      async (req, res) => {
        try {
          const membershipRequest = req.body;
          const existingMember = await clubMembershipCollection.findOne({
            userEmail: membershipRequest.userEmail,
            clubId: membershipRequest.clubId,
          });
          if (existingMember) {
            return res.status(400).send({
              success: false,
              message:
                'You have already sent a request or are already a member.',
            });
          }
          const club = await clubsCollection.findOne({
            _id: new ObjectId(membershipRequest.clubId),
          });
          const currentCount = club?.membersCount || 0;
          const membershipData = {
            userEmail: membershipRequest.userEmail,
            clubId: membershipRequest.clubId,
            clubName: membershipRequest.clubName,
            managerEmail: membershipRequest.managerEmail,
            transactionId: `FREE-${Date.now()}`,
            status: 'active',
            joinedAt: new Date(),
            membersCount: currentCount + 1,
          };
          const result =
            await clubMembershipCollection.insertOne(membershipData);
          await clubsCollection.updateOne(
            { _id: new ObjectId(membershipRequest.clubId) },
            { $inc: { membersCount: 1 } },
          );
          const paymentData = {
            userEmail: membershipRequest.userEmail,
            amount: 0,
            clubId: membershipRequest.clubId,
            clubName: membershipRequest.clubName,
            transactionId: membershipData.transactionId,
            paymentType: 'club-membership',
            status: 'paid',
            paidAt: new Date(),
          };
          await paymentCollection.insertOne(paymentData);
          res.send({ success: true, insertedId: result.insertedId });
        } catch (error) {
          res.status(500).send({ success: false, message: error.message });
        }
      },
    );

    app.post('/club-join-request', verifyFBToken, async (req, res) => {
      try {
        const joinData = req.body;
        const { userEmail, clubId } = joinData;
        const existingRequest = await clubMembershipCollection.findOne({
          userEmail,
          clubId,
        });
        if (existingRequest) {
          return res.send({ message: 'already-exists', insertedId: null });
        }
        const finalJoinData = {
          ...joinData,
          status: 'pending',
          joinedAt: new Date(),
        };
        const result = await clubMembershipCollection.insertOne(finalJoinData);
        if (result.insertedId) {
          await clubsCollection.updateOne(
            { _id: new ObjectId(clubId) },
            { $inc: { membersCount: 1 } },
          );
        }
        res.send(result);
      } catch (error) {
        console.error('Error joining club:', error);
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.patch(
      '/club-memberships/:id/status',
      verifyFBToken,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { status } = req.body;
          const result = await clubMembershipCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } },
          );
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: 'Internal Server Error' });
        }
      },
    );

    app.get('/manager/club-members', verifyFBToken, async (req, res) => {
      try {
        const { managerEmail, clubId } = req.query;
        let query = { managerEmail };
        if (clubId && clubId !== 'all') {
          query.clubId = clubId;
        }
        const result = await clubMembershipCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.patch('/membership/status/:id', verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const result = await clubMembershipCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } },
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });

    app.get('/member/my-clubs', verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;
        if (req.decoded_email !== email)
          return res.status(403).send({ message: 'Forbidden' });
        const result = await clubMembershipCollection
          .find({ userEmail: email })
          .toArray();
        res.send(result);
      } catch (error) {
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
