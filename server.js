import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 9034;

app.use(express.json());
app.use(cookieParser());

// Supabase configuration
app.get('/api/config', (req, res) => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.error('Missing Supabase environment variables');
        return res.status(500).json({
            error: 'Supabase configuration is missing'
        });
    }

    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

// Static website with extensions disabled
app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html', 'htm']
}));

// Explicit root fallback
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Chirp running on http://localhost:${PORT}`);
});