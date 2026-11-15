# D-Cerno Push-to-Talk Dashboard

Setup and operating walkthrough for the standalone HTML app (Televic D-Cerno conference system).

> **What this is.** A browser page that shows every seat's mic state and lets you switch mics on/off, adjust each seat's input sensitivity, and use **All Off** / **All Off Except Chair**. Changes made on the unit or at a seat show up on screen instantly. No install is needed for the basic setup.

## What's on the USB stick

| File | Purpose |
| --- | --- |
| `index.html` | The app itself. Always needed. |
| `dcerno-relay.js` | Backup helper. Only needed if Plan A, Step 4 fails with "Couldn't reach the unit" (see [Plan B](#plan-b--use-the-relay-helper)). Keep it in the **same folder** as the HTML file. |

Copy both files to a folder on the laptop (for example `Desktop\DCerno`). Use **Chrome or Edge**, since that's what it was tested in.

## What you need before you start

- The laptop on the **same network and subnet** as the D-Cerno Conference Controller (plug into the same switch, or the show's control network).
- The controller's **IP address** (example: `192.168.0.20`).
- The controller's **API key**: open the controller's web page and go to **API Settings & Type**, then copy the key.

## Plan A: open the file directly (try this first)

1. Give the laptop an IP on the controller's subnet (e.g. `192.168.0.50`, subnet mask `255.255.255.0`) if it isn't getting one automatically.
2. Confirm you can reach the unit: `ping 192.168.0.20` should reply. (If ping is blocked on the unit, skip this and go on.)
3. Double-click `index.html` so it opens in Chrome or Edge.
4. Enter the **IP address** and **API key**, then click **Connect**. Leave *Advanced* alone unless told otherwise (it defaults to "Directly from this browser", port 9080).
5. The seat grid appears and the top-right shows a green **Live** dot. You're done. The app remembers the IP and key on this laptop, so next time it connects automatically.

> [!WARNING]
> **If Step 4 shows "Couldn't reach the unit"** and the IP and network are right, the unit probably doesn't allow direct calls from a web page (a browser security rule called CORS). This couldn't be tested against real hardware beforehand. Use **Plan B**; it takes about two minutes.

## Plan B: use the relay helper

The relay is a tiny program that serves the same dashboard and passes its requests on to the unit, which gets around the browser rule.

1. Install **Node.js** (LTS version, 18 or newer) from [nodejs.org](https://nodejs.org) if the laptop doesn't have it. Check with `node --version` in a terminal / Command Prompt.
2. Open a terminal in the folder holding both files. On Windows: open the folder, click the address bar, type `cmd`, press Enter. On Mac: right-click the folder → *New Terminal at Folder*.
3. Run:

   ```sh
   node dcerno-relay.js
   ```

   It prints `D-Cerno relay + dashboard on http://localhost:3000`. **Leave this window open** for the whole show.
4. In Chrome/Edge go to `http://localhost:3000`. Enter the IP and API key and click **Connect**, exactly as in Plan A. (The page automatically picks "Through the relay".)
5. **Other devices:** the engineer can open `http://<laptop's IP>:3000` from a tablet or second laptop on the same network. Allow Node through the firewall if Windows/Mac asks. Each device enters the IP and key once.

## Using the dashboard

| To do this… | …do this |
| --- | --- |
| Turn a mic on / off | Click (or tap) the seat. A red card with a filled mic means **mic on**. Dim dashed cards are offline seats and can't be switched. |
| See who wants to speak | An amber pulsing card marked **REQ** means that seat is requesting to speak. The "requesting" counter at the top counts them. |
| Mute everyone | **All Off** (top left). **All Off Except Chair** leaves the Chair seat live. There is no confirmation prompt, so press deliberately. |
| Adjust a seat's input sensitivity | Click the **⋯** in the card's corner (or focus a seat and press **M**). Drag the slider from −12 to +12 dB. The small "0 dB" in the card's top-left shows the current value. |
| Name a seat | In the same **⋯** panel, type a label (e.g. "Jane – Head Table"). Labels are saved on this laptop, per unit IP. |
| Resize the cards | Slider at the bottom. **Fullscreen** button bottom-right for a clean operator view. |
| Change unit / key, or forget the key | **Settings** (top right). "Disconnect & forget key" removes the saved key from this browser. Do this on a borrowed laptop at the end of the show. |

**Status dot:** green "Live" = receiving instant updates. Amber "Reconnecting…" = the page lost the unit and is retrying automatically; mic clicks may fail until it turns green again. Failed actions show a red message at the bottom of the screen.

## Troubleshooting

| Symptom | Try |
| --- | --- |
| "The unit rejected the API key" | Re-copy the key from **API Settings & Type** (no trailing spaces). The key can change if the unit is reset. |
| "Couldn't reach the unit" | Check the laptop's IP is on the unit's subnet, the cable/switch, and the IP typed. If all fine → Plan B. |
| "Didn't answer in time" | Network is reachable but slow, or it's the wrong device. Verify the IP is the Conference Controller (not a seat or switch). |
| Green dot, but a seat shows offline | That seat unit isn't connected/powered or isn't reporting to the controller. Check the daisy-chain cabling at that seat. |
| Relay: "Couldn't reach" from a second device | The relay laptop's firewall is blocking port 3000, or the relay window was closed. |
| Page was served over `https://` | Won't work: browsers block secure pages from calling the unit's plain-http API. Use the file or the relay as described above. |
| Seat numbers wrong or mics don't respond | Open the controller's own web UI to confirm the same seat state; this app only displays and sets what the unit reports. |

## Good to know

- The API key is stored only in this browser on this laptop (never uploaded anywhere). Anyone who can open the page on that laptop can control the mics.
- This app was tested against a simulated D-Cerno built from the same API calls as the AVFX Docker dashboard, **not yet against a live unit**. If something behaves differently on the real hardware, note exactly what you see and report it back.
- The original Docker-based dashboard ([github.com/avfx-it/avfx-push-to-talk](https://github.com/avfx-it/avfx-push-to-talk)) does the same job and is the fallback if neither plan works.
