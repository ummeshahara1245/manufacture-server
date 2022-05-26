const express = require('express')
const cors = require('cors')
const app = express();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pjtoo.mongodb.net/?retryWrites=true&w=majority`;
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const ObjectId = require('mongodb').ObjectId


const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

const emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));


function sendAppointmentEmail(order) {
    const { name, tool_name, quantity, date, email } = order;

    const SendEmail = {
        from: process.env.EMAIL_SENDER,
        to: email,
        subject: `Your order for ${tool_name} has been confirmed`,
        text: `Your order for ${tool_name} has been confirmed`,
        html: `
        <div style="background-image: url('https://i.ibb.co/nRYdY2n/attachment-90071703-removebg-preview.png');">
        <h1>Hello Mr/Mr.s ${name},</h1>
        <p>Your order for ${tool_name} ${quantity} pieces, at Date: ${date} has been confirmed. It will be shipped soon to your address. Please contact us for any queries</p>
        <h3>Our company address</h3>
        <p>Trunk road, Feni, Chittagong</p>
        <p>Bangladesh</p>
        <a href="https://elite-toolboxes.web.app/">Don't want to here more from us? unsubscribe here.</a>
        </div>
        `
    };
    emailClient.sendMail(SendEmail, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });
}



async function run() {
    try {
        await client.connect()
        console.log('Database connected successfully')
        const toolCollection = client.db('manufacturer_toolboxes').collection('tools');
        const orderCollection = client.db('manufacturer_toolboxes').collection('orders');
        const userCollection = client.db('manufacturer_toolboxes').collection('users');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
        }

        app.get('/tool', async (req, res) => {
            const query = {};
            const cursor = toolCollection.find(query);
            const tools = await cursor.toArray();
            res.send(tools);
        });
        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await toolCollection.findOne(query);
            res.send(result);
        })
        app.post('/tool', verifyJWT, verifyAdmin, async (req, res) => {
            const tool = req.body;
            const result = await toolCollection.insertOne(tool);
        })
        app.delete('/tool/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await toolCollection.deleteOne(filter);
            res.send(result);
        })
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users)
        })
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;

            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);

        })
        app.put('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'user' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }

        })
        app.delete('/user/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.json(result);
        })
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        })


        app.post('/order', async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            sendAppointmentEmail(order);
            return res.send({ success: true, result });

        })
        app.get('/order', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const order = await orderCollection.find(query).toArray();
                res.send(order)
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        })
        app.get('/orders', async (req, res) => {
            const query = {};
            const cursor = orderCollection.find(query);
            const orders = await cursor.toArray();
            res.send(orders);
        });
        app.delete('/orders/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(filter);
            res.send(result);
        })
        // app.get('/available', async (req, res) => {
        //     const tools = await toolCollection.find().toArray();
        //     res.send(tools)
        // })

    }
    finally {

    }
}
run().catch(console.dir);

app.use(cors());
app.use(express.json())

app.get('/', (req, res) => {
    res.send(`Elite Toolboxes's server is running`)
})

app.listen(port, () => {
    console.log(`Elite Toolboxes's listening on port ${port}`)
})
