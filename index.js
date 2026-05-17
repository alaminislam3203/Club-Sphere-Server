const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// ===============================================
// 🔥 STRIPE INIT
// ===============================================

let stripe;
if (process.env.STRIPE_SECRET) {
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET);
    console.log('✅ Stripe SDK Initialized.');
  } catch (e) {
    console.error('❌ CRITICAL: Failed to initialize Stripe SDK.', e.message);
  }
} else {
  console.error('❌ CRITICAL: STRIPE_SECRET environment variable is missing.');
}

// ===============================================
// 🔥 FIREBASE INIT
// ===============================================

let serviceAccount;

if (process.env.FB_SERVICE_KEY && !process.env.FB_SERVICE_KEY.startsWith('{')) {
  try {
    const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
      'utf8',
    );
    serviceAccount = JSON.parse(decoded);
    console.log('✅ Firebase Key Loaded: From Base64 (FB_SERVICE_KEY)');
  } catch (e) {
    console.error(
      '⚠️ Firebase Base64 Decoding failed. Attempting Direct JSON Load.',
    );
    try {
      serviceAccount = JSON.parse(process.env.FB_SERVICE_KEY);
    } catch (e2) {
      try {
        const filePath = path.join(
          __dirname,
          'assignment-b12a11-firebase-adminsdk.json',
        );
        const fileContent = fs.readFileSync(filePath, 'utf8');
        serviceAccount = JSON.parse(fileContent);
        console.log('✅ Firebase Key Loaded: From local JSON file (DEV ONLY).');
      } catch (e3) {
        console.error('❌ CRITICAL: Failed to load Firebase credentials.');
      }
    }
  }
} else if (
  process.env.FB_SERVICE_KEY &&
  process.env.FB_SERVICE_KEY.startsWith('{')
) {
  try {
    serviceAccount = JSON.parse(process.env.FB_SERVICE_KEY);
    console.log('✅ Firebase Key Loaded: From Raw JSON string.');
  } catch (e) {
    console.error('❌ Firebase Admin Key Error: Invalid JSON.');
  }
}

if (serviceAccount) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('✅ Firebase Admin SDK Initialized.');
} else {
  console.error('❌ Firebase Admin SDK NOT INITIALIZED.');
}

// ===============================================
// 🌐 MIDDLEWARE
// ===============================================

app.use(cors());
app.use(express.json());

// ===============================================
// ✅ verifyFBToken Middleware
// ===============================================

const verifyFBToken = async (req, res, next) => {
  if (!serviceAccount) {
    return res.status(500).send({
      message: 'Server configuration error: Firebase not initialized.',
    });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  try {
    const idToken = authHeader.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).send({ message: 'unauthorized access' });
  }
};

// ===============================================
// 🛡️ checkStripe Middleware
// ===============================================

const checkStripe = (req, res, next) => {
  if (!stripe) {
    return res.status(503).send({ message: 'Payment service is unavailable.' });
  }
  next();
};

// ===============================================
// 📊 DATABASE CONNECTION
// ===============================================

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@clubsphere.g026izu.mongodb.net/?appName=ClubSphere`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    console.log('✅ MongoDB Connected Successfully!');

    const db = client.db('ClubSphereDB');
    const usersCollection = db.collection('users');
    const clubsCollection = db.collection('clubs');
    const eventsCollection = db.collection('events');
    const eventRegistrationsCollection = db.collection('eventRegistrations');
    const clubMembershipCollection = db.collection('clubMembership');
    const paymentCollection = db.collection('payments');
    const PlanMembershipCollection = db.collection('planMemberships');

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
          return res
            .status(403)
            .json({ success: false, message: 'Access denied: Email mismatch' });
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
    // ===============================================

    app.post('/event-registrations', verifyFBToken, async (req, res) => {
      try {
        const registration = req.body;
        const { eventId, userEmail } = registration;

        if (!eventId || !userEmail)
          return res.status(400).send({ message: 'Missing required fields.' });

        // ✅ Duplicate registration check
        const existing = await eventRegistrationsCollection.findOne({
          eventId,
          userEmail,
        });
        if (existing)
          return res.status(409).send({ message: 'Already registered.' });

        // ✅ eventTitle ও clubId বের করা + maxAttendees check
        let eventTitle = registration.eventTitle || '';
        let clubId = registration.clubId || '';
        if (ObjectId.isValid(eventId)) {
          const eventDoc = await eventsCollection.findOne({
            _id: new ObjectId(eventId),
          });
          if (!eventTitle)
            eventTitle = eventDoc?.eventTitle || eventDoc?.title || '';
          if (!clubId) clubId = eventDoc?.clubId || '';

          // ✅ maxAttendees check — 0 বা null হলে unlimited
          const maxAttendees = eventDoc?.maxAttendees;
          if (maxAttendees && maxAttendees > 0 && maxAttendees <= 0) {
            return res.status(400).send({
              success: false,
              message: 'This event is fully booked. No seats available.',
            });
          }
          // ✅ আরও accurate check: maxAttendees এর বিপরীতে current registration count
          if (maxAttendees && maxAttendees > 0) {
            const currentCount =
              await eventRegistrationsCollection.countDocuments({ eventId });
            if (currentCount >= maxAttendees) {
              return res.status(400).send({
                success: false,
                message: 'This event is fully booked. No seats available.',
              });
            }
          }
        }

        const registrationData = {
          ...registration,
          clubId,
          eventTitle,
          registeredAt: registration.registeredAt || new Date().toISOString(),
          paymentType: 'free',
        };

        const result =
          await eventRegistrationsCollection.insertOne(registrationData);

        // ✅ maxAttendees 1 কমানো (0 হলে update হবে না)
        if (ObjectId.isValid(eventId)) {
          await eventsCollection.updateOne(
            { _id: new ObjectId(eventId), maxAttendees: { $gt: 0 } },
            { $inc: { maxAttendees: -1 } },
          );
        }

        // ✅ Free event → paymentCollection এ record save করা
        const transactionId = `FREE-EVENT-${userEmail}-${eventId}-${Date.now()}`;
        const paymentRecord = {
          userEmail,
          amount: 0,
          eventId,
          eventTitle,
          clubId,
          transactionId,
          paymentType: 'event',
          status: 'free',
          paidAt: new Date(),
        };
        await paymentCollection.insertOne(paymentRecord);

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
        const { userEmail } = req.query;
        const query = userEmail ? { userEmail } : {};
        const result = await eventRegistrationsCollection
          .find(query)
          .sort({ registeredAt: -1 })
          .toArray();
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
    app.patch(
      '/event-registrations/:id/status',
      verifyFBToken,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { status } = req.body;
          if (!status)
            return res.status(400).send({ message: 'Status is required' });
          if (!ObjectId.isValid(id))
            return res.status(400).send({ message: 'Invalid registration ID' });
          const result = await eventRegistrationsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } },
          );
          res.send(result);
        } catch (error) {
          res.status(500).send({ message: 'Internal Server Error' });
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
          const { userEmail, clubId, clubName, managerEmail } =
            membershipRequest;

          // ✅ Duplicate check
          const existingMember = await clubMembershipCollection.findOne({
            userEmail,
            clubId,
          });
          if (existingMember) {
            return res.status(409).send({
              success: false,
              message:
                'You have already sent a request or are already a member.',
            });
          }
          const existingPayment = await paymentCollection.findOne({
            userEmail,
            clubId,
            paymentType: 'club-membership',
          });
          if (existingPayment) {
            return res.status(409).send({
              success: false,
              message: 'Club membership payment already recorded.',
            });
          }

          const transactionId = `FREE-${Date.now()}`;

          // ✅ Membership save
          const membershipData = {
            userEmail,
            clubId,
            clubName,
            managerEmail,
            transactionId,
            status: 'active',
            joinedAt: new Date(),
          };
          const result =
            await clubMembershipCollection.insertOne(membershipData);

          // ✅ join করা মাত্রই clubs collection-এ membersCount +1 (number হিসেবে)
          await clubsCollection.updateOne(
            { _id: new ObjectId(clubId) },
            { $inc: { membersCount: 1 } },
          );

          // ✅ Payment record
          await paymentCollection.insertOne({
            userEmail,
            clubId,
            clubName,
            amount: 0,
            transactionId,
            paymentType: 'club-membership',
            status: 'paid',
            paidAt: new Date(),
          });

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

        // ✅ Duplicate check
        const existingRequest = await clubMembershipCollection.findOne({
          userEmail,
          clubId,
        });
        if (existingRequest) {
          return res
            .status(409)
            .send({ message: 'already-exists', insertedId: null });
        }

        const result = await clubMembershipCollection.insertOne({
          ...joinData,
          status: 'pending',
          joinedAt: new Date(),
        });

        // ✅ join request submit করা মাত্রই clubs collection-এ membersCount +1
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

    // ===============================================
    // 💳 PAYMENT ROUTES
    // ===============================================

    // -----------------------------------------------
    // Plan membership payment intent (Stripe)
    // -----------------------------------------------
    app.post(
      '/create-checkout-session',
      checkStripe,
      verifyFBToken,
      async (req, res) => {
        try {
          const { price, planName, userEmail } = req.body;

          if (parseFloat(price) <= 0) {
            return res
              .status(400)
              .send({ error: "Free plans don't require a payment intent." });
          }

          // ✅ Duplicate plan check — same user + same plan already paid
          const existingPlan = await PlanMembershipCollection.findOne({
            userEmail,
            planName,
            status: 'paid',
          });
          if (existingPlan) {
            return res.status(409).send({
              success: false,
              message: 'You have already purchased this plan.',
            });
          }

          const amount = Math.round(parseFloat(price) * 100);
          const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'usd',
            metadata: { userEmail, planName, price },
            payment_method_types: ['card'],
          });
          res.send({ clientSecret: paymentIntent.client_secret });
        } catch (error) {
          console.error('Stripe Error:', error.message);
          res.status(500).send({ error: error.message });
        }
      },
    );

    // -----------------------------------------------
    // Save plan membership after successful payment
    // ✅ Saves to planMemberships + paymentCollection
    // -----------------------------------------------
    app.post('/save-membership', verifyFBToken, async (req, res) => {
      try {
        const membershipData = req.body;
        const { userEmail, planName, transactionId } = membershipData;

        // ✅ Duplicate check by transactionId in paymentCollection
        if (transactionId) {
          const existingPayment = await paymentCollection.findOne({
            transactionId,
          });
          if (existingPayment) {
            return res.status(409).send({
              success: false,
              message: 'This payment has already been recorded.',
            });
          }
        }

        // ✅ Duplicate check: same user + same plan already active
        const existingPlan = await PlanMembershipCollection.findOne({
          userEmail,
          planName,
          status: 'paid',
        });
        if (existingPlan) {
          return res.status(409).send({
            success: false,
            message: 'Plan already active for this user.',
          });
        }

        // ✅ Save to planMemberships collection
        const planResult = await PlanMembershipCollection.insertOne({
          ...membershipData,
          status: 'paid',
          createdAt: new Date(),
        });

        // ✅ Save to paymentCollection for history tracking
        const paymentRecord = {
          userEmail,
          planName,
          amount: membershipData.price || membershipData.amount || 0,
          transactionId: transactionId || `PLAN-${Date.now()}`,
          paymentType: 'plan-membership',
          status: 'paid',
          paidAt: new Date(),
        };
        await paymentCollection.insertOne(paymentRecord);

        res.send({
          success: true,
          insertedId: planResult.insertedId,
          message: 'Plan membership saved successfully.',
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: 'Failed to save membership',
          error: error.message,
        });
      }
    });

    // -----------------------------------------------
    // Event payment session
    // ✅ Duplicate check before creating session
    // -----------------------------------------------
    app.post(
      '/payment-checkout-session',
      checkStripe,
      verifyFBToken,
      async (req, res) => {
        try {
          const paymentInfo = req.body;
          const { userEmail, eventId } = paymentInfo;

          // ✅ Duplicate check — same user already registered/paid for this event
          if (eventId) {
            const existingRegistration =
              await eventRegistrationsCollection.findOne({
                eventId,
                userEmail,
              });
            if (existingRegistration) {
              return res.status(409).send({
                success: false,
                message: 'You have already registered for this event.',
              });
            }

            const existingPayment = await paymentCollection.findOne({
              userEmail,
              eventId,
              paymentType: 'event',
              status: 'paid',
            });
            if (existingPayment) {
              return res.status(409).send({
                success: false,
                message: 'Payment already exists for this event.',
              });
            }
          }

          const amount = parseInt(paymentInfo.amount) * 100;
          if (amount < 50)
            return res
              .status(400)
              .send({ message: 'Amount too low. Minimum amount is 0.50 USD.' });

          const session = await stripe.checkout.sessions.create({
            line_items: [
              {
                price_data: {
                  currency: 'usd',
                  unit_amount: amount,
                  product_data: {
                    name: paymentInfo.eventTitle || 'Event Payment',
                  },
                },
                quantity: 1,
              },
            ],
            customer_email: userEmail,
            mode: 'payment',
            metadata: {
              userEmail,
              amount: paymentInfo.amount,
              paymentType: 'event',
              clubId: paymentInfo.clubId || '',
              eventId: eventId || '',
              eventTitle: paymentInfo.eventTitle || '',
            },
            success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}&type=event`,
            cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
          });
          res.send({ url: session.url });
        } catch (error) {
          res.status(500).send({
            message: 'Failed to create payment session',
            error: error.message,
          });
        }
      },
    );

    // -----------------------------------------------
    // Club membership payment session
    // ✅ Duplicate check before creating session
    // -----------------------------------------------
    app.post(
      '/payment-club-membership',
      checkStripe,
      verifyFBToken,
      async (req, res) => {
        try {
          const paymentInfo = req.body;
          const { userEmail, clubId } = paymentInfo;

          // ✅ Duplicate check — already a member
          const existingMember = await clubMembershipCollection.findOne({
            userEmail,
            clubId,
            status: 'active',
          });
          if (existingMember) {
            return res.status(409).send({
              success: false,
              message: 'You are already a member of this club.',
            });
          }

          // ✅ Duplicate check — payment already exists
          const existingPayment = await paymentCollection.findOne({
            userEmail,
            clubId,
            paymentType: 'club-membership',
            status: 'paid',
          });
          if (existingPayment) {
            return res.status(409).send({
              success: false,
              message: 'Club membership payment already processed.',
            });
          }

          const amount = parseInt(paymentInfo.cost) * 100;
          if (amount < 50)
            return res
              .status(400)
              .send({ message: 'Amount too low. Minimum amount is 0.50 USD.' });

          const session = await stripe.checkout.sessions.create({
            line_items: [
              {
                price_data: {
                  currency: 'usd',
                  unit_amount: amount,
                  product_data: {
                    name: `${paymentInfo.clubName} - Club Membership`,
                  },
                },
                quantity: 1,
              },
            ],
            customer_email: userEmail,
            mode: 'payment',
            metadata: {
              userEmail,
              clubId,
              cost: paymentInfo.cost,
              paymentType: 'club-membership',
              clubName: paymentInfo.clubName,
              managerEmail: paymentInfo.managerEmail,
            },
            success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}&type=club-membership`,
            cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
          });
          res.send({ url: session.url });
        } catch (error) {
          res.status(500).send({ error: error.message });
        }
      },
    );

    // -----------------------------------------------
    // Plan membership Stripe checkout session
    // ✅ Duplicate check before creating session
    // -----------------------------------------------
    app.post('/payment-checkout', checkStripe, async (req, res) => {
      try {
        const {
          userEmail,
          amount,
          clubName,
          eventTitle,
          clubId,
          eventId,
          bannerImage,
          planName,
        } = req.body;

        // ✅ Duplicate check — plan already purchased
        if (planName) {
          const existingPlan = await PlanMembershipCollection.findOne({
            userEmail,
            planName,
            status: 'paid',
          });
          if (existingPlan) {
            return res.status(409).send({
              success: false,
              message: 'You have already purchased this plan.',
            });
          }

          const existingPayment = await paymentCollection.findOne({
            userEmail,
            planName,
            paymentType: 'plan-membership',
            status: 'paid',
          });
          if (existingPayment) {
            return res.status(409).send({
              success: false,
              message: 'Payment already recorded for this plan.',
            });
          }
        }

        if (!amount || amount <= 0)
          return res.status(400).send({ message: 'Invalid payment amount' });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name:
                    clubName || eventTitle || planName || 'ClubSphere Payment',
                  ...(bannerImage && { images: [bannerImage] }),
                },
                unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          metadata: {
            userEmail,
            clubName: clubName || '',
            eventTitle: eventTitle || '',
            clubId: clubId || '',
            eventId: eventId || '',
            planName: planName || '',
            paymentType: 'plan-membership',
          },
          success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}&type=plan-membership`,
          cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
        });
        res.send({ url: session.url });
      } catch (error) {
        res.status(500).send({
          message: 'Payment session creation failed',
          error: error.message,
        });
      }
    });

    // -----------------------------------------------
    // Event payment success handler
    // ✅ transactionId-based duplicate guard
    // -----------------------------------------------
    app.patch('/payment-success', checkStripe, async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId)
          return res
            .status(400)
            .send({ success: false, message: 'Session ID required' });

        // ✅ Already processed guard
        const alreadyProcessed = await paymentCollection.findOne({
          transactionId: sessionId,
        });
        if (alreadyProcessed) {
          return res.send({
            success: true,
            alreadyProcessed: true,
            paymentType: alreadyProcessed.paymentType,
            message: 'Payment already recorded.',
          });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
          const paymentType = session.metadata.paymentType || 'event';
          const eventTitle = session.metadata.eventTitle || '';

          const paymentInfo = {
            userEmail: session.metadata.userEmail,
            amount: session.metadata.amount,
            paymentType,
            clubId: session.metadata.clubId,
            eventId: session.metadata.eventId,
            eventTitle,
            transactionId: sessionId,
            status: 'paid',
            createdAt: new Date(),
          };

          await paymentCollection.updateOne(
            { transactionId: sessionId },
            { $setOnInsert: paymentInfo },
            { upsert: true },
          );

          // ✅ Duplicate guard for event registration
          const existingReg = await eventRegistrationsCollection.findOne({
            eventId: session.metadata.eventId,
            userEmail: session.metadata.userEmail,
          });

          if (!existingReg) {
            const registration = {
              eventId: session.metadata.eventId,
              userEmail: session.metadata.userEmail,
              clubId: session.metadata.clubId,
              eventTitle,
              status: 'registered',
              paymentType: 'paid',
              paymentId: sessionId,
              registeredAt: new Date().toISOString(),
            };
            await eventRegistrationsCollection.insertOne(registration);

            // ✅ maxAttendees 1 কমানো (paid event)
            if (ObjectId.isValid(session.metadata.eventId)) {
              await eventsCollection.updateOne(
                {
                  _id: new ObjectId(session.metadata.eventId),
                  maxAttendees: { $gt: 0 },
                },
                { $inc: { maxAttendees: -1 } },
              );
            }
          }

          return res.send({
            success: true,
            paymentType,
            message: 'Payment and registration processed successfully',
          });
        }
        res
          .status(400)
          .send({ success: false, message: 'Payment not completed' });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: 'Payment success API error',
          error: error.message,
        });
      }
    });

    // -----------------------------------------------
    // Club membership payment success handler
    // ✅ transactionId-based duplicate guard
    // -----------------------------------------------
    app.patch(
      '/club-membership-payment-success',
      checkStripe,
      async (req, res) => {
        try {
          const sessionId = req.query.session_id;
          if (!sessionId)
            return res
              .status(400)
              .send({ success: false, message: 'Session ID is required' });

          // ✅ Already processed guard
          const alreadyProcessed = await paymentCollection.findOne({
            transactionId: sessionId,
          });
          if (alreadyProcessed) {
            return res.send({
              success: true,
              alreadyProcessed: true,
              paymentType: alreadyProcessed.paymentType,
              message: 'Club membership payment already recorded.',
            });
          }

          const session = await stripe.checkout.sessions.retrieve(sessionId);

          if (session.payment_status === 'paid') {
            const paymentType =
              session.metadata.paymentType || 'club-membership';

            const paymentInfo = {
              userEmail: session.metadata.userEmail,
              amount: session.metadata.cost,
              clubId: session.metadata.clubId,
              clubName: session.metadata.clubName,
              transactionId: sessionId,
              paymentType,
              status: 'paid',
              paidAt: new Date(),
            };

            const paymentResult = await paymentCollection.updateOne(
              { transactionId: sessionId },
              { $setOnInsert: paymentInfo },
              { upsert: true },
            );

            const clubMembership = {
              userEmail: session.metadata.userEmail,
              clubId: session.metadata.clubId,
              clubName: session.metadata.clubName || 'N/A',
              managerEmail: session.metadata.managerEmail,
              paymentId: session.payment_intent,
              status: 'active',
              joinedAt: new Date(),
            };

            await clubMembershipCollection.updateOne(
              {
                userEmail: session.metadata.userEmail,
                clubId: session.metadata.clubId,
              },
              { $set: clubMembership },
              { upsert: true },
            );

            if (paymentResult.upsertedId) {
              // ✅ paid join করা মাত্রই clubs collection-এ membersCount +1
              await clubsCollection.updateOne(
                { _id: new ObjectId(session.metadata.clubId) },
                { $inc: { membersCount: 1 } },
              );
            }

            return res.send({
              success: true,
              paymentType,
              message: 'Club membership payment saved successfully',
            });
          }

          res
            .status(400)
            .send({ success: false, message: 'Payment not completed' });
        } catch (error) {
          res.status(500).send({
            success: false,
            message: 'Error in club membership payment success API',
            error: error.message,
          });
        }
      },
    );

    // -----------------------------------------------
    // Plan membership payment success handler
    // ✅ transactionId-based duplicate guard
    // ✅ Saves to planMemberships collection
    // -----------------------------------------------
    app.patch('/payment-success-record', checkStripe, async (req, res) => {
      try {
        const { session_id } = req.query;
        if (!session_id)
          return res
            .status(400)
            .send({ success: false, message: 'Session ID required' });

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid') {
          const { metadata, amount_total, payment_intent } = session;
          const paymentType = metadata.paymentType || 'plan-membership';
          const planName = metadata.planName || metadata.clubName || '';
          const userEmail = metadata.userEmail;

          // ✅ Already processed guard (payment_intent is unique per Stripe payment)
          const alreadyProcessed = await paymentCollection.findOne({
            transactionId: payment_intent,
          });
          if (alreadyProcessed) {
            return res.send({
              success: true,
              alreadyProcessed: true,
              paymentType,
              message: 'Payment already recorded.',
            });
          }

          // ✅ Save to paymentCollection
          const paymentRecord = {
            transactionId: payment_intent,
            userEmail,
            amount: amount_total / 100,
            clubName: metadata.clubName,
            eventTitle: metadata.eventTitle,
            clubId: metadata.clubId,
            eventId: metadata.eventId,
            planName,
            paymentType,
            status: 'paid',
            paidAt: new Date().toISOString(),
          };

          await paymentCollection.updateOne(
            { transactionId: payment_intent },
            { $setOnInsert: paymentRecord },
            { upsert: true },
          );

          // ✅ Save to planMemberships collection
          const existingPlan = await PlanMembershipCollection.findOne({
            userEmail,
            planName,
            status: 'paid',
          });

          if (!existingPlan) {
            await PlanMembershipCollection.insertOne({
              userEmail,
              planName,
              amount: amount_total / 100,
              transactionId: payment_intent,
              clubName: metadata.clubName || '',
              clubId: metadata.clubId || '',
              paymentType,
              status: 'paid',
              createdAt: new Date(),
            });
          }

          return res.send({
            success: true,
            paymentType,
            message: 'Payment recorded successfully',
          });
        }

        res
          .status(400)
          .send({ success: false, message: 'Payment not completed' });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get('/payments', async (req, res) => {
      try {
        const payments = await paymentCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.send(payments);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: 'Failed to fetch payments',
          error: error.message,
        });
      }
    });

    // ===============================================
    // 📊 STATISTICS ROUTES
    // ===============================================

    app.get('/member-stats/:email', verifyFBToken, async (req, res) => {
      try {
        const email = req.params.email;

        const totalClubs = await clubMembershipCollection.countDocuments({
          userEmail: email,
          status: 'active',
        });

        const validEventQuery = {
          userEmail: email,
          eventId: { $exists: true, $ne: '' },
          eventTitle: { $exists: true, $ne: '' },
          clubId: { $exists: true, $ne: '' },
        };

        const totalEvents =
          await eventRegistrationsCollection.countDocuments(validEventQuery);
        const registeredEvents = await eventRegistrationsCollection
          .find(validEventQuery)
          .toArray();

        const eventIds = registeredEvents
          .map(reg => reg.eventId)
          .filter(id => ObjectId.isValid(id))
          .map(id => new ObjectId(id));

        const nowISO = new Date().toISOString();

        const upcomingEvents = await eventsCollection
          .find({
            _id: { $in: eventIds },
            eventDate: { $gte: nowISO },
          })
          .sort({ eventDate: 1 })
          .limit(3)
          .toArray();

        res.send({ totalClubs, totalEvents, upcomingEvents });
      } catch (error) {
        res.status(500).send({
          message: 'Error fetching member stats',
          error: error.message,
        });
      }
    });

    app.get('/member-payments/:email', verifyFBToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (req.decoded_email !== email) {
          return res
            .status(403)
            .send({ message: 'Forbidden Access: Email Mismatch' });
        }
        const user = await usersCollection.findOne({ email });
        if (!user || user.role !== 'member') {
          return res.status(403).send({
            message: 'Access Denied: Only members can view this history',
          });
        }
        const result = await paymentCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1, paidAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error('Payment history fetch error:', error);
        res
          .status(500)
          .send({ message: 'Error fetching payment history', error });
      }
    });

    app.get('/admin-stats', verifyFBToken, async (req, res) => {
      try {
        const revenueResult = await paymentCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: { $toDouble: '$amount' } },
              },
            },
          ])
          .toArray();
        const totalRevenue =
          revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
        const totalUsers = await usersCollection.countDocuments();
        const totalEvents = await eventsCollection.countDocuments();
        const totalMemberships =
          await clubMembershipCollection.countDocuments();
        const approvedClubs = await clubsCollection.countDocuments({
          status: 'approved',
        });
        const pendingClubs = await clubsCollection.countDocuments({
          status: 'pending',
        });
        const rejectedClubs = await clubsCollection.countDocuments({
          status: 'rejected',
        });
        const membershipsPerClub = await clubsCollection
          .aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $project: { _id: 0, name: '$_id', count: 1 } },
          ])
          .toArray();
        res.send({
          totalRevenue,
          totalUsers,
          totalEvents,
          totalMemberships,
          clubsByStatus: {
            approved: approvedClubs,
            pending: pendingClubs,
            rejected: rejectedClubs,
          },
          membershipsPerClub,
        });
      } catch (error) {
        console.error('Admin Stats Error:', error);
        res.status(500).send({
          message: 'Failed to fetch admin statistics',
          error: error.message,
        });
      }
    });

    app.get('/club-manager-overview', verifyFBToken, async (req, res) => {
      try {
        const managerEmail = req.query.managerEmail;
        if (!managerEmail)
          return res.status(400).send({ message: 'managerEmail is required' });
        const totalClubs = await clubsCollection.countDocuments({
          managerEmail,
        });
        const myClubs = await clubsCollection.find({ managerEmail }).toArray();
        const clubIds = myClubs.map(club => club._id.toString());
        const totalEvents = await eventsCollection.countDocuments({
          managerEmail,
        });
        const totalMembers = await clubMembershipCollection.countDocuments({
          clubId: { $in: clubIds },
          status: 'active',
        });
        const revenueResult = await paymentCollection
          .aggregate([
            { $match: { clubId: { $in: clubIds } } },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: { $toDouble: '$amount' } },
              },
            },
          ])
          .toArray();
        const totalRevenue =
          revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
        res.send({ totalClubs, totalEvents, totalMembers, totalRevenue });
      } catch (error) {
        console.error('Error fetching manager overview:', error);
        res.status(500).send({ message: 'Internal Server Error', error });
      }
    });

    console.log('✅ All routes registered successfully.');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

run().catch(console.dir);

// ===============================================
// 🚀 SERVER START
// ===============================================

app.get('/', (req, res) => {
  res.send('🚀 ClubSphere Server is Running!');
});

app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.message);
  res
    .status(500)
    .send({ message: 'Something went wrong!', error: err.message });
});

app.listen(port, () => {
  console.log(`✅ ClubSphere Server listening on port ${port}`);
});
