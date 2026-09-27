import { createClient, AnamEvent } from 'https://esm.sh/@anam-ai/js-sdk@latest';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const startBtn = document.getElementById('start');

function log(line) {
  logEl.textContent += line + '\n';
}

// Prefetch the session token on page load (tokens last ~1h) so the click
// only has to attach media, per Anam's performance guidance.
const sessionTokenPromise = fetch('/api/avatar-session', { method: 'POST' })
  .then((r) => r.json())
  .then((data) => data.sessionToken);

let client;
let lastProcessedUserMessageId;
let conversation = []; // { role: 'user' | 'assistant', content: string }

async function callClaude(messages) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const talkStream = client.createTalkMessageStream();
  let fullReply = '';
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop(); // keep any incomplete trailing event
    for (const evt of events) {
      if (evt.startsWith('event: done')) continue;
      const line = evt.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const chunk = JSON.parse(line.slice('data: '.length));
      fullReply += chunk;
      await talkStream.streamMessageChunk(chunk, false);
    }
  }

  await talkStream.endMessage();
  return fullReply;
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statusEl.textContent = 'Connecting...';

  const sessionToken = await sessionTokenPromise;
  client = createClient(sessionToken);

  client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, async (messages) => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || last.id === lastProcessedUserMessageId) return;
    lastProcessedUserMessageId = last.id;

    log('You: ' + last.content);
    conversation.push({ role: 'user', content: last.content });

    try {
      const reply = await callClaude(conversation);
      conversation.push({ role: 'assistant', content: reply });
      log('David: ' + reply);
    } catch (err) {
      log('Error: ' + err.message);
    }
  });

  await client.streamToVideoElement('avatar-video');
  statusEl.textContent = 'Connected — just start speaking.';
});
