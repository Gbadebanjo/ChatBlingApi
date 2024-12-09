import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import UserModel from './model/User.js';
import Message from './model/message.js';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import connectDB from './config/Db.config.js';
import bcrypt from 'bcryptjs';
import { WebSocketServer } from 'ws';

dotenv.config();
connectDB();

const jwtSecret = process.env.JWT_SECRET;
const bcryptSalt = bcrypt.genSaltSync(10);

const app = express();
app.use(express.json()); // for parsing application/json
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));


async function getuserFromrequest(req) {
    return new Promise((resolve, reject) => {
        const token = req.cookies?.token;
        if (token) {
            jwt.verify(token, jwtSecret, {}, (err, decodedData) => {
                if (err) throw err;
                resolve(decodedData);
            });
        } else {
            reject('Unauthorized');
        }
    });
}


app.get('/messages/:userId', async (req, res) => {
    const { userId } = req.params;
    const userData = await getuserFromrequest(req);
    const ourUserId = userData.userId;
    const messages = await Message.find({
        sender: { $in: [userId, ourUserId] },
        recipient: { $in: [userId, ourUserId] },
    }).sort({ createdAt: -1 });
    res.json(messages);
});

app.get('/profile', (req, res) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    else {
        jwt.verify(token, jwtSecret, {}, (err, decodedData) => {
            if (err) throw err;
            res.json(decodedData);
        });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Find user by username
        const newUser = await UserModel.findOne({ username });
        if (!newUser) {
            return res.status(401).json({ message: 'Incorrect Username or Password' });
        }

        // Check if password is correct
        const isPasswordCorrect = bcrypt.compareSync(password, newUser.password);

        if (!isPasswordCorrect) {
            return res.status(401).json({ message: 'Incorrect Username or Password' });
        }

        jwt.sign({ userId: newUser._id, username }, jwtSecret, {}, (err, token) => {
            if (err) throw err;
            res.cookie('token', token).json({
                userId: newUser._id,
                username,
                message: 'Logged in successful'
            });
        });
    } catch (err) {
        console.log(err);
        res.status(500).json('Internal Server error, Please try again');
    }
});

app.post('/logout', (req, res) => {
    res.clearCookie('token').json({ message: 'Logged out' });
}
);

app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if user already exists
        const existingUser = await UserModel.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ message: "Username already exists" });
        }

        const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
        const newUser = await UserModel.create({
            username: username,
            password: hashedPassword
        });
        jwt.sign({ userId: newUser._id, username }, jwtSecret, { expiresIn: "1h" }, (err, token) => {
            if (err) throw err;
            res.cookie('token', token).status(201).json({
                userId: newUser._id,
                username,
                message: 'User created successfully'
            });
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});



const server = app.listen(3003, () => {
    console.log('Server running on port 3003');
});

const wss = new WebSocketServer({ server });
wss.on('connection', (connection, req) => {
    // read username & userId from cookies
    const cookies = req.headers.cookie;
    if (cookies) {
        const tokenCookieString = cookies.split('; ').find(str => str.startsWith('token='));
        if (tokenCookieString) {
            const token = tokenCookieString.split('=')[1];
            if (token) {
                jwt.verify(token, jwtSecret, {}, (err, decodedData) => {
                    if (err) throw err;
                    const { userId, username } = decodedData;
                    connection.userId = userId;
                    connection.username = username;
                });
            }
        }
    }

    connection.on('message', async (message) => {
        const messageData = JSON.parse(message.toString());
        const { recipient, text } = messageData;
        if (recipient && text) {
            const messageDoc = await Message.create({ sender: connection.userId, recipient, text, });
            [...wss.clients].filter(client => client.userId === recipient).forEach(client => client.send(JSON.stringify({ text, sender: connection.userId, recipient, id: messageDoc._id })))
        }
    });

    // notify everyone about online users
    [...wss.clients]
        .forEach(client => {
            client.send(JSON.stringify({
                online: [...wss.clients].map(client => ({ userId: client.userId, username: client.username }))
            }
            ));
        });


});


