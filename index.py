from flask import Flask, request, jsonify
import requests
import sqlite3
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")
VERIFY_TOKEN = os.getenv("VERIFY_TOKEN")
PORT = int(os.getenv("PORT", 3000))

app = Flask(__name__)

# Initialize SQLite Database
conn = sqlite3.connect("queries.db", check_same_thread=False)
cursor = conn.cursor()
cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT,
        query TEXT,
        status TEXT DEFAULT 'pending'
    )
""")
conn.commit()

# ✅ Webhook Verification
@app.route('/webhook', methods=['GET'])
def verify_webhook():
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")

    if token == VERIFY_TOKEN:
        return challenge
    return "Verification failed", 403

# ✅ Handle Incoming WhatsApp Messages
@app.route('/webhook', methods=['POST'])
def handle_whatsapp_message():
    data = request.get_json()

    if 'messages' in data['entry'][0]['changes'][0]['value']:
        message = data['entry'][0]['changes'][0]['value']['messages'][0]
        user_phone = message["from"]
        user_query = message["text"]["body"]

        response = get_auto_response(user_query)
        if response:
            send_whatsapp_message(user_phone, response)
        else:
            cursor.execute("INSERT INTO messages (user, query, status) VALUES (?, ?, 'pending')", (user_phone, user_query))
            conn.commit()
            send_whatsapp_message(user_phone, "Your query has been forwarded to an expert.")

    return jsonify({"status": "received"}), 200

# ✅ Auto Responses
def get_auto_response(query):
    faq = {
        "What are your working hours?": "We operate from 9 AM to 5 PM, Monday to Friday.",
        "Where is your clinic located?": "We are at 123 Main Street, Downtown."
    }
    return faq.get(query)

# ✅ Send WhatsApp Messages
def send_whatsapp_message(user, text):
    url = f"https://graph.facebook.com/v17.0/{PHONE_NUMBER_ID}/messages"
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}
    payload = {"messaging_product": "whatsapp", "to": user, "type": "text", "text": {"body": text}}

    requests.post(url, headers=headers, json=payload)

# ✅ Expert Response API
@app.route('/manual-response', methods=['POST'])
def manual_response():
    data = request.get_json()
    user = data.get("user")
    reply = data.get("reply")

    if not user or not reply:
        return jsonify({"error": "Missing parameters"}), 400

    cursor.execute("UPDATE messages SET status = 'answered' WHERE user = ?", (user,))
    conn.commit()
    send_whatsapp_message(user, reply)

    return jsonify({"status": "Message sent"}), 200

if __name__ == '__main__':
    app.run(debug=True, port=PORT)
