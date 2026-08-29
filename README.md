# SAREE — Premium Saree Store + Admin Studio

A single GitHub-ready Node/Express project. The storefront and `/admin` panel use the same SQLite database and backend.

## Run

1. Install Node.js 18+.
2. `npm install`
3. Copy `.env.example` to `.env` and set a strong `SESSION_SECRET`.
4. Optional: set `OPENAI_API_KEY` for real AI text/image understanding. The project still has a deterministic catalog-aware fallback without it.
5. `npm start`
6. Store: `http://localhost:3000/`
7. Admin: `http://localhost:3000/admin`

Default first-run admin password: `admin123` (change it immediately in Settings).

## AI features

- Five customer-facing quick chat cards are controlled from Admin → AI Shopping Setup.
- Admin can set delivery time, store information, opening hours, contact-agent text and sales-proof/review text/image.
- AI can collect customer name, phone, address and payment method, show the admin-configured payment number, ask for confirmation, and create the order.
- Customer can upload a product photo in the AI chat. With `OPENAI_API_KEY`, the image is analyzed against the live catalog. Without an API key, the fallback uses filename/catalog matching.
- The assistant is branded as **SAREE** and greeting responses never call it a demo website.
- Products, payment settings, agents, proof images and orders persist in SQLite until the admin changes/deletes them.

## Production deployment on Render

GitHub stores the source code; Render runs the Node/Express server. Use the included `render.yaml` or configure the same settings manually:

- Build: `npm install`
- Start: `npm start`
- Health check: `/health`
- `DATA_DIR=/var/data`
- Attach a Render persistent disk at `/var/data` (the included blueprint does this). Render documents that the normal filesystem is ephemeral, while a persistent disk preserves filesystem changes across deploys/restarts. The persistent disk is for paid services and is single-instance.
- Set `SESSION_SECRET` and `OPENAI_API_KEY` in Render Environment Variables. Do not commit secrets to GitHub.
- `OPENAI_MODEL=gpt-5.6-luna` is the default and can be overridden.

The SQLite database and admin-uploaded images live under `DATA_DIR`, so products, orders, settings, agents and uploaded proof/product images remain available until you change/delete them, provided the Render persistent disk remains attached.

