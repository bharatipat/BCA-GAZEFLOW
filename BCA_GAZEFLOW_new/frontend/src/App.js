// ╔══════════════════════════════════════════════════════════════╗
// ║  GAZEFLOW PROJECT — REACT DASHBOARD                           ║
// ║  • Gaze HEATMAP overlay (live canvas on cursor tab)        ║
// ║  • Cursor Speed Control Dashboard                          ║
// ║  • Voice Assistant PC Control                              ║
// ║            ║
// ╚══════════════════════════════════════════════════════════════╝
import React, { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://localhost:5000';

const C = {
  bg:'#030810', sf:'#070f1c', card:'#0a1628', bdr:'#0d2040',
  lo:'#00d4ff', lc:'#00ff9d', ro:'#ff6b35',  rc:'#ffcc02',
  pp:'#c084fc', tx:'#cce0f5', mu:'#2a4a6a',
};

function fmt(sec){
  if(!sec||sec<0) return '0s';
  const m=Math.floor(sec/60), s=sec%60;
  return s>0 ? `${m}m ${s}s` : `${m}m`;
}

function EyeIcon({ size=16, color='currentColor', style={} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         style={style}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

const TABS = [
  { id:'home',        label:'HOME',        icon: (c)=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id:'cursor',      label:'CURSOR',      icon: (c)=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg> },
  { id:'speed',       label:'SPEED',       icon: (c)=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M12 2a10 10 0 110 20A10 10 0 0112 2z"/><polyline points="12 6 12 12 16 14"/></svg> },
  { id:'voice',       label:'VOICE',       icon: (c)=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
  { id:'heatmap',     label:'HEATMAP',     icon: (c)=><EyeIcon size={15} color={c}/> },
  { id:'stats',       label:'STATS',       icon: (c)=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { id:'sessions',    label:'SESSIONS',    icon: (c)=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  
  { id:'screenshots', label:'SHOTS',       icon: (c)=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg> },
];

function PctMeter({ label, value, color, hint, showPct=true, height=8 }) {
  const pct = Math.min(100, Math.max(0, Number(value)||0));
  return (
    <div style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'10px 12px'}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
        <span style={{fontSize:9,color:C.mu,letterSpacing:1}}>{label}</span>
        {showPct && (
          <span style={{fontFamily:"'Orbitron',monospace",fontSize:15,fontWeight:700,color}}>
            {pct.toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{height,background:C.bdr,borderRadius:4,overflow:'hidden',marginBottom:4}}>
        <div style={{height:'100%',width:`${pct}%`,background:color,
                     borderRadius:4,boxShadow:`0 0 6px ${color}55`,
                     transition:'width .1s ease'}}/>
      </div>
      {hint && <div style={{fontSize:8,color:C.mu}}>{hint}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// HEATMAP CANVAS COMPONENT
// ════════════════════════════════════════════════════════
function GazeHeatmap({ points, width=600, height=400, showOverlay=false }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points || points.length === 0) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showOverlay) {
      ctx.fillStyle = '#030810';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(0,212,255,0.04)';
      ctx.lineWidth = 1;
      for (let x=0; x<canvas.width; x+=36) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
      for (let y=0; y<canvas.height; y+=36) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
    }
    const COLS=40, ROWS_H=30;
    const grid = Array.from({length:ROWS_H}, ()=>new Array(COLS).fill(0));
    let maxV = 0;
    for (const pt of points) {
      const nx = pt.gaze_norm_x ?? pt.x ?? 0.5;
      const ny = pt.gaze_norm_y ?? pt.y ?? 0.5;
      const ci = Math.min(COLS-1, Math.floor(nx * COLS));
      const ri = Math.min(ROWS_H-1, Math.floor(ny * ROWS_H));
      grid[ri][ci]++;
      if (grid[ri][ci] > maxV) maxV = grid[ri][ci];
    }
    if (maxV === 0) return;
    const cw = canvas.width / COLS;
    const ch = canvas.height / ROWS_H;
    const radius = Math.max(cw, ch) * 1.4;
    for (let r=0; r<ROWS_H; r++) {
      for (let c=0; c<COLS; c++) {
        const v = grid[r][c];
        if (v === 0) continue;
        const intensity = Math.min(1, v / maxV);
        const cx2 = (c + 0.5) * cw;
        const cy2 = (r + 0.5) * ch;
        const grad = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, radius);
        const a = intensity * 0.85;
        if (intensity < 0.25)       { grad.addColorStop(0, `rgba(0,100,255,${a})`);   grad.addColorStop(1, 'rgba(0,0,0,0)'); }
        else if (intensity < 0.5)   { grad.addColorStop(0, `rgba(0,220,255,${a})`);   grad.addColorStop(1, 'rgba(0,0,0,0)'); }
        else if (intensity < 0.75)  { grad.addColorStop(0, `rgba(0,255,120,${a})`);   grad.addColorStop(1, 'rgba(0,0,0,0)'); }
        else if (intensity < 0.9)   { grad.addColorStop(0, `rgba(255,220,0,${a})`);   grad.addColorStop(1, 'rgba(0,0,0,0)'); }
        else                        { grad.addColorStop(0, `rgba(255,60,0,${a})`);     grad.addColorStop(1, 'rgba(0,0,0,0)'); }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx2, cy2, radius, 0, Math.PI*2);
        ctx.fill();
      }
    }
    if (!showOverlay) {
      const lx = 10, ly = canvas.height - 22, lw = 160, lh = 12;
      const lg = ctx.createLinearGradient(lx, 0, lx+lw, 0);
      lg.addColorStop(0,   'rgba(0,100,255,0.9)');
      lg.addColorStop(0.33,'rgba(0,220,255,0.9)');
      lg.addColorStop(0.55,'rgba(0,255,120,0.9)');
      lg.addColorStop(0.75,'rgba(255,220,0,0.9)');
      lg.addColorStop(1,   'rgba(255,60,0,0.9)');
      ctx.fillStyle = lg;
      ctx.fillRect(lx, ly, lw, lh);
      ctx.fillStyle = 'rgba(200,220,240,0.85)';
      ctx.font = '9px monospace';
      ctx.fillText('Low', lx, ly-3);
      ctx.fillText('High', lx+lw-22, ly-3);
      ctx.strokeStyle='rgba(0,212,255,0.3)'; ctx.lineWidth=1;
      ctx.strokeRect(lx, ly, lw, lh);
    }
  }, [points, width, height, showOverlay]);
  return (
    <canvas ref={canvasRef} width={width} height={height}
      style={{width:'100%',height:'100%',display:'block',
              ...(showOverlay ? {position:'absolute',top:0,left:0,pointerEvents:'none'} : {})}}/>
  );
}

// ════════════════════════════════════════════════════════
// LIVE HEATMAP OVERLAY
// ════════════════════════════════════════════════════════
function LiveHeatmapOverlay({ points, visible }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!visible || !points || points.length === 0) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const COLS=50, ROWS_H=40;
    const grid = Array.from({length:ROWS_H}, ()=>new Array(COLS).fill(0));
    let maxV = 0;
    for (const pt of points) {
      const nx=pt.gaze_norm_x??pt.x??0.5;
      const ny=pt.gaze_norm_y??pt.y??0.5;
      const ci=Math.min(COLS-1,Math.floor(nx*COLS));
      const ri=Math.min(ROWS_H-1,Math.floor(ny*ROWS_H));
      grid[ri][ci]++;
      if(grid[ri][ci]>maxV) maxV=grid[ri][ci];
    }
    if(maxV===0) return;
    const cw=canvas.width/COLS, ch=canvas.height/ROWS_H;
    const radius=Math.max(cw,ch)*1.6;
    for(let r=0;r<ROWS_H;r++){
      for(let c=0;c<COLS;c++){
        const v=grid[r][c];
        if(v===0) continue;
        const intensity=Math.min(1,v/maxV);
        const cx2=(c+0.5)*cw, cy2=(r+0.5)*ch;
        const a=intensity*0.55;
        const grad=ctx.createRadialGradient(cx2,cy2,0,cx2,cy2,radius);
        if(intensity<0.33)      { grad.addColorStop(0,`rgba(0,100,255,${a})`);  grad.addColorStop(1,'rgba(0,0,0,0)'); }
        else if(intensity<0.66) { grad.addColorStop(0,`rgba(0,255,120,${a})`);  grad.addColorStop(1,'rgba(0,0,0,0)'); }
        else                    { grad.addColorStop(0,`rgba(255,60,0,${a})`);    grad.addColorStop(1,'rgba(0,0,0,0)'); }
        ctx.fillStyle=grad;
        ctx.beginPath();
        ctx.arc(cx2,cy2,radius,0,Math.PI*2);
        ctx.fill();
      }
    }
  }, [points, visible]);
  return (
    <canvas ref={canvasRef}
      style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',
              pointerEvents:'none',zIndex:9980,
              opacity: visible ? 1 : 0, transition:'opacity .3s'}}/>
  );
}

// ════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════
export default function App() {
  // Open large on first load
  useEffect(() => {
    try {
      const sw = window.screen.availWidth  || 1440;
      const sh = window.screen.availHeight || 900;
      window.resizeTo(Math.min(sw, 1440), Math.min(sh, 900));
      window.moveTo(0, 0);
    } catch(_) {}
  }, []);

  const [tab, setTab] = useState('home');
  const [st, setSt]   = useState({
    tracking:false, face_detected:false,
    gaze_x:0, gaze_y:0, gaze_x_pct:50, gaze_y_pct:50,
    gaze_norm_x:0.5, gaze_norm_y:0.5,
    blinks:0, double_blinks:0, right_clicks:0,
    close_dur:0, close_pct:0,
    left_ear:0, right_ear:0, left_ear_pct:0, right_ear_pct:0,
    screenshot_count:0, zoom_level:1, last_action:'',
    keys_typed:0, words_typed:0,
    cursor_speed:1.0, cursor_smooth:0.5, cursor_accel:false, cursor_deadzone:0.02,
    fatigue_level:0, drowsy_events:0, blink_rate_pm:0, eyes_closed_sec:0,
    focus_zones:{}, top_area:'—', focus_duration:0, productivity:0,
    eye_close_alerted_7:false, eye_close_alerted_10:false, eye_alert_level:0,
    fatigue_alert_shown:false, fatigue_alert_msg:'',
    heatmap_on:true, scroll_on:false,
    // session & time
    current_date:'', current_time:'', current_day:'',
    screen_time_sec:0, screen_time_str:'00:00:00',
    session_date:'', session_start_str:'--:--:--',
    total_sessions:0,
  });

  // Fatigue alert popup
  const [fatigueAlert,  setFatigueAlert]  = useState(null);
  const [eyeAlertLevel, setEyeAlertLevel] = useState(0);
  const [showEyeAlert,  setShowEyeAlert]  = useState(false);
  const [eyeAlertMsg,   setEyeAlertMsg]   = useState('');

  // Heatmap state
  const [heatPts,         setHeatPts]         = useState([]);
  const [liveHeatVisible, setLiveHeatVisible] = useState(false);
  const [heatmapSessions, setHeatmapSessions] = useState([]);
  const [fatigue,         setFatigue]         = useState({fatigue_level:0,drowsy_events:0,blink_rate_pm:0,eyes_closed_sec:0,focus_zones:{},top_area:'—',focus_duration:0,productivity:0});
  const [heatSelSession,  setHeatSelSession]  = useState(null);

  // Data tabs
  const [sessions,  setSessions]  = useState([]);
  const [todaySt,   setTodaySt]   = useState({});
  const [dailySt,   setDailySt]   = useState([]);
  const [allTime,   setAllTime]   = useState({});
  const [shots,     setShots]     = useState([]);
  const [logs,      setLogs]      = useState([
    {msg:'GazeFlow Project ready',type:'info'},
    {msg:'Click ▶ START TRACKING to begin',type:''},
  ]);

  const logRef     = useRef(null);
  const pollRef    = useRef(null);
  const heatPollRef= useRef(null);

  // Universal gaze-dwell for clickable elements
  const gazeRefs     = useRef({});
  const gazeBtnKey   = useRef(null);
  const gazeBtnStart = useRef(null);
  const gazeBtnFrame = useRef(null);
  const [gazeBtnHov, setGazeBtnHov] = useState(null);
  const [gazeBtnPct, setGazeBtnPct] = useState(0);
  const GAZE_BTN_MS  = 1200;
  const [selectedShot, setSelectedShot] = useState(null);

  // Cursor speed state
  const [cursorSpeed,    setCursorSpeed]    = useState(1.0);
  const [cursorSmooth,   setCursorSmooth]   = useState(0.5);
  const [cursorAccel,    setCursorAccel]    = useState(false);
  const [cursorDeadzone, setCursorDeadzone] = useState(0.02);
  const [speedSaving,    setSpeedSaving]    = useState(false);
  const [voiceStatus,    setVoiceStatus]    = useState({running:false,listening:false,log:[],speech_available:false,tts_available:false,last_command:'',last_result:''});
  const [voiceCmd,       setVoiceCmd]       = useState('');

  // Gaze scroll state
  const [scrollZone,    setScrollZone]    = useState(null);
  const [scrollSpeed,   setScrollSpeed]   = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [scrollEdge,    setScrollEdge]    = useState(0.14);
  const scrollRAF      = useRef(null);
  const scrollStateRef = useRef({ zone: null, spd: 0 });
  const prevTracking   = useRef(false);
  const SCROLL_BASE = 4;
  const SCROLL_MAX  = 32;

  const log = useCallback((msg, type='') => {
    const t = new Date().toLocaleTimeString();
    setLogs(p => [...p.slice(-100), {msg:`[${t}] ${msg}`, type}]);
  }, []);

  const alertAudioRef = useRef(null);
  const alertToneTimers = useRef([]);

  const playAlertSound = useCallback((level) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = alertAudioRef.current || new AudioCtx();
      alertAudioRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      alertToneTimers.current.forEach(clearTimeout);
      alertToneTimers.current = [];

      const pattern = level === 2
        ? [[0, 1320, 0.22], [280, 1320, 0.22], [560, 1320, 0.32]]
        : [[0, 880, 0.25], [340, 660, 0.25]];

      pattern.forEach(([delay, freq, duration]) => {
        const timer = setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = level === 2 ? 'square' : 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + duration + 0.03);
        }, delay);
        alertToneTimers.current.push(timer);
      });
    } catch {}
  }, []);

  useEffect(() => {
    return () => alertToneTimers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Load cursor speed on mount
  useEffect(() => {
    fetch(`${API}/cursor/settings`).then(r=>r.json()).then(d=>{
      setCursorSpeed(d.cursor_speed ?? 1.0);
      setCursorSmooth(d.cursor_smooth ?? 0.5);
      setCursorAccel(d.cursor_accel ?? false);
      setCursorDeadzone(d.cursor_deadzone ?? 0.02);
    }).catch(()=>{});
  }, []);

  const saveCursorSettings = useCallback(async (patch) => {
    setSpeedSaving(true);
    try {
      const r = await fetch(`${API}/cursor/settings`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(patch)
      });
      const d = await r.json();
      if (d.cursor_speed    !== undefined) setCursorSpeed(d.cursor_speed);
      if (d.cursor_smooth   !== undefined) setCursorSmooth(d.cursor_smooth);
      if (d.cursor_accel    !== undefined) setCursorAccel(d.cursor_accel);
      if (d.cursor_deadzone !== undefined) setCursorDeadzone(d.cursor_deadzone);
      log('⚙️ Cursor settings saved','info');
    } catch(e){ log('❌ Settings save failed','error'); }
    setTimeout(()=>setSpeedSaving(false), 600);
  }, [log]);

  const applyCursorPreset = useCallback(async (preset) => {
    try {
      const r = await fetch(`${API}/cursor/preset`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({preset})
      });
      const d = await r.json();
      if (d.cursor_speed    !== undefined) setCursorSpeed(d.cursor_speed);
      if (d.cursor_smooth   !== undefined) setCursorSmooth(d.cursor_smooth);
      if (d.cursor_accel    !== undefined) setCursorAccel(d.cursor_accel);
      if (d.cursor_deadzone !== undefined) setCursorDeadzone(d.cursor_deadzone);
      log(`⚙️ Preset "${preset}" applied`,'info');
    } catch(e){ log('❌ Preset failed','error'); }
  }, [log]);

  const loadVoiceStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/voice/status`);
      setVoiceStatus(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (tab !== 'voice') return;
    loadVoiceStatus();
    const iv = setInterval(loadVoiceStatus, 1200);
    return () => clearInterval(iv);
  }, [tab, loadVoiceStatus]);

  // Poll main status
  useEffect(() => {
    if (!st.tracking) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API}/status`);
        const d = await r.json();
        setSt(prev => ({...prev, ...d}));
        if (d.last_action === 'screenshot') log('📸 Screenshot taken!','info');
        if (d.last_action === 'zoom_in')    log('🔍 Zoom IN','info');
        if (d.last_action === 'zoom_out')   log('🔍 Zoom OUT','info');
      } catch {}
    }, 200);
    return () => clearInterval(pollRef.current);
  }, [st.tracking, log]);

  // Poll live heatmap
  useEffect(() => {
    if (!st.tracking) return;
    heatPollRef.current = setInterval(async () => {
      try { const r=await fetch(`${API}/heatmap/live`); const d=await r.json(); setHeatPts(d.points||[]); } catch {}
    }, 800);
    return () => clearInterval(heatPollRef.current);
  }, [st.tracking]);

  // Poll fatigue + analytics (from /status)
  useEffect(() => {
    if (!st.tracking) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/status`);
        const d = await r.json();
        setFatigue({
          fatigue_level:   d.fatigue_level   ?? 0,
          drowsy_events:   d.drowsy_events   ?? 0,
          blink_rate_pm:   d.blink_rate_pm   ?? 0,
          eyes_closed_sec: d.eyes_closed_sec ?? 0,
          focus_zones:     d.focus_zones     ?? {},
          top_area:        d.top_area        ?? '—',
          focus_duration:  d.focus_duration  ?? 0,
          productivity:    d.productivity    ?? 0,
        });
        if (d.fatigue_alert_shown && d.fatigue_alert_msg) {
          log('😴 ' + d.fatigue_alert_msg, 'warn');
          setFatigueAlert(d.fatigue_alert_msg);
        } else if (!d.fatigue_alert_shown) {
          setFatigueAlert(null);
        }
        setEyeAlertLevel(d.eye_alert_level || 0);
      } catch {}
    }, 1500);
    return () => clearInterval(iv);
  }, [st.tracking, log]);

  // Poll eye alert level (fast, 300ms)
  useEffect(() => {
    if (!st.tracking) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/status`);
        const d = await r.json();
        const lvl = d.eye_alert_level || 0;
        if (lvl !== eyeAlertLevel) {
          setEyeAlertLevel(lvl);
          if (lvl === 1) {
            setEyeAlertMsg('⚠️ Eyes closed 7 seconds! Open your eyes.');
            setShowEyeAlert(true);
            playAlertSound(1);
          }
          if (lvl === 2) {
            setEyeAlertMsg('🚨 WAKE UP! Eyes closed 10 seconds!');
            setShowEyeAlert(true);
            playAlertSound(2);
          }
          if (lvl === 0) { setShowEyeAlert(false); }
        }
        if (d.last_action === 'double_click') log('🖱️🖱️ Double-blink: OPEN (icon/image)','info');
      } catch {}
    }, 300);
    return () => clearInterval(iv);
  }, [st.tracking, eyeAlertLevel, log, playAlertSound]);

  const gazeCursorX = (st.gaze_x_pct / 100) * window.innerWidth;
  const gazeCursorY = (st.gaze_y_pct / 100) * window.innerHeight;

  // Universal gaze-button hit-test
  useEffect(() => {
    if (!st.tracking) return;
    const cx = (st.gaze_x_pct / 100) * window.innerWidth;
    const cy = (st.gaze_y_pct / 100) * window.innerHeight;
    let found = null;
    for (const [id, reg] of Object.entries(gazeRefs.current)) {
      if (!reg || !reg.el) continue;
      const r = reg.el.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) { found = id; break; }
    }
    if (found !== gazeBtnKey.current) {
      cancelAnimationFrame(gazeBtnFrame.current);
      setGazeBtnPct(0);
      gazeBtnKey.current   = found;
      gazeBtnStart.current = found ? performance.now() : null;
      setGazeBtnHov(found);
      if (found) animGazeBtn(found);
    }
  }, [st.gaze_x_pct, st.gaze_y_pct, st.tracking]);

  // Gaze edge-scroll
  useEffect(() => {
    if (!st.tracking || !scrollEnabled) {
      cancelAnimationFrame(scrollRAF.current);
      scrollStateRef.current = { zone: null, spd: 0 };
      setScrollZone(null); setScrollSpeed(0); return;
    }
    const loop = () => {
      const { zone, spd } = scrollStateRef.current;
      if (zone && spd > 0) {
        if      (zone==='down')  window.scrollBy(0,  spd);
        else if (zone==='up')    window.scrollBy(0, -spd);
        else if (zone==='right') window.scrollBy( spd, 0);
        else if (zone==='left')  window.scrollBy(-spd, 0);
      }
      scrollRAF.current = requestAnimationFrame(loop);
    };
    scrollRAF.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(scrollRAF.current);
  }, [st.tracking, scrollEnabled]);

  useEffect(() => {
    if (!st.tracking || !scrollEnabled) return;
    const xPct=st.gaze_x_pct/100, yPct=st.gaze_y_pct/100;
    let zone=null, depth=0;
    if      (yPct<scrollEdge)          { zone='up';    depth=1-yPct/scrollEdge; }
    else if (yPct>1-scrollEdge)        { zone='down';  depth=(yPct-(1-scrollEdge))/scrollEdge; }
    else if (xPct<scrollEdge)          { zone='left';  depth=1-xPct/scrollEdge; }
    else if (xPct>1-scrollEdge)        { zone='right'; depth=(xPct-(1-scrollEdge))/scrollEdge; }
    const spd=zone?Math.max(2,Math.round(SCROLL_BASE+Math.pow(depth,1.5)*(SCROLL_MAX-SCROLL_BASE))):0;
    scrollStateRef.current={zone,spd};
    setScrollZone(zone); setScrollSpeed(spd);
  }, [st.gaze_x_pct, st.gaze_y_pct, st.tracking, scrollEnabled, scrollEdge]);

  function animGazeBtn(targetId) {
    const start = gazeBtnStart.current;
    function step() {
      if (gazeBtnKey.current !== targetId) return;
      const pct = Math.min(100, ((performance.now()-start)/GAZE_BTN_MS)*100);
      setGazeBtnPct(pct);
      if (pct >= 100) {
        const reg = gazeRefs.current[targetId];
        if (reg && reg.onGazeClick) reg.onGazeClick();
        gazeBtnKey.current=null; gazeBtnStart.current=null;
        setGazeBtnHov(null); setGazeBtnPct(0); return;
      }
      gazeBtnFrame.current = requestAnimationFrame(step);
    }
    gazeBtnFrame.current = requestAnimationFrame(step);
  }

  function GazeBtn({ id, onClick, children, style={}, activeColor }) {
    const isHov = gazeBtnHov === id;
    const pct   = isHov ? gazeBtnPct : 0;
    const ac    = activeColor || C.lo;
    return (
      <div
        ref={el => { gazeRefs.current[id] = { el, onGazeClick: onClick }; }}
        onClick={onClick}
        style={{
          position:'relative', overflow:'hidden', cursor:'pointer',
          border:`2px solid ${isHov ? ac : C.bdr}`,
          boxShadow: isHov ? `0 0 16px ${ac}66` : 'none',
          transition:'border-color .1s, box-shadow .1s',
          ...style
        }}>
        {isHov && (
          <div style={{position:'absolute',bottom:0,left:0,height:3,
            width:`${pct}%`,background:ac,
            boxShadow:`0 0 8px ${ac}`,transition:'width .05s linear'}}/>
        )}
        {isHov && (
          <div style={{position:'absolute',inset:0,
            background:`rgba(${ac===C.lo?'0,212,255':ac==='#ff4444'?'255,0,0':'0,255,157'},0.07)`,
            pointerEvents:'none'}}/>
        )}
        {children}
      </div>
    );
  }

  // ── Actions ─────────────────────────────────────────────────────
  const toggleTracking = async () => {
    try {
      const r = await fetch(`${API}/toggle`, {method:'POST'});
      const d = await r.json();
      setSt(p=>({...p, tracking:d.tracking}));
      log(d.tracking ? '▶ Tracking STARTED' : '⏹ Tracking STOPPED', 'info');
    } catch { log('Connection error — is backend running?','err'); }
  };

  const takeScreenshot = async () => {
    try {
      const r = await fetch(`${API}/screenshot`, {method:'POST'});
      const d = await r.json();
      if(d.success){ log(`📸 ${d.filename}`,'info'); if(tab==='screenshots') loadScreenshots(); }
    } catch {}
  };

  const startVoice = async () => {
    try {
      const r = await fetch(`${API}/voice/start`, {method:'POST'});
      const d = await r.json();
      setVoiceStatus(d);
      log(d.message || 'Voice assistant started', d.ok ? 'info' : 'err');
    } catch { log('Voice start failed','err'); }
  };

  const stopVoice = async () => {
    try {
      const r = await fetch(`${API}/voice/stop`, {method:'POST'});
      const d = await r.json();
      setVoiceStatus(d);
      log(d.message || 'Voice assistant stopped','info');
    } catch { log('Voice stop failed','err'); }
  };

  const sendVoiceCommand = async (cmd) => {
    const command = (cmd || voiceCmd).trim();
    if (!command) return;
    try {
      const r = await fetch(`${API}/voice/command`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({command})
      });
      const d = await r.json();
      setVoiceCmd('');
      loadVoiceStatus();
      log(`🎙 ${command} → ${d.action || d.result}` , d.ok ? 'info' : 'err');
    } catch { log('Voice command failed','err'); }
  };

  const loadSessions    = async () => { try { const r=await fetch(`${API}/sessions?limit=20`); setSessions(await r.json()); } catch {} };
  const loadScreenshots = async () => { try { const r=await fetch(`${API}/screenshots`); setShots(await r.json()); } catch {} };
  const loadStats       = async () => {
    try {
      const [td,dl,at] = await Promise.all([
        fetch(`${API}/stats/today`).then(r=>r.json()),
        fetch(`${API}/stats/daily?days=7`).then(r=>r.json()),
        fetch(`${API}/stats/alltime`).then(r=>r.json()),
      ]);
      setTodaySt(td); setDailySt(dl); setAllTime(at);
    } catch {}
  };
  const loadHeatmapSessions = async () => {
    try { const r=await fetch(`${API}/sessions?limit=20`); setHeatmapSessions(await r.json()); } catch {}
  };
  const loadHeatmapSession = async (sid) => {
    try {
      const url = sid ? `${API}/heatmap/session?session_id=${sid}` : `${API}/heatmap/session`;
      const r = await fetch(url); const d = await r.json();
      setHeatPts(d.points||[]); setHeatSelSession(sid);
    } catch {}
  };

  useEffect(() => {
    if(tab==='sessions')    loadSessions();
    if(tab==='screenshots') loadScreenshots();
    if(tab==='stats')       loadStats();
    if(tab==='heatmap')     { loadHeatmapSessions(); loadHeatmapSession(null); }
  }, [tab]);

  // Auto-load stats on mount
  useEffect(() => { loadStats(); loadSessions(); }, []);

  // Reload sessions+stats when tracking stops (session just saved)
  useEffect(() => {
    if (prevTracking.current && !st.tracking) {
      setTimeout(() => { loadSessions(); loadStats(); }, 500);
    }
    prevTracking.current = st.tracking;
  }, [st.tracking]);

  const earLP = Math.min(100, Number(st.left_ear_pct)||0);
  const earRP = Math.min(100, Number(st.right_ear_pct)||0);
  const blinkP= Math.min(100, Number(st.close_pct)||0);

  // ════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════
  return (
    <div style={{background:C.bg,minHeight:'100vh',color:C.tx,
      fontFamily:"'Share Tech Mono',monospace",
      backgroundImage:`linear-gradient(rgba(0,212,255,.025) 1px,transparent 1px),
        linear-gradient(90deg,rgba(0,212,255,.025) 1px,transparent 1px)`,
      backgroundSize:'36px 36px'}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700;900&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#0d2040}
      button:hover{filter:brightness(1.1)}
      @keyframes fadeInDown{from{opacity:0;transform:translateY(-30px)}to{opacity:1;transform:translateY(0)}}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
      @keyframes blink-d{0%,100%{opacity:1}50%{opacity:.3}}
    `}</style>

    {/* ── FATIGUE ALERT POPUP ────────────────────────────────── */}
    {fatigueAlert && (
      <div style={{position:'fixed',top:24,left:'50%',transform:'translateX(-50%)',
        zIndex:9999,background:'#1a0a0a',border:'2px solid #ff4444',borderRadius:12,
        padding:'20px 32px',textAlign:'center',animation:'fadeInDown 0.4s ease',
        boxShadow:'0 0 40px #ff444488,0 4px 32px #0008',maxWidth:480,width:'90vw'}}>
        <div style={{fontSize:28,marginBottom:8}}>😴</div>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:14,color:'#ff6666',
          fontWeight:700,letterSpacing:2,marginBottom:8}}>FATIGUE DETECTED</div>
        <div style={{fontSize:13,color:'#ffaaaa',marginBottom:16}}>{fatigueAlert}</div>
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button onClick={()=>setFatigueAlert(null)}
            style={{padding:'8px 24px',background:'#ff4444',border:'none',borderRadius:6,
              color:'#fff',fontFamily:"'Orbitron',monospace",fontSize:11,cursor:'pointer',fontWeight:700}}>
            I'LL TAKE A BREAK
          </button>
          <button onClick={()=>setFatigueAlert(null)}
            style={{padding:'8px 20px',background:'transparent',border:'1px solid #ff4444',borderRadius:6,
              color:'#ff6666',fontFamily:"'Orbitron',monospace",fontSize:11,cursor:'pointer'}}>
            DISMISS
          </button>
        </div>
      </div>
    )}

    {/* ── EYE ALERT BANNER (7s=warning, 10s=critical) ─────────── */}
    {eyeAlertLevel > 0 && (
      <div style={{position:'fixed',top:0,left:0,right:0,zIndex:9998,
        background: eyeAlertLevel===2 ? '#7f0000' : '#7a4500',
        padding:'10px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:12,
        animation:'pulse 1s ease-in-out infinite',
        boxShadow:`0 2px 20px ${eyeAlertLevel===2?'#ff000088':'#ff880088'}`}}>
        <span style={{fontSize:20}}>{eyeAlertLevel===2?'🚨':'⚠️'}</span>
        <span style={{fontFamily:"'Orbitron',monospace",fontSize:12,color:'#fff',fontWeight:700,letterSpacing:2}}>
          {eyeAlertLevel===2
            ? 'CRITICAL — EYES CLOSED 10s — OPEN YOUR EYES NOW!'
            : 'WARNING — EYES CLOSED 7s — YOU LOOK TIRED, PLEASE TAKE A BREAK'}
        </span>
        <span style={{fontSize:20}}>{eyeAlertLevel===2?'🚨':'⚠️'}</span>
      </div>
    )}

    <LiveHeatmapOverlay points={heatPts} visible={liveHeatVisible && st.tracking} />

    {/* ── EYE CLOSE ALERT OVERLAY (7s warning / 10s critical) ── */}
    {showEyeAlert && (
      <div style={{
        position:'fixed', inset:0, zIndex:99999,
        display:'flex', alignItems:'center', justifyContent:'center',
        background: eyeAlertLevel === 2
          ? 'rgba(180,0,0,0.72)'
          : 'rgba(160,100,0,0.65)',
        backdropFilter:'blur(3px)',
        animation:'blink-d 0.6s infinite',
      }}>
        <div style={{
          background: eyeAlertLevel === 2 ? '#1a0000' : '#1a0f00',
          border:`3px solid ${eyeAlertLevel===2?'#ff2222':'#ffaa00'}`,
          borderRadius:12, padding:'32px 48px', textAlign:'center',
          boxShadow:`0 0 60px ${eyeAlertLevel===2?'#ff000088':'#ffaa0088'}`,
          maxWidth:480,
        }}>
          <div style={{fontSize:56, marginBottom:12}}>
            {eyeAlertLevel === 2 ? '🚨' : '⚠️'}
          </div>
          <div style={{
            fontFamily:"'Orbitron',monospace",
            fontSize: eyeAlertLevel===2 ? 22 : 18,
            fontWeight:900, letterSpacing:2,
            color: eyeAlertLevel===2 ? '#ff4444' : '#ffcc00',
            marginBottom:10,
          }}>
            {eyeAlertLevel===2 ? 'WAKE UP!' : 'WARNING'}
          </div>
          <div style={{fontSize:14, color:'#fff', lineHeight:1.6, marginBottom:18}}>
            {eyeAlertMsg}
          </div>
          <div style={{fontSize:11, color:'#aaa', letterSpacing:1}}>
            {eyeAlertLevel===2
              ? 'Eyes closed 10 seconds — alarm activated'
              : 'Eyes closed 7 seconds — alert activated'}
          </div>
          <button
            onClick={()=>setShowEyeAlert(false)}
            style={{marginTop:20,padding:'8px 24px',
              border:`1px solid ${eyeAlertLevel===2?'#ff4444':'#ffcc00'}`,
              background:'transparent',
              color:eyeAlertLevel===2?'#ff4444':'#ffcc00',
              fontFamily:"'Share Tech Mono',monospace",fontSize:11,
              cursor:'pointer',letterSpacing:1}}>
            DISMISS
          </button>
        </div>
      </div>
    )}

    {/* Eye cursor dot */}
    {st.tracking && st.face_detected && (
      <div style={{
        position:'fixed', left:gazeCursorX-14, top:gazeCursorY-14,
        width:28, height:28, pointerEvents:'none', zIndex:9998,
        transition:'left 0.05s linear, top 0.05s linear',
      }}>
        <div style={{position:'absolute',inset:0,borderRadius:'50%',
          border:`2px solid ${C.lo}`,boxShadow:`0 0 12px ${C.lo}88`,
          animation:'blink-d 2s infinite'}}/>
        <div style={{position:'absolute',top:'50%',left:'50%',
          transform:'translate(-50%,-50%)',width:8,height:8,borderRadius:'50%',
          background:C.lo,boxShadow:`0 0 8px ${C.lo}`}}/>
        <div style={{position:'absolute',top:'50%',left:0,right:0,height:1,background:`${C.lo}66`,transform:'translateY(-50%)'}}/>
        <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:`${C.lo}66`,transform:'translateX(-50%)'}}/>
      </div>
    )}

    {/* Gaze scroll zone indicators */}
    {st.tracking && scrollZone && (()=>{
      const intensity=Math.min(1,scrollSpeed/SCROLL_MAX);
      const glow=`rgba(0,212,255,${0.15+intensity*0.45})`;
      const bar=`rgba(0,212,255,${0.5+intensity*0.5})`;
      const base={position:"fixed",zIndex:9990,pointerEvents:"none"};
      if(scrollZone==="up") return (
        <div style={{...base,top:0,left:0,right:0,height:`${scrollEdge*100}vh`,
          background:`linear-gradient(to bottom,${glow},transparent)`,borderBottom:`2px solid ${bar}`}}>
          <div style={{position:"absolute",left:"50%",top:"25%",transform:"translateX(-50%)",
            display:"flex",flexDirection:"column",alignItems:"center",gap:4,
            fontFamily:"Orbitron,monospace",fontSize:12,fontWeight:700,
            color:"rgba(0,212,255,0.95)",textShadow:"0 0 10px #00d4ff"}}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            <span>SCROLL UP — {scrollSpeed}px/f</span>
          </div>
        </div>
      );
      if(scrollZone==="down") return (
        <div style={{...base,bottom:0,left:0,right:0,height:`${scrollEdge*100}vh`,
          background:`linear-gradient(to top,${glow},transparent)`,borderTop:`2px solid ${bar}`}}>
          <div style={{position:"absolute",left:"50%",bottom:"25%",transform:"translateX(-50%)",
            display:"flex",flexDirection:"column",alignItems:"center",gap:4,
            fontFamily:"Orbitron,monospace",fontSize:12,fontWeight:700,
            color:"rgba(0,212,255,0.95)",textShadow:"0 0 10px #00d4ff"}}>
            <span>SCROLL DOWN — {scrollSpeed}px/f</span>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
      );
      return null;
    })()}

    {/* TOP BAR */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'8px 16px',background:C.sf,borderBottom:`1px solid ${C.bdr}`,
      position:'sticky',top:0,zIndex:200,flexWrap:'wrap',gap:8}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <EyeIcon size={22} color={C.lo}/>
        <div>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:18,fontWeight:900,color:C.lo,letterSpacing:3}}>GAZEFLOW PROJECT</div>
          <div style={{fontSize:8,color:C.mu,letterSpacing:2}}>GAZE CONTROLLED PC — v4.0</div>
        </div>
      </div>
      <div style={{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:5,padding:'10px 16px',border:`1px solid ${C.bdr}`,fontSize:11}}>
          <div style={{width:7,height:7,borderRadius:'50%',
            background:st.tracking?C.lc:C.mu,boxShadow:st.tracking?`0 0 7px ${C.lc}`:'none',
            animation:st.tracking?'blink-d 1.2s infinite':'none'}}/>
          <span style={{color:st.tracking?C.lc:C.mu}}>{st.tracking?'TRACKING':'STOPPED'}</span>
        </div>
        <button onClick={()=>setLiveHeatVisible(p=>!p)}
          style={{padding:'10px 20px',border:`2px solid ${liveHeatVisible?C.lo:C.bdr}`,
            background:liveHeatVisible?'rgba(0,212,255,.1)':'transparent',
            color:liveHeatVisible?C.lo:C.mu,fontFamily:"'Share Tech Mono',monospace",fontSize:12,cursor:'pointer',
            display:'flex',alignItems:'center',gap:4}}>
          <EyeIcon size={12} color={liveHeatVisible?C.lo:C.mu}/>
          {liveHeatVisible?'HEAT ON':'HEAT OFF'}
        </button>
        <button onClick={()=>setScrollEnabled(p=>!p)}
          style={{padding:'10px 20px',border:`2px solid ${scrollEnabled?(scrollZone?C.lc:C.bdr):C.bdr}`,
            background:scrollEnabled&&scrollZone?'rgba(0,255,157,.08)':'transparent',
            color:scrollEnabled?(scrollZone?C.lc:C.mu):C.mu,
            fontFamily:"'Share Tech Mono',monospace",fontSize:12,cursor:'pointer',
            display:'flex',alignItems:'center',gap:4}}>
          {scrollEnabled?(scrollZone?`${scrollZone.toUpperCase()} ${scrollSpeed}px`:'SCROLL ON'):'SCROLL OFF'}
        </button>
        {scrollEnabled && (
          <div style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',border:`1px solid ${C.bdr}`}}>
            <span style={{fontSize:11,color:C.mu}}>ZONE</span>
            <input type="range" min="0.06" max="0.22" step="0.01" value={scrollEdge}
              onChange={e=>setScrollEdge(Number(e.target.value))}
              style={{width:52,accentColor:C.lc}}/>
            <span style={{fontSize:11,color:C.lc,minWidth:26,fontFamily:"'Orbitron',monospace"}}>
              {Math.round(scrollEdge*100)}%
            </span>
          </div>
        )}
        <div style={{padding:'4px 10px',border:`1px solid ${C.bdr}`,fontSize:9,color:C.mu,fontFamily:"'Orbitron',monospace"}}>
          📅 {st.current_day || new Date().toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}
        </div>
        <div style={{padding:'4px 10px',border:`1px solid ${C.lo}`,fontSize:9,color:C.lo,fontFamily:"'Orbitron',monospace",minWidth:80}}>
          ⏱ {st.screen_time_str || '00:00:00'}
        </div>
        <div style={{padding:'4px 10px',border:`1px solid ${C.bdr}`,fontSize:9,color:C.rc}}>😑 {st.blinks}</div>
        <div style={{padding:'4px 10px',border:`1px solid ${C.bdr}`,fontSize:9,color:C.lc}}>📸 {st.screenshot_count}</div>
        <button onClick={takeScreenshot}
          style={{padding:'12px 24px',border:`1px solid ${C.lc}`,background:'transparent',
            color:C.lc,fontFamily:"'Share Tech Mono',monospace",fontSize:13,cursor:'pointer'}}>
          📸 SNAP
        </button>
        <button onClick={toggleTracking}
          style={{padding:'14px 32px',border:'none',background:st.tracking?C.ro:C.lc,color:'#000',
            fontFamily:"'Orbitron',monospace",fontSize:14,fontWeight:700,cursor:'pointer',letterSpacing:1,
            boxShadow:st.tracking?`0 0 18px ${C.ro}88`:`0 0 18px ${C.lc}88`}}>
          {st.tracking?'⏹ STOP':'▶ START'}
        </button>
      </div>
    </div>

    {/* TABS */}
    <div style={{display:'flex',background:C.sf,borderBottom:`1px solid ${C.bdr}`,overflowX:'auto'}}>
      {TABS.map(({id,label,icon})=>{
        const isActive=tab===id;
        const isHov=gazeBtnHov===`tab-${id}`;
        return (
          <div key={id}
            ref={el=>{ gazeRefs.current[`tab-${id}`]={ el, onGazeClick:()=>setTab(id) }; }}
            onClick={()=>setTab(id)}
            style={{padding:'10px 16px',position:'relative',overflow:'hidden',
              borderBottom:`2px solid ${isActive?C.lo:isHov?C.lo+'55':'transparent'}`,
              background:isHov?'rgba(0,212,255,0.06)':'transparent',
              color:isActive?C.lo:isHov?C.tx:C.mu,
              fontFamily:"'Orbitron',monospace",fontSize:13,fontWeight:700,
              cursor:'pointer',letterSpacing:2,whiteSpace:'nowrap',transition:'all .2s',
              display:'flex',alignItems:'center',gap:5}}>
            {icon(isActive?C.lo:isHov?C.tx:C.mu)}
            {label}
            {isHov && (
              <div style={{position:'absolute',bottom:0,left:0,height:2,
                width:`${gazeBtnPct}%`,background:C.lo,transition:'width .05s linear'}}/>
            )}
          </div>
        );
      })}
    </div>

    {/* ══════════ HOME ══════════ */}
    {tab==='home' && (
      <div style={{padding:20,maxWidth:900,margin:'0 auto'}}>
        <div style={{textAlign:'center',padding:'22px 0 16px'}}>
          <EyeIcon size={48} color={C.lo} style={{margin:'0 auto 10px',display:'block'}}/>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:26,fontWeight:900,color:C.lo,letterSpacing:4,marginBottom:6}}>
            GAZEFLOW PROJECT
          </div>
          <div style={{fontSize:10,color:C.mu,letterSpacing:3}}>GAZE CONTROLLED PC</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:10,marginBottom:18}}>
          {[
            ['🖱️','CURSOR CONTROL','Look to move cursor\nBlink to click','cursor',C.lo],
            ['⚙️','SPEED CONTROL','Set cursor speed\nSmoothing & deadzone','speed','#f59e0b'],
            ['🎙️','VOICE ASSISTANT','Speak commands\nControl the PC','voice','#f472b6'],
            ['👁️','GAZE HEATMAP','See where you look\nOverlay on screen','heatmap',C.pp],
            ['📸','SCREENSHOT','Hold blink 1.5s\n→ screenshot!','screenshots',C.lc],
            ['🔍','ZOOM IN/OUT','Hold blink 2.5s\n→ zoom toggle','cursor',C.rc],
            ['📊','DAILY STATS','Track per day\nSQLite database','stats',C.pp],
          ].map(([ic,t,d,goto,c])=>(
            <GazeBtn key={t} id={`home-card-${goto}-${t}`}
              onClick={()=>setTab(goto)} activeColor={c}
              style={{background:C.card,borderLeft:`3px solid ${c}`,padding:'14px'}}>
              <div style={{fontSize:24,marginBottom:7}}>{ic}</div>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:c,marginBottom:5}}>{t}</div>
              <div style={{fontSize:8,color:C.mu,lineHeight:1.55,whiteSpace:'pre-line'}}>{d}</div>
              {gazeBtnHov===`home-card-${goto}-${t}` && (
                <div style={{marginTop:6,height:3,background:C.bdr,borderRadius:2,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${gazeBtnPct}%`,background:c,transition:'width .05s'}}/>
                </div>
              )}
            </GazeBtn>
          ))}
        </div>

        {/* ── BLINK GUIDE ── */}
        <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${C.rc}`,padding:'16px 18px',marginBottom:14}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:11,color:C.rc,letterSpacing:3,marginBottom:14}}>😑 BLINK CONTROL GUIDE</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
            {[
              ['SHORT BLINK','< 0.4s','🖱️ Left Click\n(single click)',C.lc],
              ['DOUBLE BLINK','2 blinks < 0.6s','🖱️🖱️ Double Click\n(open icon / app)',C.lo],
              ['LEFT EYE\nWINK','wink left eye','🖱️ Right Click\n(context menu)',C.pp],
              ['LEFT EYE\nHOLD','5 sec','🖱️ Left Mouse\nbutton',C.lc],
              ['RIGHT EYE\nHOLD','5 sec','🖱️ Right Mouse\nbutton',C.pp],
              ['HOLD 1 SEC','📸 SNAP','Screenshot\n(auto save)',C.lc],
              ['HOLD 2 SEC','🔍 ZOOM IN','Screen zooms in\n(Ctrl + +)','#34d399'],
              ['HOLD 3 SEC','🔍 ZOOM OUT','Screen zooms out\n(Ctrl + -)','#f59e0b'],
              ['HOLD 4 SEC+','⛔ STOP','Heat OFF\nScroll ON\nFinal Snap','#ef4444'],
            ].map(([lbl,dur,act,c])=>(
              <div key={lbl} style={{background:C.sf,border:`2px solid ${c}`,padding:'12px',textAlign:'center',borderRadius:6}}>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:c,fontWeight:700,marginBottom:5,letterSpacing:1,whiteSpace:'pre-line',lineHeight:1.3}}>{lbl}</div>
                <div style={{fontSize:11,color:C.mu,marginBottom:7,fontWeight:600}}>{dur}</div>
                <div style={{fontSize:12,whiteSpace:'pre-line',lineHeight:1.5,fontWeight:500}}>{act}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── MOUSE BUTTON CONTROL ── */}
        <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${C.lo}`,padding:'16px 18px',marginBottom:14}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:C.lo,letterSpacing:2,marginBottom:12}}>🖱️ MOUSE BUTTON CONTROL</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
            {[
              ['left_click','LEFT\nCLICK','🖱️',C.lc,'/mouse/left_click'],
              ['right_click','RIGHT\nCLICK','🖱️',C.pp,'/mouse/right_click'],
              ['double_click','DOUBLE\nCLICK','🖱️🖱️',C.lo,'/mouse/double_click'],
              ['middle_click','MIDDLE\nCLICK','🖲️',C.ro,'/mouse/middle_click'],
            ].map(([id,lbl,ic,c,endpoint])=>(
              <GazeBtn key={id} id={`mouse-${id}`} activeColor={c}
                onClick={()=>fetch(`${API}${endpoint}`,{method:'POST'}).then(()=>log(`🖱️ ${lbl.replace('\n',' ')}`,'info'))}
                style={{background:C.sf,border:`2px solid ${c}`,padding:'16px 10px',textAlign:'center',flexDirection:'column',gap:6,borderRadius:4,boxShadow:`0 0 10px ${c}22`}}>
                <div style={{fontSize:28}}>{ic}</div>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:c,fontWeight:700,whiteSpace:'pre-line',lineHeight:1.4,letterSpacing:1}}>{lbl}</div>
                {gazeBtnHov===`mouse-${id}`&&<div style={{fontSize:7,color:c,marginTop:2}}>{Math.round(gazeBtnPct)}%</div>}
              </GazeBtn>
            ))}
          </div>
        </div>

        {/* ── DESKTOP & WINDOWS CONTROL ── */}
        <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${'#34d399'}`,padding:'16px 18px'}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:'#34d399',letterSpacing:2,marginBottom:12}}>🖥️ DESKTOP &amp; WINDOWS CONTROL</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:8,marginBottom:10}}>
            {[
              ['dsk-show','SHOW\nDESKTOP','🖥️','#34d399','/desktop/show'],
              ['dsk-start','START\nMENU','🪟','#60a5fa','/desktop/start_menu'],
              ['dsk-switch','ALT\nTAB','🔄','#f59e0b','/desktop/switch_window'],
              ['dsk-min','MINIMIZE\nWINDOW','➖',C.lc,'/desktop/minimize'],
              ['dsk-max','MAXIMIZE\nWINDOW','⬆️',C.lo,'/desktop/maximize'],
              ['dsk-close','CLOSE\nWINDOW','❌',C.rc,'/desktop/close_window'],
              ['dsk-files','FILE\nEXPLORER','📁','#f59e0b','/desktop/file_explorer'],
              ['dsk-task','TASK\nMANAGER','📋',C.pp,'/desktop/task_manager'],
              ['dsk-vl','VIRT DESK\nLEFT','◀️',C.mu,'/desktop/vdesk_left'],
              ['dsk-vr','VIRT DESK\nRIGHT','▶️',C.mu,'/desktop/vdesk_right'],
            ].map(([id,lbl,ic,c,ep])=>(
              <GazeBtn key={id} id={id} activeColor={c}
                onClick={()=>fetch(`${API}${ep}`,{method:'POST'}).then(()=>log(`🖥️ ${lbl.replace('\n',' ')}`,'info'))}
                style={{background:C.sf,border:`1px solid ${c}22`,padding:'10px 6px',textAlign:'center',flexDirection:'column',gap:3}}>
                <div style={{fontSize:18}}>{ic}</div>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:7,color:c,fontWeight:700,whiteSpace:'pre-line',lineHeight:1.3}}>{lbl}</div>
                {gazeBtnHov===id&&<div style={{fontSize:7,color:c}}>{Math.round(gazeBtnPct)}%</div>}
              </GazeBtn>
            ))}
          </div>
          {/* Quick App Launcher */}
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:8,color:C.mu,letterSpacing:2,marginBottom:8}}>🚀 QUICK APP LAUNCH</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))',gap:6}}>
            {[
              ['app-notepad','NOTEPAD','📝','#34d399','notepad'],
              ['app-calc','CALCULATOR','🔢','#60a5fa','calculator'],
              ['app-paint','PAINT','🎨','#f472b6','paint'],
              ['app-explorer','EXPLORER','📁','#f59e0b','explorer'],
              ['app-cmd','CMD','💻',C.lc,'cmd'],
            ].map(([id,lbl,ic,c,app])=>(
              <GazeBtn key={id} id={id} activeColor={c}
                onClick={()=>fetch(`${API}/desktop/open_app`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app})}).then(()=>log(`🚀 Launched ${lbl}`,'info'))}
                style={{background:C.sf,border:`1px solid ${c}33`,padding:'10px 6px',textAlign:'center',flexDirection:'column',gap:3}}>
                <div style={{fontSize:18}}>{ic}</div>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:7,color:c,fontWeight:700}}>{lbl}</div>
                {gazeBtnHov===id&&<div style={{fontSize:7,color:c}}>{Math.round(gazeBtnPct)}%</div>}
              </GazeBtn>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* ══════════ CURSOR ══════════ */}
    {tab==='cursor' && (
      <div style={{display:'grid',gridTemplateColumns:'275px 1fr 230px',minHeight:'calc(100vh - 104px)'}}>
        <div style={{background:C.sf,borderRight:`1px solid ${C.bdr}`,padding:13,display:'flex',flexDirection:'column',gap:10,overflowY:'auto'}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:3,color:C.mu,borderLeft:`2px solid ${C.lo}`,paddingLeft:8}}>📷 CAMERA FEED</div>
          <div style={{background:'#000',border:`1px solid ${C.bdr}`,aspectRatio:'4/3',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center'}}>
            {st.tracking
              ? <img src={`${API}/video`} alt="cam" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              : <div style={{textAlign:'center',color:C.mu,fontSize:11}}><div style={{fontSize:32,marginBottom:8}}>📷</div><div>Click START</div></div>}
          </div>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:3,color:C.mu,borderLeft:`2px solid ${C.lc}`,paddingLeft:8}}>👁️ EAR % — BLINK DETECTION</div>
          <PctMeter label="LEFT EYE OPENNESS" value={earLP} color={C.lo} hint="100% = fully open  |  below 21% = BLINK!" />
          <PctMeter label="RIGHT EYE OPENNESS" value={earRP} color={C.ro} hint="Threshold: 21% — drop below = blink" />
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:3,color:C.mu,borderLeft:`2px solid ${C.rc}`,paddingLeft:8}}>😑 BLINK HOLD %</div>
          <div style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'10px 12px'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
              <span style={{fontSize:9,color:C.mu}}>HOLD DURATION</span>
              <span style={{fontFamily:"'Orbitron',monospace",fontSize:16,fontWeight:700,
                color:blinkP>100?C.rc:blinkP>60?C.lo:C.lc}}>{blinkP.toFixed(1)}%</span>
            </div>
            <div style={{height:10,background:C.bdr,borderRadius:5,overflow:'hidden',marginBottom:4}}>
              <div style={{height:'100%',width:`${blinkP}%`,
                background:blinkP>100?C.rc:blinkP>60?C.lo:C.lc,
                borderRadius:5,boxShadow:`0 0 8px ${blinkP>100?C.rc:C.lo}`,transition:'width .05s'}}/>
            </div>
            <div style={{textAlign:'center',fontFamily:"'Orbitron',monospace",fontSize:11,fontWeight:700,
              color:blinkP>100?C.rc:blinkP>60?C.lo:blinkP>16?C.lo:C.lc,minHeight:18}}>
              {blinkP<=0?'—':blinkP<=16?'CLICK!':blinkP<=60?'HOLD FOR SCREENSHOT...':blinkP<=100?'RELEASE → SCREENSHOT!':'RELEASE → ZOOM!'}
            </div>
          </div>
          <PctMeter label="GAZE X (LEFT → RIGHT)" value={st.gaze_x_pct} color={C.lo} hint={`X: ${st.gaze_x}px`} />
          <PctMeter label="GAZE Y (TOP → BOTTOM)" value={st.gaze_y_pct} color={C.ro} hint={`Y: ${st.gaze_y}px`} />
          {[['📷','Camera',st.tracking,'640×480'],['🧑','FaceMesh',st.face_detected,'OK'],
            ['👁️','Eye Tracker',st.tracking,`(${st.gaze_x},${st.gaze_y})`],
            ['🖱️','Cursor',st.tracking,'ACTIVE'],['📸','Screenshot',true,`${st.screenshot_count} saved`],
            ['🔍','Zoom',st.tracking,`Lv${st.zoom_level}`],['🌡️','Heatmap',st.tracking,`${heatPts.length} pts`],
          ].map(([ic,nm,on,val])=>(
            <div key={nm} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:C.card,border:`1px solid ${C.bdr}`,fontSize:9}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:on?C.lc:C.mu,boxShadow:on?`0 0 5px ${C.lc}`:'none',flexShrink:0}}/>
              <span style={{flex:1}}>{ic} {nm}</span>
              <span style={{color:C.lo,fontSize:8}}>{val}</span>
            </div>
          ))}
        </div>
        <div style={{padding:18,display:'flex',flexDirection:'column',gap:14,overflowY:'auto'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
            {[['BLINKS',st.blinks,C.lc],['GAZE X%',`${st.gaze_x_pct}%`,C.lo],
              ['GAZE Y%',`${st.gaze_y_pct}%`,C.ro],['SCREENSHOTS',st.screenshot_count,C.lc]
            ].map(([k,v,c])=>(
              <div key={k} style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'12px',textAlign:'center'}}>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:22,fontWeight:700,color:c}}>{v}</div>
                <div style={{fontSize:8,color:C.mu,letterSpacing:1,marginTop:3}}>{k}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${C.rc}`,padding:'14px 18px'}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:11,color:C.rc,letterSpacing:3,marginBottom:14}}>😑 BLINK ACTIONS</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[['SHORT BLINK','< 0.4s','🖱️ Mouse Click',C.lc],
                ['DOUBLE BLINK','2× < 0.6s','🖱️🖱️ Double Click',C.lo],
                ['LEFT WINK','wink left','🖱️ Right Click',C.pp],
                ['HOLD 1 SEC','📸 SNAP','Screenshot',C.lc],
                ['HOLD 2 SEC','🔍 ZOOM IN','Ctrl + +','#34d399'],
                ['HOLD 3 SEC','🔍 ZOOM OUT','Ctrl + -','#f59e0b'],
                ['HOLD 4 SEC+','⛔ STOP','Heat OFF · Scroll ON','#ef4444'],
              ].map(([t,d,a,c])=>(
                <div key={t} style={{background:C.sf,border:`2px solid ${c}`,padding:'10px 12px',borderRadius:5}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:c,marginBottom:4,fontWeight:700}}>{t}</div>
                  <div style={{fontSize:10,color:C.mu,marginBottom:4,fontWeight:600}}>{d}</div>
                  <div style={{fontSize:12,fontWeight:500}}>{a}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${C.mu}`,padding:'14px 18px'}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:C.mu,letterSpacing:2,marginBottom:10}}>🔍 MANUAL ZOOM</div>
            <div style={{display:'flex',gap:8}}>
              {[['🔍+ IN',`${API}/zoom_in`,C.lc],['🔍- OUT',`${API}/zoom_out`,C.ro],['🔍= RESET',`${API}/zoom_reset`,C.mu]].map(([lbl,url,c])=>(
                <button key={lbl} onClick={async()=>{try{await fetch(url,{method:'POST'});log(lbl,'info');}catch{}}}
                  style={{flex:1,padding:'10px',background:'transparent',border:`1px solid ${c}`,color:c,
                    fontFamily:"'Share Tech Mono',monospace",fontSize:10,cursor:'pointer'}}>{lbl}</button>
              ))}
            </div>
          </div>
          <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${C.pp}`,padding:'14px 18px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:C.pp,letterSpacing:2,display:'flex',alignItems:'center',gap:6}}>
                <EyeIcon size={12} color={C.pp}/> LIVE GAZE HEATMAP
              </div>
              <button onClick={()=>setTab('heatmap')}
                style={{background:'transparent',border:`1px solid ${C.pp}`,color:C.pp,fontSize:8,padding:'3px 8px',cursor:'pointer',fontFamily:"'Share Tech Mono',monospace"}}>
                FULL VIEW →
              </button>
            </div>
            <div style={{height:180,background:'#030810',border:`1px solid ${C.bdr}`,position:'relative'}}>
              {heatPts.length>0
                ? <GazeHeatmap points={heatPts} width={400} height={180}/>
                : <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:C.mu,fontSize:9}}>
                    Start tracking to see heatmap
                  </div>}
            </div>
            <div style={{fontSize:8,color:C.mu,marginTop:5}}>{heatPts.length} gaze points collected this session</div>
          </div>
        </div>
        <div style={{background:C.sf,borderLeft:`1px solid ${C.bdr}`,padding:12,display:'flex',flexDirection:'column',gap:10}}>
          <button onClick={toggleTracking}
            style={{padding:'13px',border:'none',background:st.tracking?C.ro:C.lo,color:'#000',
              fontFamily:"'Orbitron',monospace",fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:1}}>
            {st.tracking?'⏹ STOP':'▶ START'}
          </button>
          <button onClick={takeScreenshot}
            style={{padding:'10px',border:`1px solid ${C.lc}`,background:'transparent',color:C.lc,
              fontFamily:"'Share Tech Mono',monospace",fontSize:10,cursor:'pointer'}}>
            📸 TAKE SCREENSHOT
          </button>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,letterSpacing:3,color:C.mu,borderLeft:`2px solid ${C.rc}`,paddingLeft:8}}>📋 LOG</div>
          <div ref={logRef} style={{background:'#060d14',border:`1px solid ${C.bdr}`,padding:8,fontSize:9,lineHeight:1.8,flex:1,overflowY:'auto',minHeight:200}}>
            {logs.map((l,i)=>(<div key={i} style={{color:l.type==='info'?C.lo:l.type==='err'?'#ff4444':C.mu}}>{l.msg}</div>))}
          </div>
        </div>
      </div>
    )}

    {/* ══════════ SPEED CONTROL ══════════ */}
    {tab==='speed' && (
      <div style={{padding:24,maxWidth:860,margin:'0 auto'}}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:13,color:'#f59e0b',letterSpacing:3,marginBottom:18,display:'flex',alignItems:'center',gap:8}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M12 2a10 10 0 110 20A10 10 0 0112 2z"/><polyline points="12 6 12 12 16 14"/></svg>
          CURSOR SPEED CONTROL
        </div>
        <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:'3px solid #f59e0b',padding:'16px 20px',marginBottom:16}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:'#f59e0b',letterSpacing:2,marginBottom:12}}>⚡ QUICK PRESETS</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {[['SLOW','slow','#60a5fa','0.4× speed'],['PRECISION','precision','#a78bfa','0.6× speed'],
              ['MEDIUM','medium','#34d399','1.0× speed'],['FAST','fast','#f59e0b','1.8× speed'],['GAMING','gaming','#f87171','2.5× speed']
            ].map(([lbl,key,col,desc])=>(
              <button key={key} onClick={()=>applyCursorPreset(key)}
                style={{padding:'10px 18px',border:`1px solid ${col}`,background:'transparent',
                  color:col,fontFamily:"'Orbitron',monospace",fontSize:10,fontWeight:700,
                  cursor:'pointer',letterSpacing:1,flex:'0 0 auto',display:'flex',flexDirection:'column',gap:3,alignItems:'center'}}>
                {lbl}
                <span style={{fontSize:7,color:C.mu,fontFamily:"'Share Tech Mono',monospace",fontWeight:'normal'}}>{desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
          {[
            ['🚀 CURSOR SPEED','#f59e0b',cursorSpeed,setCursorSpeed,0.1,3.0,0.05,'0.1× (slowest)','1.0×','3.0× (fastest)'],
            ['🌊 SMOOTHING','#06b6d4',cursorSmooth,setCursorSmooth,0.05,0.95,0.05,'5% (raw)','50%','95% (smooth)'],
            ['🎯 DEADZONE','#a78bfa',cursorDeadzone,setCursorDeadzone,0,0.1,0.005,'0% (off)','5%','10% (max)'],
          ].map(([lbl,col,val,setter,mn,mx,st2,l,m,r])=>(
            <div key={lbl} style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'16px 18px'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                <span style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:col,letterSpacing:2}}>{lbl}</span>
                <span style={{fontFamily:"'Orbitron',monospace",fontSize:20,fontWeight:700,color:col}}>
                  {lbl.includes('SPEED')?`${val.toFixed(2)}×`:lbl.includes('SMOOTHING')?`${Math.round(val*100)}%`:`${(val*100).toFixed(1)}%`}
                </span>
              </div>
              <input type="range" min={mn} max={mx} step={st2} value={val}
                onChange={e=>setter(Number(e.target.value))}
                style={{width:'100%',accentColor:col,margin:'4px 0 10px'}}/>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:C.mu}}>
                <span>{l}</span><span>{m}</span><span>{r}</span>
              </div>
            </div>
          ))}
          <div style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'16px 18px',display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:'#34d399',letterSpacing:2}}>⚙️ ADVANCED</div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:10,color:C.tx}}>ACCELERATION</div>
                <div style={{fontSize:8,color:C.mu}}>Faster movement = bigger cursor jump</div>
              </div>
              <button onClick={()=>setCursorAccel(p=>!p)}
                style={{width:46,height:24,borderRadius:12,border:'none',cursor:'pointer',position:'relative',
                  background:cursorAccel?'#34d399':'#1a3048',transition:'background .3s'}}>
                <div style={{position:'absolute',top:3,left:cursorAccel?22:3,width:18,height:18,
                  borderRadius:'50%',background:'#fff',transition:'left .3s'}}/>
              </button>
            </div>
            <div style={{padding:'10px 14px',background:C.sf,border:`1px solid ${C.bdr}`}}>
              <div style={{fontSize:8,color:C.mu,marginBottom:6}}>CURRENT SETTINGS</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4,fontSize:9}}>
                <div style={{color:C.mu}}>Speed: <span style={{color:'#f59e0b',fontFamily:"'Orbitron',monospace"}}>{cursorSpeed.toFixed(2)}×</span></div>
                <div style={{color:C.mu}}>Smooth: <span style={{color:'#06b6d4',fontFamily:"'Orbitron',monospace"}}>{Math.round(cursorSmooth*100)}%</span></div>
                <div style={{color:C.mu}}>Deadzone: <span style={{color:'#a78bfa',fontFamily:"'Orbitron',monospace"}}>{(cursorDeadzone*100).toFixed(1)}%</span></div>
                <div style={{color:C.mu}}>Accel: <span style={{color:'#34d399',fontFamily:"'Orbitron',monospace"}}>{cursorAccel?'ON':'OFF'}</span></div>
              </div>
            </div>
          </div>
        </div>
        <button onClick={()=>saveCursorSettings({cursor_speed:cursorSpeed,cursor_smooth:cursorSmooth,cursor_accel:cursorAccel,cursor_deadzone:cursorDeadzone})}
          disabled={speedSaving}
          style={{width:'100%',padding:'14px',border:'none',background:speedSaving?'#1a3048':'#f59e0b',
            color:'#000',fontFamily:"'Orbitron',monospace",fontSize:13,fontWeight:900,cursor:'pointer',letterSpacing:2}}>
          {speedSaving?'✓ SAVED!':'⚙️ APPLY CURSOR SETTINGS'}
        </button>
      </div>
    )}

    {/* ══════════ VOICE ASSISTANT ══════════ */}
    {tab==='voice' && (() => {
      const VC = '#f472b6';
      const quickCommands = [
        'camera on','camera off','open camera','close app','minimize all',
        'click','double click','right click','scroll up','scroll down',
        'zoom in','zoom out','show desktop','switch window','file explorer',
        'task manager','open notepad','open calculator','open google',
        'open settings','copy','paste','save','lock pc',
      ];
      const examples = [
        ['Mouse', 'click, double click, right click, scroll up, scroll down'],
        ['Camera', 'camera on, camera off, open camera'],
        ['Windows', 'show desktop, minimize all, switch window, close app, file explorer, task manager, lock pc'],
        ['Apps', 'open notepad, open calculator, open settings, open camera, open google, open paint, open cmd'],
        ['Keyboard', 'copy, paste, cut, select all, undo, redo, save, enter, backspace, type hello'],
        ['Browser', 'new tab, close tab, next tab, previous tab, refresh'],
        ['GazeFlow Project', 'start tracking, stop tracking, screenshot, zoom in, zoom out'],
      ];
      return (
      <div style={{padding:20,maxWidth:1060,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:16,flexWrap:'wrap'}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:13,color:VC,letterSpacing:3,display:'flex',alignItems:'center',gap:10}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={VC} strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            FULL PC VOICE ASSISTANT
          </div>
          <button onClick={voiceStatus.running ? stopVoice : startVoice}
            style={{padding:'12px 28px',border:'none',background:voiceStatus.running?'#ef4444':VC,color:'#000',
              fontFamily:"'Orbitron',monospace",fontSize:12,fontWeight:900,cursor:'pointer',letterSpacing:2}}>
            {voiceStatus.running ? '⏹ STOP LISTENING' : '▶ START LISTENING'}
          </button>
        </div>

        <div style={{background:C.card,border:`2px solid ${voiceStatus.running?VC:C.bdr}`,borderLeft:`4px solid ${VC}`,padding:'18px 22px',marginBottom:14,
          display:'grid',gridTemplateColumns:'1.2fr .8fr',gap:16,alignItems:'center'}}>
          <div>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:18,fontWeight:900,color:voiceStatus.running?VC:C.mu,letterSpacing:2,marginBottom:6}}>
              {voiceStatus.running ? (voiceStatus.listening ? 'LISTENING...' : 'VOICE READY') : 'VOICE OFF'}
            </div>
            <div style={{fontSize:10,color:C.mu,lineHeight:1.7}}>
              {voiceStatus.running ? 'Speak a command naturally. You can also test commands below.' : 'Start listening to control mouse, windows, apps, keyboard shortcuts, volume, and GazeFlow Project.'}
            </div>
            {voiceStatus.last_command && (
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:VC,marginTop:8}}>
                LAST: "{voiceStatus.last_command}" → {voiceStatus.last_result || 'ok'}
              </div>
            )}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[
              ['Speech',voiceStatus.speech_available ? 'READY' : 'MISSING',voiceStatus.speech_available ? C.lc : C.rc],
              ['TTS',voiceStatus.tts_available ? 'READY' : 'OFF',voiceStatus.tts_available ? C.lc : C.mu],
              ['Mic',voiceStatus.listening ? 'ACTIVE' : 'IDLE',voiceStatus.listening ? VC : C.mu],
              ['Mode',voiceStatus.running ? 'ON' : 'OFF',voiceStatus.running ? VC : C.mu],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:C.sf,border:`1px solid ${C.bdr}`,padding:'10px',textAlign:'center'}}>
                <div style={{fontSize:8,color:C.mu,letterSpacing:1,marginBottom:4}}>{l}</div>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:11,fontWeight:700,color:c}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
          <div style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'14px'}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:VC,letterSpacing:2,marginBottom:10}}>MANUAL COMMAND TEST</div>
            <div style={{display:'flex',gap:8}}>
              <input value={voiceCmd} onChange={e=>setVoiceCmd(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') sendVoiceCommand(); }}
                placeholder="type a command, e.g. open notepad"
                style={{flex:1,padding:'10px 12px',background:C.sf,border:`1px solid ${C.bdr}`,color:C.tx,
                  fontFamily:"'Share Tech Mono',monospace",fontSize:12,outline:'none'}}/>
              <button onClick={()=>sendVoiceCommand()}
                style={{padding:'10px 18px',border:'none',background:VC,color:'#000',
                  fontFamily:"'Orbitron',monospace",fontSize:10,fontWeight:900,cursor:'pointer'}}>
                RUN
              </button>
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:12}}>
              {quickCommands.map(cmd=>(
                <button key={cmd} onClick={()=>sendVoiceCommand(cmd)}
                  style={{padding:'6px 10px',border:`1px solid ${VC}66`,background:`${VC}12`,color:VC,
                    fontFamily:"'Share Tech Mono',monospace",fontSize:9,cursor:'pointer'}}>
                  {cmd}
                </button>
              ))}
            </div>
          </div>

          <div style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'14px'}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:C.lc,letterSpacing:2,marginBottom:10}}>COMMAND GUIDE</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {examples.map(([title,body])=>(
                <div key={title} style={{background:C.sf,border:`1px solid ${C.bdr}`,padding:'8px 10px'}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:C.lc,marginBottom:3}}>{title}</div>
                  <div style={{fontSize:9,color:C.mu,lineHeight:1.5}}>{body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'14px'}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:C.lo,letterSpacing:2,marginBottom:10}}>VOICE LOG</div>
          <div style={{height:260,overflowY:'auto',background:C.sf,border:`1px solid ${C.bdr}`,padding:10}}>
            {(voiceStatus.log||[]).length === 0
              ? <div style={{color:C.mu,fontSize:10,textAlign:'center',marginTop:90}}>No voice commands yet</div>
              : [...voiceStatus.log].reverse().map((e,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'70px 1fr 150px 90px',gap:8,padding:'6px 0',borderBottom:`1px solid ${C.bdr}`,fontSize:9}}>
                  <span style={{color:C.mu}}>{e.time}</span>
                  <span style={{color:C.tx}}>{e.command}</span>
                  <span style={{color:VC}}>{e.action || '-'}</span>
                  <span style={{color:e.result==='ok'?C.lc:C.rc}}>{e.result}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
      );
    })()}

    {/* ══════════ HEATMAP ══════════ */}
    {tab==='heatmap' && (() => {
      const FL = fatigue.fatigue_level||0;
      const flColor = ['#22c55e','#f59e0b','#fb923c','#ef4444'][FL]||'#22c55e';
      const flLabel = ['✅ ALERT','⚠️ MILD STRAIN','😴 TIRED','🚨 CRITICAL'][FL]||'ALERT';
      const zoneNames = {
        '0_0':'Top-Left','0_1':'Top-Center','0_2':'Top-Right',
        '1_0':'Mid-Left','1_1':'CENTER','1_2':'Mid-Right',
        '2_0':'Bot-Left','2_1':'Bot-Center','2_2':'Bot-Right',
      };
      const zones = fatigue.focus_zones||{};
      const maxZone = Object.values(zones).length ? Math.max(...Object.values(zones)) : 1;
      return (
      <div style={{padding:20,maxWidth:1060,margin:'0 auto'}}>
        {/* Header */}
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:13,color:C.pp,letterSpacing:3,marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
          <EyeIcon size={18} color={C.pp}/> REAL-TIME HEATMAP &amp; ANALYTICS DASHBOARD
        </div>

        {/* ── ROW 1: Heatmap + Fatigue side by side ── */}
        <div style={{display:'grid',gridTemplateColumns:'1.6fr 1fr',gap:14,marginBottom:14}}>

          {/* Heatmap */}
          <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${C.pp}`,padding:'14px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:C.pp,letterSpacing:2}}>👁️ LIVE GAZE HEATMAP</div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>loadHeatmapSession(null)}
                  style={{padding:'4px 10px',border:`1px solid ${!heatSelSession?C.pp:C.bdr}`,background:'transparent',
                    color:!heatSelSession?C.pp:C.mu,fontFamily:"'Orbitron',monospace",fontSize:8,cursor:'pointer'}}>
                  LIVE
                </button>
                <button onClick={async()=>{
                  await fetch(`${API}/heatmap/clear`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
                  setHeatPts([]); log('🌡️ Heatmap cleared','info');
                }} style={{padding:'4px 10px',border:`1px solid #ef4444`,background:'transparent',
                  color:'#ef4444',fontFamily:"'Orbitron',monospace",fontSize:8,cursor:'pointer'}}>
                  ✕ CLEAR
                </button>
                <button onClick={()=>setLiveHeatVisible(p=>!p)}
                  style={{padding:'4px 10px',border:`1px solid ${liveHeatVisible?C.pp:C.bdr}`,background:liveHeatVisible?'rgba(192,132,252,.15)':'transparent',
                    color:liveHeatVisible?C.pp:C.mu,fontFamily:"'Orbitron',monospace",fontSize:8,cursor:'pointer',fontWeight:700}}>
                  {liveHeatVisible?'OVERLAY ON':'OVERLAY OFF'}
                </button>
              </div>
            </div>
            <div style={{background:'#030810',border:`1px solid ${C.bdr}`,borderRadius:4,overflow:'hidden',aspectRatio:'16/9',position:'relative'}}>
              {heatPts.length>0
                ? <GazeHeatmap points={heatPts} width={640} height={360}/>
                : <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',minHeight:200,color:C.mu,fontSize:11,gap:10}}>
                    <EyeIcon size={36} color={C.mu}/>
                    <div style={{fontFamily:"'Orbitron',monospace",fontSize:9}}>No gaze data — start tracking</div>
                    <button onClick={toggleTracking} style={{padding:'6px 18px',border:`1px solid ${C.lc}`,background:'transparent',color:C.lc,fontFamily:"'Orbitron',monospace",fontSize:9,cursor:'pointer'}}>▶ START TRACKING</button>
                  </div>}
            </div>
            <div style={{marginTop:8,fontSize:9,color:C.mu}}>{heatPts.length} gaze points collected</div>
          </div>

          {/* Fatigue panel */}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {/* Status */}
            <div style={{background:C.card,border:`2px solid ${flColor}`,padding:'16px',textAlign:'center',flex:'0 0 auto'}}>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:C.mu,letterSpacing:2,marginBottom:6}}>FATIGUE STATUS</div>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:16,fontWeight:700,color:flColor,letterSpacing:2,marginBottom:6}}>{flLabel}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:10}}>
                {[
                  ['BLINK RATE',`${fatigue.blink_rate_pm||0}/min`,fatigue.blink_rate_pm<10?'#ef4444':'#22c55e'],
                  ['DROWSY EVENTS',`${fatigue.drowsy_events||0}`,fatigue.drowsy_events>2?'#ef4444':C.mu],
                  ['EYES CLOSED',`${fatigue.eyes_closed_sec||0}s`,fatigue.eyes_closed_sec>5?'#ef4444':C.mu],
                  ['EYE LEVEL',`${st.left_ear_pct||0}%`,C.lo],
                ].map(([l,v,c])=>(
                  <div key={l} style={{background:C.sf,padding:'8px',borderRadius:4,border:`1px solid ${C.bdr}`}}>
                    <div style={{fontFamily:"'Orbitron',monospace",fontSize:8,color:C.mu,marginBottom:3}}>{l}</div>
                    <div style={{fontFamily:"'Orbitron',monospace",fontSize:13,fontWeight:700,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── ROW 2: Analytics ── */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>

          {/* Focus Zone Grid */}
          <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${C.lo}`,padding:'14px'}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:C.lo,letterSpacing:2,marginBottom:12}}>📍 MOST VIEWED AREAS</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:3}}>
              {['0_0','0_1','0_2','1_0','1_1','1_2','2_0','2_1','2_2'].map(k=>{
                const val = zones[k]||0;
                const pct = maxZone>0 ? val/maxZone : 0;
                const hot = pct>0.7;
                const warm = pct>0.3;
                const bg = hot?'rgba(239,68,68,.35)':warm?'rgba(245,158,11,.2)':'transparent';
                const border = hot?'#ef4444':warm?'#f59e0b':C.bdr;
                return (
                  <div key={k} style={{background:bg,border:`1px solid ${border}`,padding:'6px 4px',textAlign:'center',borderRadius:3,minHeight:38}}>
                    <div style={{fontSize:7,color:C.mu,marginBottom:2}}>{zoneNames[k]}</div>
                    <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,fontWeight:700,color:hot?'#ef4444':warm?'#f59e0b':C.mu}}>
                      {val>0?`${val.toFixed(1)}s`:'—'}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:8,fontSize:9,color:C.mu}}>🔴 hot  🟡 warm  ⬜ low</div>
          </div>

          {/* Focus Duration */}
          <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${'#34d399'}`,padding:'14px'}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:'#34d399',letterSpacing:2,marginBottom:12}}>⏱️ FOCUS DURATION</div>
            <div style={{textAlign:'center',marginBottom:12}}>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:32,fontWeight:700,color:'#34d399'}}>{fatigue.focus_duration||0}s</div>
              <div style={{fontSize:9,color:C.mu,marginTop:4}}>Time in center focus zone</div>
            </div>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:C.mu,marginBottom:6}}>TOP AREA: <span style={{color:C.lo}}>{fatigue.top_area||'—'}</span></div>
            {/* bar per zone */}
            {Object.entries(zones).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>(
              <div key={k} style={{marginBottom:5}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:C.mu,marginBottom:2}}>
                  <span>{zoneNames[k]||k}</span><span>{v.toFixed(1)}s</span>
                </div>
                <div style={{height:5,background:C.sf,borderRadius:3,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${Math.min(100,(v/maxZone)*100)}%`,background:'#34d399',borderRadius:3}}/>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* ── ROW 3: Session selector + reset ── */}
        <div style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'12px 16px',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:9,color:C.mu}}>PAST SESSION:</div>
          <select onChange={e=>loadHeatmapSession(e.target.value?Number(e.target.value):null)}
            style={{padding:'6px 10px',background:C.sf,border:`1px solid ${C.bdr}`,color:C.tx,fontFamily:"'Orbitron',monospace",fontSize:8,cursor:'pointer',flex:1}}>
            <option value="">— SELECT SESSION —</option>
            {heatmapSessions.map(s=>(
              <option key={s.id} value={s.id}>Session #{s.id} — {s.date} ({s.blinks} blinks)</option>
            ))}
          </select>
          <button onClick={()=>{fetch(`${API}/fatigue/reset`,{method:'POST'});setFatigue({fatigue_level:0,drowsy_events:0,blink_rate_pm:0,eyes_closed_sec:0,focus_zones:{},top_area:'—',focus_duration:0,productivity:0});log('🔄 Fatigue + analytics reset','info');}}
            style={{padding:'6px 14px',border:`1px solid #f59e0b`,background:'transparent',color:'#f59e0b',fontFamily:"'Orbitron',monospace",fontSize:8,cursor:'pointer'}}>
            🔄 RESET ANALYTICS
          </button>
        </div>
      </div>
      );
    })()}

    {/* ══════════ STATS ══════════ */}
    {tab==='stats' && (
      <div style={{padding:20,maxWidth:900,margin:'0 auto'}}>

        {/* Live session banner */}
        {st.tracking && (
          <div style={{background:'#071a12',border:`1px solid ${C.lc}`,borderRadius:8,
            padding:'12px 18px',marginBottom:18,display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:C.lc,letterSpacing:2}}>🟢 LIVE</span>
            <span style={{fontSize:11,color:C.tx}}>📅 {st.current_day||new Date().toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</span>
            <span style={{fontFamily:"'Orbitron',monospace",fontSize:13,color:C.lc}}>⏱ {st.screen_time_str||'00:00:00'}</span>
            <span style={{fontSize:10,color:C.rc}}>😑 {st.blinks} blinks</span>
            <span style={{fontSize:10,color:C.lo}}>📸 {st.screenshot_count} shots</span>
            <button onClick={()=>{loadStats();loadSessions();}} style={{marginLeft:'auto',padding:'4px 12px',
              border:`1px solid ${C.bdr}`,background:'transparent',color:C.mu,fontSize:9,cursor:'pointer'}}>🔄</button>
          </div>
        )}

        {/* TODAY */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:11,color:C.lo,letterSpacing:3}}>
            📊 TODAY — {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}
          </div>
          <button onClick={()=>{loadStats();loadSessions();}} style={{padding:'4px 12px',
            border:`1px solid ${C.bdr}`,background:'transparent',color:C.mu,fontSize:9,cursor:'pointer',
            fontFamily:"'Share Tech Mono',monospace"}}>🔄 REFRESH</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:24}}>
          {(()=>{
            const todaySessions = sessions.filter(s=>s.date===new Date().toISOString().slice(0,10));
            const liveExtra = st.tracking ? 1 : 0;
            const items = [
              ['📋 SESSIONS',  (todaySt.total_sessions!=null ? todaySt.total_sessions : todaySessions.length) + liveExtra, C.lo],
              ['⏱ SCREEN TIME', st.tracking ? st.screen_time_str||'00:00:00' : (todaySt.total_duration ? fmt(todaySt.total_duration) : todaySessions.reduce((a,s)=>a+(s.duration_sec||0),0) > 0 ? fmt(todaySessions.reduce((a,s)=>a+(s.duration_sec||0),0)) : '00:00:00'), C.lc],
              ['😑 BLINKS',    (todaySt.total_blinks!=null ? todaySt.total_blinks : todaySessions.reduce((a,s)=>a+(s.blinks||0),0)) + (st.tracking ? st.blinks : 0), C.rc],
              ['📸 SHOTS',     (todaySt.total_screenshots!=null ? todaySt.total_screenshots : todaySessions.reduce((a,s)=>a+(s.screenshots||0),0)) + (st.tracking ? st.screenshot_count : 0), C.lo],
              ['😴 DROWSY',    (todaySessions.reduce((a,s)=>a+(s.drowsy_events||0),0)) + (st.tracking ? (st.drowsy_events||0) : 0), C.ro],
            ];
            return items.map(([k,v,c])=>(
              <div key={k} style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'18px 10px',textAlign:'center',borderRadius:6}}>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:22,fontWeight:700,color:c,lineHeight:1}}>{v}</div>
                <div style={{fontSize:8,color:C.mu,letterSpacing:1,marginTop:6}}>{k}</div>
              </div>
            ));
          })()}
        </div>

        {/* ALL TIME */}
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:11,color:C.pp,letterSpacing:3,marginBottom:10}}>🏆 ALL TIME</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:24}}>
          {(()=>{
            const total = sessions.length + (st.tracking ? 1 : 0);
            const items = [
              ['📋 SESSIONS',  allTime.total_sessions!=null ? allTime.total_sessions : total, C.lo],
              ['⏱ TOTAL TIME', allTime.total_duration  ? fmt(allTime.total_duration)  : fmt(sessions.reduce((a,s)=>a+(s.duration_sec||0),0)+(st.screen_time_sec||0)), C.lc],
              ['😑 BLINKS',    allTime.total_blinks    != null ? allTime.total_blinks    : sessions.reduce((a,s)=>a+(s.blinks||0),0)+(st.tracking?st.blinks:0), C.rc],
              ['📸 SHOTS',     allTime.total_screenshots!=null ? allTime.total_screenshots: sessions.reduce((a,s)=>a+(s.screenshots||0),0)+(st.tracking?st.screenshot_count:0), C.lo],
            ];
            return items.map(([k,v,c])=>(
              <div key={k} style={{background:C.card,border:`1px solid ${C.bdr}`,padding:'18px 10px',textAlign:'center',borderRadius:6}}>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:22,fontWeight:700,color:c,lineHeight:1}}>{v}</div>
                <div style={{fontSize:8,color:C.mu,letterSpacing:1,marginTop:6}}>{k}</div>
              </div>
            ));
          })()}
        </div>

        {/* DAILY BREAKDOWN */}
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:11,color:C.rc,letterSpacing:3,marginBottom:10}}>📅 DAILY BREAKDOWN</div>
        <div style={{background:C.card,border:`1px solid ${C.bdr}`,borderRadius:6,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1.5fr 1fr 1fr',
            padding:'8px 14px',borderBottom:`1px solid ${C.bdr}`,fontSize:8,color:C.mu,letterSpacing:1}}>
            {['DATE','SESSIONS','SCREEN TIME','BLINKS','SHOTS'].map(h=><span key={h}>{h}</span>)}
          </div>
          {(()=>{
            // Build from sessions in-memory (always up to date)
            const byDate = {};
            sessions.forEach(s=>{
              const d=s.date||'—';
              if(!byDate[d]) byDate[d]={date:d,count:0,dur:0,blinks:0,shots:0};
              byDate[d].count++; byDate[d].dur+=s.duration_sec||0;
              byDate[d].blinks+=s.blinks||0; byDate[d].shots+=s.screenshots||0;
            });
            // add live session
            if(st.tracking && st.session_date){
              const d=st.session_date;
              if(!byDate[d]) byDate[d]={date:d,count:0,dur:0,blinks:0,shots:0};
              byDate[d].count++; byDate[d].dur+=st.screen_time_sec||0;
              byDate[d].blinks+=st.blinks||0; byDate[d].shots+=st.screenshot_count||0;
            }
            const rows = Object.values(byDate).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
            if(rows.length===0) return (
              <div style={{padding:'24px',textAlign:'center',color:C.mu,fontSize:11}}>
                No sessions yet — click ▶ START TRACKING to begin
              </div>
            );
            return rows.map((d,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1.5fr 1fr 1fr',
                padding:'10px 14px',borderBottom:`1px solid ${C.bdr}`,fontSize:10,
                background:i%2===0?'transparent':'#060e1a'}}>
                <span style={{color:C.lo,fontFamily:"'Orbitron',monospace",fontSize:9}}>{d.date}</span>
                <span style={{color:C.tx}}>{d.count}</span>
                <span style={{color:C.lc}}>{fmt(Math.round(d.dur))}</span>
                <span style={{color:C.rc}}>{d.blinks}</span>
                <span style={{color:C.lo}}>{d.shots}</span>
              </div>
            ));
          })()}
        </div>
      </div>
    )}



    {/* ══════════ SESSIONS ══════════ */}
    {tab==='sessions' && (
      <div style={{padding:20,maxWidth:1000,margin:'0 auto'}}>

        {/* ── Current session live info ──────────────────────── */}
        {st.tracking && (
          <div style={{background:C.card,border:`2px solid ${C.lc}`,borderRadius:8,padding:'16px 20px',marginBottom:20,
            boxShadow:`0 0 20px ${C.lc}33`}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,color:C.lc,letterSpacing:3,marginBottom:12}}>
              🟢 LIVE SESSION — {st.session_date} started {st.session_start_str}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10}}>
              {[
                ['⏱ SCREEN TIME', st.screen_time_str||'00:00:00', C.lc],
                ['📅 DATE', st.current_date||'—', C.lo],
                ['🕐 TIME', st.current_time||'—', C.mu],
                ['😑 BLINKS', st.blinks, C.rc],
                ['📸 SCREENSHOTS', st.screenshot_count, C.lo],
                ['😴 DROWSY', st.drowsy_events||0, C.ro],
                ['🎯 TOP AREA', st.top_area||'—', C.pp],
                ['📈 PRODUCTIVITY', `${Math.round(st.productivity||0)}%`, C.lc],
              ].map(([k,v,c])=>(
                <div key={k} style={{textAlign:'center',background:'#0a1628',border:`1px solid ${C.bdr}`,padding:'10px 6px',borderRadius:6}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:14,fontWeight:700,color:c}}>{v}</div>
                  <div style={{fontSize:7,color:C.mu,letterSpacing:1,marginTop:4}}>{k}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Session history list ───────────────────────────── */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:11,color:C.lo,letterSpacing:3}}>
            📋 SESSION HISTORY ({sessions.length})
          </div>
          <button onClick={loadSessions}
            style={{padding:'6px 14px',border:`1px solid ${C.bdr}`,background:'transparent',
              color:C.mu,fontFamily:"'Share Tech Mono',monospace",fontSize:9,cursor:'pointer'}}>
            🔄 REFRESH
          </button>
        </div>

        {sessions.length===0
          ? <div style={{padding:'40px',textAlign:'center',color:C.mu,fontSize:11,
              border:`1px dashed ${C.bdr}`,borderRadius:8}}>
              No sessions yet — click ▶ START TRACKING to begin your first session
            </div>
          : <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {sessions.map((s,i)=>(
                <div key={i} style={{background:C.card,border:`1px solid ${C.bdr}`,borderLeft:`3px solid ${C.lo}`,
                  borderRadius:6,padding:'14px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <div style={{display:'flex',gap:12,alignItems:'center'}}>
                      <span style={{fontFamily:"'Orbitron',monospace",fontSize:12,color:C.lo}}>#{s.id}</span>
                      <span style={{fontSize:11,color:C.tx}}>📅 {s.date}</span>
                      <span style={{fontSize:10,color:C.mu}}>{s.start_time} → {s.end_time}</span>
                    </div>
                    <span style={{fontFamily:"'Orbitron',monospace",fontSize:13,color:C.lc}}>{s.duration_str||fmt(s.duration_sec||0)}</span>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))',gap:6}}>
                    {[
                      ['😑 Blinks', s.blinks||0, C.rc],
                      ['📸 Screenshots', s.screenshots||0, C.lo],
                      ['😴 Drowsy events', s.drowsy_events||0, C.ro],
                      ['🎯 Top area', s.top_area||'—', C.pp],
                      ['📈 Productivity', `${Math.round(s.productivity||0)}%`, C.lc],
                    ].map(([k,v,c])=>(
                      <div key={k} style={{background:'#060e1a',border:`1px solid ${C.bdr}`,padding:'6px 8px',borderRadius:4,textAlign:'center'}}>
                        <div style={{fontSize:12,color:c,fontWeight:700}}>{v}</div>
                        <div style={{fontSize:7,color:C.mu,marginTop:2}}>{k}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    )}

    {/* ══════════ SCREENSHOTS ══════════ */}    {tab==='screenshots' && (
      <div style={{padding:20,maxWidth:1000,margin:'0 auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:13,color:C.lc,letterSpacing:3,display:'flex',alignItems:'center',gap:8}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.lc} strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            SCREENSHOTS ({shots.length})
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={takeScreenshot}
              style={{padding:'8px 18px',border:`1px solid ${C.lc}`,background:'transparent',
                color:C.lc,fontFamily:"'Share Tech Mono',monospace",fontSize:10,cursor:'pointer'}}>
              📸 SNAP NOW
            </button>
            <button onClick={loadScreenshots}
              style={{padding:'8px 14px',border:`1px solid ${C.bdr}`,background:'transparent',
                color:C.mu,fontFamily:"'Share Tech Mono',monospace",fontSize:9,cursor:'pointer'}}>
              🔄 REFRESH
            </button>
          </div>
        </div>

        {shots.length === 0
          ? <div style={{padding:'60px',textAlign:'center',color:C.mu,fontSize:11,
              border:`1px dashed ${C.bdr}`,borderRadius:8}}>
              No screenshots yet — hold blink for 1s to capture, or click SNAP NOW
            </div>
          : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12}}>
              {shots.map((s,i)=>(
                <div key={i}
                  onClick={()=>setSelectedShot(selectedShot===s.filename?null:s.filename)}
                  style={{background:C.card,border:`2px solid ${selectedShot===s.filename?C.lc:C.bdr}`,
                    borderRadius:6,overflow:'hidden',cursor:'pointer',
                    boxShadow:selectedShot===s.filename?`0 0 14px ${C.lc}44`:'none',
                    transition:'border-color .15s,box-shadow .15s'}}>
                  <img
                    src={`${API}/screenshots/${s.filename}`}
                    alt={s.filename}
                    onError={e=>{ e.target.style.display='none'; }}
                    style={{width:'100%',aspectRatio:'16/9',objectFit:'cover',display:'block',background:'#000'}}
                  />
                  <div style={{padding:'8px 10px'}}>
                    <div style={{fontSize:9,color:C.lo,fontFamily:"'Orbitron',monospace",
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.filename}</div>
                    <div style={{fontSize:8,color:C.mu,marginTop:3}}>{s.timestamp||''}</div>
                  </div>
                </div>
              ))}
            </div>
        }

        {/* Lightbox */}
        {selectedShot && (
          <div onClick={()=>setSelectedShot(null)}
            style={{position:'fixed',inset:0,zIndex:9990,background:'rgba(0,0,0,0.85)',
              display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
            <img src={`${API}/screenshots/${selectedShot}`} alt={selectedShot}
              style={{maxWidth:'90vw',maxHeight:'88vh',objectFit:'contain',
                border:`2px solid ${C.lc}`,boxShadow:`0 0 40px ${C.lc}44`}}/>
            <div style={{position:'fixed',top:18,right:24,color:C.mu,fontSize:13,
              fontFamily:"'Orbitron',monospace",letterSpacing:2}}>
              {selectedShot} — click anywhere to close
            </div>
          </div>
        )}
      </div>
    )}

    </div>
  );
}
