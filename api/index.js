const { ObjectId } = require("mongodb");
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();
const cors = require("cors");

// Stripe webhook handler
const stripeWebhookHandler = async (req, res) => {
  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      // Update MongoDB user as Premium - requires usersCollection from db context
         const client = new MongoClient(process.env.MONGODB_URI);
      //  await client.connect();
      const usersCollection = client.db("skillSync").collection("users");

      await usersCollection.updateOne(
        { email: session.customer_email },
        { $set: { isPremium: true } }
      );

      console.log(" User upgraded to Premium:", session.customer_email);
    }

    res.json({ received: true });
  } catch (error) {
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
};

// Middleware
// app.use(cors());
app.use(
  cors({
    origin: ["http://localhost:5173", "https://skill-sync-learning.web.app"], //  frontend url

    credentials: true,
  })
);

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

app.use(express.json());

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
    const publicLessonsCollection = database.collection("publicLessons");
    const privateLessonsCollection = database.collection("privateLessons");
    const usersCollection = database.collection("users");
    const reportsCollection = database.collection("reports");

    // role middlewares
    const verifyAdmin = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "admin")
        return res
          .status(403)
          .send({ message: "Admin only Actions!", role: user?.role });

      next();
    };

    // ADD a public lesson
    app.post("/add-lesson", async (req, res) => {
      const addLesson = req.body;
      const result = await publicLessonsCollection.insertOne(addLesson);
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

    // ------ stripe set up start -------

    // Stripe Setup
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

    // CREATE CHECKOUT SESSION
    app.post("/create-checkout-session", async (req, res) => {
      const { email } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency: "bdt",
              product_data: {
                name: "Premium Lifetime Access",
              },
              unit_amount: 150000, // ৳1500 × 100
            },
            quantity: 1,
          },
        ],
        success_url:
          "http://localhost:5173/payment/success" ||
          "https://skill-sync-learning.web.app/payment/success",
        cancel_url:
          "http://localhost:5173/payment/cancel" ||
          "https://skill-sync-learning.web.app/payment/cancel",
      });

      res.send({ url: session.url });
    });

    // ------ stripe set up end -------

    // GET public lessons
    app.get("/public-lessons", async (req, res) => {
      //   console.log(" Public Lessons API Hit");
      const cursor = publicLessonsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // ------------ START LESSON DETAILS page relevant apis ------------

    //  POST COMMENT
    app.post("/public-lessons/:id/comment", async (req, res) => {
      try {
        const { id } = req.params;
        const payload = req.body;

        const newComment = {
          ...payload,
          timestamp: new Date(),
        };

        const result = await publicLessonsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { comments: newComment } }
        );

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ message: "Failed to post comment", error });
      }
    });

    //  GET COMMENTS
    app.get("/public-lessons/:id/comments", async (req, res) => {
      const lesson = await publicLessonsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(lesson?.comments || []);
    });

    // Toggle Like
    app.patch("/details/like/:id", async (req, res) => {
      const { email } = req.body;
      const lesson = await publicLessonsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      const likesArray = lesson?.likes || [];

      const alreadyLiked = likesArray.includes(email);

      const update = alreadyLiked
        ? { $pull: { likes: email } }
        : { $addToSet: { likes: email } };

      const result = await publicLessonsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        update
      );

      res.send({ success: true, liked: !alreadyLiked });
    });

    //  TOGGLE FAVORITE
    app.patch("/details/favorite/:id", async (req, res) => {
      try {
        const { email } = req.body;

        const lesson = await publicLessonsCollection.findOne({
          _id: new ObjectId(req.params.id),
        });

        const favoriteArray = lesson?.favorites || [];
        const alreadySaved = favoriteArray.includes(email);

        const update = alreadySaved
          ? { $pull: { favorites: email } }
          : { $addToSet: { favorites: email } };

        await publicLessonsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          update
        );

        res.send({ success: true, saved: !alreadySaved });
      } catch (error) {
        res.status(500).send({ message: "Favorite failed", error });
      }
    });

    // Get Single Lesson
    app.get("/public-lessons/:id", async (req, res) => {
      try {
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
      const result = await publicLessonsCollection
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
      const result = await publicLessonsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //  UPDATE LESSON
    app.patch("/update/:id", async (req, res) => {
      const id = req.params.id;
      const updatedLesson = req.body;

      const result = await publicLessonsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedLesson }
      );

      res.send(result);
    });

    // GET user
    app.get("/users", async (req, res) => {
      console.log(" Users API Hit");
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // GET a user's role
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      //   res.send({ role: user?.role });
      res.send({ role: user?.role || "user" });
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
