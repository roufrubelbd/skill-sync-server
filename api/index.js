// const { ObjectId } = require("mongodb");
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// const express = require("express");
// const app = express();
// const port = process.env.PORT || 5000;
// const { MongoClient, ServerApiVersion } = require("mongodb");

// require("dotenv").config();
// const cors = require("cors");

// //   middleware
// app.use(cors({ origin: true, credentials: true }));
// app.use(express.json());

// const uri = process.env.MONGODB_URI;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     // await client.connect();

//     const database = client.db("skillSync");
//     const publicLessonsCollection = database.collection("publicLessons");
//     // const privateLessonsCollection = database.collection("privateLessons");
//     const usersCollection = database.collection("users");
//     const reportsCollection = database.collection("reports");

//     // ADD a public lesson
//     app.post("/add-lesson", async (req, res) => {
//       const addLesson = req.body;
//       const result = await publicLessonsCollection.insertOne(addLesson);
//       res.send(result);
//     });

//     //  SAVE USER (REGISTER + GOOGLE)
//     app.post("/users", async (req, res) => {
//       console.log("Hit users collection post");
//       const user = req.body;

//       const existingUser = await usersCollection.findOne({
//         email: user.email,
//       });

//       if (existingUser) {
//         return res.send({ message: "User already exists" });
//       }

//       const result = await usersCollection.insertOne(user);
//       res.send(result);
//     });

//     // ------------------------- stripe set up start -------------------------

//     // CREATE CHECKOUT SESSION
//     app.post("/create-checkout-session", async (req, res) => {
//       try {
//         const { email } = req.body;

//         if (!email) {
//           return res.status(400).send({ message: "Email is required" });
//         }

//         const session = await stripe.checkout.sessions.create({
//           line_items: [
//             {
//               price_data: {
//                 currency: "bdt",
//                 unit_amount: 150000, // ৳1500
//                 product_data: {
//                   name: "SkillSync Premium Lifetime",
//                 },
//               },
//               quantity: 1,
//             },
//           ],
//           mode: "payment",

//           // ✅ This is IMPORTANT (used by webhook)
//           metadata: {
//             userEmail: email,
//             plan: "premium",
//           },

//           customer_email: email,

//           // ✅ session_id added like your sample
//           success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
//           cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
//         });

//         res.send({ url: session.url });
//       } catch (error) {
//         console.error("Stripe Error:", error.message);
//         res.status(500).send({ message: error.message });
//       }
//     });

//     // ✅ STRIPE WEBHOOK (FIXED & WORKING)
//     app.post(
//       "/webhook",
//       express.raw({ type: "application/json" }),
//       async (req, res) => {
//         const sig = req.headers["stripe-signature"];

//         let event;

//         try {
//           event = stripe.webhooks.constructEvent(
//             req.body,
//             sig,
//             process.env.STRIPE_WEBHOOK_SECRET
//           );
//         } catch (err) {
//           console.error("Webhook signature error:", err.message);
//           return res.status(400).send(`Webhook Error: ${err.message}`);
//         }

//         if (event.type === "checkout.session.completed") {
//           const session = event.data.object;

//           const userEmail =
//             session.metadata?.userEmail || session.customer_email;

//           console.log("✅ Payment Success for:", userEmail);

//           const result = await usersCollection.updateOne(
//             { email: userEmail },
//             { $set: { isPremium: true } }
//           );

//           console.log("✅ MongoDB Update Result:", result.modifiedCount);
//         }

//         res.json({ received: true });
//       }
//     );

//     // ------ stripe set up end -------

//     // GET public lessons
//     app.get("/public-lessons", async (req, res) => {
//       //   console.log(" Public Lessons API Hit");
//       const cursor = publicLessonsCollection.find();
//       const result = await cursor.toArray();
//       res.send(result);
//     });

//     // ------------ START LESSON DETAILS page relevant apis ------------

//     //  POST COMMENT
//     app.post("/public-lessons/:id/comment", async (req, res) => {
//       try {
//         const { id } = req.params;
//         const payload = req.body;

//         const newComment = {
//           ...payload,
//           timestamp: new Date(),
//         };

//         const result = await publicLessonsCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $push: { comments: newComment } }
//         );

//         res.send({ success: true });
//       } catch (error) {
//         res.status(500).send({ message: "Failed to post comment", error });
//       }
//     });

//     //  GET COMMENTS
//     app.get("/public-lessons/:id/comments", async (req, res) => {
//       const lesson = await publicLessonsCollection.findOne({
//         _id: new ObjectId(req.params.id),
//       });

//       res.send(lesson?.comments || []);
//     });

//     // Toggle Like
//     app.patch("/details/like/:id", async (req, res) => {
//       const { email } = req.body;
//       const lesson = await publicLessonsCollection.findOne({
//         _id: new ObjectId(req.params.id),
//       });

//       const likesArray = lesson?.likes || [];

//       const alreadyLiked = likesArray.includes(email);

//       const update = alreadyLiked
//         ? { $pull: { likes: email } }
//         : { $addToSet: { likes: email } };

//       const result = await publicLessonsCollection.updateOne(
//         { _id: new ObjectId(req.params.id) },
//         update
//       );

//       res.send({ success: true, liked: !alreadyLiked });
//     });

//     //  TOGGLE FAVORITE
//     app.patch("/details/favorite/:id", async (req, res) => {
//       try {
//         const { email } = req.body;

//         const lesson = await publicLessonsCollection.findOne({
//           _id: new ObjectId(req.params.id),
//         });

//         const favoriteArray = lesson?.favorites || [];
//         const alreadySaved = favoriteArray.includes(email);

//         const update = alreadySaved
//           ? { $pull: { favorites: email } }
//           : { $addToSet: { favorites: email } };

//         await publicLessonsCollection.updateOne(
//           { _id: new ObjectId(req.params.id) },
//           update
//         );

//         res.send({ success: true, saved: !alreadySaved });
//       } catch (error) {
//         res.status(500).send({ message: "Favorite failed", error });
//       }
//     });

//     // Get Single Lesson
//     app.get("/public-lessons/:id", async (req, res) => {
//       try {
//         const id = req.params.id;

//         if (!ObjectId.isValid(id)) {
//           return res.status(400).send({ message: "Invalid lesson ID" });
//         }

//         const result = await publicLessonsCollection.findOne({
//           _id: new ObjectId(id),
//         });

//         if (!result) {
//           return res.status(404).send({ message: "Lesson not found" });
//         }

//         res.send(result);
//       } catch (error) {
//         res.status(500).send({ message: "Server error", error });
//       }
//     });

//     // Report Lesson
//     app.post("/lesson-reports", async (req, res) => {
//       const payload = req.body;
//       const result = await reportsCollection.insertOne(payload);
//       res.send(result);
//     });

//     // Get Similar Lessons
//     app.get("/similar-lessons/:category/:tone", async (req, res) => {
//       const { category, tone } = req.params;
//       const result = await publicLessonsCollection
//         .find({
//           $or: [{ category }, { tone }],
//         })
//         .limit(6)
//         .toArray();
//       res.send(result);
//     });

//     // ------------ END LESSON DETAILS page relevant apis ------------

//     //  GET SINGLE LESSON
//     app.get("/update/:id", async (req, res) => {
//       const id = req.params.id;
//       const result = await publicLessonsCollection.findOne({
//         _id: new ObjectId(id),
//       });
//       res.send(result);
//     });

//     //  UPDATE LESSON
//     app.patch("/update/:id", async (req, res) => {
//       const id = req.params.id;
//       const updatedLesson = req.body;

//       const result = await publicLessonsCollection.updateOne(
//         { _id: new ObjectId(id) },
//         { $set: updatedLesson }
//       );

//       res.send(result);
//     });

//     // GET user
//     app.get("/users", async (req, res) => {
//       console.log(" Users API Hit");
//       const cursor = usersCollection.find();
//       const result = await cursor.toArray();
//       res.send(result);
//     });

//     // GET a user's role
//     app.get("/users/:email/role", async (req, res) => {
//       const email = req.params.email;
//       const user = await usersCollection.findOne({ email });

//       res.send({
//         role: user?.role || "user",
//         isPremium: user?.isPremium || false,
//       });
//     });

//     // Send a ping to confirm a successful connection
//     // await client.db("admin").command({ ping: 1 });

//     // console.log(uri);
//     // console.log(
//     //   "Pinged your deployment. You successfully connected to MongoDB!"
//     // );
//   } finally {
//     // await client.close();
//   }
// }
// run().catch(console.dir);

// app.get("/", (req, res) => {
//   res.send("Hello World!");
// });

// app.listen(port, () => {
//   console.log(`Example app listening on port ${port}`);
// });

// server.js (replace your previous server with this)
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

/* -----------------------
  Middleware
  - For webhook we need raw body; for other routes JSON
------------------------*/
app.use(cors({ origin: true, credentials: true }));

// Use express.json for all routes except /webhook (Stripe requires raw body)
app.use((req, res, next) => {
  if (
    req.originalUrl === "/webhook" ||
    req.originalUrl.startsWith("/webhook")
  ) {
    return next();
  }
  return express.json()(req, res, next);
});

/* -----------------------
  MongoDB
------------------------*/
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function startServer() {
  try {
    // IMPORTANT: ensure the client is connected before registering routes that use DB
    await client.connect();
    console.log("MongoDB connected");

    const database = client.db("skillSync");
    const publicLessonsCollection = database.collection("publicLessons");
    const usersCollection = database.collection("users");
    const reportsCollection = database.collection("reports");

    /* =========================
       Routes (DB-backed)
       ========================= */

    // -- Users
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        if (!user?.email)
          return res.status(400).send({ message: "Email required" });

        const existingUser = await usersCollection.findOne({
          email: user.email,
        });
        if (existingUser) return res.send({ message: "User already exists" });

        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (err) {
        console.error("POST /users error:", err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send({
        role: user?.role || "user",
        isPremium: user?.isPremium || false,
      });
    });

    /* -------------------------------
       Stripe: create session & webhook
       ------------------------------- */

    // Create Checkout Session
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email)
          return res.status(400).send({ message: "Email is required" });

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: 1500, // 1500 cents = $15 (adjust as needed)
                product_data: { name: "SkillSync Premium Lifetime" },
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          metadata: { userEmail: email, plan: "premium" },
          customer_email: email,
          success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
        });

        res.send({ url: session.url });
      } catch (err) {
        console.error("create-checkout-session error:", err);
        res.status(500).send({ message: err.message || "Stripe error" });
      }
    });

    // Stripe webhook (raw body)
    app.post(
      "/webhook",
      express.raw({ type: "application/json" }),
      async (req, res) => {
        const sig = req.headers["stripe-signature"];
        let event;

        try {
          event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
          );
        } catch (err) {
          console.error("Webhook signature error:", err.message);
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        try {
          if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            // prefer metadata.userEmail (we stored it when creating the session)
            const userEmail =
              session.metadata?.userEmail || session.customer_email;

            console.log("Webhook: checkout.session.completed for", userEmail);

            if (userEmail) {
              const result = await usersCollection.updateOne(
                { email: userEmail },
                { $set: { isPremium: true } }
              );
              console.log(
                "Mongo update result.modifiedCount=",
                result.modifiedCount
              );
            } else {
              console.warn("No email found in session to mark premium");
            }
          }

          // you can handle other events here if needed

          res.json({ received: true });
        } catch (err) {
          console.error("Webhook handling error:", err);
          res.status(500).send("Webhook handling failed");
        }
      }
    );

    // Fallback: manual verify endpoint — fetch session from Stripe and update DB (useful for debugging)
    // Client calls: POST /verify-session { session_id: 'cs_test_...' }
    app.post("/verify-session", express.json(), async (req, res) => {
      try {
        const { session_id } = req.body;
        if (!session_id)
          return res.status(400).send({ message: "session_id required" });

        const session = await stripe.checkout.sessions.retrieve(session_id);

        const userEmail = session.metadata?.userEmail || session.customer_email;

        if (!userEmail)
          return res.status(400).send({ message: "No email in session" });

        const result = await usersCollection.updateOne(
          { email: userEmail },
          { $set: { isPremium: true } }
        );

        res.send({ success: true, modifiedCount: result.modifiedCount });
      } catch (err) {
        console.error("verify-session error:", err);
        res.status(500).send({ message: err.message });
      }
    });

    /* =========================
       Lessons, comments, likes, favorites, reports
       (Your logic preserved, lightly restructured)
       ========================= */

    app.post("/add-lesson", async (req, res) => {
      const result = await publicLessonsCollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/public-lessons", async (req, res) => {
      const result = await publicLessonsCollection.find().toArray();
      res.send(result);
    });

    app.get("/public-lessons/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid id" });

        const lesson = await publicLessonsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!lesson) return res.status(404).send({ message: "Not found" });

        res.send(lesson);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/public-lessons/:id/comment", async (req, res) => {
      const { id } = req.params;
      const newComment = { ...req.body, timestamp: new Date() };

      await publicLessonsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $push: { comments: newComment } }
      );
      res.send({ success: true });
    });

    app.patch("/details/like/:id", async (req, res) => {
      const { email } = req.body;
      const id = req.params.id;

      const lesson = await publicLessonsCollection.findOne({
        _id: new ObjectId(id),
      });
      const alreadyLiked = lesson?.likes?.includes(email);
      const update = alreadyLiked
        ? { $pull: { likes: email } }
        : { $addToSet: { likes: email } };

      await publicLessonsCollection.updateOne(
        { _id: new ObjectId(id) },
        update
      );
      res.send({ success: true, liked: !alreadyLiked });
    });

    app.patch("/details/favorite/:id", async (req, res) => {
      const { email } = req.body;
      const id = req.params.id;

      const lesson = await publicLessonsCollection.findOne({
        _id: new ObjectId(id),
      });
      const alreadySaved = lesson?.favorites?.includes(email);
      const update = alreadySaved
        ? { $pull: { favorites: email } }
        : { $addToSet: { favorites: email } };

      await publicLessonsCollection.updateOne(
        { _id: new ObjectId(id) },
        update
      );
      res.send({ success: true, saved: !alreadySaved });
    });

    app.post("/lesson-reports", async (req, res) => {
      const result = await reportsCollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/similar-lessons/:category/:tone", async (req, res) => {
      const { category, tone } = req.params;
      const result = await publicLessonsCollection
        .find({ $or: [{ category }, { tone }] })
        .limit(6)
        .toArray();
      res.send(result);
    });

    /* End of route registrations */

    console.log("All routes registered");
  } catch (err) {
    console.error("Start server failed:", err);
    process.exit(1);
  }
}

startServer().catch(console.dir);

/* -----------------------
  Root
------------------------*/
app.get("/", (req, res) => {
  res.send("SkillSync Server Running ✅");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
