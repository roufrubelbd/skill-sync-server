const { ObjectId } = require("mongodb");
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();
const cors = require("cors");

//  middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

// To handle raw body for webhook separately
// app.use((req, res, next) => {
//   if (req.originalUrl === "/webhook") {
//     next();
//   } else {
//     express.json()(req, res, next);
//   }
// });

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
    // await client.connect();

    const database = client.db("skillSync");
    const allLessonsCollection = database.collection("allLessons");
    const featuredLessonsCollection = database.collection("featuredLessons");
    const usersCollection = database.collection("users");
    const reportsCollection = database.collection("reports");

    // ADD a public lesson
    app.post("/add-lesson", async (req, res) => {
      const addLesson = req.body;
      const result = await allLessonsCollection.insertOne(addLesson);
      res.send(result);
    });

    //  SAVE USER (REGISTER + GOOGLE)
    app.post("/users", async (req, res) => {
      console.log("Hit users collection post");
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

    // ================================
    // FEATURED LESSONS START
    // ================================

    // ADD TO FEATURED
    app.post("/featured-lessons", async (req, res) => {
      const payload = req.body;

      // prevent duplicates
      const exists = await featuredLessonsCollection.findOne({
        lessonId: payload.lessonId,
      });

      if (exists) {
        return res.send({ message: "Already featured" });
      }

      const result = await featuredLessonsCollection.insertOne(payload);
      res.send(result);
    });

    // GET ALL FEATURED LESSONS
    app.get("/featured-lessons", async (req, res) => {
      const result = await featuredLessonsCollection.find().toArray();
      res.send(result);
    });

    // DELETE ALL LESSON
    app.delete("/all-lessons/:id", async (req, res) => {
      const id = req.params.id;
      const result = await allLessonsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // DELETE FEATURED LESSON
    app.delete("/featured-lessons/:id", async (req, res) => {
      const id = req.params.id;

      const result = await featuredLessonsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    // UPDATE FEATURED LESSON
    app.patch("/featured-lessons/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      const result = await featuredLessonsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      res.send(result);
    });

    // ================================
    // FEATURED LESSONS END
    // ================================

    // -------------- GET TOP CONTRIBUTORS ------
    app.get("/top-contributors", async (req, res) => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const contributors = await allLessonsCollection
        .aggregate([
          { $match: { createdAt: { $gte: oneWeekAgo.toISOString() } } },
          { $group: { _id: "$createdByEmail", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "email",
              as: "userData",
            },
          },
          { $unwind: "$userData" },
        ])
        .toArray();

      res.send(contributors);
    });

    // GET MOST SAVED LESSONS
    app.get("/most-saved-lessons", async (req, res) => {
      const lessons = await allLessonsCollection
        .aggregate([
          {
            $addFields: {
              saveCount: { $size: "$favorites" },
            },
          },
          { $sort: { saveCount: -1 } },
          { $limit: 6 },
        ])
        .toArray();

      res.send(lessons);
    });

    // ------------------------- stripe set up start -------------------------

    // CREATE CHECKOUT SESSION
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
                currency: "usd",
                unit_amount: 1500, // $15
                product_data: {
                  name: "SkillSync Premium Lifetime",
                },
              },
              quantity: 1,
            },
          ],
          mode: "payment",

          // ✅ This is IMPORTANT (used by webhook)
          metadata: {
            userEmail: email,
            plan: "premium",
          },

          customer_email: email,

          // ✅ session_id added like your sample
          success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error.message);
        res.status(500).send({ message: error.message });
      }
    });

    // ✅ STRIPE WEBHOOK (FIXED & WORKING)
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

    // ------ stripe set up end -------

    // GET public lessons
    app.get("/all-lessons", async (req, res) => {
      const cursor = allLessonsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // GET public lessons
    app.get("/public-lessons", async (req, res) => {
      try {
        // Find only lessons with visibility: "public"
        const cursor = allLessonsCollection.find({ visibility: "public" });
        const result = await cursor.toArray();
        res.status(200).json(result);
      } catch (error) {
        console.error("Error fetching public lessons:", error);
        res.status(500).json({ error: "Failed to fetch public lessons" });
      }
    });

    // ------------ START LESSON DETAILS page relevant apis ------------

    //  POST COMMENT
    app.post("/all-lessons/:id/comment", async (req, res) => {
      try {
        const { id } = req.params;
        const payload = req.body;

        const newComment = {
          ...payload,
          timestamp: new Date(),
        };

        const result = await allLessonsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { comments: newComment } }
        );

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ message: "Failed to post comment", error });
      }
    });

    //  GET COMMENTS
    app.get("/all-lessons/:id/comments", async (req, res) => {
      const lesson = await allLessonsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(lesson?.comments || []);
    });

    // Toggle Like
    app.patch("/details/like/:id", async (req, res) => {
      const { email } = req.body;
      const lesson = await allLessonsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      const likesArray = lesson?.likes || [];

      const alreadyLiked = likesArray.includes(email);

      const update = alreadyLiked
        ? { $pull: { likes: email } }
        : { $addToSet: { likes: email } };

      const result = await allLessonsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        update
      );

      res.send({ success: true, liked: !alreadyLiked });
    });

    //  TOGGLE FAVORITE
    app.patch("/details/favorite/:id", async (req, res) => {
      try {
        const { email } = req.body;

        const lesson = await allLessonsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });

        const favoriteArray = lesson?.favorites || [];
        const alreadySaved = favoriteArray.includes(email);

        const update = alreadySaved
          ? { $pull: { favorites: email } }
          : { $addToSet: { favorites: email } };

        await allLessonsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          update
        );

        res.send({ success: true, saved: !alreadySaved });
      } catch (error) {
        res.status(500).send({ message: "Favorite failed", error });
      }
    });

    // Get Single Lesson
    app.get("/all-lessons/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid lesson ID" });
        }

        const result = await allLessonsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).send({ message: "Lesson not found" });
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error", error });
      }
    });

    // Report Lesson
    app.post("/lesson-reports", async (req, res) => {
      const payload = req.body;
      const result = await reportsCollection.insertOne(payload);
      res.send(result);
    });

    // Get Similar Lessons
    app.get("/similar-lessons/:category/:tone", async (req, res) => {
      const { category, tone } = req.params;
      const result = await allLessonsCollection
        .find({
          $or: [{ category }, { tone }],
        })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // ------------ END LESSON DETAILS page relevant apis ------------

    //  GET SINGLE LESSON
    app.get("/update/:id", async (req, res) => {
      const id = req.params.id;
      const result = await allLessonsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //  UPDATE LESSON
    app.patch("/update/:id", async (req, res) => {
      const id = req.params.id;
      const updatedLesson = req.body;

      const result = await allLessonsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedLesson }
      );
      res.send(result);
    });

    // GET user
    app.get("/users", async (req, res) => {
      // console.log(" Users API Hit");
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // GET a user's role
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });

      res.send({
        role: user?.role || "user",
        isPremium: user?.isPremium || false,
      });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    // console.log(uri);
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
