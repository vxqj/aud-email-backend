const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const app = express();

app.use(cors());
app.use(express.json());

const RESEND_API_KEY = 're_PdpSut6x_8XJV77U424TSpZsvpRTXTcSV';

// Supabase configuration
const SUPABASE_URL = 'https://ujvuuhkoloeoxhkpsagm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UPUggIBIrpIg7j2U-W3t5g_c-Y-4amL';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper functions
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function redactEmail(email) {
    if (!email) return 'unknown';
    const atIndex = email.indexOf('@');
    if (atIndex <= 0) return '***@***';
    const domain = email.substring(atIndex);
    return '******' + domain;
}

// Load stats from Supabase
async function loadStats() {
    try {
        const { data, error } = await supabase
            .from('stats')
            .select('value')
            .eq('key', 'global')
            .single();
        
        if (error) throw error;
        return data.value;
    } catch (error) {
        console.error('Error loading stats:', error);
        return { totalSent: 0, daily: {}, userSent: {}, recentActivity: [] };
    }
}

// Save stats to Supabase
async function saveStats(stats) {
    try {
        const { error } = await supabase
            .from('stats')
            .update({ value: stats, updated_at: new Date() })
            .eq('key', 'global');
        
        if (error) throw error;
        console.log(`[STATS] Saved to Supabase: Total sent = ${stats.totalSent}`);
    } catch (error) {
        console.error('Error saving stats:', error);
    }
}

// Initialize globalStats from Supabase
let globalStats = null;

// ============ STATISTICS ENDPOINTS ============

app.get('/stats', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.json({ success: false, error: "Missing userId" });
    }
    
    const stats = await loadStats();
    const userSent = stats.userSent[userId] || 0;
    
    res.json({
        success: true,
        userSent: userSent,
        globalTotal: stats.totalSent,
        globalDaily: stats.daily,
        recentActivity: stats.recentActivity
    });
});

app.post('/record', async (req, res) => {
    const { userId, count, email } = req.body;
    
    if (!userId) {
        return res.json({ success: false, error: "Missing userId" });
    }
    
    const stats = await loadStats();
    const sendCount = count || 1;
    const today = getTodayDate();
    const redactedEmail = redactEmail(email || 'unknown');
    
    // Update stats
    stats.userSent[userId] = (stats.userSent[userId] || 0) + sendCount;
    stats.totalSent += sendCount;
    stats.daily[today] = (stats.daily[today] || 0) + sendCount;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    stats.recentActivity.unshift({
        time: timeStr,
        message: `${sendCount} email${sendCount !== 1 ? 's' : ''} sent to ${redactedEmail}`
    });
    
    if (stats.recentActivity.length > 50) {
        stats.recentActivity = stats.recentActivity.slice(0, 50);
    }
    
    await saveStats(stats);
    
    console.log(`[STATS] User ${userId}: +${sendCount} | Total: ${stats.totalSent}`);
    
    res.json({
        success: true,
        userSent: stats.userSent[userId],
        globalTotal: stats.totalSent,
        globalDaily: stats.daily,
        recentActivity: stats.recentActivity
    });
});

app.get('/leaderboard', async (req, res) => {
    const stats = await loadStats();
    const leaderboard = Object.entries(stats.userSent)
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    res.json({ success: true, leaderboard });
});

app.post('/reset-stats', async (req, res) => {
    const { secret } = req.body;
    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'audloladmin123';
    
    if (secret !== ADMIN_SECRET) {
        return res.json({ success: false, error: "Unauthorized" });
    }
    
    const newStats = { totalSent: 0, daily: {}, userSent: {}, recentActivity: [] };
    await saveStats(newStats);
    
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

app.get('/', (req, res) => {
    res.send('Email backend is running. Use /send, /stats, /record endpoints.');
});

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Proxy running on port ${PORT}`);
    globalStats = await loadStats();
    console.log(`Total emails sent (from Supabase): ${globalStats.totalSent}`);
});
