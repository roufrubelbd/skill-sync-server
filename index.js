const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();
const cors = require("cors");

// Middleware
// app.use(cors());
app.use(
  cors({
    origin: "http://localhost:5173", //  frontend url
    credentials: true,
  })
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
    await client.connect();

    const database = client.db("skillSync");
    const publicLessonsCollection = database.collection("publicLessons");
    const privateLessonsCollection = database.collection("privateLessons");
    const usersCollection = database.collection("users");


    // role middlewares
    const verifyAdmin = async (req, res, next) => {
      const email = req.tokenEmail
      const user = await usersCollection.findOne({ email })
      if (user?.role !== 'admin')
        return res
          .status(403)
          .send({ message: 'Admin only Actions!', role: user?.role })

      next()
    }



    //  ADD LESSON
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

    // GET public lessons
    app.get("/public-lessons", async (req, res) => {
      //   console.log(" Public Lessons API Hit");
      const cursor = publicLessonsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });

    console.log(uri);
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
