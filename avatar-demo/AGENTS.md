# Rules for working on this Anam avatar integration

ALWAYS:

- Mint session tokens on the server; only the short-lived token reaches the browser.
- Prepare on page load (bundle the SDK, prefetch the session token — it lives ~1 hour); the user gesture should only have to start the stream.
- Keep replies concise and conversational — they get spoken aloud.

NEVER:

- Expose `ANAM_API_KEY` to the client.
