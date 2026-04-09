# GTA Achievement Tracker

Static Halo Achievement Tracker-inspired website for Grand Theft Auto games on Steam.

## Stack

- HTML
- CSS
- JavaScript
- Bootstrap 5
- Bootstrap Icons

## Data

Each game is backed by its own JSON file in `data/games/`.
The manifest in `data/games.json` controls the sidebar order and metadata.

## Run locally

Because the app loads JSON with `fetch`, serve it through a local HTTP server instead of opening `index.html` directly.

```bash
cd /home/ianmarais/Documents/Development/Ian\ Marais/GTA-Achievement-Tracker
python3 -m http.server 8000
```

Then open `http://localhost:8000`.