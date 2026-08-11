# D-Cerno Push-to-Talk Dashboard

A browser dashboard for controlling a Televic D-Cerno push-to-talk system: see every seat's mic state at a glance and toggle mics on/off, with live updates pushed the instant a mic changes (no polling delay).

The server must run on the same LAN as the D-Cerno Conference Controller, since the controller is only reachable at its local IP address (e.g. `192.168.0.20`).

## Prerequisites

[Docker Desktop](https://www.docker.com/products/docker-desktop/) must be installed and running before using either the `docker run` command or `docker compose` below:

- **Mac**: [docs.docker.com/desktop/setup/install/mac-install](https://docs.docker.com/desktop/setup/install/mac-install/)
- **Windows**: [docs.docker.com/desktop/setup/install/windows-install](https://docs.docker.com/desktop/setup/install/windows-install/)

## Run it (technician quick start)

No source checkout or build required — pull the published image and run it:

```sh
docker run -d \
  --name dcerno-dashboard \
  --restart unless-stopped \
  -p 3000:3000 \
  ghcr.io/avfx-it/avfx-push-to-talk:latest
```

Then open `http://<this-machine's-LAN-IP>:3000` from any browser on the same network, and add a connection using the D-Cerno unit's IP and API key (from the D-Cerno **API Settings & Type** page).

To update to the latest published version:

```sh
docker pull ghcr.io/avfx-it/avfx-push-to-talk:latest
docker stop dcerno-dashboard && docker rm dcerno-dashboard
# then re-run the `docker run` command above
```

### Using Docker Compose instead

```yaml
services:
  app:
    image: ghcr.io/avfx-it/avfx-push-to-talk:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
```

## Development

This repo's `docker-compose.yml` builds the image from source instead of pulling it, for local iteration:

```sh
docker compose up --build
```

Every push to `main` automatically rebuilds and republishes `ghcr.io/avfx-it/avfx-push-to-talk:latest` via GitHub Actions (see `.github/workflows/publish.yml`).
