const express = require('express')
const cors = require('cors')
const ObjectId = require('mongodb').ObjectId;
const { MongoClient } = require('mongodb');
const admin = require("firebase-admin");
require('dotenv').config()
/* image/file upload */
const fileUpload = require('express-fileupload');
/* for payment */
const stripe = require('stripe')(process.env.STRIPE_SECRET)

const app = express()
const port = process.env.PORT || 5000;

/* === Firebase admin initialization === */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

/*========= Middleware============== */
app.use(cors());
app.use(express.json());
app.use(fileUpload());

/* ===========MongoDb================ */
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2rvjh.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
// console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req, res, next) {

    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];
        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch {

        }
    }
    next()
}

async function run() {
    try {
        await client.connect();
        const database = client.db("Doctors_Portal");
        const appointmentsCollection = database.collection("appointments");
        const usersCollection = database.collection("users");
        const doctorsCollection = database.collection("doctors");

        /* ====== get Patients appointments api ====== */
        //-- search appointment email and date---//
        app.get('/appointments', verifyToken, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            const query = { email: email, date: date }
            const appointment = appointmentsCollection.find(query)
            const coursor = await appointment.toArray();
            // console.log(coursor);
            res.json(coursor)
        })

        //* -------post patient appointment------*//
        app.post('/appointments', async (req, res) => {
            const appointment = await appointmentsCollection.insertOne(req.body)
            res.send(appointment)
        })

        /* ==== admin data get api ===== */
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin });
        })

        /* ==User data Post api=== */
        app.post('/users', async (req, res) => {
            const result = await usersCollection.insertOne(req.body);
            res.send(result)
        })
        /* ====== upsert ===== */
        app.put('/users', async (req, res) => {
            const user = req.body;
            console.log("put", user);
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            // console.log(result);
            res.json(result);
        })

        /*==== admin update =======*/
        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester });
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email }
                    const updateDoc = {
                        $set: { role: 'admin' }
                    }
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result)
                }
            }
            else {
                res.status(403).json({ message: 'You don not have access to make Admin' })
            }
        })

        /*--------- addDoctor Post api--------- */
        app.post('/doctors', async (req, res) => {
            const name = req.body.name;
            const email = req.body.email;
            const pic = req.files.image;
            const picData = pic.data;
            const encodedPic = picData.toString('base64')
            const imageBuffer = Buffer.from(encodedPic, 'base64')
            const doctor = {
                name,
                email,
                image: imageBuffer
            }
            const result = await doctorsCollection.insertOne(doctor)

            res.json(result)
        })

        app.get('/doctors', async (req, res) => {
            const doctors = await doctorsCollection.find({}).toArray()
            res.json(doctors)
        })



        /* =========for  Payment mehode======= */
        app.get('/appointment/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await appointmentsCollection.findOne(query)
            res.send(result)
        })

        /* update payment */
        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: { payment: payment }
            };
            const result = await appointmentsCollection.updateOne(filter, updateDoc)
            res.json(result);
        })

        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            const ammount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: ammount,
                payment_method_types: ['card']
            })
            res.json({ clientSecret: paymentIntent.client_secret })
        })




    } finally {
        //   await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello Doctors Portal!')
})

app.listen(port, () => {
    console.log(`listening at :${port}`)
})
