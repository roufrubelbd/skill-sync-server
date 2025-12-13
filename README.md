# 🌟 SKILL SYNC – Digital Life Lessons Platform

**Website Live Site:** [ https://skill-sync-learning.web.app ]

SKILL SYNC is a full‑stack digital learning and reflection platform where users can create, store, and share meaningful life lessons. The platform encourages personal growth, mindful reflection, and community learning through structured life lessons with free and premium access control.

---

## 🚀 Key Features

- 🔐 **Authentication & Authorization**

  - Email & Password login
  - Google authentication
  - Role-based access (User / Admin)
  - Protected routes with Firebase token verification

- 💎 **Free & Premium Membership System**

  - All users start with Free plan
  - Stripe one-time lifetime Premium upgrade (৳1500)
  - Premium users can create and access Premium lessons
  - Premium lessons are locked/blurred for Free users

- 📚 **Life Lessons Management**

  - Create lessons with title, description, category, emotional tone, and optional image
  - Control lesson visibility (Public / Private)
  - Control access level (Free / Premium)
  - Update lessons with pre-filled forms
  - Delete lessons with confirmation

- 🌍 **Public Lesson Browsing**

  - Browse all public lessons
  - Search by keyword
  - Filter by category & emotional tone
  - Sort by newest or most saved
  - Pagination for better performance

- ❤️ **Engagement & Interaction**

  - Like / Unlike lessons
  - Save lessons to Favorites
  - Comment system
  - Report inappropriate lessons
  - Social sharing support

- 📊 **User Dashboard**

  - Overview analytics
  - My Lessons management
  - My Favorites list
  - Profile management with Premium badge

- 🛠️ **Admin Dashboard**

  - Platform analytics
  - Manage users & roles
  - Manage lessons
  - Review & moderate reported content
  - Feature lessons on homepage

---

## 🏗️ Tech Stack

### Frontend

- React + Vite
- Tailwind CSS & DaisyUI
- React Router
- Axios
- Firebase Authentication
- React Toast / SweetAlert
- Lottie Animations

### Backend

- Node.js
- Express.js
- MongoDB Atlas
- Firebase Admin SDK
- Stripe Payment Gateway

---

## 🔒 Security & Best Practices

- Environment variables used for all sensitive credentials
- Firebase Admin SDK for secure token verification
- MongoDB as the single source of truth for user roles & plans
- CORS properly configured
- Reload-safe routes on deployment

---

## 💳 Stripe Payment Flow

1. User clicks **Upgrade to Premium**
2. Backend creates Stripe Checkout Session
3. User completes payment on Stripe
4. Stripe Webhook updates `isPremium: true` in MongoDB
5. User instantly gains Premium access

---

## 📌 Project Highlights

- Clean & professional UI with consistent spacing
- Fully responsive (Mobile / Tablet / Desktop)
- No lorem ipsum used
- No default browser alerts
- Proper confirmation modals & toast messages
- Minimum required GitHub commits followed

---

## 📂 GutHub Repositories

- **Client-side:** GitHub repository (React)
  [ https://github.com/roufrubelbd/skill-sync ]
- **Server-side:** GitHub repository (Node + Express)
  [ https://github.com/roufrubelbd/skill-sync-server ]

---

## 👨‍💻 Developed By

**SKILL SYNC** – Digital Life Lessons Platform
Built as part of Assignment 11 (Category 03)

---

✨ _Preserve wisdom. Learn from life. Grow together with SKILL SYNC._
