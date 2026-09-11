import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 9034;

function getSupabaseConfig() {
    return {
        url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    };
}

function getSupabaseServerClient(accessToken) {
    const { url, anonKey } = getSupabaseConfig();
    return createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });
}

app.use(express.json());
app.use(cookieParser());

// Supabase configuration
app.get('/api/config', (req, res) => {
    const { url, anonKey } = getSupabaseConfig();

    if (!url || !anonKey) {
        console.error('Missing Supabase environment variables');
        return res.status(500).json({
            error: 'Supabase configuration is missing'
        });
    }

    res.set('Cache-Control', 'no-store');
    res.json({ supabaseUrl: url, supabaseAnonKey: anonKey });
});

app.post('/api/reports', async (req, res) => {
    const webhookUrl = process.env.DISCORD_REPORT_WEBHOOK_URL;
    const accessToken = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    const { type, reason, messageId, reportedUserId } = req.body || {};

    if (!webhookUrl) return res.status(503).json({ error: 'Reporting service is unavailable.' });
    if (!accessToken || !reason || !['message', 'user'].includes(type)) {
        return res.status(400).json({ error: 'A report type, reason, and valid session are required.' });
    }

    try {
        const supabase = getSupabaseServerClient(accessToken);
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return res.status(401).json({ error: 'Your session has expired.' });

        const { data: reporter } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
        let reportedMessage = null;
        let reportedUser = null;

        if (type === 'message') {
            if (!messageId) return res.status(400).json({ error: 'The reported message is required.' });
            const { data, error } = await supabase.from('messages').select('id, content, sender_id, receiver_id, created_at').eq('id', messageId).maybeSingle();
            if (error || !data) return res.status(404).json({ error: 'The reported message could not be found.' });
            if (data.sender_id !== user.id && data.receiver_id !== user.id) return res.status(403).json({ error: 'You cannot report this message.' });
            reportedMessage = data;
            const { data: sender } = await supabase.from('profiles').select('username').eq('id', data.sender_id).maybeSingle();
            reportedUser = { id: data.sender_id, username: sender?.username || 'Unknown user' };
        } else {
            if (!reportedUserId || reportedUserId === user.id) return res.status(400).json({ error: 'A valid user is required.' });
            const { data: target } = await supabase.from('profiles').select('id, username').eq('id', reportedUserId).maybeSingle();
            if (!target) return res.status(404).json({ error: 'The reported user could not be found.' });
            reportedUser = target;
        }

        const fields = [
            { name: 'Reason', value: reason.slice(0, 1024), inline: false },
            { name: 'Reported by', value: `${reporter?.username || 'Unknown user'} (${user.id})`, inline: false },
            { name: 'Reported user', value: `${reportedUser.username} (${reportedUser.id})`, inline: false }
        ];
        if (reportedMessage) {
            fields.push({ name: 'Message', value: reportedMessage.content.slice(0, 1024), inline: false });
            fields.push({ name: 'Message ID', value: reportedMessage.id, inline: true });
        }

        const discordResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'Chirp Reports',
                embeds: [{ title: type === 'message' ? 'Message report' : 'User report', color: 0xef4444, fields, timestamp: new Date().toISOString() }]
            })
        });
        if (!discordResponse.ok) throw new Error(`Webhook returned ${discordResponse.status}`);
        res.status(204).end();
    } catch (error) {
        console.error('Report error:', error.message);
        res.status(502).json({ error: 'Unable to send the report right now.' });
    }
});

// Static website with extensions disabled
app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html', 'htm']
}));

// Explicit root fallback
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only listen locally or on a persistent server, not inside Vercel's serverless environment
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`Chirp running on http://localhost:${PORT}`);
    });
}

export default app;