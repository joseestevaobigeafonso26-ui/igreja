import { HostEngine } from "../../src/lib/aula/HostEngine";
import { StudentEngine } from "../../src/lib/aula/StudentEngine";
import type { HostMsg, StudentMsg, Person } from "../../src/lib/aula/protocol";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
class Bus {
  hostCb?: (uid: string, m: StudentMsg) => void;
  studs = new Map<string, (m: HostMsg) => void>();
  drop: ((m: any) => boolean) | null = null; // para simular mensagens perdidas
  log: any[] = [];
  host() {
    return {
      send: (m: HostMsg) => { if (this.drop?.(m)) return; const c = clone(m); setTimeout(() => this.studs.forEach((cb) => cb(clone(c))), 5); },
      onStudent: (cb: any) => { this.hostCb = cb; }, close: () => {},
    };
  }
  student(uid: string) {
    return {
      send: (m: StudentMsg) => { this.log.push({ uid, m: m.t }); const c = clone(m); setTimeout(() => this.hostCb?.(uid, c), 5); },
      onHost: (cb: any) => { this.studs.set(uid + Math.random(), cb); }, close: () => {},
    };
  }
}
const rtc: RTCConfiguration = { iceServers: [] };
(window as any).T = {
  Bus, rtc, HostEngine, StudentEngine,
  async host(bus: Bus, roster: Person[], extra: any = {}) {
    const h = new HostEngine({ transport: bus.host(), rtc, hostNome: "Prof", roster, heartbeatMs: 1000, answerTimeoutMs: 2500, ...extra });
    const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    h.start(media);
    return h;
  },
  student(bus: Bus, uid: string, nome: string, extra: any = {}) {
    const s = new StudentEngine({ transport: bus.student(uid), rtc, uid, nome, tickMs: 300, ...extra });
    s.start();
    return s;
  },
};
