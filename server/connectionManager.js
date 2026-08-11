const { DCernoClient } = require('./dcernoClient');

function unitKey(ip, apiKey) {
  return `${ip}::${apiKey}`;
}

function mergeSeats(roomSeats, discussionSeats) {
  const discussionByNumber = new Map(discussionSeats.map((s) => [s.seatNumber, s]));
  return roomSeats
    .map((room) => {
      const discussion = discussionByNumber.get(room.seatNumber) || {};
      return {
        seatNumber: room.seatNumber,
        online: room.state === 'online',
        role: discussion.role || room.role || null,
        microphoneOn: Boolean(discussion.microphoneOn),
        requestingToSpeak: Boolean(discussion.requestingToSpeak),
      };
    })
    .sort((a, b) => a.seatNumber - b.seatNumber);
}

class Unit {
  constructor(ip, apiKey) {
    this.client = new DCernoClient({ ip, apiKey });
    this.seats = new Map(); // seatNumber -> seat
    this.subscribers = new Set(); // ws connections
    this.minimumId = null;
    this.polling = false;
    this.stopped = false;
  }

  seatList() {
    return [...this.seats.values()].sort((a, b) => a.seatNumber - b.seatNumber);
  }

  async init() {
    const [roomSeats, discussionSeats] = await Promise.all([
      this.client.getRoomSeats(),
      this.client.getDiscussionSeats(),
    ]);
    this.seats = new Map(mergeSeats(roomSeats, discussionSeats).map((s) => [s.seatNumber, s]));
  }

  async resync() {
    await this.init();
    this.broadcast({ type: 'snapshot', seats: this.seatList() });
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const ws of this.subscribers) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }

  applyDiscussionEvent(seatState) {
    const existing = this.seats.get(seatState.seatNumber);
    const merged = {
      seatNumber: seatState.seatNumber,
      online: existing ? existing.online : true,
      role: seatState.role || (existing ? existing.role : null),
      microphoneOn: Boolean(seatState.microphoneOn),
      requestingToSpeak: Boolean(seatState.requestingToSpeak),
    };
    this.seats.set(merged.seatNumber, merged);
    this.broadcast({ type: 'seatChanged', seat: merged });
  }

  applyRoomEvent(seat) {
    const existing = this.seats.get(seat.seatNumber);
    const merged = {
      seatNumber: seat.seatNumber,
      online: seat.state === 'online',
      role: seat.role || (existing ? existing.role : null),
      microphoneOn: existing ? existing.microphoneOn : false,
      requestingToSpeak: existing ? existing.requestingToSpeak : false,
    };
    this.seats.set(merged.seatNumber, merged);
    this.broadcast({ type: 'seatChanged', seat: merged });
  }

  removeSeat(seatNumber) {
    if (this.seats.delete(seatNumber)) {
      this.broadcast({ type: 'seatRemoved', seatNumber });
    }
  }

  async startPolling() {
    if (this.polling) return;
    this.polling = true;
    this.stopped = false;

    let backoffMs = 1000;
    while (!this.stopped) {
      try {
        const event = await this.client.pollEvents(this.minimumId);
        backoffMs = 1000;
        if (!event) continue; // 204 timeout, immediately re-poll

        this.minimumId = event.id + 1;

        if (event.discontinuity) {
          await this.resync();
          continue;
        }

        if (event.module === 'Discussion' && event.name === 'SeatChanged') {
          this.applyDiscussionEvent(event.data);
        } else if (event.module === 'Room' && event.name === 'SeatChanged') {
          this.applyRoomEvent(event.data);
        } else if (event.module === 'Room' && event.name === 'SeatAdded') {
          this.applyRoomEvent(event.data);
        } else if (event.module === 'Room' && event.name === 'SeatRemoved') {
          this.removeSeat(event.data);
        }
      } catch (err) {
        if (this.stopped) break;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 30000);
      }
    }
    this.polling = false;
  }

  stopPolling() {
    this.stopped = true;
  }
}

class ConnectionManager {
  constructor() {
    this.units = new Map(); // key -> Unit
  }

  async getOrCreateUnit(ip, apiKey) {
    const key = unitKey(ip, apiKey);
    let unit = this.units.get(key);
    if (!unit) {
      unit = new Unit(ip, apiKey);
      this.units.set(key, unit);
      await unit.init();
      unit.startPolling();
    }
    return unit;
  }

  async testConnection(ip, apiKey) {
    const client = new DCernoClient({ ip, apiKey });
    await client.getRoomSeats();
  }

  async getSeats(ip, apiKey) {
    const unit = await this.getOrCreateUnit(ip, apiKey);
    return unit.seatList();
  }

  async setMicrophone(ip, apiKey, seatNumber, on) {
    const unit = await this.getOrCreateUnit(ip, apiKey);
    const existing = unit.seats.get(seatNumber);
    await unit.client.setMicrophone(seatNumber, on, existing?.requestingToSpeak);
  }

  async getSensitivity(ip, apiKey, seatNumber) {
    const unit = await this.getOrCreateUnit(ip, apiKey);
    const result = await unit.client.getInputSensitivityOffset(seatNumber);
    return result.input_sensitivity_offset;
  }

  async getAllSensitivities(ip, apiKey) {
    const unit = await this.getOrCreateUnit(ip, apiKey);
    const seatNumbers = unit.seatList().map((seat) => seat.seatNumber);
    const entries = await Promise.all(
      seatNumbers.map(async (seatNumber) => {
        try {
          const result = await unit.client.getInputSensitivityOffset(seatNumber);
          return [seatNumber, result.input_sensitivity_offset];
        } catch {
          return [seatNumber, null];
        }
      })
    );
    return Object.fromEntries(entries);
  }

  async setSensitivity(ip, apiKey, seatNumber, offset) {
    const unit = await this.getOrCreateUnit(ip, apiKey);
    await unit.client.setInputSensitivityOffset(seatNumber, offset);
  }

  async turnOffMicrophones(ip, apiKey, { exceptRoles = [] } = {}) {
    const unit = await this.getOrCreateUnit(ip, apiKey);
    const targets = unit
      .seatList()
      .filter((seat) => seat.microphoneOn && !exceptRoles.includes(seat.role));
    await Promise.all(
      targets.map((seat) => unit.client.setMicrophone(seat.seatNumber, false, seat.requestingToSpeak))
    );
  }

  async subscribe(ip, apiKey, ws) {
    const unit = await this.getOrCreateUnit(ip, apiKey);
    unit.subscribers.add(ws);
    ws.send(JSON.stringify({ type: 'snapshot', seats: unit.seatList() }));
    return () => this.unsubscribe(ip, apiKey, ws);
  }

  unsubscribe(ip, apiKey, ws) {
    const key = unitKey(ip, apiKey);
    const unit = this.units.get(key);
    if (!unit) return;
    unit.subscribers.delete(ws);
    if (unit.subscribers.size === 0) {
      unit.stopPolling();
      this.units.delete(key);
    }
  }
}

module.exports = { ConnectionManager };
