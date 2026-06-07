const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

const RESEND_API_KEY = 're_PdpSut6x_8XJV77U424TSpZsvpRTXTcSV';
const STATS_FILE = path.join(__dirname, 'stats.json');

// ============ STATISTICS STORAGE WITH FILE PERSISTENCE ============

// Load stats from file or initialize if not exists
function loadStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const data = fs.readFileSync(STATS_FILE, 'utf8');
            const stats = JSON.parse(data);
            console.log(`[STATS] Loaded from file: Total sent = ${stats.totalSent}`);
            return stats;
        } else {
            console.log('[STATS] No stats file found, creating new');
            return {
                totalSent: 0,
                daily: {},
                userSent: {},
                recentActivity: []
            };
        }
    } catch (error) {
        console.error('[STATS] Error loading stats file:', error);
        return {
            totalSent: 0,
            daily: {},
            userSent: {},
            recentActivity: []
        };
    }
}

// Save stats to file
function saveStats(stats) {
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
        console.log(`[STATS] Saved to file: Total sent = ${stats.totalSent}`);
    } catch (error) {
        console.error('[STATS] Error saving stats file:', error);
    }
}

// Initialize globalStats from file
let globalStats = loadStats();

// Helper function to get today's date in YYYY-MM-DD format
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// Helper function to redact email (keep domain visible)
function redactEmail(email) {
    if (!email) return 'unknown';
    const atIndex = email.indexOf('@');
    if (atIndex <= 0) return '***@***';
    const domain = email.substring(atIndex);
    return '******' + domain;
}

// ============ STATISTICS ENDPOINTS ============

// Get stats for a specific user
app.get('/stats', (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.json({ success: false, error: "Missing userId" });
    }
    
    const userSent = globalStats.userSent[userId] || 0;
    res.json({
        success: true,
        userSent: userSent,
        globalTotal: globalStats.totalSent,
        globalDaily: globalStats.daily,
        recentActivity: globalStats.recentActivity
    });
});

// Record a successful email send
app.post('/record', (req, res) => {
    const { userId, count, email } = req.body;
    
    if (!userId) {
        return res.json({ success: false, error: "Missing userId" });
    }
    
    const sendCount = count || 1;
    const today = getTodayDate();
    const redactedEmail = redactEmail(email || 'unknown');
    
    // Update user stats
    globalStats.userSent[userId] = (globalStats.userSent[userId] || 0) + sendCount;
    
    // Update global totals
    globalStats.totalSent += sendCount;
    globalStats.daily[today] = (globalStats.daily[today] || 0) + sendCount;
    
    // Add to recent activity
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    globalStats.recentActivity.unshift({
        time: timeStr,
        message: `${sendCount} email${sendCount !== 1 ? 's' : ''} sent to ${redactedEmail}`
    });
    
    // Keep only last 50 activities
    if (globalStats.recentActivity.length > 50) {
        globalStats.recentActivity = globalStats.recentActivity.slice(0, 50);
    }
    
    // Save stats to file after update
    saveStats(globalStats);
    
    console.log(`[STATS] User ${userId}: +${sendCount} | Total: ${globalStats.totalSent}`);
    
    res.json({
        success: true,
        userSent: globalStats.userSent[userId],
        globalTotal: globalStats.totalSent,
        globalDaily: globalStats.daily,
        recentActivity: globalStats.recentActivity
    });
});

// Get global leaderboard (top users by sent emails)
app.get('/leaderboard', (req, res) => {
    const leaderboard = Object.entries(globalStats.userSent)
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    res.json({ success: true, leaderboard });
});

// Reset stats (admin only - requires secret key)
app.post('/reset-stats', (req, res) => {
    const { secret } = req.body;
    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'audloladmin123';
    
    if (secret !== ADMIN_SECRET) {
        return res.json({ success: false, error: "Unauthorized" });
    }
    
    globalStats = {
        totalSent: 0,
        daily: {},
        userSent: {},
        recentActivity: []
    };
    
    saveStats(globalStats);
    
    console.log('[STATS] Statistics reset by admin');
    res.json({ success: true, message: "Statistics reset" });
});

// ============ EMAIL SENDING ENDPOINT ============

app.post('/send', async (req, res) => {
    console.log("Request received at /send", req.body);

    if (req.body.test === true) {
        return res.json({ success: true, message: "Backend is alive" });
    }

    const { to, subject, body, from } = req.body;
    
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

// ============ ROOT ENDPOINT ============

app.get('/', (req, res) => {
    res.send('Email backend is running. Use /send, /stats, /record endpoints.');
});

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
    console.log(`Stats file: ${STATS_FILE}`);
    console.log(`Total emails sent (from file): ${globalStats.totalSent}`);
});
