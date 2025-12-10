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

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

/* =======================
 ✅ MIDDLEWARE (STRIPE SAFE)
======================= */

app.use(cors({ origin: true, credentials: true }));

app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    next(); // ✅ Allow Stripe RAW body
  } else {
    express.json()(req, res, next); // ✅ Normal JSON for all other routes
  }
});

/* =======================
 ✅ MONGODB CONNECTION
======================= */

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("skillSync");

    const publicLessonsCollection = database.collection("publicLessons");
    const usersCollection = database.collection("users");
    const reportsCollection = database.collection("reports");

    /* =======================
 ✅ USERS
======================= */

    app.post("/users", async (req, res) => {
      const user = req.body;

      const existingUser = await usersCollection.findOne({
        email: user.email,
      });

      if (existingUser) {
        return res.send({ message: "User already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
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

    /* =======================
 ✅ STRIPE PAYMENT
======================= */

    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { email } = req.body;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "usd", // ✅ FIXED
                unit_amount: 1500, // ✅ $15 = ৳1500 approx
                product_data: {
                  name: "SkillSync Premium Lifetime",
                },
              },
              quantity: 1,
            },
          ],
          mode: "payment",

          metadata: {
            userEmail: email,
            plan: "premium",
          },

          customer_email: email,

          success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error.message);
        res.status(500).send({ message: error.message });
      }
    });

    /* =======================
 ✅ STRIPE WEBHOOK
======================= */

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

        if (event.type === "checkout.session.completed") {
          const session = event.data.object;

          const userEmail =
            session.metadata?.userEmail || session.customer_email;

          console.log("✅ Payment Success for:", userEmail);

          const result = await usersCollection.updateOne(
            { email: userEmail },
            { $set: { isPremium: true } }
          );

          console.log("✅ MongoDB Update Result:", result.modifiedCount);
        }

        res.json({ received: true });
      }
    );

    /* =======================
 ✅ LESSONS
======================= */

    app.post("/add-lesson", async (req, res) => {
      const result = await publicLessonsCollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/public-lessons", async (req, res) => {
      const result = await publicLessonsCollection.find().toArray();
      res.send(result);
    });

    app.get("/public-lessons/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid lesson ID" });
      }

      const result = await publicLessonsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!result) {
        return res.status(404).send({ message: "Lesson not found" });
      }

      res.send(result);
    });

    app.patch("/update/:id", async (req, res) => {
      const id = req.params.id;

      const result = await publicLessonsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );

      res.send(result);
    });

    app.get("/update/:id", async (req, res) => {
      const id = req.params.id;
      const result = await publicLessonsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    /* =======================
 ✅ COMMENTS, LIKES, FAVORITES
======================= */

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

      const lesson = await publicLessonsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      const alreadyLiked = lesson?.likes?.includes(email);

      const update = alreadyLiked
        ? { $pull: { likes: email } }
        : { $addToSet: { likes: email } };

      await publicLessonsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        update
      );

      res.send({ success: true, liked: !alreadyLiked });
    });

    app.patch("/details/favorite/:id", async (req, res) => {
      const { email } = req.body;

      const lesson = await publicLessonsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      const alreadySaved = lesson?.favorites?.includes(email);

      const update = alreadySaved
        ? { $pull: { favorites: email } }
        : { $addToSet: { favorites: email } };

      await publicLessonsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        update
      );

      res.send({ success: true, saved: !alreadySaved });
    });

    /* =======================
 ✅ REPORTS & SIMILAR
======================= */

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
  } finally {
  }
}

run().catch(console.dir);

/* =======================
 ✅ ROOT
======================= */

app.get("/", (req, res) => {
  res.send("SkillSync Server Running ✅");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
