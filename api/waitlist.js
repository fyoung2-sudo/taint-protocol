import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const MAX_SPOTS = 100;
  const KV_KEY = 'taint_founding_agents';

  try {
    if (req.method === 'GET') {
      // Fetch current waitlist
      const waitlist = (await kv.get(KV_KEY)) || [];
      const recent = waitlist.slice(-10).reverse().map(w => ({
        wallet: w.wallet,
        spot: w.spot,
        time: timeAgo(w.timestamp)
      }));
      return res.status(200).json({
        count: waitlist.length,
        recent,
        wallets: waitlist.map(w => ({ wallet: w.wallet, spot: w.spot }))
      });
    }

    if (req.method === 'POST') {
      const { wallet, signature, message } = req.body;

      if (!wallet || !signature) {
        return res.status(400).json({ success: false, error: 'Missing wallet or signature' });
      }

      // Validate wallet address format (base58, 32-44 chars)
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
        return res.status(400).json({ success: false, error: 'Invalid wallet address' });
      }

      const waitlist = (await kv.get(KV_KEY)) || [];

      // Check if wallet already claimed
      const existing = waitlist.find(w => w.wallet === wallet);
      if (existing) {
        return res.status(200).json({
          success: false,
          error: 'Wallet already claimed a spot!',
          spot: existing.spot
        });
      }

      // Check if full
      if (waitlist.length >= MAX_SPOTS) {
        return res.status(200).json({ success: false, error: 'All 100 spots are claimed!' });
      }

      // Add to waitlist
      const entry = {
        wallet,
        signature: signature.slice(0, 64), // store truncated sig as proof
        spot: waitlist.length + 1,
        timestamp: Date.now()
      };

      waitlist.push(entry);
      await kv.set(KV_KEY, waitlist);

      return res.status(200).json({
        success: true,
        spot: entry.spot,
        message: `Welcome, Founding Agent #${entry.spot}! 🤖🍑`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return res.status(500).json({ success: false, error: 'Server error. Try again.' });
  }
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}
