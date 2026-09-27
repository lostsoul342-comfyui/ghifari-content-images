import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { buildLocalKnowledge } from './knowledge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
const WEB_SEARCH_ENABLED = process.env.ENABLE_WEB_SEARCH === 'true';

// Repo folders that ship with this project, always included alongside
// whatever the user points LOCAL_KNOWLEDGE_PATHS at.
const REPO_ROOT = path.join(__dirname, '..', '..');
const REPO_EXTRA_PATHS = [
  path.join(REPO_ROOT, 'images'),
  path.join(REPO_ROOT, 'videos'),
];

function systemPrompt() {
  const knowledge = buildLocalKnowledge({ extraPaths: REPO_EXTRA_PATHS });
  return [
    'You are David, a helpful spoken avatar assistant.',
    'Keep replies short and conversational — they are read aloud by a text-to-speech avatar, so avoid markdown, bullet points, or long lists.',
    'First check the local knowledge below to answer the question.',
    'If the question needs live/current information that is not in local knowledge (e.g. today\'s weather, news, current prices), use the web_search tool if it is available to you. If it is not available, say you cannot check that right now.',
    '',
    '--- LOCAL KNOWLEDGE ---',
    knowledge,
  ].join('\n');
}

// Mint a short-lived Anam session token. The frontend never sees ANAM_API_KEY.
app.post('/api/avatar-session', async (_req, res) => {
  try {
    const response = await fetch(`${process.env.ANAM_API_BASE}/v1/auth/session-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ANAM_API_KEY}`,
      },
      body: JSON.stringify({
        personaConfig: {
          name: 'David',
          avatarId: process.env.ANAM_AVATAR_ID,
          voiceId: '1f4122e6-6e3d-43e0-b936-b8262206d2eb',
          llmId: 'CUSTOMER_CLIENT_V1', // Anam's brain is off — Claude answers below
        },
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Streams Claude's reply as Server-Sent Events: one "data:" line of raw text per chunk.
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body; // [{ role: 'user'|'assistant', content: string }]

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const baseParams = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt(),
    messages,
  };

  async function runStream(params) {
    const stream = anthropic.messages.stream(params);
    stream.on('text', (chunk) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    });
    await stream.finalMessage();
  }

  try {
    if (WEB_SEARCH_ENABLED) {
      try {
        // Tool name/type per Anthropic's current web search tool docs — if this
        // rejects, we fall back to a plain (no-search) call below.
        await runStream({
          ...baseParams,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        });
      } catch (toolErr) {
        console.warn('web_search tool call failed, retrying without it:', toolErr.message);
        await runStream(baseParams);
      }
    } else {
      await runStream(baseParams);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify('Sorry, I hit an error: ' + err.message)}\n\n`);
  } finally {
    res.write('event: done\ndata: {}\n\n');
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`avatar-demo running at http://localhost:${PORT}`);
});
