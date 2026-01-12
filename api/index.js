require("dotenv").config();
// console.log("STRIPE_SECRET_KEY:", process.env.STRIPE_SECRET_KEY);
const { ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const cors = require("cors");
const admin = require("firebase-admin");

// ====== Initialize Firebase Admin SDK with ENV vars (no file) ========
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"), // Handle newlines
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

// middleware
app.use(
  cors({
    origin: ["http://localhost:5173", process.env.CLIENT_URL],
    credentials: true,
  })
);

app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Ignore favicon
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Global error handler
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err.stack || err.message);
  res.status(500).send({
    message: "Internal server error",
    error: err.message,
  });
});

// ======== MONGODB Connections ===================================
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect(); // Explicit connect

    const database = client.db("skillSync");
    const allLessonsCollection = database.collection("allLessons");
    const featuredLessonsCollection = database.collection("featuredLessons");
    const usersCollection = database.collection("users");
    const reportsCollection = database.collection("reports");

    // Token Verification Middleware
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ message: "No token provided" });
      }

      const token = authHeader.split(" ")[1];

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        const dbUser = await usersCollection.findOne({ email: decoded.email });
        if (!dbUser) {
          return res
            .status(401)
            .send({ message: "User not found in database" });
        }
        req.user = {
          email: decoded.email,
          role: dbUser.role || "user",
          isPremium: dbUser.isPremium || false,
        };
        next();
      } catch (err) {
        console.error("Token verification error:", err);
        res.status(401).send({ message: "Invalid or expired token" });
      }
    };

    // Admin Middleware
    const isAdmin = async (req, res, next) => {
      const email = req.user.email;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden" });
      }
      next();
    };

    // USER API
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

    // GET a user's role
    app.get("/users/:email/role", verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send({
        role: user?.role || "user",
        isPremium: user?.isPremium || false,
      });
    });

    // UPDATE USER PROFILE (name and photo)
    app.patch("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden" });
      }
      const { name, photoURL } = req.body;
      if (!name && !photoURL) {
        return res.status(400).send({ message: "No update data provided" });
      }
      const updateData = {};
      if (name) updateData.name = name;
      if (photoURL) updateData.photoURL = photoURL;
      const result = await usersCollection.updateOne(
        { email },
        { $set: updateData }
      );
      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send(result);
    });

    // GET users
    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // ====== ADMIN ANALYTICS --- (protect with verifyToken and isAdmin) ------ START ======

    app.get("/admin/analytics", verifyToken, isAdmin, async (req, res) => {
      try {
        // total users
        const totalUsers = await usersCollection.countDocuments();
        // total public lessons
        const totalPublicLessons = await allLessonsCollection.countDocuments({
          visibility: "public",
        });
        // total reports
        const totalReports = await reportsCollection.countDocuments();
        // today's new lessons
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaysLessons = await allLessonsCollection.countDocuments({
          createdAt: { $gte: today.toISOString() },
        });
        // most active contributors
        const contributors = await allLessonsCollection
          .aggregate([
            {
              $group: {
                _id: "$createdByEmail",
                lessonCount: { $sum: 1 },
              },
            },
            { $sort: { lessonCount: -1 } },
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
        // Lessons growth per day (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const lessonGrowth = await allLessonsCollection
          .aggregate([
            {
              $match: {
                createdAt: { $gte: sevenDaysAgo.toISOString() },
              },
            },
            {
              $group: {
                _id: {
                  $substr: ["$createdAt", 0, 10],
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray();
        // Users growth per day (last 7 days)
        const userGrowth = await usersCollection
          .aggregate([
            {
              $match: {
                createdAt: { $gte: sevenDaysAgo.toISOString() },
              },
            },
            {
              $group: {
                _id: {
                  $substr: ["$createdAt", 0, 10],
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray();
        res.send({
          totalUsers,
          totalPublicLessons,
          totalReports,
          todaysLessons,
          contributors,
          lessonGrowth,
          userGrowth,
        });
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    //-------------- ADMIN OTHERS DATA -------------------------->>
    // ---- GET TOP CONTRIBUTORS ------
    app.get("/top-contributors", async (req, res) => {
      try {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const contributors = await allLessonsCollection
          .aggregate([
            { $match: { createdAt: { $gte: oneWeekAgo } } },
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
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch contributors" });
      }
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

    //  GET grouped reported lessons
    app.get("/reported-lessons", verifyToken, isAdmin, async (req, res) => {
      try {
        // Group reports by lessonId (string) and collect report entries
        const grouped = await reportsCollection
          .aggregate([
            { $sort: { timestamp: -1 } },
            {
              $group: {
                _id: "$lessonId",
                totalReports: { $sum: 1 },
                reports: {
                  $push: {
                    reporterEmail: "$reporterEmail",
                    reporterName: "$reporterName",
                    reason: "$reason",
                    timestamp: "$timestamp",
                    _id: "$_id",
                  },
                },
              },
            },
          ])
          .toArray();
        // For each group, attempt to find the lesson (safe conversion)
        const out = [];
        for (const g of grouped) {
          const lessonIdStr = g._id;
          let lesson = null;
          // Try to find lesson by ObjectId if valid, otherwise try string match
          if (ObjectId.isValid(lessonIdStr)) {
            lesson = await allLessonsCollection.findOne({
              _id: new ObjectId(lessonIdStr),
            });
          }
          // if not found yet, try matching by string field fallback (rare)
          if (!lesson) {
            lesson = await allLessonsCollection.findOne({
              _id: lessonIdStr,
            });
          }
          // Build item (if lesson is missing, include minimal info)
          out.push({
            lessonId: lesson ? lesson._id.toString() : lessonIdStr,
            title: lesson ? lesson.title : "(Deleted or missing)",
            image: lesson ? lesson.image : "",
            category: lesson ? lesson.category : "",
            totalReports: g.totalReports,
            reports: g.reports,
          });
        }
        res.status(200).send(out);
      } catch (err) {
        console.error("GET /reported-lessons error:", err);
        res.status(500).send({
          message: "Failed to fetch reported lessons",
          error: err.message,
        });
      }
    });

    //  DELETE reports only for a lesson by admin delete/ ignore
    app.delete(
      "/reported-lessons/:lessonId/reports",
      verifyToken,
      isAdmin,
      async (req, res) => {
        try {
          const { lessonId } = req.params;
          const result = await reportsCollection.deleteMany({
            lessonId: lessonId,
          });
          res.status(200).send({ deletedCount: result.deletedCount });
        } catch (err) {
          console.error(
            "DELETE /reported-lessons/:lessonId/reports error:",
            err
          );
          res
            .status(500)
            .send({ message: "Failed to clear reports", error: err.message });
        }
      }
    );

    //  DELETE lesson + its reports by admin delete
    app.delete(
      "/reported-lessons/:lessonId/lesson",
      verifyToken,
      isAdmin,
      async (req, res) => {
        try {
          const { lessonId } = req.params;
          let lessonDeleteResult = { deletedCount: 0 };

          if (ObjectId.isValid(lessonId)) {
            lessonDeleteResult = await allLessonsCollection.deleteOne({
              _id: new ObjectId(lessonId),
            });
          } else {
            // fallback: try deleting by string field if you stored _id as string (unlikely)
            lessonDeleteResult = await allLessonsCollection.deleteOne({
              _id: lessonId,
            });
          }
          const reportsDeleteResult = await reportsCollection.deleteMany({
            lessonId: lessonId,
          });
          res.status(200).send({
            lessonDeleted: lessonDeleteResult.deletedCount || 0,
            reportsDeleted: reportsDeleteResult.deletedCount || 0,
          });
        } catch (err) {
          console.error(
            "DELETE /reported-lessons/:lessonId/lesson error:",
            err
          );
          res.status(500).send({
            message: "Failed to delete lesson and reports",
            error: err.message,
          });
        }
      }
    );

    // ADMIN — Manage Users APIs -------

    // Search users
    app.get("/admin/search-users", verifyToken, isAdmin, async (req, res) => {
      const q = req.query.q || "";
      const users = await usersCollection
        .find({
          $or: [
            { name: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
          ],
        })
        .toArray();
      res.send(users);
    });

    // Promote user to admin
    app.patch(
      "/admin/users/:email/role",
      verifyToken,
      isAdmin,
      async (req, res) => {
        const email = req.params.email;
        const result = await usersCollection.updateOne(
          { email },
          { $set: { role: "admin" } }
        );
        res.send(result);
      }
    );

    // Delete user
    app.delete(
      "/admin/users/:email",
      verifyToken,
      isAdmin,
      async (req, res) => {
        const email = req.params.email;
        const result = await usersCollection.deleteOne({ email });
        res.send(result);
      }
    );

    // PATCH: Mark lesson reviewed or unreviewed
    app.patch(
      "/all-lessons/review/:id",
      verifyToken,
      isAdmin,
      async (req, res) => {
        const { reviewed } = req.body;
        const result = await allLessonsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { reviewed } }
        );
        res.send(result);
      }
    );

    // =========== ADMIN ANALYTICS ---------- END =======================

    // ======= FEATURED LESSONS --------- START ===========================
    // ADD TO FEATURED
    app.post("/featured-lessons", verifyToken, isAdmin, async (req, res) => {
      const payload = req.body;
      // prevent duplicates
      const exists = await featuredLessonsCollection.findOne({
        lessonId: payload.lessonId,
      });
      if (exists) {
        return res.send({ message: "Already featured" });
      }
      const result = await featuredLessonsCollection.insertOne(payload);
      res.send({ success: true, data: result });
    });

    // GET ALL FEATURED LESSONS
    app.get("/featured-lessons", async (req, res) => {
      try {
        const result = await featuredLessonsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch featured lessons" });
      }
    });

    // DELETE FEATURED LESSON
    app.delete(
      "/featured-lessons/:id",
      verifyToken,
      isAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await featuredLessonsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );

    // UPDATE FEATURED LESSON
    app.patch(
      "/featured-lessons/:id",
      verifyToken,
      isAdmin,
      async (req, res) => {
        const id = req.params.id;
        const updateData = req.body;
        const result = await featuredLessonsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );
        res.send(result);
      }
    );

    // ========  FEATURED LESSONS ------- END ==============================

    // ========= ALL LESSONS ----------- START================================
    // ADD a public lesson
    app.post("/add-lesson", verifyToken, async (req, res) => {
      const addLesson = {
        ...req.body,
        createdAt: new Date().ISODate(),
        updatedAt: new Date().ISODate(),
        comments: [],
        likes: [],
        favorites: [],
      };
      const result = await allLessonsCollection.insertOne(addLesson);
      res.send(result);
    });

    // DELETE ALL LESSON
    app.delete("/all-lessons/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await allLessonsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // Get Single Lesson
    app.get("/all-lessons/:id", verifyToken, async (req, res) => {
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

    // GET public lessons
    app.get("/all-lessons", async (req, res) => {
      const cursor = allLessonsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // ------------ GET public lessons ---------------
    app.get("/public-lessons/:id", async (req, res) => {
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

    // GET my lessons
    app.get("/my-lessons", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).send("Email is required");
      const cursor = allLessonsCollection
        .find({ createdByEmail: email })
        .sort({ createdAt: -1 });
      const lessons = await cursor.toArray();
      res.json(lessons);
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

    // ------START LESSON DETAILS page relevant apis ------

    //  POST COMMENT
    app.post("/all-lessons/:id/comment", verifyToken, async (req, res) => {
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
    app.patch("/details/like/:id", verifyToken, async (req, res) => {
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
    app.patch("/details/favorite/:id", verifyToken, async (req, res) => {
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

    // Report Lesson
    app.post("/lesson-reports", verifyToken, async (req, res) => {
      const payload = req.body;
      payload.timestamp = new Date();
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

    // ------ END LESSON DETAILS page relevant apis -------

    //  GET SINGLE LESSON
    app.get("/update-lesson/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await allLessonsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //  UPDATE LESSON
    app.patch("/update-lesson/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      // const updatedLesson = req.body;
      const updatedLesson = {
        ...req.body,
        updatedAt: new Date(),
      };
      const result = await allLessonsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedLesson }
      );
      res.send(result);
    });

    // PATCH: public to private || private to public
    app.patch("/all-lessons/private/:id", verifyToken, async (req, res) => {
      const { visibility } = req.body;
      const result = await allLessonsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { visibility } }
      );
      res.send(result);
    });

    // PATCH: free to premium || private to public
    app.patch("/all-lessons/premium/:id", verifyToken, async (req, res) => {
      const { accessLevel } = req.body;
      const result = await allLessonsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { accessLevel } }
      );
      res.send(result);
    });

    // ================ ALL LESSONS ----------- END =========================

    // ========== STRIPE set up -------------- START ============================

    // CREATE CHECKOUT SESSION
    app.post("/create-checkout-session", verifyToken, async (req, res) => {
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
          //  This is IMPORTANT (used by webhook)
          metadata: {
            userEmail: email,
            plan: "premium",
          },
          customer_email: email,
          //  session_id added like your sample
          success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          // cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
          cancel_url: `${process.env.CLIENT_URL}/payment/cancel?reason=cancelled`,
        });
        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error.message);
        res.status(500).send({ message: error.message });
      }
    });

    //  STRIPE WEBHOOK
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
          // console.error("Webhook signature error:", err.message);
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }
        if (event.type === "checkout.session.completed") {
          const session = event.data.object;
          const userEmail =
            session.metadata?.userEmail || session.customer_email;
          // console.log("Payment Success for:", userEmail);
          const result = await usersCollection.updateOne(
            { email: userEmail },
            { $set: { isPremium: true } }
          );
          // console.log(" MongoDB Update Result:", result.modifiedCount);
        }
        res.json({ received: true });
      }
    );
    // ========= STRIPE set up ------------- END =============================
  } finally {
    // Do not close client in serverless - let it pool
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
