<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>서울아리수본부 AMI 정밀 시뮬레이터 (Ultimate Fixed)</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: 'Noto Sans KR', sans-serif; background-color: #f1f5f9; }
        .font-mono { font-family: 'Courier New', monospace; }
        
        .pipe-container { position: relative; height: 28px; background: #e2e8f0; border-radius: 14px; overflow: hidden; border: 2px solid #94a3b8; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
        .water-stream { position: absolute; top: 0; left: 0; bottom: 0; width: 100%; background: repeating-linear-gradient(45deg, #3b82f6, #3b82f6 10px, #60a5fa 10px, #60a5fa 20px); opacity: 0.7; }
        .stream-fwd { animation: flow-fwd 1s linear infinite; }
        .stream-bwd { animation: flow-bwd 1s linear infinite; background: repeating-linear-gradient(45deg, #ef4444, #ef4444 10px, #fca5a5 10px, #fca5a5 20px); }
        .stream-stop { display: none; }
        @keyframes flow-fwd { from { background-position: 0 0; } to { background-position: 28px 0; } }
        @keyframes flow-bwd { from { background-position: 0 0; } to { background-position: -28px 0; } }

        .packet-path { position: relative; height: 2px; background: #cbd5e1; width: 100%; margin: 10px 0; }
        .packet-obj { position: absolute; width: 12px; height: 12px; border-radius: 6px; background: #7c3aed; top: -5px; opacity: 0; display: flex; align-items: center; justify-content: center; color: white; font-size: 8px; font-weight: bold; }
        .anim-send { animation: send-packet 0.5s ease-in-out forwards; }
        @keyframes send-packet { 0% { left: 0; opacity: 1; transform: scale(1); } 50% { transform: scale(1.2); } 100% { left: 100%; opacity: 0; transform: scale(0.5); } }

        .gauge-bg { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 4px; border:1px solid #cbd5e1; }
        .gauge-fill { height: 100%; width: 0%; transition: width 0.2s linear; }
        .gauge-fill.warning { background-color: #fbbf24; }
        .gauge-fill.danger { background-color: #ef4444; }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
    </style>
</head>
<body class="text-slate-800 h-screen flex flex-col overflow-hidden">

    <header class="bg-white border-b px-5 py-3 flex justify-between items-center shadow-sm z-20">
        <div class="flex items-center gap-3">
            <span class="text-2xl">💧</span>
            <div>
                <h1 class="text-lg font-bold text-slate-800 leading-none">서울아리수 AMI 정밀 시뮬레이터</h1>
                <p class="text-[10px] text-slate-500 font-mono mt-0.5">NB-IoT V2.0 (0xB1) | Digital V1.4</p>
            </div>
        </div>
        <div class="flex items-center gap-6">
            <div class="text-right">
                <div class="text-[10px] text-slate-400 font-bold">PROTOCOL STATUS</div>
                <div class="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">V2.0 (0xB1) Active</div>
            </div>
            <div class="h-8 w-px bg-slate-200"></div>
            <div class="text-right">
                <div class="text-[10px] text-slate-400 font-bold">VIRTUAL TIME</div>
                <div id="clockDisplay" class="font-mono text-lg font-bold text-blue-600">0000-00-00 00:00:00</div>
            </div>
        </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
        <aside class="w-80 bg-white border-r flex flex-col overflow-y-auto shadow-sm z-10">
            <div class="p-4 border-b">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-xs font-bold text-slate-500 uppercase">System Time</h3>
                    <span id="speedLabel" class="text-xs font-mono font-bold text-red-500">x1</span>
                </div>
                <input type="range" min="0" max="4" step="1" value="1" class="w-full accent-blue-600 h-1.5 bg-slate-200 rounded cursor-pointer mb-1" oninput="updateSpeed(this.value)">
                <div class="flex justify-between text-[9px] text-slate-400 font-mono">
                    <span>PAUSE</span><span>x1</span><span>x60</span><span>x1H</span><span>MAX</span>
                </div>
            </div>

            <div class="p-4 border-b bg-slate-50/50">
                <h3 class="text-xs font-bold text-slate-500 uppercase mb-3">Event Monitors</h3>
                <div class="mb-3 bg-white p-2 rounded border border-slate-200 shadow-sm">
                    <div class="flex justify-between items-center mb-1">
                        <label class="text-xs font-bold text-slate-700">온도 (동파)</label>
                        <span id="tempVal" class="text-xs font-mono font-bold text-orange-500">15 °C</span>
                    </div>
                    <input type="range" min="-20" max="40" value="15" class="w-full accent-orange-500 h-1.5 bg-slate-200 rounded" oninput="updateEnv('temp', this.value)">
                    <div class="mt-2">
                        <div class="flex justify-between text-[9px] text-slate-500"><span>조건: 0℃ 이하 1분</span><span id="stateFreeze" class="text-slate-300">정상</span></div>
                        <div class="gauge-bg"><div id="gaugeFreeze" class="gauge-fill warning"></div></div>
                    </div>
                </div>
                <div class="mb-3 bg-white p-2 rounded border border-slate-200 shadow-sm">
                    <div class="flex justify-between items-center mb-1">
                        <label class="text-xs font-bold text-slate-700">유량 (L/h)</label>
                        <span id="flowVal" class="text-xs font-mono font-bold text-blue-600">0</span>
                    </div>
                    <input type="range" min="-2000" max="2500" value="0" step="50" class="w-full accent-blue-500 h-1.5 bg-slate-200 rounded" oninput="updateEnv('flow', this.value)">
                    <div class="mt-2 grid grid-cols-2 gap-2">
                        <div>
                            <div class="flex justify-between text-[9px] text-slate-500"><span>과부하(5분)</span><span id="stateOver" class="text-slate-300">-</span></div>
                            <div class="gauge-bg"><div id="gaugeOver" class="gauge-fill warning"></div></div>
                        </div>
                        <div>
                            <div class="flex justify-between text-[9px] text-slate-500"><span>역류(1분)</span><span id="stateBack" class="text-slate-300">-</span></div>
                            <div class="gauge-bg"><div id="gaugeBack" class="gauge-fill warning"></div></div>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-white p-2 rounded border border-slate-200 shadow-sm">
                        <label class="flex justify-between items-center cursor-pointer mb-1"><span class="text-xs font-bold">🧲 자석</span><input type="checkbox" id="swMagnet" class="accent-red-500" onchange="updateEnv('magnet', this.checked)"></label>
                        <div class="text-[9px] text-slate-400 mb-1">조건: 5분 지속</div>
                        <div class="gauge-bg"><div id="gaugeMag" class="gauge-fill danger"></div></div>
                    </div>
                    <div class="bg-white p-2 rounded border border-slate-200 shadow-sm">
                        <label class="flex justify-between items-center cursor-pointer mb-1"><span class="text-xs font-bold">💧 누수</span><input type="checkbox" id="swLeak" class="accent-yellow-500" onchange="updateEnv('leak', this.checked)"></label>
                        <div class="text-[9px] text-slate-400 mb-1">조건: 7일 (강제)</div>
                        <div class="gauge-bg"><div id="gaugeLeak" class="gauge-fill warning" style="width:0%"></div></div>
                    </div>
                </div>
            </div>

            <div class="p-4">
                <h3 class="text-xs font-bold text-slate-500 uppercase mb-3">Hardware & Config</h3>
                <div class="mb-3 flex justify-between items-center bg-white p-2 border rounded">
                    <span class="text-xs font-bold">배터리</span>
                    <input type="range" min="2.5" max="3.7" step="0.1" value="3.6" class="w-24 accent-green-600 h-1.5 bg-slate-200 rounded" oninput="updateEnv('bat', this.value)">
                    <span id="batVal" class="text-xs font-mono font-bold text-green-600 w-10 text-right">3.6V</span>
                </div>
                <div class="mb-3 bg-white p-2 border rounded">
                    <div class="flex justify-between mb-1"><span class="text-xs font-bold">통신 감도</span><span id="rsrpVal" class="text-xs font-mono">-90dBm</span></div>
                    <input type="range" min="-140" max="-60" value="-90" class="w-full accent-purple-500 h-1.5 bg-slate-200 rounded" oninput="updateEnv('rsrp', this.value)">
                    <label class="flex items-center gap-2 mt-2 text-xs"><input type="checkbox" id="swAckFail" class="accent-red-500" onchange="updateEnv('ackFail', this.checked)"><span>서버 무응답 (ACK Fail)</span></label>
                </div>
                <div class="grid grid-cols-2 gap-2 mb-2">
                    <div><label class="text-[10px] text-slate-500">검침주기</label><select id="selReadPeriod" class="w-full text-xs border rounded p-1.5 bg-white outline-none" onchange="updateConfig()"><option value="1" selected>1H</option><option value="2">2H</option><option value="3">3H</option><option value="4">4H</option><option value="6">6H</option><option value="8">8H</option><option value="12">12H</option><option value="24">24H</option></select></div>
                    <div><label class="text-[10px] text-slate-500">보고주기</label><select id="selReportPeriod" class="w-full text-xs border rounded p-1.5 bg-white outline-none" onchange="updateConfig()"><option value="1">1H</option><option value="2">2H</option><option value="3">3H</option><option value="4">4H</option><option value="6" selected>6H</option><option value="8">8H</option><option value="12">12H</option><option value="24">24H</option></select></div>
                </div>
                <div id="configMsg" class="text-[10px] text-center mb-2 text-slate-400">설정 대기 중...</div>
                <button onclick="forceReport()" class="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded shadow transition flex justify-center items-center gap-2"><span>📡 즉시 보고 (Force Report)</span></button>
            </div>
        </aside>

        <main class="flex-1 bg-slate-100 p-6 flex flex-col items-center justify-center relative">
            <div class="absolute inset-0 pointer-events-none overflow-hidden">
                <div id="fxFreeze" class="hidden absolute top-8 right-8 text-4xl animate-pulse" title="한파주의보">❄️</div>
            </div>
            <div class="w-full max-w-2xl flex items-center mb-16 relative">
                <div class="w-12 h-7 bg-slate-300 rounded-l flex items-center justify-center text-[9px] text-slate-500">In</div>
                <div class="flex-1 pipe-container"><div id="waterStream1" class="water-stream stream-stop"></div></div>
                <div class="relative z-10 w-52 bg-white rounded-xl shadow-lg border border-slate-200 p-4 flex flex-col items-center mx-[-2px]">
                    <div class="w-full flex justify-between items-center mb-2 border-b pb-1"><span class="text-[9px] font-bold text-slate-400">DIGITAL METER V1.4</span><span class="text-[9px] text-slate-400 font-mono">ID:11223344</span></div>
                    <div class="w-full bg-emerald-50 border border-emerald-100 rounded p-2 mb-2 text-right"><span id="meterReadout" class="font-mono text-xl font-bold text-emerald-800">00000.000</span><span class="text-[10px] text-emerald-600 font-bold ml-1">m³</span></div>
                    <div class="w-full flex justify-between items-center h-6"><div id="meterSpinner" class="w-6 h-6 rounded-full border-2 border-slate-200 flex items-center justify-center text-xs grayscale opacity-20">⚙️</div><div id="meterStatusIcons" class="flex gap-1 text-sm"></div></div>
                    <div class="absolute -right-8 top-1/2 w-8 h-1.5 bg-gray-800 rounded-full"></div>
                </div>
                <div class="flex-1 pipe-container"><div id="waterStream2" class="water-stream stream-stop"></div></div>
                <div class="w-12 h-7 bg-slate-300 rounded-r flex items-center justify-center text-[9px] text-slate-500">Out</div>
            </div>
            <div class="flex flex-col items-center relative">
                <div class="h-10 w-1.5 bg-gray-800"></div>
                <div class="w-48 bg-slate-800 rounded-lg shadow-2xl p-4 text-white border-t-4 border-blue-500 relative">
                    <div class="flex justify-between items-start mb-3">
                        <div><div class="text-[10px] font-bold text-slate-400">SMART TERMINAL</div><div class="text-[8px] text-slate-500">NB-IoT Model-S</div></div>
                        <div class="flex gap-1"><div id="ledPwr" class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]"></div><div id="ledTx" class="w-2 h-2 rounded-full bg-slate-600"></div></div>
                    </div>
                    <div class="bg-black/30 rounded p-2 text-center mb-2 border border-slate-600">
                        <div id="modemState" class="font-mono text-sm font-bold text-yellow-400">SLEEP</div>
                        <div class="text-[9px] text-slate-400 mt-1 flex justify-center gap-2"><span>Next: <span id="nextTimeDisplay" class="text-white">--:--</span></span></div>
                    </div>
                    <div class="flex justify-between items-end text-[9px] text-slate-400">
                        <div class="flex items-center gap-1"><span id="signalIcon">📶</span><span id="modemRsrp">-90dBm</span></div><div id="modemBatText">3.6V</div>
                    </div>
                    <div class="absolute top-[-25px] left-0 w-full flex justify-center">
                        <div class="bg-gray-700 text-[9px] text-white px-2 py-0.5 rounded-full shadow border border-gray-600 flex items-center gap-1">
                            <span>📦 Buffer:</span><span id="bufferCountDisplay" class="font-bold text-blue-300">0</span>
                        </div>
                    </div>
                    <div id="modemAlerts" class="absolute -top-14 -right-24 w-32 flex flex-col gap-1 items-start"></div>
                </div>
                <div class="packet-path w-40 absolute left-full top-1/2 ml-6 hidden lg:block"><div class="absolute -top-4 text-[9px] text-slate-400 w-full text-center">NB-IoT Network</div><div id="packetObj" class="packet-obj">📦</div></div>
            </div>
            <div class="absolute right-10 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center opacity-70">
                <div class="w-20 h-24 bg-indigo-900 rounded-lg shadow-xl border-b-4 border-indigo-950 p-2 flex flex-col justify-center gap-1.5">
                    <div class="w-full h-1 bg-indigo-700/50 rounded"><div class="h-full w-1/2 bg-indigo-400 animate-pulse"></div></div>
                    <div class="w-full h-1 bg-indigo-700/50 rounded"><div class="h-full w-3/4 bg-indigo-400 animate-pulse" style="animation-delay:0.2s"></div></div>
                    <div class="w-full h-1 bg-indigo-700/50 rounded"><div class="h-full w-1/3 bg-indigo-400 animate-pulse" style="animation-delay:0.4s"></div></div>
                </div>
                <div class="mt-2 text-[10px] font-bold text-indigo-900">AMI SERVER</div>
            </div>
        </main>

        <aside class="w-96 bg-white border-l flex flex-col z-10 shadow-sm">
            <div class="flex border-b text-xs font-bold text-slate-500 bg-white">
                <button onclick="uiLogTab('sys')" id="tabSys" class="flex-1 py-3 text-center border-b-2 border-blue-600 text-blue-700 bg-blue-50 transition">System Log</button>
                <button onclick="uiLogTab('pkt')" id="tabPkt" class="flex-1 py-3 text-center hover:bg-slate-50 transition">Packet Log</button>
            </div>
            <div class="px-3 py-1 flex justify-end bg-slate-50 border-b">
                 <button onclick="clearLogs()" class="text-[10px] text-gray-400 hover:text-red-500 underline">CLEAR ALL</button>
            </div>
            <div id="logContainer" class="flex-1 overflow-y-auto p-3 font-mono text-[11px] text-slate-600 custom-scroll leading-relaxed"><div class="text-blue-600 font-bold mb-2">--- System Ready ---</div></div>
            <div id="packetContainer" class="hidden flex-1 overflow-y-auto p-3 font-mono text-[11px] text-slate-800 custom-scroll whitespace-pre leading-relaxed select-all bg-gray-50"></div>
            <div class="h-40 border-t bg-slate-50 p-3 overflow-y-auto text-[10px] font-mono">
                <h4 class="font-bold text-slate-400 mb-1">INTERNAL MEMORY (Protocol Data)</h4>
                <div class="grid grid-cols-2 gap-x-2">
                    <div class="flex justify-between border-b pb-0.5"><span>Usage:</span> <span id="dbgUsage" class="text-blue-600">0.000</span></div>
                    <div class="flex justify-between border-b pb-0.5"><span>Buffer:</span> <span id="dbgBuf">0</span></div>
                    <div class="flex justify-between border-b pb-0.5"><span>Retry:</span> <span id="dbgRetry" class="text-red-500">0</span></div>
                    <div class="flex justify-between border-b pb-0.5" title="Digital V1.4 Status 1"><span>Status1:</span> <span id="dbgSt1">00</span></div>
                    <div class="flex justify-between border-b pb-0.5" title="Digital V1.4 Status 2"><span>Status2:</span> <span id="dbgSt2">00</span></div>
                </div>
            </div>
        </aside>

    </div>

    <script>
        const pad = (n,w) => (n+'').padStart(w,'0');
        const toHex = (n) => (n<0 ? (0xFF+n+1) : n).toString(16).toUpperCase().padStart(2,'0');
        const nowStr = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1,2)}-${pad(d.getDate(),2)} ${pad(d.getHours(),2)}:${pad(d.getMinutes(),2)}:${pad(d.getSeconds(),2)}`;

        const state = {
            running: true, speed: 1, time: new Date().getTime(), lastTick: Date.now(),
            temp: 15, flow: 0, volt: 3.6, magnet: false, leak: false, rsrp: -90, ackFail: false,
            usage: 123.456, alarms: { freeze:0, magnet:0, overload:0, backflow:0 },
            thresholds: { freeze:60000, magnet:300000, overload:300000, backflow:60000 },
            progress: { freeze:0, magnet:0, overload:0, backflow:0 },
            mode: "SLEEP", readPeriod: 3600*1000, reportPeriod: 6*3600*1000,
            nextRead: 0, nextReport: 0, buffer: [], retryCount: 0, forceReport: false,
            delayTimer: 0, lastAlarmState: { m:false, f:false }
        };
        const initT = Math.ceil(state.time / (3600*1000)) * (3600*1000);
        state.nextRead = initT; 
        state.nextReport = initT + (state.reportPeriod - (initT % state.reportPeriod));

        function loop() {
            if(!state.running) return requestAnimationFrame(loop);
            const now = Date.now();
            const realDelta = (now - state.lastTick) / 1000;
            state.lastTick = now;
            const speedMap = [0, 1, 60, 3600, 86400];
            const virtualDelta = realDelta * speedMap[state.speed];
            
            if(state.speed > 0) {
                const dtMs = virtualDelta * 1000;
                state.time += dtMs;
                updateMeter(virtualDelta);
                updateModemLogic(dtMs);
            }
            updateUI();
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);

        function updateMeter(dt) {
            const ms = dt * 1000;
            if(state.flow !== 0) state.usage += (state.flow / 1000 / 3600) * dt;
            updateTimer('freeze', state.temp <= 0, ms);
            updateTimer('overload', state.flow > 1600, ms);
            updateTimer('backflow', state.flow < 0, ms);
            updateTimer('magnet', state.magnet, ms);
        }
        function updateTimer(key, cond, ms) {
            const th = state.thresholds[key];
            if(cond) {
                if(state.alarms[key] < th) {
                    state.alarms[key] += ms;
                    if(state.alarms[key] >= th) sysLog(`[METER] ${key.toUpperCase()} 경보 발생!`, 'alarm');
                }
            } else state.alarms[key] = 0;
            state.progress[key] = Math.min(100, (state.alarms[key] / th) * 100);
        }

        // --- Modem Logic (Synchronous FSM) ---
        function updateModemLogic(dtMs) {
            // Emergency Check
            const isMag = state.alarms.magnet >= state.thresholds.magnet;
            const isFrz = state.alarms.freeze >= state.thresholds.freeze;
            if ((isMag && !state.lastAlarmState.m) || (isFrz && !state.lastAlarmState.f)) {
                sysLog(`[MODEM] 긴급 이벤트 -> 즉시 보고`, 'alarm');
                state.mode = "WAKE"; state.forceReport = true;
            }
            state.lastAlarmState = { m: isMag, f: isFrz };

            if(state.delayTimer > 0) {
                state.delayTimer -= dtMs;
                return; 
            }

            switch(state.mode) {
                case "SLEEP":
                    if (state.time >= state.nextRead) state.mode = "WAKE";
                    break;
                
                case "WAKE":
                    state.mode = "READ";
                    break;
                
                case "READ":
                    // 1. Read Meter
                    state.buffer.push({ time: state.nextRead, val: state.usage, st1: getStatus1(), st2: getStatus2() });
                    sysLog(`[METER] 검침 저장 (${state.buffer.length})`, 'meter');
                    
                    // 2. Schedule Next Read
                    state.nextRead += state.readPeriod;
                    
                    // 3. Check Report
                    // If current time passes Report Time OR Forced
                    // Important: Check if Report Time matches the Read Time slot we just processed
                    // Using tolerance for floating point time
                    if (state.time >= state.nextReport || state.forceReport) {
                        state.mode = "CONNECT";
                    } else {
                        state.mode = "SLEEP";
                    }
                    break;
                
                case "CONNECT":
                    state.delayTimer = 500 * (state.speed === 1 ? 1 : 0); // Visual delay only in 1x speed
                    state.mode = "SEND";
                    break;
                
                case "SEND":
                    // Packet Construction
                    const pkt = buildPacket();
                    const fmtPkt = pkt.match(/.{1,2}/g).join(' ');
                    sysLog(`[TX] 1 Packet Sent (Contains ${Math.min(state.buffer.length, 24)} Readings)`, 'tx');
                    packetLog(fmtPkt);
                    animPacket();
                    
                    // Advance Report Schedule
                    if(!state.forceReport) state.nextReport += state.reportPeriod;
                    state.forceReport = false;
                    
                    state.delayTimer = 500 * (state.speed === 1 ? 1 : 0);
                    state.mode = "WAIT";
                    break;
                
                case "WAIT":
                    if (state.ackFail) {
                        state.retryCount++;
                        sysLog(`[NET] ACK 실패 (Retry ${state.retryCount})`, 'err');
                        if(state.retryCount >= 3) {
                            sysLog(`[MODEM] 전송 실패. Sleep`, 'err');
                            state.retryCount = 0;
                            state.mode = "SLEEP";
                        } else {
                            state.mode = "CONNECT"; 
                        }
                    } else {
                        sysLog(`[RX] ACK 수신 (RSRP ${state.rsrp}dBm)`, 'rx');
                        // Clear Buffer (Max 24 items sent)
                        const sentCount = Math.min(state.buffer.length, 24);
                        state.buffer.splice(0, sentCount); 
                        state.retryCount = 0;
                        state.mode = "SLEEP";
                    }
                    break;
            }
        }

        function getStatus1() {
            let b = 0;
            if(state.alarms.overload >= state.thresholds.overload) b |= 0x80;
            if(state.alarms.backflow >= state.thresholds.backflow) b |= 0x40;
            if(state.leak) b |= 0x20;
            let bc = 0;
            if(state.volt < 3.7) {
                if(state.volt < 0.7) bc = 31;
                else bc = Math.floor((3.7 - state.volt) * 10) + 1;
                if(bc > 31) bc = 31;
            }
            b |= (bc & 0x1F);
            return b;
        }
        function getStatus2() {
            let b = 0;
            if(state.alarms.magnet >= state.thresholds.magnet) b |= 0x80;
            if(state.alarms.freeze >= state.thresholds.freeze) b |= 0x40;
            b |= 0x08; b |= 3;
            return b;
        }
        function buildPacket() {
            const p = [0xB1, 0x00, 0x70];
            pushBCD(p, "861921031229508F"); pushBCD(p, "450012345678901F");
            p.push(85, 0, 0,0,0,0, 0, Math.abs(state.rsrp), 0,0, 0xFC,0xFF);
            pushBCD(p, "0001234501"); p.push(0x02, 0x00, Math.round(state.volt * 10));
            pushBCD(p, "11223344"); p.push(0x02, 0x13);
            let s = 0;
            if(state.alarms.overload >= state.thresholds.overload) s |= 0x80;
            if(state.alarms.backflow >= state.thresholds.backflow) s |= 0x40;
            if(state.leak) s |= 0x20;
            if(state.alarms.magnet >= state.thresholds.magnet) s |= 0x10;
            if(state.alarms.freeze >= state.thresholds.freeze) s |= 0x08;
            p.push(s, 0x53);
            let t = Math.round(state.temp); if(t < 0) t = 256 + t;
            p.push(t & 0xFF, 0, 0, 0, 0x01, state.readPeriod/3600000, state.reportPeriod/3600000);
            const d = new Date(state.time);
            p.push(d.getFullYear()-2000, d.getMonth()+1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
            
            const cnt = Math.min(state.buffer.length, 24);
            p.push(0x01, cnt, 0x00);
            if(cnt > 0) {
                const lat = state.buffer[cnt-1];
                const r = Math.round(lat.val * 1000);
                p.push(r&0xFF, (r>>8)&0xFF, (r>>16)&0xFF, (r>>24)&0xFF);
                for(let i=1; i<cnt; i++) {
                    const prev = state.buffer[cnt - 1 - i];
                    const v = Math.round(prev.val * 1000);
                    p.push(v&0xFF, (v>>8)&0xFF, (v>>16)&0xFF, (v>>24)&0xFF);
                }
            } else p.push(0,0,0,0);
            
            p[1] = p.length + 1;
            let sum = 0; for(let i=1; i<p.length; i++) sum += p[i];
            p.push(sum & 0xFF);
            return p.map(b => b.toString(16).toUpperCase().padStart(2,'0')).join('');
        }
        function pushBCD(arr, str) { for(let i=0; i<str.length; i+=2) arr.push(parseInt(str.substr(i,2), 16)); }

        function updateUI() {
            document.getElementById('clockDisplay').innerText = nowStr(new Date(state.time));
            document.getElementById('meterReadout').innerText = pad(state.usage.toFixed(3), 9);
            const ws1=document.getElementById('waterStream1'), ws2=document.getElementById('waterStream2'), sp=document.getElementById('meterSpinner');
            if(state.flow === 0) { ws1.className=ws2.className="water-stream stream-stop"; sp.style.animationPlayState="paused"; }
            else if(state.flow > 0) { ws1.className=ws2.className="water-stream stream-fwd"; sp.style.animationPlayState="running"; sp.style.animationDirection="normal"; }
            else { ws1.className=ws2.className="water-stream stream-bwd"; sp.style.animationPlayState="running"; sp.style.animationDirection="reverse"; }
            setGauge('gaugeFreeze', state.progress.freeze, 'stateFreeze', state.alarms.freeze >= state.thresholds.freeze);
            setGauge('gaugeOver', state.progress.overload, 'stateOver', state.alarms.overload >= state.thresholds.overload);
            setGauge('gaugeBack', state.progress.backflow, 'stateBack', state.alarms.backflow >= state.thresholds.backflow);
            setGauge('gaugeMag', state.progress.magnet, null, state.alarms.magnet >= state.thresholds.magnet);
            const gl = document.getElementById('gaugeLeak'); gl.style.width=state.leak?"100%":"0%"; gl.className=state.leak?"gauge-fill warning":"gauge-fill";
            const stD = document.getElementById('modemState'); stD.innerText = state.mode; stD.className = `font-mono text-sm font-bold ${state.mode==='SLEEP'?'text-gray-400':'text-yellow-400'}`;
            document.getElementById('nextTimeDisplay').innerText = new Date(state.nextReport).toLocaleTimeString();
            document.getElementById('modemRsrp').innerText = state.rsrp + "dBm";
            document.getElementById('modemBatText').innerText = state.volt + "V";
            document.getElementById('bufferCountDisplay').innerText = state.buffer.length;
            
            let al = "";
            if(state.alarms.freeze >= state.thresholds.freeze) al += `<div class="bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded mb-1 shadow">❄️ 동파</div>`;
            if(state.alarms.magnet >= state.thresholds.magnet) al += `<div class="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded mb-1 shadow">🧲 자석</div>`;
            if(state.leak) al += `<div class="bg-yellow-500 text-white text-[9px] px-1.5 py-0.5 rounded mb-1 shadow">💧 누수</div>`;
            document.getElementById('modemAlerts').innerHTML = al;
            document.getElementById('dbgUsage').innerText = state.usage.toFixed(3);
            document.getElementById('dbgBuf').innerText = state.buffer.length;
            document.getElementById('dbgRetry').innerText = state.retryCount;
            document.getElementById('dbgSt1').innerText = "0x" + toHex(getStatus1());
            document.getElementById('dbgSt2').innerText = "0x" + toHex(getStatus2());
        }
        function setGauge(id, pct, txtId, trig) {
            document.getElementById(id).style.width = pct + "%";
            document.getElementById(id).className = `gauge-fill ${trig ? 'danger' : 'warning'}`;
            if(txtId) {
                const t = document.getElementById(txtId); t.innerText = trig ? "발생" : (pct>0?"감지중":"-");
                t.className = trig ? "text-red-500 font-bold" : "text-slate-300";
            }
        }
        function animPacket() { const d=document.getElementById('packetObj'); d.classList.remove('anim-send'); void d.offsetWidth; d.classList.add('anim-send'); }
        function sysLog(msg, type) {
            const b = document.getElementById('logContainer');
            const d = document.createElement('div');
            let c = "text-slate-500";
            if(type==='tx') c="text-purple-600 font-bold"; if(type==='rx') c="text-green-600 font-bold";
            if(type==='err') c="text-red-500 font-bold"; if(type==='alarm') c="text-red-600 font-bold bg-red-50 p-1 rounded inline-block";
            d.innerHTML = `<span class="text-[9px] text-slate-300 mr-2">[${new Date(state.time).toLocaleTimeString()}]</span><span class="${c}">${msg}</span>`;
            d.className = "mb-1 border-b border-slate-50 pb-0.5";
            b.appendChild(d); b.scrollTop = b.scrollHeight;
        }
        function packetLog(rawHex) {
            const box = document.getElementById('packetContainer');
            const row = document.createElement('div');
            const t = nowStr(new Date(state.time));
            row.innerHTML = `<span class="text-blue-500 font-bold">${t}</span>\t${rawHex}`;
            row.className = "mb-1 border-b border-gray-200 pb-1 font-mono text-[10px]";
            box.appendChild(row);
            box.scrollTop = box.scrollHeight;
        }

        function uiLogTab(t) {
            const sys = document.getElementById('logContainer');
            const pkt = document.getElementById('packetContainer');
            const bS = document.getElementById('tabSys');
            const bP = document.getElementById('tabPkt');
            if(t==='sys') {
                sys.classList.remove('hidden'); pkt.classList.add('hidden');
                bS.className = "flex-1 py-3 text-center border-b-2 border-blue-600 text-blue-700 bg-blue-50 transition";
                bP.className = "flex-1 py-3 text-center hover:bg-slate-50 transition";
            } else {
                sys.classList.add('hidden'); pkt.classList.remove('hidden');
                bS.className = "flex-1 py-3 text-center hover:bg-slate-50 transition";
                bP.className = "flex-1 py-3 text-center border-b-2 border-purple-600 text-purple-700 bg-purple-50 transition";
            }
        }

        function updateSpeed(v) { state.speed = parseInt(v); document.getElementById('speedLabel').innerText = ["PAUSE","x1","x60","x1H","MAX"][v]; }
        function updateEnv(k, v) {
            if(k==='flow') { state.flow=parseInt(v); document.getElementById('flowVal').innerText=v; }
            if(k==='temp') { state.temp=parseInt(v); document.getElementById('tempVal').innerText=v+" °C"; }
            if(k==='bat') { state.volt=parseFloat(v); document.getElementById('batVal').innerText=v+"V"; }
            if(k==='magnet') state.magnet=v; if(k==='leak') state.leak=v;
            if(k==='rsrp') { state.rsrp=parseInt(v); document.getElementById('rsrpVal').innerText=v+"dBm"; }
            if(k==='ackFail') state.ackFail=v;
        }
        function updateConfig() {
            const rd=parseInt(document.getElementById('selReadPeriod').value), rp=parseInt(document.getElementById('selReportPeriod').value);
            const m = document.getElementById('configMsg');
            if(rp < rd) { m.innerText="⚠ 오류: 보고<검침"; m.className="text-[10px] text-center mb-2 text-red-500 font-bold"; return; }
            m.innerText="설정 변경 완료"; m.className="text-[10px] text-center mb-2 text-green-500";
            state.readPeriod=rd*3600000; state.reportPeriod=rp*3600000;
            state.nextRead=state.time+state.readPeriod; state.nextReport=state.time+state.reportPeriod;
            sysLog(`[CONFIG] 검침${rd}H/보고${rp}H`, 'info');
        }
        function forceReport() { state.forceReport=true; if(state.mode==='SLEEP') { sysLog(`[USER] 강제 보고`, 'info'); } }
        function clearLogs() { document.getElementById('logContainer').innerHTML=''; document.getElementById('packetContainer').innerHTML=''; }
    </script>
</body>
</html>