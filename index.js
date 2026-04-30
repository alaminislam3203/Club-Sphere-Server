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

    // ===============================================
    // 💳 PAYMENT ROUTES
    // ===============================================

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

    app.post('/save-membership', verifyFBToken, async (req, res) => {
      try {
        const membershipData = req.body;
        const query = {
          userEmail: membershipData.userEmail,
          planName: membershipData.planName,
        };
        const existing = await PlanMembershipCollection.findOne(query);
        if (existing) {
          return res
            .status(400)
            .send({ message: 'Plan already active for this user.' });
        }
        const result = await PlanMembershipCollection.insertOne({
          ...membershipData,
          createdAt: new Date(),
        });
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to save membership', error: error.message });
      }
    });

    // ✅ EVENT payment session — type=event hardcoded
    app.post(
      '/payment-checkout-session',
      checkStripe,
      verifyFBToken,
      async (req, res) => {
        try {
          const paymentInfo = req.body;
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
            customer_email: paymentInfo.userEmail,
            mode: 'payment',
            metadata: {
              userEmail: paymentInfo.userEmail,
              amount: paymentInfo.amount,
              paymentType: 'event',
              clubId: paymentInfo.clubId || '',
              eventId: paymentInfo.eventId || '',
              eventTitle: paymentInfo.eventTitle || '', // ✅ eventTitle metadata এ রাখা হচ্ছে
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
    // ✅ CLUB MEMBERSHIP payment session — type=club-membership hardcoded
    app.post(
      '/payment-club-membership',
      checkStripe,
      verifyFBToken,
      async (req, res) => {
        try {
          const paymentInfo = req.body;
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
            customer_email: paymentInfo.userEmail,
            mode: 'payment',
            metadata: {
              userEmail: paymentInfo.userEmail,
              clubId: paymentInfo.clubId,
              cost: paymentInfo.cost,
              paymentType: 'club-membership',
              clubName: paymentInfo.clubName,
              managerEmail: paymentInfo.managerEmail,
            },
            // ✅ type=club-membership hardcoded
            success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}&type=club-membership`,
            cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
          });
          res.send({ url: session.url });
        } catch (error) {
          res.status(500).send({ error: error.message });
        }
      },
    );

    // ✅ PLAN MEMBERSHIP payment session — type=plan-membership hardcoded
    app.post('/payment-checkout', checkStripe, async (req, res) => {
      try {
        const {
          userEmail,
          cost,
          clubName,
          eventTitle,
          clubId,
          eventId,
          bannerImage,
        } = req.body;
        if (!cost || cost <= 0)
          return res.status(400).send({ message: 'Invalid payment amount' });
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: clubName || eventTitle || 'ClubSphere Payment',
                  ...(bannerImage && { images: [bannerImage] }),
                },
                unit_amount: Math.round(cost * 100),
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

    // ✅ EVENT payment success handler
    // FIX: eventRegistrations এ eventTitle সহ সব field save হচ্ছে
    app.patch('/payment-success', checkStripe, async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId)
          return res
            .status(400)
            .send({ success: false, message: 'Session ID required' });

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
          const paymentType = session.metadata.paymentType || 'event';
          const eventTitle = session.metadata.eventTitle || '';

          // ✅ payments collection এ eventTitle সহ save
          const paymentInfo = {
            userEmail: session.metadata.userEmail,
            amount: session.metadata.amount,
            paymentType,
            clubId: session.metadata.clubId,
            eventId: session.metadata.eventId,
            eventTitle, // ✅ eventTitle save
            transactionId: sessionId,
            status: 'paid',
            createdAt: new Date(),
          };

          await paymentCollection.updateOne(
            { transactionId: sessionId },
            { $setOnInsert: paymentInfo },
            { upsert: true },
          );

          // ✅ FIX: eventRegistrations এ eventTitle সহ সব field save হচ্ছে
          const registration = {
            eventId: session.metadata.eventId,
            userEmail: session.metadata.userEmail,
            clubId: session.metadata.clubId,
            eventTitle, // ✅ eventTitle save
            status: 'registered',
            paymentType: 'paid', // ✅ paid event চেনা যাবে
            paymentId: sessionId,
            registeredAt: new Date().toISOString(),
          };

          await eventRegistrationsCollection.updateOne(
            {
              eventId: session.metadata.eventId,
              userEmail: session.metadata.userEmail,
            },
            { $setOnInsert: registration },
            { upsert: true },
          );

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

    // ✅ CLUB MEMBERSHIP payment success handler
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

    // ✅ PLAN MEMBERSHIP payment success handler
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

          const paymentRecord = {
            transactionId: payment_intent,
            userEmail: metadata.userEmail,
            amount: amount_total / 100,
            clubName: metadata.clubName,
            eventTitle: metadata.eventTitle,
            clubId: metadata.clubId,
            eventId: metadata.eventId,
            paymentType,
            status: 'paid',
            paidAt: new Date().toISOString(),
          };

          await paymentCollection.updateOne(
            { transactionId: payment_intent },
            { $setOnInsert: paymentRecord },
            { upsert: true },
          );

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

        // ✅ Clubs count (same)
        const totalClubs = await clubMembershipCollection.countDocuments({
          userEmail: email,
          status: 'active',
        });

        // ✅ FIX: Only valid event registrations count হবে
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
