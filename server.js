const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const RESEND_API_KEY = 're_PdpSut6x_8XJV77U424TSpZsvpRTXTcSV';

// IMPORTANT: The endpoint must be exactly "/send"
app.post('/send', async (req, res) => {
    // Add a simple test log
    console.log("Request received at /send", req.body);

    // A simple test to confirm the endpoint works
    if (req.body.test === true) {
        return res.json({ success: true, message: "Backend is alive" });
    }

    const { to, subject, body, from } = req.body;
    
    // Basic validation
    if (!to) {
        return res.status(400).json({ success: false, error: "Missing 'to' email address" });
    }
    
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: from || 'noreply@aud.lol',
                to: [to],
                subject: subject || 'No Subject',
                text: body || 'No message'
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            res.json({ success: true, id: data.id });
        } else {
            res.json({ success: false, error: data.message });
        }
    } catch (error) {
        console.error("Send error:", error);
        res.json({ success: false, error: error.message });
    }
});

// A simple route for the root URL to fix the 404 error
app.get('/', (req, res) => {
    res.send('Email backend is running. Use the /send endpoint.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
