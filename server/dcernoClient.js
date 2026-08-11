const DEFAULT_PORT = 9080;

class DCernoError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DCernoError';
    this.status = status;
  }
}

class DCernoClient {
  constructor({ ip, apiKey, port = DEFAULT_PORT }) {
    this.baseUrl = `http://${ip}:${port}`;
    this.apiKey = apiKey;
  }

  async request(path, { method = 'GET', body, timeoutMs, query } = {}) {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, value);
      }
    }

    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (res.status === 204) return null;
    if (!res.ok) {
      throw new DCernoError(`D-Cerno request failed: ${method} ${path} -> ${res.status}`, res.status);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  getRoomSeats() {
    return this.request('/api/room/seats/discussion', { timeoutMs: 8000 });
  }

  getDiscussionSeats() {
    return this.request('/api/discussion/seats', { timeoutMs: 8000 });
  }

  // The device rejects a PUT that omits either field with a 400, even
  // though the spec lists both as optional -- so always send both.
  setMicrophone(seatNumber, microphoneOn, requestingToSpeak) {
    return this.request(`/api/discussion/seats/${seatNumber}`, {
      method: 'PUT',
      body: { microphoneOn, requestingToSpeak: Boolean(requestingToSpeak) },
      timeoutMs: 8000,
    });
  }

  getInputSensitivityOffset(seatNumber) {
    return this.request(`/api/audio/seats/${seatNumber}/inputsensitivityoffset`, { timeoutMs: 8000 });
  }

  setInputSensitivityOffset(seatNumber, offset) {
    return this.request(`/api/audio/seats/${seatNumber}/inputsensitivityoffset`, {
      method: 'PUT',
      body: { input_sensitivity_offset: offset },
      timeoutMs: 8000,
    });
  }

  // Long-poll: the D-Cerno unit holds the connection open until an event
  // arrives or it times out server-side, so this call itself blocks for a
  // while. No client-side timeout is applied beyond a generous safety net.
  pollEvents(minimumId) {
    return this.request('/api/notification/events', {
      query: {
        'include-filter': 'Discussion,Room',
        ...(minimumId != null ? { 'minimum-id': minimumId } : {}),
      },
      timeoutMs: 65000,
    });
  }
}

module.exports = { DCernoClient, DCernoError };
