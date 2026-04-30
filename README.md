# 🚀 ClubSphere Backend API

A powerful and scalable Node.js + Express + MongoDB + Firebase + Stripe backend
for the ClubSphere platform.

---

## ⚡ Tech Stack

Node.js, Express.js, MongoDB Atlas, Firebase Admin SDK, Stripe, dotenv, cors

---

## 🌟 Features

- Firebase Authentication (JWT secured)
- Stripe Payment Integration
- Club & Event Management
- Membership System (Free & Paid)
- Admin & Manager Analytics
- Role-based Access Control
- Auto registration after payment

---

## 📁 Project Structure

server.js\
.env

---

## 🔐 Environment Variables

PORT=3000\
DB_USER=your_mongo_user\
DB_PASS=your_mongo_password\
STRIPE_SECRET=your_stripe_secret_key\
FB_SERVICE_KEY=your_firebase_key\
SITE_DOMAIN=https://your-frontend.com

---

## 🚀 Installation

git clone https://github.com/alaminislam3203/Club-Sphere-Server.git

cd clubsphere-backend\
npm install\
npm start

---

## 📌 API Endpoints

### USERS

POST /users\
GET /users/:email\
GET /users\
PATCH /users/:id/role

### CLUBS

POST /clubs\
GET /clubs\
GET /clubs/:id\
PATCH /clubs/:id\
DELETE /clubs/:id

### EVENTS

POST /events\
GET /events\
GET /events/upcoming\
PATCH /events/:id\
DELETE /events/:id

### PAYMENTS

POST /create-checkout-session\
POST /payment-club-membership\
POST /payment-checkout\
PATCH /payment-success\
PATCH /payment-success-record\
GET /payments

---

## 🛡️ Security

Firebase JWT + Stripe verification + Role-based access

---

## 👨‍💻 Developer

Built for ClubSphere Platform 🚀

---

## 📜 License

MIT
