const express = require('express');
const cors = require("cors")
const app = express()
const port = 5000
require('dotenv').config()
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


app.use(cors())
app.use(express.json())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

app.get('/', (req, res) => {
    res.send('Hello World!')
})


const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`))


// middleware
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization
    console.log(authHeader)


    if (!authHeader || !authHeader.startsWith("Bearer")) {
        return res.status(401).json({ msg: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    console.log(token)

    if (!token) {
        return res.status(401).json({ msg: "Unauthorized" });
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;

        next();
    }
    catch (error) {
        console.log(error);
        return res.status(401).json({ msg: "Unauthorized" });
    }

}


const verifyAdmin = async (req, res, next) => {
    const email = req.user.email;

    const user = await usersCollection.findOne({ email });

    if (user?.role !== "admin") {
        return res.status(403).send({
            message: "Forbidden Access",
        });
    }

    next();
};





async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const database = client.db('recipehub_db');
        const recipesCollection = database.collection('recipes');
        const favoritesCollection = database.collection('favorites');
        const usersCollection = database.collection('user');
        const paymentsCollection = database.collection('payments')
        const reportsCollection = database.collection("reports");


        app.post("/api/recipes", async (req, res) => {
            const recipe = req.body;
            const result = await recipesCollection.insertOne(recipe)
            res.send(result)
        })

        // to get recipe in browser recipe
        app.get("/recipes", async (req, res) => {
            const category = req.query.category;

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 6;

            const skip = (page - 1) * limit;

            let query = {};

            if (category) {
                query.category = category;
            }

            const totalRecipes =
                await recipesCollection.countDocuments(query);

            const recipes = await recipesCollection
                .find(query)
                .skip(skip)
                .limit(limit)
                .toArray();

            res.send({
                recipes,
                totalRecipes,
                totalPages: Math.ceil(totalRecipes / limit),
                currentPage: page,
            });
        });



        // recipe details
        app.get("/recipes/:id", async (req, res) => {
            const id = req.params.id;

            const recipe = await recipesCollection.findOne({
                _id: new ObjectId(id),
            });

            res.send(recipe);
        });


        // like recipe
        app.patch("/recipes/like/:id", async (req, res) => {

            const result = await recipesCollection.updateOne(
                {
                    _id: new ObjectId(req.params.id),
                },
                {
                    $inc: {
                        likesCount: 1,
                    },
                }
            );

            res.send(result);
        });


        // reports recipe
        app.post("/reports", verifyToken, async (req, res) => {

            const report = req.body;

            const existingReport =
                await reportsCollection.findOne({
                    recipeId: report.recipeId,
                    reportedBy: report.reportedBy,
                });

            if (existingReport) {
                return res.send({
                    message: "Already Reported",
                });
            }

            const result =
                await reportsCollection.insertOne(report);

            res.send(result);
        });


        // get all reports
        app.get("/reports", verifyToken, async (req, res) => {
            const result = await reportsCollection
                .find()
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });


        // dismiss report
        app.patch("/reports/dismiss/:id", verifyToken, async (req, res) => {

            const result =
                await reportsCollection.updateOne(
                    {
                        _id: new ObjectId(req.params.id),
                    },
                    {
                        $set: {
                            status: "dismissed",
                        },
                    }
                );

            res.send(result);
        });

        // resolve report
        app.patch("/reports/resolve/:id", verifyToken, async (req, res) => {

            const result =
                await reportsCollection.updateOne(
                    {
                        _id: new ObjectId(req.params.id),
                    },
                    {
                        $set: {
                            status: "resolved",
                        },
                    }
                );

            res.send(result);
        });


        // dashboard overview user info
        app.get("/dashboard/:email", verifyToken, async (req, res) => {
            const email = req.params.email;

            const totalRecipes = await recipesCollection.countDocuments({
                authorEmail: email,
            });

            const totalFavorites = await favoritesCollection.countDocuments({
                userEmail: email,
            });

            const userRecipes = await recipesCollection
                .find({ authorEmail: email })
                .toArray();

            const totalLikes = userRecipes.reduce(
                (sum, recipe) => sum + recipe.likesCount,
                0
            );

            const user = await usersCollection.findOne({
                email,
            });

            res.send({
                totalRecipes,
                totalFavorites,
                totalLikes,
                isPremium: user?.isPremium,
            });
        });


        // add-recipe
        app.post("/recipes", verifyToken, async (req, res) => {
            const recipe = req.body;

            const result =
                await recipesCollection.insertOne(recipe);

            res.send(result);
        });

        // my recipes
        app.get("/my-recipes/:email", verifyToken, async (req, res) => {
            const email = req.params.email;


            const result = await recipesCollection
                .find({
                    authorEmail: email,
                })
                .toArray();


            res.send(result);
        });

        // edit recipe
        app.put("/recipes/:id", async (req, res) => {

            const updatedRecipe = req.body;

            const result =
                await recipesCollection.updateOne(
                    {
                        _id: new ObjectId(
                            req.params.id
                        ),
                    },
                    {
                        $set:
                            updatedRecipe,
                    }
                );

            res.send(result);
        });

        // delete recipe
        app.delete("/recipes/:id", async (req, res) => {

            const result =
                await recipesCollection.deleteOne({
                    _id: new ObjectId(
                        req.params.id
                    ),
                });

            res.send(result);
        });




        // update profile name and image
        app.patch("/user/:email", verifyToken, async (req, res) => {
            const email = req.params.email;


            const { name, image } = req.body;
            console.log(name, image)

            const result = await usersCollection.updateOne(
                {
                    email: email,
                },
                {
                    $set: {
                        name,
                        image,
                        updatedAt: new Date(),
                    },
                }
            );

            res.send(result);
        });


        // receipe payment 
        app.post("/payments", verifyToken, async (req, res) => {

            const payment = req.body;
            console.log(payment)

            const existingPayment = await paymentsCollection.findOne({
                stripeSessionId:
                    payment.stripeSessionId,
            });

            if (existingPayment) {
                return res.send({
                    message:
                        "Payment already exists",
                });
            }

            const result =
                await paymentsCollection.insertOne(
                    payment
                );

            res.send(result);
        });

        // purchased recipe
        app.get("/purchases/:email", verifyToken, async (req, res) => {

            const email = req.params.email;

            const result =
                await paymentsCollection.find({
                    userEmail: email,
                }).toArray();

            res.send(result);
        });


        // favorites recipe
        app.post("/favorites", async (req, res) => {

            const favorite = req.body;

            const existing = await favoritesCollection.findOne({
                userEmail: favorite.userEmail,
                recipeId: favorite.recipeId,
            });

            if (existing) {
                return res.send({
                    message: "Already Added",
                });
            }

            const result =
                await favoritesCollection.insertOne(
                    favorite
                );

            res.send(result);
        });


        // fetch favorites recipe
        app.get("/favorites/:email", verifyToken, async (req, res) => {

            const email = req.params.email;

            const result =
                await favoritesCollection
                    .find({
                        userEmail: email,
                    })
                    .toArray();

            res.send(result);
        });

        // remove favorite recipe
        app.delete("/favorites/:id", async (req, res) => {

            const result =
                await favoritesCollection.deleteOne({
                    _id: new ObjectId(
                        req.params.id
                    ),
                });

            res.send(result);
        });


        // premium user feature
        app.patch("/users/plan/:email", async (req, res) => {
            const email = req.params.email;

            const result =
                await usersCollection.updateOne(
                    {
                        email,
                    },
                    {
                        $set: {
                            plan: "premium",
                        },
                    }
                );

            res.send(result);
        });


        // store payment using stripe
        app.get("/stripe-session/:id", verifyToken, async (req, res) => {
            try {
                const session = await stripe.checkout.sessions.retrieve(
                    req.params.id
                );
                res.send({
                    amount: session.amount_total / 100,
                    paymentStatus: session.payment_status,
                    sessionId: session.id,
                });
            } catch (error) {
                res.status(500).send({
                    message: error.message,
                });
            }
        });

        // transaction route
        app.get("/payments", verifyToken, async (req, res) => {
            const result =
                await paymentsCollection
                    .find()
                    .sort({
                        purchasedAt: -1,
                    })
                    .toArray();


            res.send(result);
        });


        // fetch user by email
        app.get("/user/:email", verifyToken, async (req, res) => {
            const email = req.params.email;

            const user = await usersCollection.findOne({
                email: email,
            });

            res.send(user);
        });


        // admin dashboard overview
        app.get("/admin-overview", verifyToken, async (req, res) => {

            const totalUsers =
                await usersCollection.countDocuments();

            const totalRecipes =
                await recipesCollection.countDocuments();

            const totalPremiumMembers =
                await usersCollection.countDocuments({
                    plan: "premium",
                });

            const totalReports = await reportsCollection.countDocuments();;

            res.send({
                totalUsers,
                totalRecipes,
                totalPremiumMembers,
                totalReports,
            });
        });


        // get all users
        app.get("/users", verifyToken, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        // block user
        app.patch("/users/block/:id", verifyToken, async (req, res) => {

            const result = await usersCollection.updateOne(
                {
                    _id: new ObjectId(req.params.id),
                },
                {
                    $set: {
                        status: "blocked",
                    },
                }
            );

            res.send(result);
        });

        // unblock user
        app.patch("/users/unblock/:id", verifyToken, async (req, res) => {

            const result = await usersCollection.updateOne(
                {
                    _id: new ObjectId(req.params.id),
                },
                {
                    $set: {
                        status: "active",
                    },
                }
            );

            res.send(result);
        });


        // feature recipe
        app.patch("/recipes/feature/:id", async (req, res) => {
            const result = await recipesCollection.updateOne(
                {
                    _id: new ObjectId(req.params.id),
                },
                {
                    $set: {
                        isFeatured: true,
                    },
                }
            );

            res.send(result);
        });


        // get feature recipe
        app.get("/featured-recipes", async (req, res) => {

            const result = await recipesCollection
                .find({
                    isFeatured: true,
                })
                .limit(6)
                .toArray();

            res.send(result);
        });


        // popular recipes by liked most
        app.get("/popular-recipes", async (req, res) => {

            const result = await recipesCollection
                .find()
                .sort({
                    likesCount: -1,
                })
                .limit(6)
                .toArray();

            res.send(result);
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);





app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
