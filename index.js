const express = require('express');
const cors = require("cors")
const app = express()
const port = 5000
require('dotenv').config()

app.use(cors())
app.use(express.json())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const database = client.db('recipehub_db');
        const recipesCollection = database.collection('recipes');
        const favoritesCollection = database.collection('favorites');
        const usersCollection = database.collection('user');
        const paymentsCollection = database.collection('payments')


        app.post("/api/recipes", async (req, res) => {
            const recipe = req.body;
            const result = await recipesCollection.insertOne(recipe)
            res.send(result)
        })

        // to get recipe in browser recipe
        app.get("/recipes", async (req, res) => {
            const recipes = await recipesCollection.find().toArray();

            res.send(recipes);
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


        // dashboard overview user info
        app.get("/dashboard/:email", async (req, res) => {
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
        app.post("/recipes", async (req, res) => {
            const recipe = req.body;

            const result =
                await recipesCollection.insertOne(recipe);

            res.send(result);
        });

        // my recipes
        app.get("/my-recipes/:email", async (req, res) => {
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
        app.patch("/user/:email", async (req, res) => {
            const email = req.params.email;

            const { name, image } = req.body;

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
        app.post("/payments", async (req, res) => {

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
        app.get("/purchases/:email", async (req, res) => {

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
        app.get("/favorites/:email", async (req, res) => {

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

        // fetch user by email
        app.get("/user/:email", async (req, res) => {
            const email = req.params.email;

            const user = await usersCollection.findOne({
                email: email,
            });

            res.send(user);
        });


        // admin dashboard overview
        app.get("/admin-overview", async (req, res) => {

            const totalUsers =
                await usersCollection.countDocuments();

            const totalRecipes =
                await recipesCollection.countDocuments();

            const totalPremiumMembers =
                await usersCollection.countDocuments({
                    plan: "premium",
                });

            const totalReports = 0;

            res.send({
                totalUsers,
                totalRecipes,
                totalPremiumMembers,
                totalReports,
            });
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


