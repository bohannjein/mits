import "server-only";

import { createSocket } from "node:dgram";

import { isValidNtpHost } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Minimal SNTP client (RFC 4330).

   Hand-rolled over `node:dgram` rather than pulled in as a package: the whole
   protocol needed here is one 48-byte packet out and one back, and the backend
   already lives under a four-package limit that this repository takes seriously.

   What this does *not* do is set the clock. A container cannot — the kernel clock
   belongs to the host, and a process that could change it would need capabilities
   MITS has no business holding. So this measures and reports, and the operator
   decides. Saying "sync" and only reading the time would be the worse outcome: an
   admin would tick a box and believe the problem is handled.
   ────────────────────────────────────────────────────────────────────────── */

const NTP_PORT = 123;
const NTP_PACKET_BYTES = 48;

/** Seconds between the NTP epoch (1900-01-01) and the Unix epoch. */
const NTP_UNIX_EPOCH_DIFF = 2_208_988_800;

/** A stratum-0 reply means "unsynchronised" — the server is not usable. */
const KISS_OF_DEATH_STRATUM = 0;

const DEFAULT_TIMEOUT_MS = 3000;

export interface NtpResult {
  ok: true;
  /** The server's idea of now. */
  serverTime: Date;
  /** Local clock minus server clock. Positive means the local clock runs ahead. */
  offsetMs: number;
  /** Round-trip time, which bounds how precise `offsetMs` can be. */
  roundTripMs: number;
  stratum: number;
}

export interface NtpFailure {
  ok: false;
  error: string;
}

/**
 * Ask an NTP server for the time and report the local clock's offset.
 *
 * Never throws: a blocked port, an unreachable host or a silent server are all
 * ordinary conditions in a container, and every one of them comes back as a
 * readable message. UDP 123 outbound is frequently closed in corporate networks,
 * and "the check failed" has to be distinguishable from "the clock is wrong".
 */
export async function queryNtp(
  host: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<NtpResult | NtpFailure> {
  const target = host.trim();
  if (!isValidNtpHost(target)) {
    return { ok: false, error: "Kein gültiger Hostname." };
  }

  return new Promise<NtpResult | NtpFailure>((resolve) => {
    const socket = createSocket("udp4");
    let settled = false;

    const finish = (result: NtpResult | NtpFailure) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // The socket is torn down before resolving, so a late reply cannot arrive
      // after the caller has moved on.
      try {
        socket.close();
      } catch {
        /* already closing */
      }
      resolve(result);
    };

    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          error: `Keine Antwort von ${target} innerhalb von ${timeoutMs} ms. UDP-Port 123 ist in vielen Netzen ausgehend gesperrt.`,
        }),
      timeoutMs,
    );

    socket.on("error", (error) =>
      finish({ ok: false, error: `Verbindung fehlgeschlagen: ${error.message}` }),
    );

    const packet = Buffer.alloc(NTP_PACKET_BYTES);
    // LI = 0, VN = 4, Mode = 3 (client). The rest stays zero: a client request
    // carries no timestamps the server needs.
    packet[0] = 0x23;

    const sentAt = Date.now();

    socket.on("message", (message) => {
      const receivedAt = Date.now();

      if (message.length < NTP_PACKET_BYTES) {
        finish({ ok: false, error: "Unvollständige NTP-Antwort." });
        return;
      }

      const stratum = message[1];
      if (stratum === KISS_OF_DEATH_STRATUM) {
        // Stratum 0 carries a four-character reason in the reference id field.
        const code = message.subarray(12, 16).toString("ascii").replace(/\0/g, "");
        finish({
          ok: false,
          error: `Server antwortet als nicht synchronisiert${code ? ` (${code})` : ""}.`,
        });
        return;
      }

      // Transmit timestamp: seconds and fraction, both unsigned 32-bit big-endian.
      const seconds = message.readUInt32BE(40);
      const fraction = message.readUInt32BE(44);
      if (seconds === 0) {
        finish({ ok: false, error: "NTP-Antwort ohne Zeitstempel." });
        return;
      }

      const serverMs =
        (seconds - NTP_UNIX_EPOCH_DIFF) * 1000 + (fraction * 1000) / 2 ** 32;

      const roundTripMs = receivedAt - sentAt;
      /*
       * The reply describes the moment the server sent it, which is roughly half a
       * round trip before it arrived. Comparing it against `receivedAt` unadjusted
       * would report the network latency as clock error — on a link with 200 ms
       * round trip, a perfectly synchronised clock would look 100 ms off.
       */
      const offsetMs = receivedAt - (serverMs + roundTripMs / 2);

      finish({
        ok: true,
        serverTime: new Date(Math.round(serverMs)),
        offsetMs,
        roundTripMs,
        stratum,
      });
    });

    socket.send(packet, 0, packet.length, NTP_PORT, target, (error) => {
      if (error) {
        finish({ ok: false, error: `Senden fehlgeschlagen: ${error.message}` });
      }
    });
  });
}

