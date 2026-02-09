import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- Types & Interfaces ---

interface LogEntry {
  id: number;
  time: string;
  msg: string;
  type: 'info' | 'tx' | 'rx' | 'err' | 'alarm' | 'meter';
}

interface PacketEntry {
  id: number;
  time: string;
  hex: string;
}

interface MeterState {
  usage: number;
  flow: number;
  temp: number;
  volt: number;
  magnet: boolean;
  leak: boolean;
  alarms: {
    freeze: number; // ms
    magnet: number;
    overload: number;
    backflow: number;
  };
}

interface ModemState {
  mode: 'SLEEP' | 'WAKE' | 'READ' | 'CONNECT' | 'SEND' | 'WAIT';
  rsrp: number;
  ackFail: boolean;
  readPeriod: number;
  reportPeriod: number;
  nextRead: number;
  nextReport: number;
  bufferSize: number;
  retryCount: number;
}

// --- Utilities ---

const pad = (n: number | string, w: number, z: string = '0') => {
  n = n + '';
  return n.length >= w ? n : new Array(w - n.length + 1).join(z) + n;
};

const toHex = (n: number, p: number = 2) => {
  let hex = n.toString(16).toUpperCase();
  if (n < 0) hex = (0xFF + n + 1).toString(16).toUpperCase();
  return hex.padStart(p, '0');
};

const nowStr = (d: Date) => 
  `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`;

// --- Simulation Logic Classes (Non-React) ---

class VirtualClock {
  virtualStartTime: number;
  speedMultiplier: number;
  lastUpdateReal: number;

  constructor() {
    this.virtualStartTime = new Date().getTime();
    this.speedMultiplier = 1;
    this.lastUpdateReal = Date.now();
  }

  update() {
    const now = Date.now();
    const deltaReal = now - this.lastUpdateReal;
    if (this.speedMultiplier > 0) {
      this.virtualStartTime += deltaReal * this.speedMultiplier;
    }
    this.lastUpdateReal = now;
    return deltaReal * this.speedMultiplier; // Returns virtual delta ms
  }

  getTime() {
    return new Date(this.virtualStartTime);
  }

  setSpeed(idx: number) {
    // PAUSE, x1, x60, x1H, MAX
    const speeds = [0, 1, 60, 3600, 86400];
    this.speedMultiplier = speeds[idx];
    this.lastUpdateReal = Date.now();
  }
}

// --- Main Component ---

export default function App() {
  // --- Refs for Simulation Engine (Mutable State) ---
  const clockRef = useRef(new VirtualClock());
  const meterRef = useRef<MeterState>({
    usage: 123.456,
    flow: 0,
    temp: 15,
    volt: 3.6,
    magnet: false,
    leak: false,
    alarms: { freeze: 0, magnet: 0, overload: 0, backflow: 0 },
  });
  const modemRef = useRef({
    mode: 'SLEEP' as const,
    readPeriod: 3600 * 1000,
    reportPeriod: 6 * 3600 * 1000,
    nextRead: 0,
    nextReport: 0,
    buffer: [] as any[],
    retryCount: 0,
    forceReport: false,
    rsrp: -90,
    ackFail: false,
    delayTimer: 0,
    lastAlarmState: { m: false, f: false },
  });

  // --- React State for UI Rendering ---
  const [currentTime, setCurrentTime] = useState<string>("INIT");
  const [speedIdx, setSpeedIdx] = useState(1);
  const [meterUI, setMeterUI] = useState<MeterState>(meterRef.current);
  const [modemUI, setModemUI] = useState<ModemState>({
    mode: 'SLEEP', rsrp: -90, ackFail: false, readPeriod: 1, reportPeriod: 6,
    nextRead: 0, nextReport: 0, bufferSize: 0, retryCount: 0
  });
  
  // Logs
  const [sysLogs, setSysLogs] = useState<LogEntry[]>([]);
  const [packetLogs, setPacketLogs] = useState<PacketEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'sys' | 'pkt'>('sys');

  // Helper to add logs (Using functional update to avoid stale closures if used in callbacks)
  const addSysLog = (msg: string, type: LogEntry['type']) => {
    const time = nowStr(clockRef.current.getTime()).split(' ')[1];
    setSysLogs(prev => [{ id: Date.now() + Math.random(), time, msg, type }, ...prev].slice(0, 100));
  };

  const addPacketLog = (hex: string) => {
    const time = nowStr(clockRef.current.getTime());
    setPacketLogs(prev => [{ id: Date.now() + Math.random(), time, hex }, ...prev].slice(0, 50));
  };

  // --- Initialization ---
  useEffect(() => {
    // Align next targets to hour
    const now = clockRef.current.getTime().getTime();
    const initT = Math.ceil(now / (3600 * 1000)) * (3600 * 1000);
    modemRef.current.nextRead = initT;
    modemRef.current.nextReport = initT + (modemRef.current.reportPeriod - (initT % modemRef.current.reportPeriod));
    
    addSysLog("시스템 초기화 완료", "info");
  }, []);

  // --- Core Simulation Loop ---
  useEffect(() => {
    let animationFrameId: number;

    const loop = () => {
      const deltaVirtualMs = clockRef.current.update();
      const nowMs = clockRef.current.getTime().getTime();

      if (deltaVirtualMs > 0) {
        updateMeter(deltaVirtualMs);
        updateModem(nowMs, deltaVirtualMs);
      }

      // Sync UI (throttled slightly naturally by React, but here we do every frame for smoothness)
      // For optimization, one could reduce setStates here.
      setCurrentTime(nowStr(clockRef.current.getTime()));
      setMeterUI({ ...meterRef.current }); // Clone to trigger re-render
      setModemUI({
        mode: modemRef.current.mode,
        rsrp: modemRef.current.rsrp,
        ackFail: modemRef.current.ackFail,
        readPeriod: modemRef.current.readPeriod / 3600000,
        reportPeriod: modemRef.current.reportPeriod / 3600000,
        nextRead: modemRef.current.nextRead,
        nextReport: modemRef.current.nextReport,
        bufferSize: modemRef.current.buffer.length,
        retryCount: modemRef.current.retryCount
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []); // Run once on mount

  // --- Logic Functions (Refs based) ---

  const updateMeter = (dtMs: number) => {
    const m = meterRef.current;
    
    // Flow integration
    if (m.flow !== 0) {
      // Flow is L/h. dtMs is ms.
      // Usage += (L/h / 1000(m3) / 3600(s) / 1000(ms)) * dtMs
      m.usage += (m.flow / 3600000000) * dtMs;
    }

    // Spec Logic Checks
    const thresholds = { freeze: 60000, magnet: 300000, overload: 300000, backflow: 60000 };

    const updateTimer = (key: keyof typeof m.alarms, cond: boolean, name: string) => {
      if (cond) {
        if (m.alarms[key] < thresholds[key]) {
          m.alarms[key] += dtMs;
          if (m.alarms[key] >= thresholds[key]) {
            // Triggered just now
             // We can't easily dedup log here without state, but it's fine for sim
          }
        }
      } else {
        m.alarms[key] = 0;
      }
    };

    updateTimer('freeze', m.temp <= 0, "동파경보");
    updateTimer('overload', m.flow > 1600, "과부하경보");
    updateTimer('backflow', m.flow < 0, "역류경보");
    updateTimer('magnet', m.magnet, "자석감지");
  };

  const updateModem = (now: number, dtMs: number) => {
    const mo = modemRef.current;
    const me = meterRef.current;

    // Emergency Check
    const isMag = me.alarms.magnet >= 300000;
    const isFrz = me.alarms.freeze >= 60000;
    
    if ((isMag && !mo.lastAlarmState.m) || (isFrz && !mo.lastAlarmState.f)) {
      addSysLog("[MODEM] 긴급 이벤트 -> 즉시 보고", "alarm");
      mo.mode = "WAKE";
      mo.forceReport = true;
    }
    mo.lastAlarmState = { m: isMag, f: isFrz };

    if (mo.delayTimer > 0) {
      mo.delayTimer -= dtMs;
      return;
    }

    switch (mo.mode) {
      case "SLEEP":
        if (now >= mo.nextRead) mo.mode = "WAKE";
        break;

      case "WAKE":
        mo.mode = "READ";
        break;

      case "READ":
        // 1. Read Meter
        mo.buffer.push({
          time: mo.nextRead,
          val: me.usage,
          st1: getStatus1(),
          st2: getStatus2()
        });
        addSysLog(`[METER] 검침 저장 (Buffer: ${mo.buffer.length})`, "meter");

        // 2. Schedule Next Read
        mo.nextRead += mo.readPeriod;

        // 3. Check Report
        // Using tolerance for floating point time comparison issues is usually good, but direct >= works here
        if (now >= mo.nextReport || mo.forceReport) {
          mo.mode = "CONNECT";
        } else {
          mo.mode = "SLEEP";
        }
        break;

      case "CONNECT":
        // Visual delay only in slow speeds
        mo.delayTimer = 500 * (clockRef.current.speedMultiplier <= 60 ? 1 : 0);
        mo.mode = "SEND";
        break;

      case "SEND":
        const cnt = Math.min(mo.buffer.length, 24);
        const pkt = buildPacket(cnt, now);
        const fmtPkt = pkt.match(/.{1,2}/g)?.join(' ') || "";
        
        addSysLog(`[TX] 1 Packet Sent (Contains ${cnt} Readings)`, "tx");
        addPacketLog(fmtPkt);

        // Advance Report Schedule
        if (!mo.forceReport) mo.nextReport += mo.reportPeriod;
        mo.forceReport = false;

        mo.delayTimer = 500 * (clockRef.current.speedMultiplier <= 60 ? 1 : 0);
        mo.mode = "WAIT";
        break;

      case "WAIT":
        if (mo.ackFail) {
          mo.retryCount++;
          addSysLog(`[NET] ACK 실패 (Retry ${mo.retryCount})`, "err");
          if (mo.retryCount >= 3) {
            addSysLog(`[MODEM] 전송 실패. Sleep`, "err");
            mo.retryCount = 0;
            mo.mode = "SLEEP";
          } else {
            mo.mode = "CONNECT";
          }
        } else {
          addSysLog(`[RX] ACK 수신 (RSRP ${mo.rsrp}dBm)`, "rx");
          // Clear Buffer
          const sentCount = Math.min(mo.buffer.length, 24);
          mo.buffer.splice(0, sentCount);
          mo.retryCount = 0;
          mo.mode = "SLEEP";
        }
        break;
    }
  };

  // --- Protocol Helpers ---

  const getStatus1 = () => {
    const m = meterRef.current;
    let b = 0;
    if (m.alarms.overload >= 300000) b |= 0x80;
    if (m.alarms.backflow >= 60000) b |= 0x40;
    if (m.leak) b |= 0x20;
    
    let bc = 0;
    if (m.volt < 3.7) {
      if (m.volt < 0.7) bc = 31;
      else bc = Math.floor((3.7 - m.volt) * 10) + 1;
      if (bc > 31) bc = 31;
    }
    b |= (bc & 0x1F);
    return b;
  };

  const getStatus2 = () => {
    const m = meterRef.current;
    let b = 0;
    if (m.alarms.magnet >= 300000) b |= 0x80;
    if (m.alarms.freeze >= 60000) b |= 0x40;
    b |= 0x08; // Unit m3
    b |= 3; // decimal
    return b;
  };

  const buildPacket = (cnt: number, time: number) => {
    const mo = modemRef.current;
    const m = meterRef.current;
    
    // Header V2.0 (0xB1)
    const p = [0xB1, 0x00, 0x70];
    
    // Dummies
    pushBCD(p, "861921031229508F"); 
    pushBCD(p, "450012345678901F");
    
    // Wireless
    p.push(85, 0, 0,0,0,0, 0, Math.abs(mo.rsrp), 0,0, 0xFC, 0xFF);
    
    // Terminal
    pushBCD(p, "0001234501");
    p.push(0x02, 0x00, Math.round(m.volt * 10));
    
    // Meter (12B)
    pushBCD(p, "11223344");
    p.push(0x02, 0x13); // Type, Caliper
    
    let s = 0;
    if (m.alarms.overload >= 300000) s |= 0x80;
    if (m.alarms.backflow >= 60000) s |= 0x40;
    if (m.leak) s |= 0x20;
    if (m.alarms.magnet >= 300000) s |= 0x10;
    if (m.alarms.freeze >= 60000) s |= 0x08;
    p.push(s, 0x53); // Status, ManCode
    
    let t = Math.round(m.temp);
    if (t < 0) t = 256 + t;
    p.push(t & 0xFF, 0, 0, 0); // Temp, Correction, Reserved
    
    // Period & Time
    p.push(0x01, mo.readPeriod/3600000, mo.reportPeriod/3600000);
    const d = new Date(time);
    p.push(d.getFullYear()-2000, d.getMonth()+1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    
    // Data
    p.push(0x01, cnt, 0x00);
    if (cnt > 0) {
      const lat = mo.buffer[cnt - 1];
      const r = Math.round(lat.val * 1000);
      p.push(r & 0xFF, (r >> 8) & 0xFF, (r >> 16) & 0xFF, (r >> 24) & 0xFF);
      
      for (let i = 1; i < cnt; i++) {
        const prev = mo.buffer[cnt - 1 - i];
        const v = Math.round(prev.val * 1000);
        p.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF);
      }
    } else {
      p.push(0,0,0,0);
    }
    
    p[1] = p.length + 1;
    let sum = 0; for(let i=1; i<p.length; i++) sum += p[i];
    p.push(sum & 0xFF);
    
    return p.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
  };

  const pushBCD = (arr: number[], str: string) => {
    for (let i = 0; i < str.length; i += 2) arr.push(parseInt(str.substr(i, 2), 16));
  };

  // --- Handlers ---

  const handleSpeedChange = (val: string) => {
    const v = parseInt(val);
    setSpeedIdx(v);
    clockRef.current.setSpeed(v);
  };

  const handleEnvChange = (key: keyof MeterState, val: any) => {
    // React state update for UI
    // Ref update for Physics loop
    if (key === 'flow') meterRef.current.flow = parseInt(val);
    if (key === 'temp') meterRef.current.temp = parseInt(val);
    if (key === 'volt') meterRef.current.volt = parseFloat(val);
    if (key === 'magnet') meterRef.current.magnet = val;
    if (key === 'leak') meterRef.current.leak = val;
  };

  const handleModemConfig = (key: 'rsrp' | 'ackFail', val: any) => {
    if (key === 'rsrp') modemRef.current.rsrp = parseInt(val);
    if (key === 'ackFail') modemRef.current.ackFail = val;
  };

  const updatePeriods = (read: number, report: number) => {
    if (report < read) {
      alert("오류: 보고주기는 검침주기보다 커야 합니다.");
      return;
    }
    modemRef.current.readPeriod = read * 3600000;
    modemRef.current.reportPeriod = report * 3600000;
    
    // Re-align
    const now = clockRef.current.getTime().getTime();
    modemRef.current.nextRead = now + (modemRef.current.readPeriod - (now % modemRef.current.readPeriod));
    modemRef.current.nextReport = now + (modemRef.current.reportPeriod - (now % modemRef.current.reportPeriod));
    
    addSysLog(`[CONFIG] 검침${read}H / 보고${report}H 변경`, "info");
  };

  const forceReport = () => {
    modemRef.current.forceReport = true;
    if (modemRef.current.mode === 'SLEEP') {
      addSysLog("[USER] 강제 보고 실행", "info");
    }
  };

  const clearLogs = () => {
    setSysLogs([]);
    setPacketLogs([]);
  };

  // --- Render Helpers ---
  const getProgress = (current: number, max: number) => Math.min(100, (current / max) * 100);

  return (
    <div className="h-screen flex flex-col bg-slate-100 text-slate-800 font-sans overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b px-6 py-3 flex justify-between items-center shadow-sm z-20">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💧</span>
          <div>
            <h1 className="text-lg font-bold leading-none text-slate-800">서울아리수 AMI 정밀 시뮬레이터</h1>
            <p className="text-xs text-slate-500 font-mono mt-0.5">NB-IoT V2.0 (0xB1) | Digital V1.4</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 font-bold">VIRTUAL TIME</div>
            <div className="font-mono text-xl font-bold text-blue-600">{currentTime}</div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className="w-80 bg-white border-r flex flex-col overflow-y-auto shadow-sm z-10">
          
          {/* Time Control */}
          <div className="p-5 border-b">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase">System Time</h3>
              <span className="text-xs font-mono font-bold text-red-500">
                {["PAUSE", "x1", "x60", "x1H", "MAX"][speedIdx]}
              </span>
            </div>
            <input 
              type="range" min="0" max="4" step="1" 
              value={speedIdx} 
              onChange={(e) => handleSpeedChange(e.target.value)}
              className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded cursor-pointer"
            />
          </div>

          {/* Environment */}
          <div className="p-5 border-b bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-4">Event Monitors (규격 타이머)</h3>
            
            {/* Freeze */}
            <div className="mb-4 bg-white p-3 rounded border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-700">온도 (동파)</label>
                <span className="text-xs font-mono font-bold text-orange-500">{meterUI.temp} °C</span>
              </div>
              <input 
                type="range" min="-20" max="40" defaultValue="15" 
                className="w-full accent-orange-500 h-1.5 bg-slate-200 rounded"
                onInput={(e) => handleEnvChange('temp', e.currentTarget.value)}
              />
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>조건: 0℃ 이하 1분</span>
                  <span className={meterUI.alarms.freeze >= 60000 ? "text-red-500 font-bold" : "text-slate-300"}>
                    {meterUI.alarms.freeze >= 60000 ? "발생" : "정상"}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                  <div 
                    className={`h-full transition-all duration-200 ${meterUI.alarms.freeze >= 60000 ? 'bg-red-500' : 'bg-amber-400'}`}
                    style={{ width: `${getProgress(meterUI.alarms.freeze, 60000)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Flow */}
            <div className="mb-4 bg-white p-3 rounded border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-700">유량 (L/h)</label>
                <span className="text-xs font-mono font-bold text-blue-600">{meterUI.flow}</span>
              </div>
              <input 
                type="range" min="-2000" max="2500" step="50" defaultValue="0"
                className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded"
                onInput={(e) => handleEnvChange('flow', e.currentTarget.value)}
              />
              
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>과부하(5분)</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                    <div 
                      className={`h-full transition-all duration-200 ${meterUI.alarms.overload >= 300000 ? 'bg-red-500' : 'bg-amber-400'}`}
                      style={{ width: `${getProgress(meterUI.alarms.overload, 300000)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>역류(1분)</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                    <div 
                      className={`h-full transition-all duration-200 ${meterUI.alarms.backflow >= 60000 ? 'bg-red-500' : 'bg-amber-400'}`}
                      style={{ width: `${getProgress(meterUI.alarms.backflow, 60000)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                <label className="flex justify-between items-center cursor-pointer mb-1">
                  <span className="text-xs font-bold">🧲 자석</span>
                  <input type="checkbox" className="accent-red-500" onChange={(e) => handleEnvChange('magnet', e.target.checked)} />
                </label>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                  <div 
                    className={`h-full transition-all duration-200 ${meterUI.alarms.magnet >= 300000 ? 'bg-red-500' : 'bg-amber-400'}`}
                    style={{ width: `${getProgress(meterUI.alarms.magnet, 300000)}%` }}
                  />
                </div>
              </div>
              <div className="bg-white p-2 rounded border border-slate-200 shadow-sm">
                <label className="flex justify-between items-center cursor-pointer mb-1">
                  <span className="text-xs font-bold">💧 누수</span>
                  <input type="checkbox" className="accent-yellow-500" onChange={(e) => handleEnvChange('leak', e.target.checked)} />
                </label>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                  <div 
                    className={`h-full transition-all duration-200 ${meterUI.leak ? 'bg-amber-400' : ''}`}
                    style={{ width: meterUI.leak ? '100%' : '0%' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Config */}
          <div className="p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Hardware & Config</h3>
            
            <div className="mb-3 flex justify-between items-center bg-white p-2 border rounded">
              <span className="text-xs font-bold">배터리</span>
              <input 
                type="range" min="2.5" max="3.7" step="0.1" defaultValue="3.6"
                className="w-24 accent-green-600 h-1.5 bg-slate-200 rounded"
                onInput={(e) => handleEnvChange('volt', e.currentTarget.value)}
              />
              <span className="text-xs font-mono font-bold text-green-600 w-10 text-right">{meterUI.volt}V</span>
            </div>

            <div className="mb-3 bg-white p-2 border rounded">
              <div className="flex justify-between mb-1">
                <span className="text-xs font-bold">통신 감도</span>
                <span className="text-xs font-mono">{modemUI.rsrp}dBm</span>
              </div>
              <input 
                type="range" min="-140" max="-60" defaultValue="-90"
                className="w-full accent-purple-500 h-1.5 bg-slate-200 rounded"
                onInput={(e) => handleModemConfig('rsrp', e.currentTarget.value)}
              />
              <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
                <input type="checkbox" className="accent-red-500" onChange={(e) => handleModemConfig('ackFail', e.target.checked)} />
                <span>서버 무응답 (ACK Fail)</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[10px] text-slate-500">검침주기</label>
                <select 
                  className="w-full text-xs border rounded p-1.5 bg-white outline-none"
                  value={modemUI.readPeriod}
                  onChange={(e) => updatePeriods(Number(e.target.value), modemUI.reportPeriod)}
                >
                  {[1,2,3,4,6,8,12,24].map(v => <option key={v} value={v}>{v}H</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500">보고주기</label>
                <select 
                  className="w-full text-xs border rounded p-1.5 bg-white outline-none"
                  value={modemUI.reportPeriod}
                  onChange={(e) => updatePeriods(modemUI.readPeriod, Number(e.target.value))}
                >
                  {[1,2,3,4,6,8,12,24].map(v => <option key={v} value={v}>{v}H</option>)}
                </select>
              </div>
            </div>

            <button 
              onClick={forceReport}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded shadow transition flex justify-center items-center gap-2"
            >
              <span>📡 즉시 보고 (Force Report)</span>
            </button>
          </div>
        </aside>

        {/* Center Visuals */}
        <main className="flex-1 bg-slate-100 p-6 flex flex-col items-center justify-center relative">
          {/* Pipeline */}
          <div className="w-full max-w-2xl flex items-center mb-16 relative">
            <div className="w-12 h-7 bg-slate-300 rounded-l flex items-center justify-center text-[9px] text-slate-500">In</div>
            <div className="flex-1 pipe-container bg-slate-300 relative overflow-hidden h-6 rounded-none">
               {/* Simplified Water Animation using CSS classes derived from flow state */}
               {meterUI.flow !== 0 && (
                 <div className={`absolute inset-0 opacity-60 bg-blue-400 ${meterUI.flow > 0 ? 'animate-[flow-fwd_1s_linear_infinite]' : 'animate-[flow-bwd_1s_linear_infinite]'}`} 
                      style={{ background: meterUI.flow > 0 ? 
                        'repeating-linear-gradient(45deg, #3b82f6, #3b82f6 10px, #60a5fa 10px, #60a5fa 20px)' : 
                        'repeating-linear-gradient(45deg, #ef4444, #ef4444 10px, #fca5a5 10px, #fca5a5 20px)'
                      }} 
                 />
               )}
            </div>
            
            {/* Meter Device */}
            <div className="relative z-10 w-52 bg-white rounded-xl shadow-lg border border-slate-200 p-4 flex flex-col items-center mx-[-2px]">
              <div className="w-full flex justify-between items-center mb-2 border-b pb-1">
                <span className="text-[9px] font-bold text-slate-400">DIGITAL METER V1.4</span>
                <span className="text-[9px] text-slate-400 font-mono">ID:11223344</span>
              </div>
              <div className="w-full bg-emerald-50 border border-emerald-100 rounded p-2 mb-2 text-right">
                <span className="font-mono text-xl font-bold text-emerald-800">{pad(meterUI.usage.toFixed(3), 9)}</span>
                <span className="text-[10px] text-emerald-600 font-bold ml-1">m³</span>
              </div>
              <div className="w-full flex justify-between items-center h-6">
                <div className={`w-6 h-6 rounded-full border-2 border-slate-200 flex items-center justify-center text-xs text-slate-400 ${meterUI.flow !== 0 ? 'animate-spin' : ''}`}>⚙️</div>
                <div className="flex gap-1 text-sm">
                   {meterUI.alarms.freeze >= 60000 && <span>❄️</span>}
                   {meterUI.alarms.magnet >= 300000 && <span>🧲</span>}
                   {meterUI.leak && <span>💧</span>}
                   {meterUI.alarms.backflow >= 60000 && <span>↩️</span>}
                </div>
              </div>
            </div>

            <div className="flex-1 pipe-container bg-slate-300 relative overflow-hidden h-6 rounded-none">
               {meterUI.flow !== 0 && (
                 <div className={`absolute inset-0 opacity-60 bg-blue-400 ${meterUI.flow > 0 ? 'animate-[flow-fwd_1s_linear_infinite]' : 'animate-[flow-bwd_1s_linear_infinite]'}`} 
                      style={{ background: meterUI.flow > 0 ? 
                        'repeating-linear-gradient(45deg, #3b82f6, #3b82f6 10px, #60a5fa 10px, #60a5fa 20px)' : 
                        'repeating-linear-gradient(45deg, #ef4444, #ef4444 10px, #fca5a5 10px, #fca5a5 20px)'
                      }} 
                 />
               )}
            </div>
            <div className="w-12 h-7 bg-slate-300 rounded-r flex items-center justify-center text-[9px] text-slate-500">Out</div>
          </div>

          {/* Terminal */}
          <div className="flex flex-col items-center relative">
            <div className="h-10 w-1.5 bg-gray-800"></div>
            <div className="w-48 bg-slate-800 rounded-lg shadow-2xl p-4 text-white border-t-4 border-blue-500 relative transition-transform">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-400">SMART TERMINAL</div>
                  <div className="text-[8px] text-slate-500">NB-IoT Model-S</div>
                </div>
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]"></div>
                  <div className={`w-2 h-2 rounded-full ${modemUI.mode === 'SEND' || modemUI.mode === 'CONNECT' ? 'bg-yellow-400 shadow-[0_0_5px_yellow]' : 'bg-slate-600'}`}></div>
                </div>
              </div>
              
              <div className="bg-black/30 rounded p-2 text-center mb-2 border border-slate-600">
                <div className={`font-mono text-sm font-bold ${modemUI.mode === 'SLEEP' ? 'text-gray-400' : 'text-yellow-400'}`}>
                  {modemUI.mode}
                </div>
                <div className="text-[9px] text-slate-400 mt-1 flex justify-center gap-2">
                  <span>Next: <span className="text-white">{new Date(modemUI.nextReport).toLocaleTimeString()}</span></span>
                </div>
              </div>

              <div className="flex justify-between items-end text-[9px] text-slate-400">
                <div className="flex items-center gap-1"><span>📶</span><span>{modemUI.rsrp}dBm</span></div>
                <div>{meterUI.volt}V</div>
              </div>

              {/* Buffer Badge */}
              <div className="absolute top-[-25px] left-0 w-full flex justify-center">
                <div className="bg-gray-700 text-[9px] text-white px-2 py-0.5 rounded-full shadow border border-gray-600 flex items-center gap-1">
                  <span>📦 Buffer:</span>
                  <span className="font-bold text-blue-300">{modemUI.bufferSize}</span>
                  <span className="text-gray-500">/ 24</span>
                </div>
              </div>

              {/* Alert Badges */}
              <div className="absolute -top-14 -right-24 w-32 flex flex-col gap-1 items-start">
                 {meterUI.alarms.freeze >= 60000 && <span className="bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow">❄️ 동파</span>}
                 {meterUI.alarms.magnet >= 300000 && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow">🧲 자석</span>}
                 {meterUI.leak && <span className="bg-yellow-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow">💧 누수</span>}
              </div>
            </div>

            {/* Packet Animation Line */}
            <div className="relative h-0.5 bg-slate-300 w-40 mt-3 ml-6 hidden lg:block">
               {modemUI.mode === 'SEND' && (
                 <div className="absolute top-[-4px] w-3 h-3 bg-purple-600 rounded-full animate-[send-packet_0.8s_ease-in_forwards]" />
               )}
               <div className="absolute -top-4 text-[9px] text-slate-400 w-full text-center">NB-IoT Network</div>
            </div>
          </div>

          {/* Server */}
          <div className="absolute right-10 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center opacity-70">
             <div className="w-20 h-24 bg-indigo-900 rounded-lg shadow-xl border-b-4 border-indigo-950 p-2 flex flex-col justify-center gap-1.5">
                <div className="w-full h-1 bg-indigo-700/50 rounded"><div className="h-full w-1/2 bg-indigo-400 animate-pulse"></div></div>
                <div className="w-full h-1 bg-indigo-700/50 rounded"><div className="h-full w-3/4 bg-indigo-400 animate-pulse" style={{animationDelay:'0.2s'}}></div></div>
                <div className="w-full h-1 bg-indigo-700/50 rounded"><div className="h-full w-1/3 bg-indigo-400 animate-pulse" style={{animationDelay:'0.4s'}}></div></div>
             </div>
             <div className="mt-2 text-[10px] font-bold text-indigo-900">AMI SERVER</div>
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="w-96 bg-white border-l flex flex-col z-10 shadow-sm">
          <div className="flex border-b text-xs font-bold text-slate-500 bg-white">
            <button 
              onClick={() => setActiveTab('sys')} 
              className={`flex-1 py-3 text-center transition ${activeTab === 'sys' ? 'border-b-2 border-blue-600 text-blue-700 bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              System Log
            </button>
            <button 
              onClick={() => setActiveTab('pkt')} 
              className={`flex-1 py-3 text-center transition ${activeTab === 'pkt' ? 'border-b-2 border-purple-600 text-purple-700 bg-purple-50' : 'hover:bg-slate-50'}`}
            >
              Packet Log
            </button>
          </div>
          <div className="px-3 py-1 flex justify-end bg-slate-50 border-b">
             <button onClick={clearLogs} className="text-[10px] text-gray-400 hover:text-red-500 underline">CLEAR ALL</button>
          </div>

          {/* Log Views */}
          {activeTab === 'sys' ? (
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] text-slate-600 leading-relaxed">
              <div className="text-blue-600 font-bold mb-2">--- System Ready ---</div>
              {sysLogs.map(log => (
                <div key={log.id} className="mb-1 border-b border-slate-50 pb-0.5">
                  <span className="text-[9px] text-slate-300 mr-2">[{log.time}]</span>
                  <span className={
                    log.type === 'tx' ? 'text-purple-600 font-bold' :
                    log.type === 'rx' ? 'text-green-600 font-bold' :
                    log.type === 'err' ? 'text-red-500 font-bold' :
                    log.type === 'alarm' ? 'text-red-600 font-bold bg-red-50 px-1 rounded' :
                    'text-slate-500'
                  }>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] text-slate-800 whitespace-pre leading-relaxed select-all bg-gray-50">
              {packetLogs.map(log => (
                <div key={log.id} className="mb-1 border-b border-gray-200 pb-1">
                  <span className="text-blue-500 font-bold">{log.time}</span>
                  <span className="ml-4">{log.hex}</span>
                </div>
              ))}
            </div>
          )}

          {/* Debug Info */}
          <div className="h-40 border-t bg-slate-50 p-3 overflow-y-auto text-[10px] font-mono">
            <h4 className="font-bold text-slate-400 mb-1">INTERNAL MEMORY (Protocol Data)</h4>
            <div className="grid grid-cols-2 gap-x-2">
              <div className="flex justify-between border-b pb-0.5"><span>Usage:</span> <span className="text-blue-600">{meterUI.usage.toFixed(3)}</span></div>
              <div className="flex justify-between border-b pb-0.5"><span>Buffer:</span> <span>{modemUI.bufferSize}</span></div>
              <div className="flex justify-between border-b pb-0.5"><span>Retry:</span> <span className="text-red-500">{modemUI.retryCount}</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}