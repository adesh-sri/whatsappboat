require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(bodyParser.json());

// Load environment variables
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 4000;

// Initialize SQLite Database
const db = new sqlite3.Database("./queries.db", (err) => {
    if (err) console.error("Database Connection Error:", err.message);
    else console.log("✅ Connected to SQLite Database");
});

// Create messages table if it doesn’t exist
db.run(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT,
        query TEXT,
        status TEXT DEFAULT 'pending'
    )
`);

// ✅ Webhook Verification (Meta Requirement)
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];


    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    return res.status(403).send("Verification failed.");
});
app.get("/getdata", (req, res) => {
    const response = db.run("SELECT * FROM messages")
    //return response;
    res.status(200).json(response);
});
// ✅ Handle Incoming WhatsApp Messages
app.post("/webhook", async (req, res) => {
    const body = req.body;
   
    if (body.entry?.[0].changes?.[0].value?.messages) {
        const message = body.entry[0].changes[0].value.messages[0];
        const userPhone = message.from;
        const userQuery = message.text.body;

        console.log(message,userPhone);
        
        const response = getAutoResponse(userQuery);
        if (response) {
            sendWhatsAppMessage(userPhone, response);
        } else {
            db.run("INSERT INTO messages (user, query, status) VALUES (?, ?, 'pending')", [userPhone, userQuery]);
            sendWhatsAppMessage(userPhone, "Your query has been forwarded to an expert.");
        }
    }

    res.sendStatus(200);
});

// ✅ Auto Responses
const getAutoResponse = (query) => {
    const faq = {
        "What are your working hours?": "We operate from 9 AM to 5 PM, Monday to Friday.",
        "Where is your clinic located?": "We are at 123 Main Street, Downtown."
    };
    return faq[query] || null;
};

// ✅ Send WhatsApp Messages
const sendWhatsAppMessage = async (to, text) => {
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: text }
            },
            { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" } }
        );
        console.log(`Message sent to ${to}`);
    } catch (error) {
        console.error("Error sending message:", error.response?.data || error.message);
    }
};

// ✅ Expert Response API
app.post("/manual-response", (req, res) => {
    const { user, reply } = req.body;

    if (!user || !reply) return res.status(400).json({ error: "Missing parameters" });

    db.run("UPDATE messages SET status = 'answered' WHERE user = ?", [user]);
    sendWhatsAppMessage(user, reply);

    res.status(200).json({ status: "Message sent" });
});

// ✅ Start Server
app.listen(PORT, () => console.log(`🚀 Good Server running on port ${PORT}`));
