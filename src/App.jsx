import React, { useState, useEffect, useRef } from 'react';

// ============ STORAGE ============
const BOOKINGS_KEY = 'usanzasvar:bookings';
const TECHS_KEY = 'usanzasvar:techs';
const SETTINGS_KEY = 'usanzasvar:settings';
const CUSTOMERS_KEY = 'usanzasvar:customers';
const FEEDBACK_KEY = 'usanzasvar:feedback';
const ORGS_KEY = 'usanzasvar:orgs';
const BROADCASTS_KEY = 'usanzasvar:broadcasts';
const ADMIN_PASSWORD = 'My96101613@@@';
const ADMIN_PWHASH_KEY = 'usanzasvar:admin-pwhash';
const SESSION_KEY = 'usanzasvar:session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle = auto logout
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days max session
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function sha256Hash(text) {
  const buf = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkAdminPassword(input) {
  const stored = await loadObj(ADMIN_PWHASH_KEY);
  if (stored && stored.hash) {
    return (await sha256Hash(input)) === stored.hash;
  }
  // Fallback: check against default (will be migrated to hash on next save)
  return input === ADMIN_PASSWORD;
}

async function setAdminPassword(newPassword) {
  const hash = await sha256Hash(newPassword);
  await saveObj(ADMIN_PWHASH_KEY, { hash, updatedAt: Date.now() });
}

function getActivePromo(broadcasts) {
  if (!broadcasts || !broadcasts.length) return null;
  const now = Date.now();
  const active = broadcasts.find(b => b.discountPct > 0 && (!b.expiresAt || b.expiresAt > now));
  return active || null;
}

// ============ LOYALTY TIERS ============
const TIERS = [
  { id: 'bronze', name: 'Bronze', emoji: '🥉', minCount: 0, discountPct: 0, color: '#cd7f32', badge: 'Стандарт' },
  { id: 'silver', name: 'Silver', emoji: '🥈', minCount: 10, discountPct: 5, color: '#9ca3af', badge: '5% хямдрал' },
  { id: 'gold', name: 'Gold', emoji: '🥇', minCount: 50, discountPct: 10, color: '#d99a00', badge: '10% хямдрал' },
];
function getTier(completedCount) {
  return [...TIERS].reverse().find(t => completedCount >= t.minCount) || TIERS[0];
}
function getNextTier(completedCount) {
  return TIERS.find(t => completedCount < t.minCount);
}

// ============ NOTIFICATIONS ============
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (e) { return false; }
}

function showBrowserNotification(title, body, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: options.tag || 'uszasvar',
      requireInteraction: false,
      ...options,
    });
    setTimeout(() => { try { n.close(); } catch(e){} }, 8000);
  } catch (e) { /* silent */ }
}

function playNotificationSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // Two-tone ding
    [800, 1000].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch (e) { /* silent */ }
}

async function loadList(key) {
  try { 
    const r = await window.storage.get(key, true); 
    const list = r && r.value ? JSON.parse(r.value) : [];
    // Auto-deduplicate by appropriate key
    if (key === 'usanzasvar:techs') return dedupeBy(list, 'phone');
    if (key === 'usanzasvar:bookings') return dedupeBy(list, 'id');
    if (key === 'usanzasvar:orgs') return dedupeBy(list, 'id');
    if (key === 'usanzasvar:feedback') return dedupeBy(list, 'id');
    if (key === 'usanzasvar:broadcasts') return dedupeBy(list, 'id');
    return list;
  }
  catch { return []; }
}
function dedupeBy(list, key) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter(item => {
    if (!item || !item[key]) return false;
    const k = String(item[key]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
async function saveList(key, list) {
  try { 
    // Auto-deduplicate before save to prevent duplicates from concurrent writes
    let finalList = list;
    if (key === 'usanzasvar:techs') finalList = dedupeBy(list, 'phone');
    else if (key === 'usanzasvar:bookings') finalList = dedupeBy(list, 'id');
    else if (key === 'usanzasvar:orgs') finalList = dedupeBy(list, 'id');
    else if (key === 'usanzasvar:feedback') finalList = dedupeBy(list, 'id');
    else if (key === 'usanzasvar:broadcasts') finalList = dedupeBy(list, 'id');
    await window.storage.set(key, JSON.stringify(finalList), true); 
    return true; 
  } catch { return false; }
}
async function loadObj(key) {
  try { const r = await window.storage.get(key, true); return r && r.value ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function saveObj(key, obj) {
  try { await window.storage.set(key, JSON.stringify(obj), true); return true; } catch { return false; }
}

// ATOMIC UPDATE: Read fresh from storage, apply mutator, save back
// This prevents race conditions when multiple tabs/users modify same data
async function atomicUpdateList(key, mutator) {
  const current = await loadList(key);
  const next = mutator(current);
  await saveList(key, next);
  return next;
}
async function atomicUpdateObj(key, mutator) {
  const current = await loadObj(key);
  const next = mutator(current);
  await saveObj(key, next);
  return next;
}

// ============ DATA ============
const DISTRICTS = [
  { name: 'Сүхбаатар', eta: 18 }, { name: 'Чингэлтэй', eta: 20 },
  { name: 'Баянгол', eta: 22 }, { name: 'Баянзүрх', eta: 28 },
  { name: 'Хан-Уул', eta: 30 }, { name: 'Сонгинохайрхан', eta: 35 }, { name: 'Налайх', eta: 55 },
  { name: 'Дархан', eta: 40 }, { name: 'Эрдэнэт', eta: 40 },
];
const SERVICES_KEY = 'usanzasvar:services';
const SERVICE_CATEGORIES = ['Засвар', 'Цэвэрлэгээ', 'Халаалт', 'Тоног', 'Суурилуулалт'];
const MATERIALS_KEY = 'usanzasvar:materials';
const MAT_ORDERS_KEY = 'usanzasvar:matorders';
const MATERIAL_CATEGORIES = ['Бүгд', 'Холигч', 'Суултуур', 'Холбогч', 'Хоолой', 'Бусад'];
const DEFAULT_MATERIALS = [
  { id: 'm1', icon: '🚿', cat: 'Холигч', name: 'Угаалгын өрөөний холигч', price: 85000, unit: 'ш' },
  { id: 'm2', icon: '🍽️', cat: 'Холигч', name: 'Гал тогооны холигч', price: 95000, unit: 'ш' },
  { id: 'm3', icon: '🚿', cat: 'Холигч', name: 'Душны холигч', price: 120000, unit: 'ш' },
  { id: 'm4', icon: '🚽', cat: 'Суултуур', name: 'Суултуур (бачогтой)', price: 250000, unit: 'ш' },
  { id: 'm5', icon: '🔘', cat: 'Суултуур', name: 'Бачокны механизм', price: 35000, unit: 'ш' },
  { id: 'm6', icon: '🪑', cat: 'Суултуур', name: 'Суултуурын таг', price: 28000, unit: 'ш' },
  { id: 'm7', icon: '🔗', cat: 'Холбогч', name: 'Гибкий холбогч (40см)', price: 8000, unit: 'ш' },
  { id: 'm8', icon: '🔗', cat: 'Холбогч', name: 'PVC муфт', price: 2500, unit: 'ш' },
  { id: 'm9', icon: '📐', cat: 'Холбогч', name: 'PVC өнцөг (90°)', price: 3000, unit: 'ш' },
  { id: 'm10', icon: '➕', cat: 'Холбогч', name: 'Тройник (гурвалжин)', price: 3500, unit: 'ш' },
  { id: 'm11', icon: '🟫', cat: 'Хоолой', name: 'PPR хоолой (20мм)', price: 6000, unit: 'м' },
  { id: 'm12', icon: '⬜', cat: 'Хоолой', name: 'PVC бохирын хоолой (110мм)', price: 18000, unit: 'м' },
  { id: 'm13', icon: '🧵', cat: 'Бусад', name: 'Тефлон тууз', price: 1500, unit: 'ш' },
  { id: 'm14', icon: '🧴', cat: 'Бусад', name: 'Сантехникийн силикон', price: 12000, unit: 'ш' },
  { id: 'm15', icon: '🌀', cat: 'Бусад', name: 'Сифон (угаалтуурын)', price: 15000, unit: 'ш' },
  { id: 'm16', icon: '🚰', cat: 'Бусад', name: 'Хаалтын кран (1/2")', price: 9000, unit: 'ш' },
];
const DEFAULT_SERVICES = [
  { id: 'kran', icon: '🚰', cat: 'Засвар', name: 'Кран засвар / солих', desc: 'Гоожиж буй болон эвдэрсэн кран, холигч засварлах, шинээр суурилуулах.', priceMin: 15000, priceMax: 45000, duration: '30–60 мин' },
  { id: 'zai', icon: '🚽', cat: 'Цэвэрлэгээ', name: '00 / угаалтуур бөглөрөл', desc: 'Бөглөрсөн 00, угаалтуур, шингэн зайлуулах шугамыг тусгай төхөөрөмжөөр цэвэрлэх.', priceMin: 25000, priceMax: 60000, duration: '30–90 мин' },
  { id: 'shugam', icon: '🔧', cat: 'Засвар', name: 'Шугам сүлжээний засвар', desc: 'Хагарсан, гоожсон ус, бохирын шугам солих, гагнах, залгах.', priceMin: 35000, priceMax: 90000, duration: '1–3 цаг' },
  { id: 'halaalt', icon: '♨️', cat: 'Халаалт', name: 'Халаалтын радиатор', desc: 'Радиатор солих, угаах, агаар гаргах, халаалтын систем тохируулах.', priceMin: 40000, priceMax: 120000, duration: '1–3 цаг' },
  { id: 'nasos', icon: '⚙️', cat: 'Тоног', name: 'Усны мотор / насос', desc: 'Усны даралт сайжруулах мотор, насос суурилуулах, засварлах.', priceMin: 50000, priceMax: 150000, duration: '1–2 цаг' },
  { id: 'suuril', icon: '🛁', cat: 'Суурилуулалт', name: 'Шинэ суурилуулалт', desc: 'Ванн, душ, угаалтуур, угаалгын машин зэргийг шинээр холбож суурилуулах.', priceMin: 40000, priceMax: null, duration: 'Тохиролцоно' },
];
const CALLOUT_FEE = 5000, REGISTRATION_FEE = 10000, PER_CALL_FEE = 5000, COINS_FOR_FREE_CALL = 2;
const EXPERIENCE_LEVELS = ['1 жилээс бага', '1–3 жил', '3–5 жил', '5–10 жил', '10+ жил'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = (n) => Number(n).toLocaleString('en-US');
const fmtIBAN = (acc) => {
  if (!acc) return '';
  const a = String(acc).replace(/\s/g, '');
  if (a.length === 20 && a.startsWith('MN')) {
    // MN40 001500 1745120839 (MN+4 country/check, +6 bank code, +10 account)
    return a.substring(0, 10) + ' ' + a.substring(10);
  }
  return a;
};
const getAccountOnly = (acc) => {
  if (!acc) return '';
  const a = String(acc).replace(/\s/g, '');
  if (a.length === 20 && a.startsWith('MN')) {
    return a.substring(10); // Just the account number, no IBAN prefix
  }
  return a;
};
const cleanPhone = (p) => p.replace(/\D/g, '').slice(-8);
const validPhone = (p) => cleanPhone(p).length === 8;
const fmtPhone = (p) => { const c = cleanPhone(p); return c.length === 8 ? `${c.slice(0,4)}-${c.slice(4)}` : c; };
function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 60000);
  if (d < 1) return 'дөнгөж сая'; if (d < 60) return `${d} мин өмнө`;
  if (d < 1440) return `${Math.floor(d/60)} цагийн өмнө`; return `${Math.floor(d/1440)} өдрийн өмнө`;
}

// ============ CONFIRM DIALOG ============
function ConfirmDialog({ open, message, confirmLabel = 'Тийм', cancelLabel = 'Үгүй', variant = 'default', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="uz-modal-overlay" onClick={onCancel} style={{ zIndex: 9999 }}>
      <div className="uz-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 className="uz-modal-title" style={{ marginBottom: 12 }}>⚠ Баталгаажуулна уу</h3>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink)', marginBottom: 20, whiteSpace: 'pre-wrap' }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="uz-modal-cancel" style={{ flex: 1, marginTop: 0 }} onClick={onCancel}>{cancelLabel}</button>
          <button className={variant === 'danger' ? 'uz-del-btn' : 'uz-confirm-btn'} style={{ flex: 1, padding: '12px 18px', fontSize: 14 }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ============ COPY BUTTON ============
function CopyButton({ text, label = 'Хуулах' }) {
  const [done, setDone] = useState(false);
  function copy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      });
    } else {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setDone(true); setTimeout(() => setDone(false), 1500); }
      catch (e) {}
      document.body.removeChild(ta);
    }
  }
  return (
    <button className="uz-copy-btn" onClick={copy} title="Хуулах">
      {done ? '✓ Хуулсан' : '📋 ' + label}
    </button>
  );
}

// ============ CHAT THREAD ============
function ChatThread({ booking, myRole, onSend, compact }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(!compact);
  const messages = booking.messages || [];
  const bodyRef = useRef(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages.length, open]);
  function send() {
    if (!text.trim()) return;
    onSend(booking.id, myRole, text);
    setText('');
  }
  const roleLabel = { admin: '🛡 Админ', tech: '👷 Сантехникч', customer: '👤 Хэрэглэгч' };
  if (compact && !open) {
    return (
      <button className="uz-chat-toggle" onClick={() => setOpen(true)}>
        💬 Чат {messages.length > 0 && <span className="uz-badge">{messages.length}</span>}
      </button>
    );
  }
  return (
    <div className="uz-chat">
      <div className="uz-chat-head">
        <span>💬 Чат ({messages.length}) <span className="uz-chat-live">● Live</span></span>
        {compact && <button className="uz-chat-close" onClick={() => setOpen(false)}>✕</button>}
      </div>
      <div className="uz-chat-body" ref={bodyRef}>
        {messages.length === 0 ? (
          <div className="uz-chat-empty">Мессеж бичсэн хүн алга. Эхлээрэй!</div>
        ) : messages.map(m => (
          <div key={m.id} className={`uz-chat-msg ${m.from === myRole ? 'mine' : ''}`}>
            <div className="uz-chat-from">{roleLabel[m.from] || m.from}</div>
            <div className="uz-chat-text">{m.text}</div>
            <div className="uz-chat-ts">{timeAgo(m.ts)}</div>
          </div>
        ))}
      </div>
      <div className="uz-chat-input">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Мессеж бичих..."
          onKeyDown={e => e.key === 'Enter' && send()} />
        <button className="uz-chat-send" onClick={send} disabled={!text.trim()}>Илгээх</button>
      </div>
    </div>
  );
}

// ============ PASSWORD FIELD (reusable, with show/hide) ============
function PasswordField({ value, onChange, placeholder, onKeyDown, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="uz-pass-wrap">
      <input type={show ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder={placeholder} onKeyDown={onKeyDown} autoFocus={autoFocus} />
      <button type="button" className="uz-pass-eye" onClick={() => setShow(!show)} tabIndex={-1} title={show ? 'Нуух' : 'Харах'}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  );
}

// ============ APP ============
export default function App() {
  const [bookings, setBookings] = useState([]);
  const [techs, setTechs] = useState([]);
  const [mode, setMode] = useState('customer'); // customer | tech | admin
  const [view, setView] = useState('home');
  // Scroll to top when view or mode changes
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view, mode]);
  const [activeService, setActiveService] = useState(null);
  const [payBookingId, setPayBookingId] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [toast, setToast] = useState(null);
  const [myPhone, setMyPhone] = useState(null); // customer's phone for viewing bookings
  const [techPhone, setTechPhone] = useState(null);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [settings, setSettings] = useState({
    bankName: '', accountNumber: '', accountHolder: '', contactPhone: '7700-1234',
    paymentLink: '',
    fbLink: '',
    messengerLink: '',
    viberLink: '',
    registrationFee: REGISTRATION_FEE,
    perCallFee: PER_CALL_FEE,
    calloutFee: CALLOUT_FEE,
    techCoinPerComplete: 1,
    techCoinsForFreeCall: COINS_FOR_FREE_CALL,
    customerCoinPerComplete: 1,
    customerCoinsForDiscount: 5,
    customerDiscountAmount: 5000,
    orgMonthlyFee: 300000,
    districts: DISTRICTS,
  });
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [materials, setMaterials] = useState(DEFAULT_MATERIALS);
  const [matOrders, setMatOrders] = useState([]);
  const [customers, setCustomers] = useState({}); // { phone: { coins: N } }
  const [feedback, setFeedback] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [lastSeenBroadcastId, setLastSeenBroadcastId] = useState(null);

  useEffect(() => { (async () => {
    setBookings(await loadList(BOOKINGS_KEY));
    setTechs(await loadList(TECHS_KEY));
    const s = await loadObj(SETTINGS_KEY);
    if (s) setSettings(prev => ({ ...prev, ...s }));
    const sv = await loadList(SERVICES_KEY);
    if (sv && sv.length) setServices(sv);
    const mt = await loadList(MATERIALS_KEY);
    if (mt && mt.length) setMaterials(mt);
    setMatOrders(await loadList(MAT_ORDERS_KEY));
    const cust = await loadObj(CUSTOMERS_KEY);
    if (cust) setCustomers(cust);
    setFeedback(await loadList(FEEDBACK_KEY));
    setOrgs(await loadList(ORGS_KEY));
    setBroadcasts(await loadList(BROADCASTS_KEY));
    try {
      const seen = localStorage.getItem('uszasvar_last_broadcast');
      if (seen) setLastSeenBroadcastId(seen);
    } catch (e) {}
  })(); }, []);

  function showToast(m) { setToast(m); setTimeout(() => setToast(null), 2800); }
  async function refreshAll() {
    setBookings(await loadList(BOOKINGS_KEY));
    setTechs(await loadList(TECHS_KEY));
    const s = await loadObj(SETTINGS_KEY);
    if (s) setSettings(prev => ({ ...prev, ...s }));
    const sv = await loadList(SERVICES_KEY);
    if (sv && sv.length) setServices(sv);
    const mt = await loadList(MATERIALS_KEY);
    if (mt && mt.length) setMaterials(mt);
    setMatOrders(await loadList(MAT_ORDERS_KEY));
    const cust = await loadObj(CUSTOMERS_KEY);
    if (cust) setCustomers(cust);
    setFeedback(await loadList(FEEDBACK_KEY));
    setOrgs(await loadList(ORGS_KEY));
    setBroadcasts(await loadList(BROADCASTS_KEY));
  }

  // SMART POLLING: adaptive interval based on tab visibility & activity
  useEffect(() => {
    let intervalId = null;
    let lastActivity = Date.now();
    let isPolling = false;
    
    async function doFetch() {
      if (isPolling) return; // prevent overlapping requests
      isPolling = true;
      try {
        const [newBookings, newTechs, newFeedback, newOrgs, newCustomers, newBroadcasts] = await Promise.all([
          loadList(BOOKINGS_KEY),
          loadList(TECHS_KEY),
          loadList(FEEDBACK_KEY),
          loadList(ORGS_KEY),
          loadObj(CUSTOMERS_KEY),
          loadList(BROADCASTS_KEY),
        ]);
        setBookings(prev => JSON.stringify(prev) !== JSON.stringify(newBookings) ? newBookings : prev);
        setTechs(prev => JSON.stringify(prev) !== JSON.stringify(newTechs) ? newTechs : prev);
        setFeedback(prev => JSON.stringify(prev) !== JSON.stringify(newFeedback) ? newFeedback : prev);
        setOrgs(prev => JSON.stringify(prev) !== JSON.stringify(newOrgs) ? newOrgs : prev);
        setBroadcasts(prev => JSON.stringify(prev) !== JSON.stringify(newBroadcasts) ? newBroadcasts : prev);
        if (newCustomers) setCustomers(prev => JSON.stringify(prev) !== JSON.stringify(newCustomers) ? newCustomers : prev);
      } catch (e) { /* silent fail */ }
      isPolling = false;
    }
    
    function getInterval() {
      const idleMs = Date.now() - lastActivity;
      if (document.hidden) return 30000;       // Hidden tab: every 30 sec (was 2 sec)
      if (idleMs > 10 * 60 * 1000) return 60000; // Idle > 10 min: every 1 min
      if (idleMs > 2 * 60 * 1000) return 10000;  // Idle 2-10 min: every 10 sec
      return 2000;                             // Active: every 2 sec
    }
    
    function scheduleNext() {
      if (intervalId) clearTimeout(intervalId);
      intervalId = setTimeout(async () => {
        await doFetch();
        scheduleNext();
      }, getInterval());
    }
    
    function onActivity() { lastActivity = Date.now(); }
    function onVisible() {
      if (!document.hidden) {
        lastActivity = Date.now();
        // Immediate fetch when coming back to tab
        doFetch();
      }
    }
    
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('touchstart', onActivity);
    window.addEventListener('click', onActivity);
    document.addEventListener('visibilitychange', onVisible);
    
    scheduleNext();
    
    return () => {
      if (intervalId) clearTimeout(intervalId);
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('click', onActivity);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Register service worker for background notifications
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.log('SW failed:', err));
    }
  }, []);

  // RESTORE SESSION on app load
  useEffect(() => {
    (async () => {
      try {
        // CLEANUP: Remove any existing duplicates from storage
        const keysToClean = [
          { key: TECHS_KEY, by: 'phone' },
          { key: BOOKINGS_KEY, by: 'id' },
          { key: ORGS_KEY, by: 'id' },
          { key: FEEDBACK_KEY, by: 'id' },
          { key: BROADCASTS_KEY, by: 'id' },
        ];
        for (const { key, by } of keysToClean) {
          try {
            const raw = await window.storage.get(key, true);
            if (raw && raw.value) {
              const list = JSON.parse(raw.value);
              if (Array.isArray(list)) {
                const cleaned = dedupeBy(list, by);
                if (cleaned.length !== list.length) {
                  console.log(`Cleaned ${list.length - cleaned.length} duplicates from ${key}`);
                  await window.storage.set(key, JSON.stringify(cleaned), true);
                }
              }
            }
          } catch (e) { /* skip */ }
        }
        
        // Restore session from localStorage (browser-local, not shared)
        let session = null;
        try {
          const raw = localStorage.getItem(SESSION_KEY);
          if (raw) session = JSON.parse(raw);
        } catch (e) { /* skip */ }
        // Migration: also check old shared storage and clean it up
        try {
          const oldShared = await loadObj(SESSION_KEY);
          if (oldShared) {
            await saveObj(SESSION_KEY, null); // delete from shared storage
          }
        } catch (e) {}
        
        if (!session || !session.role) return;
        if (Date.now() - session.savedAt > SESSION_MAX_AGE_MS) {
          localStorage.removeItem(SESSION_KEY);
          return;
        }
        if (session.role === 'admin') {
          setAdminAuthed(true);
          setMode('admin');
          setView('admin');
        } else if (session.role === 'tech' && session.phone) {
          setTechPhone(session.phone);
          setMode('tech');
          setView('techdash');
        } else if (session.role === 'customer' && session.phone) {
          setMyPhone(session.phone);
        }
      } catch (e) { /* silent */ }
    })();
  }, []);

  async function saveSession(role, phone) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ role, phone, savedAt: Date.now() })); } catch (e) {}
  }
  async function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  async function logout() {
    await clearSession();
    setAdminAuthed(false);
    setTechPhone(null);
    setMyPhone(null);
    setMode('customer');
    setView('home');
    showToast('Системээс гарлаа');
  }

  // UNREAD COUNT - title flashing when away + app icon badge
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    const baseTitle = 'УсЗасвар - 24 цагийн сантехникийн дуудлага';
    // Set app icon badge (PWA installed apps)
    if ('setAppBadge' in navigator) {
      try {
        if (unreadCount > 0) navigator.setAppBadge(unreadCount);
        else navigator.clearAppBadge();
      } catch (e) {}
    }
    let alt = false;
    let interval = null;
    function flash() {
      if (unreadCount > 0 && document.hidden) {
        document.title = alt ? `(${unreadCount}) 🔔 Шинэ зүйл!` : baseTitle;
        alt = !alt;
      } else {
        document.title = baseTitle;
      }
    }
    if (unreadCount > 0) {
      interval = setInterval(flash, 1200);
      flash();
    } else {
      document.title = baseTitle;
    }
    function onVisible() {
      if (!document.hidden) {
        setUnreadCount(0);
        document.title = baseTitle;
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      document.title = baseTitle;
    };
  }, [unreadCount]);

  // Admin session timeout - auto-logout after 30 min of inactivity
  useEffect(() => {
    if (!adminAuthed) return;
    let lastActivity = Date.now();
    const updateActivity = () => { lastActivity = Date.now(); };
    window.addEventListener('click', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('touchstart', updateActivity);
    const check = setInterval(() => {
      if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
        setAdminAuthed(false);
        setMode('customer');
        setView('home');
        showToast('Удаан хугацаанд идэвхгүй байсан тул автомат гарлаа');
      }
    }, 30000);
    return () => {
      clearInterval(check);
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
    };
  }, [adminAuthed]);

  // Notification: detect new bookings/changes/chat messages
  const seenBookingsRef = useRef(null);
  const seenStatusesRef = useRef({});
  const seenMessagesRef = useRef({});
  useEffect(() => {
    if (!bookings) return;
    // First load - just initialize
    if (seenBookingsRef.current === null) {
      seenBookingsRef.current = new Set(bookings.map(b => b.id));
      const statuses = {};
      const messages = {};
      bookings.forEach(b => {
        statuses[b.id] = b.completed ? 'completed' : (b.accepted ? 'accepted' : (b.paymentStatus === 'paid' ? 'paid' : 'pending'));
        messages[b.id] = (b.messages || []).length;
      });
      seenStatusesRef.current = statuses;
      seenMessagesRef.current = messages;
      return;
    }
    const currentIds = new Set(bookings.map(b => b.id));
    const newOnes = bookings.filter(b => !seenBookingsRef.current.has(b.id));
    seenBookingsRef.current = currentIds;

    // ADMIN: notify on any new booking
    if (mode === 'admin' && adminAuthed && newOnes.length > 0) {
      newOnes.forEach(b => {
        showBrowserNotification('🛎 Шинэ дуудлага!', `${b.serviceName} · ${b.district} · ${b.customerName || ''}`, { tag: 'new-booking-' + b.id, requireInteraction: true, vibrate: [300, 100, 300] });
      });
      playNotificationSound();
      setUnreadCount(c => c + newOnes.length);
      showToast(`🛎 ${newOnes.length} шинэ дуудлага ирлээ!`);
    }
    // TECH: notify only for matching specialty bookings that are paid
    if (mode === 'tech' && techPhone) {
      const tech = techs.find(t => t.phone === techPhone);
      if (tech) {
        const relevant = newOnes.filter(b => 
          tech.specialties.includes(b.serviceId) && 
          !b.accepted && 
          b.paymentStatus === 'paid'
        );
        if (relevant.length > 0) {
          relevant.forEach(b => {
            showBrowserNotification('🔧 Шинэ дуудлага бэлэн!', `${b.serviceName} · ${b.district}`, { tag: 'tech-' + b.id, requireInteraction: true, vibrate: [300, 100, 300] });
          });
          playNotificationSound();
          setUnreadCount(c => c + relevant.length);
          showToast(`🔧 ${relevant.length} шинэ дуудлага ирлээ!`);
        }
      }
    }
    // CUSTOMER: notify on their booking status changes
    if (mode === 'customer' && myPhone) {
      bookings.forEach(b => {
        if (cleanPhone(b.phone) !== cleanPhone(myPhone)) return;
        const current = b.completed ? 'completed' : (b.accepted ? 'accepted' : (b.paymentStatus === 'paid' ? 'paid' : 'pending'));
        const prev = seenStatusesRef.current[b.id];
        if (prev && prev !== current) {
          if (current === 'paid' && prev === 'pending') {
            showBrowserNotification('✅ Төлбөр баталгаажлаа!', 'Сантехникчид мэдээлэл илгээгдсэн.', { tag: 'paid-' + b.id, requireInteraction: true, vibrate: [200, 100, 200] });
            playNotificationSound();
            setUnreadCount(c => c + 1);
          } else if (current === 'accepted') {
            showBrowserNotification('✓ Сантехникч хүлээж авлаа!', `${b.techName || 'Сантехникч'} тантай уулзах гэж явж байна.`, { tag: 'accepted-' + b.id, requireInteraction: true, vibrate: [200, 100, 200] });
            playNotificationSound();
            setUnreadCount(c => c + 1);
          } else if (current === 'completed') {
            showBrowserNotification('✓ Дуудлага дууссан!', 'Үнэлгээ өгөхөө бүү март!', { tag: 'completed-' + b.id, requireInteraction: true, vibrate: [200, 100, 200] });
            playNotificationSound();
            setUnreadCount(c => c + 1);
          }
        }
        seenStatusesRef.current[b.id] = current;
      });
    }

    // CHAT NOTIFICATIONS - detect new messages
    bookings.forEach(b => {
      const msgs = b.messages || [];
      const prevCount = seenMessagesRef.current[b.id] || 0;
      if (msgs.length > prevCount && prevCount > 0) {
        const newMsgs = msgs.slice(prevCount);
        newMsgs.forEach(m => {
          let shouldNotify = false;
          let label = '';
          if (mode === 'admin' && adminAuthed && m.from !== 'admin') {
            shouldNotify = true;
            label = m.from === 'customer' ? '👤 Үйлчлүүлэгч' : '👷 Сантехникч';
          } else if (mode === 'tech' && techPhone && b.techPhone === techPhone && m.from !== 'tech') {
            shouldNotify = true;
            label = m.from === 'admin' ? '🛡 Админ' : '👤 Үйлчлүүлэгч';
          } else if (mode === 'customer' && myPhone && cleanPhone(b.phone) === cleanPhone(myPhone) && m.from !== 'customer') {
            shouldNotify = true;
            label = m.from === 'admin' ? '🛡 Админ' : '👷 Сантехникч';
          }
          if (shouldNotify) {
            showBrowserNotification(`💬 ${label} (${b.code})`, m.text.substring(0, 100), { tag: 'msg-' + m.id, requireInteraction: true, vibrate: [150, 75, 150] });
            playNotificationSound();
            setUnreadCount(c => c + 1);
          }
        });
      }
      seenMessagesRef.current[b.id] = msgs.length;
    });
  }, [bookings, mode, adminAuthed, techPhone, myPhone, techs]);

  // Broadcast notification: detect new broadcasts
  const seenBroadcastsRef = useRef(null);
  useEffect(() => {
    if (!broadcasts.length) return;
    if (seenBroadcastsRef.current === null) {
      // First load - initialize
      seenBroadcastsRef.current = new Set(broadcasts.map(b => b.id));
      return;
    }
    const newOnes = broadcasts.filter(b => !seenBroadcastsRef.current.has(b.id));
    seenBroadcastsRef.current = new Set(broadcasts.map(b => b.id));
    if (newOnes.length > 0 && mode !== 'admin') {
      // Filter by audience
      const role = mode === 'tech' ? 'techs' : 'customers';
      const relevant = newOnes.filter(b => !b.audience || b.audience === 'all' || b.audience === role);
      relevant.forEach(b => {
        showBrowserNotification(`📢 ${b.title}`, b.message, { tag: 'broadcast-' + b.id, requireInteraction: true, vibrate: [200, 100, 200, 100, 200] });
      });
      if (relevant.length > 0) {
        playNotificationSound();
        setUnreadCount(c => c + relevant.length);
      }
    }
  }, [broadcasts, mode]);

  async function saveServices(list) {
    setServices(list); await saveList(SERVICES_KEY, list);
    showToast('Үйлчилгээний мэдээлэл хадгалагдлаа');
  }
  async function saveMaterials(list) {
    setMaterials(list); await saveList(MATERIALS_KEY, list);
    showToast('Материалын мэдээлэл хадгалагдлаа');
  }
  async function placeMaterialOrder(order) {
    const o = { id: uid(), code: 'МЗ-' + Math.floor(1000 + Math.random() * 9000), ...order, createdAt: Date.now(), status: 'Хүлээн авсан' };
    const next = await atomicUpdateList(MAT_ORDERS_KEY, list => [o, ...list]);
    setMatOrders(next);
    showToast('Материалын захиалга амжилттай');
    return o;
  }

  async function saveSettings(s) {
    setSettings(s); await saveObj(SETTINGS_KEY, s);
    showToast('Банкны данс хадгалагдлаа');
  }
  async function creditTech(phone, amount) {
    const next = await atomicUpdateList(TECHS_KEY, list => 
      list.map(t => t.phone === phone ? { ...t, balance: Math.max(0, (t.balance || 0) + amount) } : t)
    );
    setTechs(next);
    const t = next.find(x => x.phone === phone);
    if (!t) return;
    if (amount > 0) {
      showToast(`${t.name}-ийн үлдэгдэлд ₮${fmt(amount)} нэмэгдлээ`);
    } else {
      showToast(`${t.name}-ийн үлдэгдэлээс ₮${fmt(Math.abs(amount))} хасагдлаа`);
    }
  }

  // ---- Customer booking (no account — name + phone at booking) ----
  async function createBooking(data) {
    const custPhone = cleanPhone(data.phone);
    const custCoins = (customers[custPhone] && customers[custPhone].coins) || 0;
    const coinsForDiscount = (settings.customerCoinsForDiscount || 5);
    const discountAmt = (settings.customerDiscountAmount || 5000);
    const useDiscount = data.useDiscount && custCoins >= coinsForDiscount;
    const calloutAtTime = settings.calloutFee || CALLOUT_FEE;
    const booking = {
      id: uid(), ...data, customerName: data.customerName,
      createdAt: Date.now(), status: 'Төлбөр хүлээгдэж байна',
      code: 'УЗ-' + Math.floor(1000 + Math.random() * 9000),
      techPhone: null, techName: null, accepted: false,
      completed: false, onTime: null, rating: null, coinAwarded: false,
      disputed: false, disputeReason: null, feeRefunded: false,
      adminArrivalTime: null, extraWaitNote: null,
      discountApplied: useDiscount ? discountAmt : 0,
      paymentStatus: 'pending',
      calloutFee: calloutAtTime,
    };
    const next = await atomicUpdateList(BOOKINGS_KEY, list => [booking, ...list]);
    setBookings(next);
    // Deduct coins if discount used
    if (useDiscount) {
      const updatedCustomers = await atomicUpdateObj(CUSTOMERS_KEY, current => ({
        ...(current || {}),
        [custPhone]: { coins: ((current && current[custPhone] && current[custPhone].coins) || custCoins) - coinsForDiscount }
      }));
      setCustomers(updatedCustomers);
    }
    setMyPhone(custPhone);
    setPayBookingId(booking.id);
    setView('pay-booking');
  }

  async function markBookingPaid(bookingId) {
    const next = await atomicUpdateList(BOOKINGS_KEY, list => 
      list.map(b => b.id === bookingId ? { ...b, paymentStatus: 'paid', status: 'Сантехникч хайж байна' } : b)
    );
    setBookings(next);
    showToast('Төлбөр баталгаажлаа. Дуудлага идэвхжлээ.');
  }
  async function rateBooking(bookingId, rating, onTime, comment) {
    const techCoinAmt = (settings.techCoinPerComplete || 1);
    const custCoinAmt = (settings.customerCoinPerComplete || 1);
    const updatedBookings = await atomicUpdateList(BOOKINGS_KEY, list => 
      list.map(b => b.id === bookingId ? {
        ...b,
        rating,
        onTime,
        comment: (comment || '').trim() || null,
        coinAwarded: onTime,
        status: onTime ? 'Дууссан (цагтаа)' : 'Дууссан (хоцорсон)',
      } : b)
    );
    setBookings(updatedBookings);
    const b = updatedBookings.find(x => x.id === bookingId);
    if (b && b.techPhone) {
      const updatedTechs = await atomicUpdateList(TECHS_KEY, list => 
        list.map(t => t.phone === b.techPhone ? {
          ...t,
          ratingSum: (t.ratingSum || 0) + rating,
          ratingCount: (t.ratingCount || 0) + 1,
          onTimeCount: (t.onTimeCount || 0) + (onTime ? 1 : 0),
          coins: (t.coins || 0) + (onTime ? techCoinAmt : 0),
        } : t)
      );
      setTechs(updatedTechs);
    }
    // Award customer coin (when they rate)
    if (b) {
      const custPhone = cleanPhone(b.phone);
      const updatedCustomers = await atomicUpdateObj(CUSTOMERS_KEY, current => ({
        ...(current || {}),
        [custPhone]: { coins: ((current && current[custPhone] && current[custPhone].coins) || 0) + custCoinAmt }
      }));
      setCustomers(updatedCustomers);
    }
    showToast(`Үнэлгээ илгээгдлээ! Танд +${custCoinAmt}🪙 нэмэгдлээ`);
  }
  async function disputeBooking(bookingId, reason) {
    const next = await atomicUpdateList(BOOKINGS_KEY, list => 
      list.map(b => b.id === bookingId
        ? { ...b, disputed: true, disputeReason: reason, feeRefunded: true, status: 'Гомдолтой · төлбөр буцаагдсан' } : b)
    );
    setBookings(next);
    const b = next.find(x => x.id === bookingId);
    if (b && b.techPhone) {
      const updated = await atomicUpdateList(TECHS_KEY, list => 
        list.map(t => t.phone === b.techPhone ? { ...t, complaints: (t.complaints || 0) + 1 } : t)
      );
      setTechs(updated);
    }
    showToast('Гомдол хүлээн авлаа. Дуудлагын төлбөр буцаагдсан');
  }

  // ---- Technician ----
  async function registerTech(data) {
    const phone = cleanPhone(data.phone);
    // Read FRESH from storage to avoid stale state collision
    const currentTechs = await loadList(TECHS_KEY);
    if (currentTechs.some(t => t.phone === phone))
      return { err: 'Энэ утасны дугаар аль хэдийн бүртгэлтэй байна' };
    // Hash password before saving
    const passwordHash = await sha256Hash(data.password);
    const tech = {
      phone, passwordHash, name: data.name, experience: data.experience,
      serviceArea: data.serviceArea, about: data.about, specialties: data.specialties,
      registeredAt: Date.now(), balance: 0, coins: 0, approved: false,
      completedCount: 0, onTimeCount: 0, ratingSum: 0, ratingCount: 0, complaints: 0, blocked: false,
    };
    // Filter out any tech with same phone from current (storage), then prepend new
    const next = [tech, ...currentTechs.filter(t => t.phone !== phone)];
    setTechs(next); await saveList(TECHS_KEY, next);
    setTechPhone(tech.phone); showToast('Бүртгэл хүлээн авлаа! Төлбөр баталгаажсаны дараа идэвхжинэ'); setView('techdash');
    saveSession('tech', tech.phone);
    requestNotificationPermission();
    return {};
  }
  async function techLogin(phone, password) {
    const t = techs.find(x => x.phone === cleanPhone(phone));
    if (!t) return 'notfound';
    // Hash input and compare with stored hash
    const inputHash = await sha256Hash(password);
    let ok = false;
    if (t.passwordHash) {
      ok = inputHash === t.passwordHash;
    } else if (t.password) {
      // Legacy: plaintext password (migrate on successful login)
      ok = t.password === password;
      if (ok) {
        // Migrate to hash
        const updated = techs.map(x => x.phone === t.phone ? { ...x, passwordHash: inputHash, password: undefined } : x);
        setTechs(updated); await saveList(TECHS_KEY, updated);
      }
    }
    if (!ok) return 'wrongpass';
    setTechPhone(t.phone); setView('techdash');
    saveSession('tech', t.phone);
    requestNotificationPermission();
    return t.blocked ? 'blocked' : 'ok';
  }
  async function updateTech(phone, updater) {
    const next = await atomicUpdateList(TECHS_KEY, list => 
      list.map(t => t.phone === phone ? updater(t) : t)
    );
    setTechs(next);
  }
  async function acceptCall(booking, payMethod) {
    // Re-fetch latest tech & booking from storage
    const currentTechs = await loadList(TECHS_KEY);
    const tech = currentTechs.find(t => t.phone === techPhone);
    if (!tech) return;
    // Check if blocked
    if (tech.blockedUntil && tech.blockedUntil > Date.now()) {
      const daysLeft = Math.ceil((tech.blockedUntil - Date.now()) / (24 * 60 * 60 * 1000));
      showToast(`Та блоклогдсон байна. ${daysLeft} хоног үлдсэн.`);
      return;
    }
    const perCallFee = settings.perCallFee || PER_CALL_FEE;
    const coinsForFree = settings.techCoinsForFreeCall || COINS_FOR_FREE_CALL;
    if (payMethod === 'money' && tech.balance < perCallFee) { showToast('Үлдэгдэл хүрэлцэхгүй байна'); return; }
    if (payMethod === 'coin' && (tech.coins || 0) < coinsForFree) { showToast('Coin хүрэлцэхгүй байна'); return; }
    // Check if booking still available (not taken by someone else)
    const currentBookings = await loadList(BOOKINGS_KEY);
    const curr = currentBookings.find(b => b.id === booking.id);
    if (!curr) { showToast('Дуудлага олдсонгүй'); return; }
    if (curr.accepted) { showToast('Энэ дуудлагыг өөр сантехникч хүлээж аваад байна'); refreshAll(); return; }
    // Update tech (balance/coin)
    const updatedTechs = currentTechs.map(t => t.phone === techPhone ? 
      (payMethod === 'money' ? { ...t, balance: t.balance - perCallFee } : { ...t, coins: t.coins - coinsForFree }) : t);
    await saveList(TECHS_KEY, updatedTechs);
    setTechs(updatedTechs);
    // Update booking
    const updatedBookings = currentBookings.map(b => b.id === booking.id ? 
      { ...b, techPhone, techName: tech.name, accepted: true, payMethod, status: 'Сантехникч замдаа' } : b);
    await saveList(BOOKINGS_KEY, updatedBookings);
    setBookings(updatedBookings);
    showToast(payMethod === 'money' ? `Дуудлага авлаа (−${fmt(perCallFee)}₮)` : `Дуудлага авлаа (−${coinsForFree} coin)`);
  }
  async function completeCall(booking) {
    const updatedBookings = await atomicUpdateList(BOOKINGS_KEY, list => 
      list.map(b => b.id === booking.id ? { ...b, completed: true, status: 'Дууссан · үнэлгээ хүлээж байна' } : b)
    );
    setBookings(updatedBookings);
    const updatedTechs = await atomicUpdateList(TECHS_KEY, list => 
      list.map(t => t.phone === techPhone ? { ...t, completedCount: (t.completedCount || 0) + 1 } : t)
    );
    setTechs(updatedTechs);
    showToast('Дуудлага дууссан! Үйлчлүүлэгчийн үнэлгээг хүлээж байна.');
  }

  // ---- Admin: delete booking ----
  async function deleteBooking(bookingId) {
    const next = await atomicUpdateList(BOOKINGS_KEY, list => list.filter(b => b.id !== bookingId));
    setBookings(next);
    showToast('Дуудлага устгагдлаа');
  }

  // ---- Feedback ----
  async function submitFeedback(data) {
    const item = { id: uid(), ...data, createdAt: Date.now(), read: false };
    const next = await atomicUpdateList(FEEDBACK_KEY, list => [item, ...list]);
    setFeedback(next);
    showToast('Таны санал амжилттай илгээгдлээ. Баярлалаа!');
  }
  async function markFeedbackRead(id) {
    const next = await atomicUpdateList(FEEDBACK_KEY, list => list.map(f => f.id === id ? { ...f, read: true } : f));
    setFeedback(next);
  }
  async function deleteFeedback(id) {
    const next = await atomicUpdateList(FEEDBACK_KEY, list => list.filter(f => f.id !== id));
    setFeedback(next);
    showToast('Санал устгагдлаа');
  }

  // ---- Organizations (subscription) ----
  async function submitOrgRequest(data) {
    const org = { id: uid(), ...data, createdAt: Date.now(), status: 'pending', paid: false };
    const next = await atomicUpdateList(ORGS_KEY, list => [org, ...list]);
    setOrgs(next);
    showToast('Гэрээт үйлчилгээний хүсэлт илгээгдлээ. Бид удахгүй холбогдоно.');
  }
  async function approveOrg(id) {
    const next = await atomicUpdateList(ORGS_KEY, list => list.map(o => o.id === id ? { ...o, status: 'active', paid: true, activatedAt: Date.now() } : o));
    setOrgs(next);
    showToast('Байгууллага идэвхжүүлэгдлээ');
  }
  async function deleteOrg(id) {
    const next = await atomicUpdateList(ORGS_KEY, list => list.filter(o => o.id !== id));
    setOrgs(next);
    showToast('Байгууллага устгагдлаа');
  }

  // ---- Broadcasts (mass push notifications) ----
  async function sendBroadcast(title, message, audience, discountPct, expiresAt) {
    const broadcast = {
      id: uid(),
      title: title.trim(),
      message: message.trim(),
      audience: audience || 'all', // 'all' | 'customers' | 'techs'
      discountPct: Number(discountPct) || 0,
      expiresAt: expiresAt || null, // Date.now() value
      ts: Date.now(),
    };
    const next = await atomicUpdateList(BROADCASTS_KEY, list => [broadcast, ...list]);
    setBroadcasts(next);
    showToast('📢 Мэдэгдэл илгээгдлээ');
  }
  async function deleteBroadcast(id) {
    const next = await atomicUpdateList(BROADCASTS_KEY, list => list.filter(b => b.id !== id));
    setBroadcasts(next);
    showToast('Мэдэгдэл устгагдлаа');
  }
  function markBroadcastsSeen() {
    if (broadcasts.length === 0) return;
    const latest = broadcasts[0].id;
    setLastSeenBroadcastId(latest);
    try { localStorage.setItem('uszasvar_last_broadcast', latest); } catch (e) {}
  }

  // ---- Tech Warnings & Block ----
  async function sendWarning(techPhone, type, message, days) {
    const warning = {
      id: uid(),
      type, // 'late' | 'incomplete' | 'block' | 'general'
      message,
      ts: Date.now(),
      days: days || 0,
      replies: [], // [{ from: 'admin'|'tech', text, ts }]
      read: false,
    };
    const blockedUntil = days > 0 ? Date.now() + (days * 24 * 60 * 60 * 1000) : null;
    await updateTech(techPhone, t => ({
      ...t,
      warnings: [warning, ...(t.warnings || [])],
      ...(blockedUntil ? { blockedUntil, blocked: true } : {}),
    }));
    showToast(days > 0 ? `Сантехникч ${days} хоног блоклогдлоо` : 'Анхааруулга илгээгдлээ');
  }
  async function replyToWarning(techPhone, warningId, fromRole, text) {
    if (!text.trim()) return;
    const reply = { id: uid(), from: fromRole, text: text.trim(), ts: Date.now() };
    await updateTech(techPhone, t => ({
      ...t,
      warnings: (t.warnings || []).map(w => w.id === warningId ? { ...w, replies: [...(w.replies || []), reply], read: fromRole === 'tech' ? w.read : true } : w),
    }));
  }
  async function markWarningRead(techPhone, warningId) {
    await updateTech(techPhone, t => ({
      ...t,
      warnings: (t.warnings || []).map(w => w.id === warningId ? { ...w, read: true } : w),
    }));
  }
  async function unblockTech(techPhone) {
    await updateTech(techPhone, t => ({ ...t, blockedUntil: null, blocked: false }));
    showToast('Блок цуцлагдлаа');
  }

  // ---- Chat ----
  async function sendMessage(bookingId, from, text) {
    if (!text.trim()) return;
    const msg = { id: uid(), from, text: text.trim(), ts: Date.now() };
    const next = await atomicUpdateList(BOOKINGS_KEY, list => 
      list.map(b => b.id === bookingId ? { ...b, messages: [...(b.messages || []), msg] } : b)
    );
    setBookings(next);
    showToast('Мессеж илгээгдлээ');
  }

  // ---- Admin ----
  async function toggleBlock(phone) {
    const next = await atomicUpdateList(TECHS_KEY, list => 
      list.map(t => t.phone === phone ? { ...t, blocked: !t.blocked } : t)
    );
    setTechs(next);
    const t = next.find(x => x.phone === phone);
    if (t) showToast(t.blocked ? `${t.name} блоклогдлоо` : `${t.name}-ийн блок цуцлагдлаа`);
  }
  async function approveTech(phone) {
    const next = await atomicUpdateList(TECHS_KEY, list => 
      list.map(t => t.phone === phone ? { ...t, approved: true } : t)
    );
    setTechs(next);
    const t = next.find(x => x.phone === phone);
    if (t) showToast(`${t.name}-д нэвтрэх эрх олголоо`);
  }
  async function rejectTech(phone) {
    const tInfo = techs.find(x => x.phone === phone);
    const next = await atomicUpdateList(TECHS_KEY, list => list.filter(x => x.phone !== phone));
    setTechs(next);
    showToast(`${tInfo ? tInfo.name : 'Сантехникч'}-ийн бүртгэл буцаагдлаа`);
  }
  async function setArrivalTime(bookingId, time) {
    const next = await atomicUpdateList(BOOKINGS_KEY, list => 
      list.map(b => b.id === bookingId
        ? { ...b, adminArrivalTime: time, status: b.accepted ? b.status : 'Очих цаг тогтоогдсон' } : b)
    );
    setBookings(next);
    showToast('Очих цаг хэрэглэгчид мэдэгдлээ');
  }
  async function setExtraWait(bookingId, note) {
    const next = await atomicUpdateList(BOOKINGS_KEY, list => 
      list.map(b => b.id === bookingId
        ? { ...b, extraWaitNote: note, status: 'Нэмэлт хугацаа мэдэгдсэн' } : b)
    );
    setBookings(next);
    showToast('Нэмэлт хүлээх хугацаа мэдэгдлээ');
  }

  const myBookings = myPhone ? bookings.filter(b => cleanPhone(b.phone) === myPhone) : [];
  const currentTech = techs.find(t => t.phone === techPhone) || null;

  return (
    <div className="uz">
      <style>{STYLES}</style>
      <Header
        mode={mode}
        setMode={(m) => { setMode(m); setView(m === 'tech' ? (techPhone ? 'techdash' : 'techentry') : m === 'admin' ? 'admin' : 'home'); }}
        view={view} setView={setView}
        myCount={myBookings.length} isTechLoggedIn={!!techPhone}
      />

      {/* CUSTOMER (no account needed) */}
      {mode === 'customer' && view === 'home' && (
        <Home
          onPlaceCall={() => setView('services')}
          onMaterials={() => setView('materials')}
          onTechRegister={() => { setMode('tech'); setView(techPhone ? 'techdash' : 'techentry'); }}
          onTrack={() => setView('mybookings')}
          onAdmin={() => { setMode('admin'); setView('admin'); }}
          onHelp={() => setView('help')}
          onFeedback={() => setView('feedback')}
          onOrgs={() => setView('orgs')}
          onReviews={() => setView('reviews')}
          isLoggedInAsTech={!!techPhone}
          isLoggedInAsAdmin={adminAuthed}
          techName={currentTech ? currentTech.name : null}
          latestBroadcast={(() => {
            const relevant = broadcasts.filter(b => !b.audience || b.audience === 'all' || b.audience === 'customers');
            if (!relevant.length) return null;
            const latest = relevant[0];
            return lastSeenBroadcastId === latest.id ? null : latest;
          })()}
          onDismissBroadcast={markBroadcastsSeen}
        />
      )}
      {mode === 'customer' && view === 'reviews' && (
        <ReviewsPage bookings={bookings} onBack={() => setView('home')} />
      )}
      {mode === 'customer' && view === 'orgs' && (
        <OrgsPage settings={settings} onSubmit={submitOrgRequest} onBack={() => setView('home')} />
      )}
      {mode === 'customer' && view === 'feedback' && (
        <FeedbackForm onSubmit={submitFeedback} onBack={() => setView('home')} />
      )}
      {mode === 'customer' && view === 'services' && (
        <ServicesPage services={services} settings={settings} selectedDistrict={selectedDistrict} onSelectDistrict={setSelectedDistrict} onBook={(s) => { setActiveService(s); setView('booking'); }} onBack={() => setView('home')} />
      )}
      {mode === 'customer' && view === 'booking' && (
        <Booking service={activeService} customers={customers} settings={settings} initialDistrict={selectedDistrict} onCancel={() => setView('services')} onSubmit={createBooking} />
      )}
      {mode === 'customer' && view === 'pay-booking' && payBookingId && (
        <BookingPayment booking={bookings.find(b => b.id === payBookingId)} settings={settings} broadcasts={broadcasts} onDone={() => { setPayBookingId(null); setView('mybookings'); }} />
      )}
      {mode === 'customer' && view === 'mybookings' && (
        <MyBookings bookings={myBookings} hasPhone={!!myPhone} onLookup={(p) => { const cleaned = cleanPhone(p); setMyPhone(cleaned); saveSession('customer', cleaned); requestNotificationPermission(); }} onNew={() => setView('home')} onRate={rateBooking} onDispute={disputeBooking} onSendMessage={sendMessage} onBack={() => setView('home')} myCoins={myPhone && customers[myPhone] ? customers[myPhone].coins || 0 : 0} settings={settings} broadcasts={broadcasts} />
      )}
      {mode === 'customer' && view === 'materials' && (
        <Materials materials={materials} settings={settings} onOrder={placeMaterialOrder} onBack={() => setView('home')} />
      )}
      {mode === 'customer' && view === 'help' && (
        <HelpGuide onBack={() => setView('home')} settings={settings} />
      )}

      {/* TECHNICIAN */}
      {mode === 'tech' && view === 'techentry' && (
        <TechEntry settings={settings} onRegister={() => setView('techreg')} onLogin={techLogin} onBack={() => { setMode('customer'); setView('home'); }} />
      )}
      {mode === 'tech' && view === 'techreg' && (
        <TechRegister settings={settings} services={services} onCancel={() => setView('techentry')} onSubmit={registerTech} />
      )}
      {mode === 'tech' && view === 'techdash' && currentTech && (
        currentTech.blocked
          ? <TechBlocked tech={currentTech} onBack={() => { setTechPhone(null); setView('techentry'); }} />
          : currentTech.approved === false
            ? <TechPending tech={currentTech} settings={settings} onRefresh={refreshAll} onBack={() => { setTechPhone(null); setView('techentry'); }} />
            : <TechDashboard tech={currentTech} bookings={bookings} settings={settings} onAccept={acceptCall} onComplete={completeCall} onRefresh={refreshAll} onSendMessage={sendMessage} onReplyWarning={replyToWarning} onMarkWarningRead={markWarningRead} onLogout={logout} />
      )}

      {/* ADMIN */}
      {mode === 'admin' && !adminAuthed && (
        <AdminLogin onAuth={() => { setAdminAuthed(true); saveSession('admin', null); refreshAll(); }} onBack={() => { setMode('customer'); setView('home'); }} />
      )}
      {mode === 'admin' && adminAuthed && (
        <AdminDashboard techs={techs} bookings={bookings} customers={customers} feedback={feedback} orgs={orgs} broadcasts={broadcasts} settings={settings} services={services} materials={materials} matOrders={matOrders} onToggleBlock={toggleBlock} onApproveTech={approveTech} onRejectTech={rejectTech} onSetArrival={setArrivalTime} onSetExtraWait={setExtraWait} onSaveSettings={saveSettings} onCreditTech={creditTech} onSaveServices={saveServices} onSaveMaterials={saveMaterials} onSendMessage={sendMessage} onDeleteBooking={deleteBooking} onMarkPaid={markBookingPaid} onMarkFeedbackRead={markFeedbackRead} onDeleteFeedback={deleteFeedback} onApproveOrg={approveOrg} onDeleteOrg={deleteOrg} onSendBroadcast={sendBroadcast} onDeleteBroadcast={deleteBroadcast} onSendWarning={sendWarning} onReplyWarning={replyToWarning} onUnblockTech={unblockTech} onRefresh={refreshAll} onLogout={logout} />
      )}

      <Footer settings={settings} />
      {toast && <div className="uz-toast">✓ {toast}</div>}
    </div>
  );
}

// ============ HEADER ============
function Header({ mode, setMode, view, setView, myCount, isTechLoggedIn }) {
  return (
    <header className="uz-header">
      <div className="uz-header-inner">
        <button className="uz-logo" onClick={() => { setMode('customer'); setView('home'); }}>
          <span className="uz-logo-icon">💧</span><span className="uz-logo-text">Ус<span className="uz-logo-accent">Засвар</span></span>
        </button>
        <div className="uz-track-link-wrap">
          {mode === 'customer' && view !== 'mybookings' && (
            <button className="uz-track-link" onClick={() => setView('mybookings')}>
              📋 Дуудлагаа энд дарж хянана уу {myCount > 0 && <span className="uz-badge">{myCount}</span>}
            </button>
          )}
          {mode === 'tech' && isTechLoggedIn && (
            <button className="uz-track-link" onClick={() => { setMode('customer'); setView('home'); }}>🏠 Нүүр</button>
          )}
          {mode === 'admin' && (
            <button className="uz-track-link" onClick={() => { setMode('customer'); setView('home'); }}>🏠 Нүүр</button>
          )}
        </div>
      </div>
    </header>
  );
}

// ============ HOME ============
function Home({ onPlaceCall, onMaterials, onTechRegister, onTrack, onAdmin, onHelp, onFeedback, onOrgs, onReviews, isLoggedInAsTech, isLoggedInAsAdmin, techName, latestBroadcast, onDismissBroadcast }) {
  const [installOpen, setInstallOpen] = useState(false);
  // Detect if already installed (running as PWA)
  const isInstalled = (() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  })();
  return (
    <div className="uz-home">
      {(isLoggedInAsTech || isLoggedInAsAdmin) && (
        <div className="uz-session-banner" onClick={isLoggedInAsAdmin ? onAdmin : onTechRegister}>
          <div style={{ fontSize: 24 }}>{isLoggedInAsAdmin ? '🛡' : '👷'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {isLoggedInAsAdmin ? 'Та админ эрхтэй нэвтэрсэн' : `Сайн уу, ${techName || 'сантехникч'}!`}
            </div>
            <div style={{ fontSize: 12, opacity: .9 }}>
              {isLoggedInAsAdmin ? 'Админ самбар руу буцах →' : 'Сантехникч самбар руу буцах →'}
            </div>
          </div>
          <div style={{ fontSize: 20 }}>→</div>
        </div>
      )}
      {latestBroadcast && (
        <div className="uz-broadcast-banner">
          <div className="uz-broadcast-icon">📢</div>
          <div className="uz-broadcast-body">
            <div className="uz-broadcast-title">{latestBroadcast.title}</div>
            <div className="uz-broadcast-msg">{latestBroadcast.message}</div>
          </div>
          <button className="uz-broadcast-close" onClick={onDismissBroadcast} title="Хаах">×</button>
        </div>
      )}
      <button className="uz-install-link" onClick={() => setInstallOpen(true)}>
        📲 Аппыг утсандаа суулгах →
      </button>
      <div className="uz-home-header">
        <h1 className="uz-home-title">Тавтай морил!</h1>
        <div className="uz-home-sub-row">
          <span className="uz-arrow-down">⬇</span>
          <p className="uz-home-sub">Доош гүйлж үйлчилгээгээ сонгоно уу</p>
          <span className="uz-arrow-down">⬇</span>
        </div>
      </div>
      <div className="uz-home-cards">
        <button className="uz-home-card uz-home-card--call" onClick={onPlaceCall}>
          <div className="uz-home-card-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
          </div>
          <div className="uz-home-card-title">Дуудлага өгөх</div>
          <div className="uz-home-card-sub">Сантехникч дуудах</div>
        </button>
        <button className="uz-home-card uz-home-card--tech" onClick={onTechRegister}>
          <div className="uz-home-card-icon">👷</div>
          <div className="uz-home-card-title">Сантехникч болох</div>
          <div className="uz-home-card-sub">Ажил, орлого хайж буй бол</div>
        </button>
        <button className="uz-home-card uz-home-card--mat" onClick={onMaterials}>
          <div className="uz-home-card-icon">🛠</div>
          <div className="uz-home-card-title">Материал захиалах</div>
          <div className="uz-home-card-sub">Холигч, хоолой, бусад</div>
        </button>
      </div>

      <button className="uz-org-banner" onClick={onOrgs}>
        <div className="uz-org-banner-left">
          <div className="uz-org-icon">🏢</div>
        </div>
        <div className="uz-org-banner-body">
          <div className="uz-org-banner-title">Албан байгууллага → Гэрээт үйлчилгээ</div>
          <div className="uz-org-banner-sub">Сарын суурь хураамжтай · Гэрээний дагуу үнэ тохиролцоно · Бүх сантехник асуудлыг бүрэн хариуцна</div>
        </div>
        <div className="uz-org-banner-arrow">→</div>
      </button>

      <button className="uz-help-link" onClick={onHelp}>
        🪙 Coin шагналын тухай & Аппыг хэрхэн ашиглах →
      </button>
      <button className="uz-feedback-link" onClick={onTrack} style={{ background: '#e6f7ef', color: '#0d8a56', borderColor: '#b9e8d2' }}>
        📋 Дуудлагаа энд дарж хянана уу →
      </button>
      <button className="uz-feedback-link" onClick={onReviews} style={{ background: '#fff8e1', color: '#7a5a00', borderColor: '#f0d678' }}>
        ⭐ Үйлчлүүлэгчдийн үнэлгээ харах →
      </button>
      <button className="uz-feedback-link" onClick={onFeedback}>
        📝 Санал хүсэлт илгээх →
      </button>
      <button className="uz-admin-login-btn" onClick={onAdmin}>
        🛡 Админ нэвтрэх
      </button>
      {installOpen && <InstallModal onClose={() => setInstallOpen(false)} />}
    </div>
  );
}

// ============ INSTALL MODAL ============
function InstallModal({ onClose }) {
  const isIOS = (typeof navigator !== 'undefined') && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [platform, setPlatform] = useState(isIOS ? 'ios' : 'android');
  return (
    <div className="uz-modal-overlay" onClick={onClose}>
      <div className="uz-modal uz-install-modal" onClick={e => e.stopPropagation()}>
        <button className="uz-modal-x" onClick={onClose} aria-label="Хаах">×</button>
        <div className="uz-install-hero">
          <div className="uz-install-icon">📲</div>
          <h2 className="uz-install-title">Аппыг утсандаа суулгах</h2>
          <p className="uz-install-sub">2 минутын дотор бэлэн. Үнэгүй!</p>
        </div>
        <div className="uz-install-benefits">
          <div className="uz-install-benefit">
            <div className="uz-install-benefit-icon">⚡</div>
            <div>Шуурхай нээгдэх</div>
          </div>
          <div className="uz-install-benefit">
            <div className="uz-install-benefit-icon">🔔</div>
            <div>Мэдэгдэл ирэх</div>
          </div>
          <div className="uz-install-benefit">
            <div className="uz-install-benefit-icon">📱</div>
            <div>Home screen дээр</div>
          </div>
        </div>
        <div className="uz-install-tabs">
          <button className={`uz-install-tab ${platform === 'android' ? 'active' : ''}`} onClick={() => setPlatform('android')}>🤖 Android</button>
          <button className={`uz-install-tab ${platform === 'ios' ? 'active' : ''}`} onClick={() => setPlatform('ios')}>📱 iPhone</button>
        </div>
        {platform === 'android' ? (
          <div className="uz-install-steps">
            <div className="uz-install-step">
              <div className="uz-install-step-num">1</div>
              <div className="uz-install-step-body">
                <b>Chrome browser</b>-оор энэ хуудсыг нээ
                <small>Хэрэв Chrome биш бол → Chrome-оор нээгээд буцаж ор</small>
              </div>
            </div>
            <div className="uz-install-step">
              <div className="uz-install-step-num">2</div>
              <div className="uz-install-step-body">
                Баруун дээд буланд <b>⋮</b> (3 цэг) товч дар
                <small>Эсвэл доод талд "Гэрт нэмэх" banner гарвал тэр</small>
              </div>
            </div>
            <div className="uz-install-step">
              <div className="uz-install-step-num">3</div>
              <div className="uz-install-step-body">
                <b>"Install app"</b> эсвэл <b>"Add to Home screen"</b> сонгох
                <small>Зарим утсанд "Гэрт нэмэх" гэж бичигдсэн</small>
              </div>
            </div>
            <div className="uz-install-step">
              <div className="uz-install-step-num">4</div>
              <div className="uz-install-step-body">
                <b>"Install"</b> эсвэл <b>"Нэмэх"</b> товч дар → бэлэн!
                <small>Home screen дээр УсЗасвар icon гарна 💧🔧</small>
              </div>
            </div>
          </div>
        ) : (
          <div className="uz-install-steps">
            <div className="uz-install-step">
              <div className="uz-install-step-num">1</div>
              <div className="uz-install-step-body">
                <b>Safari browser</b>-аар энэ хуудсыг нээ
                <small>⚠ Заавал Safari! Chrome дээр ажиллахгүй</small>
              </div>
            </div>
            <div className="uz-install-step">
              <div className="uz-install-step-num">2</div>
              <div className="uz-install-step-body">
                Доод талын <b>📤</b> (Share) товч дар
                <small>Дээш чиглэсэн сум бүхий квадрат icon</small>
              </div>
            </div>
            <div className="uz-install-step">
              <div className="uz-install-step-num">3</div>
              <div className="uz-install-step-body">
                Доош scroll хийгээд <b>"Add to Home Screen"</b> дар
                <small>📲 + тэмдэгтэй icon</small>
              </div>
            </div>
            <div className="uz-install-step">
              <div className="uz-install-step-num">4</div>
              <div className="uz-install-step-body">
                Баруун дээд буланд <b>"Add"</b> дар → бэлэн!
                <small>Home screen дээр УсЗасвар app гарна 💧🔧</small>
              </div>
            </div>
          </div>
        )}
        <button className="uz-install-done" onClick={onClose}>Ойлголоо ✓</button>
      </div>
    </div>
  );
}

// ============ SERVICES PAGE (booking flow) ============
function ServicesPage({ services, settings, selectedDistrict, onSelectDistrict, onBook, onBack }) {
  const districts = (settings && settings.districts && settings.districts.length) ? settings.districts : DISTRICTS;
  const [district, setDistrict] = useState(selectedDistrict || districts[0]);
  const [cat, setCat] = useState('Бүгд');
  const cats = ['Бүгд', ...Array.from(new Set(services.map(s => s.cat)))];
  const list = cat === 'Бүгд' ? services : services.filter(s => s.cat === cat);
  const availableTechs = 4 + (district.eta < 25 ? 2 : 0);
  function handleDistrictChange(d) {
    setDistrict(d);
    if (onSelectDistrict) onSelectDistrict(d);
  }
  return (
    <>
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '20px 24px 0' }}>
        <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>
      </div>
      <section className="uz-hero">
        <div className="uz-hero-inner">
          <div className="uz-live-badge"><span className="uz-live-dot" /> Одоо ажиллаж байна · 24/7</div>
          <h1 className="uz-hero-title">Сантехникийн асуудлыг<br/><span className="uz-hl">тэр даруй</span> шийдье</h1>
          <p className="uz-hero-sub">Ил тод үнэ, тогтсон хугацаа. Захиалга өгөхөөсөө өмнө үнэ болон сантехникч хэдэн минутын дотор ирэхийг харна.</p>
          <div className="uz-eta-picker">
            <div className="uz-eta-field"><label>Таны байршил</label>
              <select value={district.name} onChange={e => handleDistrictChange(districts.find(d => d.name === e.target.value))}>
                {districts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select></div>
            <div className="uz-eta-result">
              <div className="uz-eta-block"><div className="uz-eta-num">~{district.eta}<span>мин</span></div><div className="uz-eta-label">ойролцоогоор ирнэ</div></div>
              <div className="uz-eta-divider" />
              <div className="uz-eta-block"><div className="uz-eta-num uz-eta-num--green">{availableTechs}</div><div className="uz-eta-label">сантехникч сул байна</div></div>
            </div>
          </div>
          <div className="uz-trust-row"><span>✓ Дуудлагын хураамж {fmt((settings && settings.calloutFee) || CALLOUT_FEE)}₮-өөс</span><span>✓ Баталгаат засвар</span><span>✓ Ажил дутуу бол төлбөр буцаана</span></div>
        </div>
        <div className="uz-hero-deco" />
      </section>
      <section className="uz-services">
        <div className="uz-section-head"><h2 className="uz-section-title">Үйлчилгээ ба үнэ</h2><p className="uz-section-sub">Бүх үнэ ил тод. Эцсийн үнэ ажлын хэмжээнээс хамаарна.</p></div>
        <div className="uz-cat-tabs">{cats.map(c => <button key={c} className={`uz-cat-tab ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="uz-service-grid">
          {list.map((s, i) => (
            <div key={s.id} className="uz-service-card" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="uz-service-icon">{s.icon}</div>
              <div className="uz-service-body">
                <h3 className="uz-service-name">{s.name}</h3><p className="uz-service-desc">{s.desc}</p>
                <div className="uz-service-meta"><span className="uz-meta-pill">⏱ {s.duration}</span><span className="uz-meta-pill uz-meta-pill--cat">{s.cat}</span></div>
              </div>
              <div className="uz-service-foot">
                <div className="uz-price"><span className="uz-price-from">Үнэ</span>
                  <span className="uz-price-val">₮{fmt(s.priceMin)}+</span></div>
                <button className="uz-book-btn" onClick={() => onBook(s)}>Дуудах →</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ============ REVIEWS PAGE (PUBLIC) ============
function ReviewsPage({ bookings, onBack }) {
  const [filter, setFilter] = useState('all');
  const rated = bookings.filter(b => b.completed && !b.disputed && b.rating != null);
  const filtered = filter === 'all' ? rated : rated.filter(b => b.rating === parseInt(filter));
  const avgRating = rated.length ? (rated.reduce((sum, b) => sum + b.rating, 0) / rated.length).toFixed(1) : 0;
  const total5 = rated.filter(b => b.rating === 5).length;
  return (
    <div className="uz-page" style={{ maxWidth: 800 }}>
      <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>
      <h1 className="uz-page-title">⭐ Үйлчлүүлэгчдийн үнэлгээ</h1>
      <div className="uz-reviews-stats">
        <div className="uz-reviews-avg">
          <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--gold)' }}>{avgRating}</div>
          <div style={{ fontSize: 22, color: 'var(--gold)' }}>{'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{rated.length} үнэлгээ</div>
        </div>
        <div className="uz-reviews-summary">
          <div className="uz-reviews-row"><span>5★ үнэлгээ</span> <b>{total5}</b></div>
          <div className="uz-reviews-row"><span>Нийт амжилттай</span> <b>{rated.length}</b></div>
          <div className="uz-reviews-row"><span>Цагтаа ирсэн</span> <b>{rated.filter(b => b.onTime).length} ({rated.length ? Math.round(rated.filter(b => b.onTime).length / rated.length * 100) : 0}%)</b></div>
        </div>
      </div>
      <div className="uz-cat-tabs" style={{ marginBottom: 14 }}>
        {['all', '5', '4', '3', '2', '1'].map(f => (
          <button key={f} className={`uz-cat-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Бүгд' : `${f}★`}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="uz-empty-sm">Энэ ангилалд үнэлгээ алга байна.</div>
      ) : (
        <div className="uz-reviews-list">
          {filtered.slice(0, 50).map(b => {
            const name = (b.customerName || '').split(' ')[0] || 'Х';
            const initial = name[0] + '***';
            return (
              <div key={b.id} className="uz-review-card">
                <div className="uz-review-head">
                  <div className="uz-review-avatar">{name[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{initial}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{b.serviceName} · {b.district} · {timeAgo(b.createdAt)}</div>
                  </div>
                  <div style={{ color: 'var(--gold)', fontSize: 18 }}>{'★'.repeat(b.rating)}{'☆'.repeat(5 - b.rating)}</div>
                </div>
                {b.comment && <div className="uz-review-text">"{b.comment}"</div>}
                {b.onTime && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 6 }}>✓ Цагтаа ирсэн</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ ORGANIZATIONS PAGE ============
function OrgsPage({ settings, onSubmit, onBack }) {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [employees, setEmployees] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const monthlyFee = (settings && settings.orgMonthlyFee) || 300000;
  function submit() {
    if (!companyName.trim()) return setErr('Байгууллагын нэрийг бөглөнө үү');
    if (!contactName.trim()) return setErr('Холбоо барих хүний нэрийг бөглөнө үү');
    if (!validPhone(phone)) return setErr('8 оронтой утас оруулна уу');
    if (!address.trim()) return setErr('Хаягаа оруулна уу');
    setErr('');
    onSubmit({
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      position: position.trim(),
      phone: phone.trim(),
      address: address.trim(),
      employees: employees.trim(),
      note: note.trim(),
    });
    setDone(true);
  }
  if (done) {
    return (
      <div className="uz-page" style={{ maxWidth: 560 }}>
        <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>
        <div className="uz-empty">
          <div className="uz-empty-icon">🏢</div>
          <div className="uz-empty-title">Хүсэлт амжилттай илгээгдлээ!</div>
          <div className="uz-empty-sub">Бид удахгүй танай байгууллагатай холбогдож гэрээт үйлчилгээний дэлгэрэнгүйг тохиролцох болно. Ойролцоогоор 1-2 ажлын өдөрт холбогдох болно.</div>
          <button className="uz-confirm-btn" style={{ marginTop: 22, maxWidth: 240 }} onClick={onBack}>Нүүр буцах</button>
        </div>
      </div>
    );
  }
  return (
    <div className="uz-page" style={{ maxWidth: 880 }}>
      <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>
      <div className="uz-org-hero">
        <div className="uz-org-hero-icon">🏢</div>
        <h1 className="uz-org-hero-title">Албан байгууллагын гэрээт үйлчилгээ</h1>
        <p className="uz-org-hero-sub">Сард тогтсон хураамжтай — сантехникийн бүх асуудлыг бид бүрэн хариуцна</p>
      </div>

      <div className="uz-org-benefits">
        <h2 className="uz-org-section-title">✅ Юу багтсан бэ?</h2>
        <div className="uz-org-benefits-grid">
          <div className="uz-org-benefit"><span>💧</span><b>Ус гоожих засвар</b></div>
          <div className="uz-org-benefit"><span>🚽</span><b>Бөглөрөл цэвэрлэх</b></div>
          <div className="uz-org-benefit"><span>🚰</span><b>Холигч, кран солих</b></div>
          <div className="uz-org-benefit"><span>🔧</span><b>Шугам сүлжээний засвар</b></div>
          <div className="uz-org-benefit"><span>♨️</span><b>Халаалтын систем</b></div>
          <div className="uz-org-benefit"><span>⚡</span><b>Яаралтай дуудлага 24/7</b></div>
          <div className="uz-org-benefit"><span>👷</span><b>Тогтмол сантехникч</b></div>
          <div className="uz-org-benefit"><span>📊</span><b>Сар тутмын тайлан</b></div>
        </div>
      </div>

      <div className="uz-org-benefits">
        <h2 className="uz-org-section-title">💎 Бидний давуу талууд</h2>
        <div className="uz-org-adv-grid">
          <div className="uz-org-adv">
            <div className="uz-org-adv-icon">⏱</div>
            <div className="uz-org-adv-title">Цаг алдалгүй засвар</div>
            <div className="uz-org-adv-desc">Асуудал гарсан даруйд сантехникч очно. Урт хугацааны хүлээгдэлгүй.</div>
          </div>
          <div className="uz-org-adv">
            <div className="uz-org-adv-icon">🌙</div>
            <div className="uz-org-adv-title">24/7 шуурхай үйлчилгээ</div>
            <div className="uz-org-adv-desc">Шөнө дөл, амралтын өдөр, баяр ёслол ч ялгаагүй. Бид хэзээ ч бэлэн.</div>
          </div>
          <div className="uz-org-adv">
            <div className="uz-org-adv-icon">🤝</div>
            <div className="uz-org-adv-title">Найдвартай & мэргэжлийн</div>
            <div className="uz-org-adv-desc">Туршлагатай, шалгагдсан сантехникч нар л танай байгууллагад очно.</div>
          </div>
          <div className="uz-org-adv">
            <div className="uz-org-adv-icon">💰</div>
            <div className="uz-org-adv-title">Зардал хэмнэх</div>
            <div className="uz-org-adv-desc">Орон тооны сантехникч авах хэрэггүй. Цалин, татвар, нийгмийн даатгал хэмнэнэ.</div>
          </div>
          <div className="uz-org-adv">
            <div className="uz-org-adv-icon">🎯</div>
            <div className="uz-org-adv-title">Тогтсон үнэ</div>
            <div className="uz-org-adv-desc">Сарын тогтсон хураамжтай. Гэнэтийн зардал гарахгүй, төсвөө сайн төлөвлөнө.</div>
          </div>
          <div className="uz-org-adv">
            <div className="uz-org-adv-icon">🛡</div>
            <div className="uz-org-adv-title">Баталгаатай засвар</div>
            <div className="uz-org-adv-desc">Хийсэн ажилд дахин асуудал гарвал нэмэлт төлбөргүйгээр засна.</div>
          </div>
          <div className="uz-org-adv">
            <div className="uz-org-adv-icon">🔧</div>
            <div className="uz-org-adv-title">Мэргэжлийн багаж</div>
            <div className="uz-org-adv-desc">Орчин үеийн өндөр чанарын төхөөрөмж, багажтай. Чанартай засвар.</div>
          </div>
          <div className="uz-org-adv">
            <div className="uz-org-adv-icon">📞</div>
            <div className="uz-org-adv-title">Нэг л дуудлага</div>
            <div className="uz-org-adv-desc">Аль ч асуудал гарсан, нэг л дугаар руу залгаад л болоо. Хайх, харьцуулах хэрэггүй.</div>
          </div>
        </div>
      </div>

      <div className="uz-org-price-card">
        <div className="uz-org-price-label">Эхлэх үнэ</div>
        <div className="uz-org-price-value">₮{fmt(monthlyFee)}<span>-аас/сар</span></div>
        <div className="uz-org-price-note">⚡ Хязгааргүй дуудлага · Бүх засвар үнэгүй · Зөвхөн материал нэмэлт төлбөртэй</div>
        <div className="uz-org-price-deal">📝 <b>Эцсийн үнэ нь</b> танай байгууллагын хэмжээ, ажилтны тоо, байршил болон шаардлагатай үйлчилгээний хүрээнээс хамаарч <b>гэрээ хийх үед тохиролцоно</b>.</div>
      </div>

      <div className="uz-org-excluded">
        <h2 className="uz-org-section-title" style={{ marginBottom: 10 }}>⚠ Нэмэлт төлбөртэй томоохон ажлууд</h2>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
          Сарын суурь хураамжид <b>бүх ердийн засвар үнэгүй</b> хамрагдана. Гэхдээ дараах <b>томоохон ажлуудад нэмэлт төлбөр тохиролцоно</b>:
        </p>
        <div className="uz-org-excluded-list">
          <div className="uz-org-excluded-item">🚧 <b>Шугам сүлжээ шинэчлэх</b> — бүхэлд нь сольж шинээр суурилуулах ажил</div>
          <div className="uz-org-excluded-item">🕳 <b>Бохирын худаг бөглөрөл цэвэрлэх</b> — гадна бохирын систем</div>
          <div className="uz-org-excluded-item">🏗 <b>Шинэ суурилуулалт</b> — шинээр өрөө, нэмэлт сантехник суурилуулах</div>
          <div className="uz-org-excluded-item">🔬 <b>Тусгай тоног төхөөрөмж</b> — мотор, насос, бойлер солих</div>
          <div className="uz-org-excluded-item">📐 <b>Том хэмжээний шинэчлэлт</b> — бөөн ажил, хэдэн өдөр үргэлжлэх ажил</div>
        </div>
        <div className="uz-help-tip" style={{ marginTop: 12 }}>
          💡 Эдгээр ажлуудыг танай байгууллагатай <b>тусгайлан үнэлж, тохиролцон</b> хийдэг. Гэрээт байгууллагууд эдгээр ажилд ердийн үнээс <b>хямдралтай</b> үнэ авна.
        </div>
      </div>

      <div className="uz-feedback-form">
        <h2 className="uz-org-section-title">📝 Хүсэлт илгээх</h2>
        <p className="uz-settings-sub" style={{ marginBottom: 14 }}>Доорх мэдээллийг бөглөж илгээгээрэй. Бид удахгүй танд холбогдоно.</p>
        <div className="uz-field"><label>Байгууллагын нэр *</label>
          <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Жишээ: Ариун Ус ХХК" /></div>
        <div className="uz-field"><label>Холбоо барих хүний нэр *</label>
          <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Жишээ: Б.Болд" /></div>
        <div className="uz-field"><label>Албан тушаал</label>
          <input value={position} onChange={e => setPosition(e.target.value)} placeholder="Жишээ: Захиргааны менежер" /></div>
        <div className="uz-field"><label>Утас *</label>
          <div className="uz-phone-input"><span className="uz-phone-prefix">+976</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9911-2233" /></div></div>
        <div className="uz-field"><label>Байгууллагын хаяг *</label>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Дүүрэг, гудамж, байр" /></div>
        <div className="uz-field"><label>Ажилтны тоо</label>
          <input value={employees} onChange={e => setEmployees(e.target.value)} placeholder="Жишээ: 50" /></div>
        <div className="uz-field"><label>Нэмэлт тайлбар (заавал биш)</label>
          <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Тусгай хүсэлт эсвэл асуулт..." /></div>
        {err && <div className="uz-error">{err}</div>}
        <button className="uz-confirm-btn" onClick={submit}>Хүсэлт илгээх</button>
      </div>
    </div>
  );
}

// ============ FEEDBACK FORM ============
function FeedbackForm({ onSubmit, onBack }) {
  const [type, setType] = useState('suggestion');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  function submit() {
    if (!message.trim() || message.trim().length < 5) return setErr('Саналаа дор хаяж 5 тэмдэгтээр бичнэ үү');
    setErr('');
    onSubmit({ type, name: name.trim(), phone: phone.trim(), message: message.trim() });
    setDone(true);
  }
  if (done) {
    return (
      <div className="uz-page" style={{ maxWidth: 560 }}>
        <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>
        <div className="uz-empty">
          <div className="uz-empty-icon">💌</div>
          <div className="uz-empty-title">Баярлалаа!</div>
          <div className="uz-empty-sub">Таны санал илгээгдлээ. Бид сайтаа сайжруулахын тулд таны санааг анхааралтай уншиж, шаардлагатай бол холбоо барих болно.</div>
          <button className="uz-confirm-btn" style={{ marginTop: 22, maxWidth: 240 }} onClick={onBack}>Нүүр буцах</button>
        </div>
      </div>
    );
  }
  return (
    <div className="uz-page" style={{ maxWidth: 680 }}>
      <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>
      <h1 className="uz-page-title">📝 Санал хүсэлт</h1>
      <p className="uz-section-sub" style={{ marginBottom: 22 }}>
        Бид аппаа сайжруулахын тулд таны санаа бодлыг сонсохыг хүсэж байна. Сэтгэгдэл, гомдол, эсвэл асуултаа бичиж илгээгээрэй.
      </p>
      <div className="uz-feedback-form">
        <div className="uz-field">
          <label>Төрөл</label>
          <div className="uz-feedback-types">
            <button className={`uz-feedback-type ${type === 'suggestion' ? 'on' : ''}`} onClick={() => setType('suggestion')}>💡 Санал</button>
            <button className={`uz-feedback-type ${type === 'complaint' ? 'on' : ''}`} onClick={() => setType('complaint')}>⚠ Гомдол</button>
            <button className={`uz-feedback-type ${type === 'question' ? 'on' : ''}`} onClick={() => setType('question')}>❓ Асуулт</button>
            <button className={`uz-feedback-type ${type === 'praise' ? 'on' : ''}`} onClick={() => setType('praise')}>💚 Талархал</button>
          </div>
        </div>
        <div className="uz-field"><label>Нэр (заавал биш)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Жишээ: Болд" /></div>
        <div className="uz-field"><label>Утас (заавал биш)</label>
          <div className="uz-phone-input"><span className="uz-phone-prefix">+976</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9911-2233" /></div></div>
        <div className="uz-field"><label>Таны санал/гомдол/асуулт *</label>
          <textarea rows={6} value={message} onChange={e => setMessage(e.target.value)} placeholder="Дэлгэрэнгүй бичнэ үү..." /></div>
        {err && <div className="uz-error">{err}</div>}
        <button className="uz-confirm-btn" onClick={submit}>Илгээх</button>
      </div>
    </div>
  );
}

// ============ HELP GUIDE ============
function HelpGuide({ onBack, settings }) {
  const techCoinComp = (settings && settings.techCoinPerComplete) || 1;
  const techCoinsFree = (settings && settings.techCoinsForFreeCall) || 2;
  const custCoinComp = (settings && settings.customerCoinPerComplete) || 1;
  const custCoinsDisc = (settings && settings.customerCoinsForDiscount) || 5;
  const custDiscAmt = (settings && settings.customerDiscountAmount) || 5000;
  const callFee = (settings && settings.perCallFee) || PER_CALL_FEE;
  return (
    <div className="uz-page" style={{ maxWidth: 820 }}>
      <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>
      <h1 className="uz-page-title">📖 Аппыг хэрхэн ашиглах вэ?</h1>
      <p className="uz-section-sub" style={{ marginBottom: 28 }}>УсЗасвар апп нь сантехникийн дуудлага өгөх, материал захиалах, эсвэл сантехникчээр ажиллах гурван үндсэн боломжтой.</p>

      {/* COIN SECTION — featured at top */}
      <div className="uz-help-section uz-help-section--coin">
        <div className="uz-help-head">
          <span className="uz-help-num" style={{ background: 'var(--gold)' }}>🪙</span>
          <h2>Coin шагналын тухай</h2>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 16 }}>
          УсЗасвар апп нь хэрэглэгч ба сантехникч хоёуланд нь <b>coin шагнал</b> өгдөг урамшууллын системтэй. Coin цуглуулбал хямдрал, үнэгүй дуудлага гэх мэт шагнал авна.
        </p>

        <h3 className="uz-coin-sec-title">🎁 Үйлчлүүлэгчийн coin (танд)</h3>
        <ul className="uz-coin-list">
          <li>📞 Дуудлагын дараа <b>үнэлгээ өгснөөр +{custCoinComp} coin</b> цуглуулна</li>
          <li>⏱ Үнэлгээ өгөхдөө <b>"Сантехникч цагтаа ирсэн үү?"</b> асуултанд бас хариулна — таны хариу шударга байх ёстой</li>
          <li>🛍 Утсаа оруулмагц "Миний дуудлага" хэсэгт <b>цугласан coin</b> чинь харагдана</li>
          <li>🎁 <b>{custCoinsDisc} coin</b> цуглуулбал дараагийн дуудлагадаа <b>₮{fmt(custDiscAmt)} хямдрал</b> авна</li>
          <li>✅ Дуудлага өгөхдөө утсаа оруулсны дараа <b>"Coin ашиглах"</b> чек дарж хямдралаа автоматаар авна</li>
          <li>♻️ Ашиглагдсан coin хасагдана, шинээр дуудлага хийгээд цуглуулж эхлэх боломжтой</li>
        </ul>

        <h3 className="uz-coin-sec-title">👷 Сантехникчийн coin</h3>
        <ul className="uz-coin-list">
          <li>✅ Дуудлагаа дуусгасны дараа <b>үйлчлүүлэгчийн үнэлгээг хүлээнэ</b></li>
          <li>⏱ Хэрэв үйлчлүүлэгч <b>"цагтаа ирсэн"</b> гэж сонгосон бол <b>+{techCoinComp} coin</b> авна</li>
          <li>✗ Хэрэв "хоцорсон" гэвэл coin олгогдохгүй (шударга байх системтэй)</li>
          <li>🪙 <b>{techCoinsFree} coin</b> цуглуулбал <b>1 дуудлагыг хураамжгүй</b> авах боломжтой ({fmt(callFee)}₮ хэмнэнэ)</li>
          <li>📊 Сантехникчийн самбараас coin тоо, хэдэн үнэгүй дуудлагатайгаа харна</li>
        </ul>

        <div className="uz-help-tip" style={{ background: '#e6f7ef', borderColor: '#b9e8d2', color: '#0d8a56' }}>
          💚 <b>Зорилго:</b> Coin шагнал нь үйлчлүүлэгч аппаа дахин ашиглах, сантехникч цагтаа ажилласанд урамшуулах зорилготой.
        </div>
      </div>

      <div className="uz-help-section">
        <div className="uz-help-head"><span className="uz-help-num">1</span><h2>📞 Дуудлага өгөх</h2></div>
        <ol className="uz-help-steps">
          <li>Нүүр хуудасны <b>"Дуудлага өгөх"</b> том хөх товчийг дар</li>
          <li><b>Дүүргээ сонго</b> — таны байршил хэдэн минутын дотор сантехникч хүрэхийг харна</li>
          <li>Хүссэн <b>үйлчилгээгээ сонгоод "Дуудах →"</b> товч дар</li>
          <li>Нэр, хаяг, утсаа оруулаад дуудлагыг <b>яаралтай</b> эсвэл <b>тогтсон цаг</b>-аар сонго</li>
          <li>"Дуудлага баталгаажуулах" товч дарвал захиалга үүснэ</li>
        </ol>
        <div className="uz-help-tip">💡 <b>Сайн мэдэх:</b> Дуудлагын хураамж ₮10,000-аас эхэлнэ. Сантехникч цагтаа ирээгүй эсвэл ажил дутуу бол төлбөрөө бүрэн буцааж авна.</div>
      </div>

      <div className="uz-help-section">
        <div className="uz-help-head"><span className="uz-help-num">2</span><h2>📋 Дуудлагаа хянах</h2></div>
        <ol className="uz-help-steps">
          <li>Нүүр хуудасны доор байгаа <b>"Дуудлагаа хянах →"</b> товч эсвэл толгойн "Дуудлага" линкийг дар</li>
          <li>Захиалга өгсөн <b>утасны дугаараа оруул</b></li>
          <li>Бүх дуудлагын явц, сантехникчийн нэр, хэдэн минутын дараа ирэхийг харна</li>
          <li>Ажил дууссаны дараа <b>★ үнэлгээ</b> өгөх боломжтой</li>
          <li>Асуудал гарвал <b>"⚠ Асуудал мэдээлэх"</b> дарж төлбөрөө буцаан авна</li>
        </ol>
        <div className="uz-help-tip">💬 <b>Чат:</b> Сантехникч дуудлагыг хүлээж авсны дараа та сантехникч/админтай шууд мессеж бичих боломжтой.</div>
      </div>

      <div className="uz-help-section">
        <div className="uz-help-head"><span className="uz-help-num">3</span><h2>🛠 Материал захиалах</h2></div>
        <ol className="uz-help-steps">
          <li>Нүүр хуудасны <b>"Материал"</b> ногоон товчийг дар</li>
          <li>Холигч, суултуур, хоолой г.м. хэрэгтэй материалаа <b>"+ Сагсанд"</b> товчоор сонгоно</li>
          <li>Тоо ширхэг тохируулна (+ −)</li>
          <li>Доорх <b>"Захиалах →"</b> товч дар</li>
          <li>Нэр, утас, хүргэлтийн хаягаа оруулаад захиалгаа баталгаажуул</li>
        </ol>
        <div className="uz-help-tip">📦 Захиалгын дугаар үүсэнэ. Бид удахгүй танай дугаар руу залгаж хүргэлтийн нөхцөлийг тохиролцоно.</div>
      </div>

      <div className="uz-help-section">
        <div className="uz-help-head"><span className="uz-help-num">4</span><h2>👷 Сантехникчээр ажиллах</h2></div>
        <ol className="uz-help-steps">
          <li>Нүүр хуудасны <b>"Сантехникч болох"</b> алтан товчийг дар (эсвэл толгойн "Сантехникч" таб)</li>
          <li>Нэр, утас, нууц үг, туршлага, мэргэшлээ сонгож <b>бүртгүүл</b></li>
          <li>Бүртгэлийн нэг удаагийн хураамжаа банкны данс руу шилжүүлэх</li>
          <li><b>Гүйлгээний утганд утасны дугаараа</b> заавал бичих</li>
          <li>Админ баталгаажуулсны дараа эрх нээгдэж дуудлага хүлээж эхэлнэ</li>
        </ol>
        <div className="uz-help-tip">🪙 <b>Coin шагнал:</b> Ажил цагтаа дуусгасан тохиолдолд +1 coin авна. 2 coin цуглуулбал 1 дуудлагыг хураамжгүй авна!</div>
      </div>

      <div className="uz-help-section">
        <div className="uz-help-head"><span className="uz-help-num">?</span><h2>Тусламж хэрэгтэй юу?</h2></div>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
          Асуудал гарвал, эсвэл нэмэлт тусламж хэрэгтэй бол сайтын доод хэсэгт байгаа <b>📞 утасны дугаар</b> луу залгаарай. Бид 24/7 ажилладаг.
        </p>
      </div>
    </div>
  );
}

// ============ BOOKING PAYMENT ============
function BookingPayment({ booking, settings, broadcasts, onDone }) {
  if (!booking) return <div className="uz-page"><p>Уучлаарай, дуудлага олдсонгүй.</p><button className="uz-confirm-btn" onClick={onDone}>Буцах</button></div>;
  const hasBank = settings && settings.accountNumber;
  const callFee = (settings && settings.calloutFee) || CALLOUT_FEE;
  const promo = getActivePromo(broadcasts);
  const promoDisc = promo ? Math.round((callFee - (booking.discountApplied || 0)) * promo.discountPct / 100) : 0;
  const total = callFee - (booking.discountApplied || 0) - promoDisc;
  return (
    <div className="uz-page" style={{ maxWidth: 560 }}>
      <div className="uz-pay-required">
        <div className="uz-empty-icon">💳</div>
        <h1 className="uz-page-title" style={{ textAlign: 'center', marginBottom: 8 }}>Дуудлагын төлбөр</h1>
        {promo && (
          <div className="uz-promo-applied">
            🎁 <b>{promo.title}</b><br/>
            <span style={{ fontSize: 13 }}>Энэ дуудлагад {promo.discountPct}% хямдрал автомат хэрэглэгдсэн!</span>
          </div>
        )}
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', marginBottom: 24, fontSize: 14 }}>
          Дуудлагын дугаар: <b style={{ color: 'var(--blue)' }}>{booking.code}</b><br/>
          Үйлчилгээ: <b>{booking.serviceName}</b><br/>
          {(booking.discountApplied > 0 || promoDisc > 0) && <span style={{ textDecoration: 'line-through', color: 'var(--ink-soft)' }}>Анхны үнэ: ₮{fmt(callFee)}</span>}
          {(booking.discountApplied > 0 || promoDisc > 0) && <br/>}
          Төлөх дүн: <b style={{ color: promoDisc > 0 ? 'var(--green)' : 'var(--ink)', fontSize: 22 }}>₮{fmt(total)}</b>
          {booking.discountApplied > 0 && <><br/><span style={{ color: 'var(--green)', fontSize: 13 }}>🪙 Coin хямдрал: −₮{fmt(booking.discountApplied)}</span></>}
          {promoDisc > 0 && <><br/><span style={{ color: 'var(--green)', fontSize: 13 }}>🎁 Урамшуулал ({promo.discountPct}%): −₮{fmt(promoDisc)}</span></>}
        </p>
        <p style={{ textAlign: 'center', marginBottom: 18, fontSize: 14, lineHeight: 1.5 }}>
          Доорх данс руу <b>₮{fmt(total)}</b> шилжүүлээд, <b>гүйлгээний утганд утасны дугаараа ({fmtPhone(booking.phone)})</b> бичнэ үү. Төлбөр баталгаажсаны дараа сантехникч хайж эхлэх болно.
        </p>
        {hasBank ? (
          <div className="uz-bank-box uz-bank-box--lg" style={{ marginBottom: 18 }}>
            <div className="uz-bank-row"><span>Банк:</span> <b>{settings.bankName}</b></div>
            <div className="uz-bank-row"><span>Данс:</span> <b>{settings.accountNumber}</b> <CopyButton text={settings.accountNumber} /></div>
            <div className="uz-bank-row"><span>Эзэмшигч:</span> <b>{settings.accountHolder}</b></div>
            <div className="uz-bank-divider" />
            <div className="uz-bank-row"><span>Гүйлгээний утга:</span> <b>{fmtPhone(booking.phone)}</b> <CopyButton text={booking.phone} /></div>
            <div className="uz-bank-row"><span>Дүн:</span> <b>₮{fmt(total)}</b> <CopyButton text={String(total)} /></div>
          </div>
        ) : (
          <div className="uz-bank-empty">Админ данс хараахан тохируулаагүй байна. Холбоо барих утсаар залгана уу.</div>
        )}
        {settings && settings.paymentLink && (
          <a href={settings.paymentLink} target="_blank" rel="noopener noreferrer" className="uz-pay-link-btn">
            💳 Шууд төлөх (QPay/SocialPay) →
          </a>
        )}
        <button className="uz-confirm-btn" onClick={onDone}>Төлбөр төлсний дараа дарна уу →</button>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', marginTop: 14 }}>
          Дуудлагын явцыг "Миний дуудлага" хэсгээс хянана уу
        </p>
      </div>
    </div>
  );
}

// ============ MATERIALS SHOP (customer) ============
function Materials({ materials, settings, onOrder, onBack }) {
  const [cat, setCat] = useState('Бүгд');
  const [cart, setCart] = useState({}); // { id: qty }
  const [checkout, setCheckout] = useState(false);
  const [done, setDone] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState(DISTRICTS[0].name);
  const [err, setErr] = useState('');

  const list = cat === 'Бүгд' ? materials : materials.filter(m => m.cat === cat);
  const cartItems = Object.entries(cart).map(([id, qty]) => ({ ...materials.find(m => m.id === id), qty })).filter(x => x.id);
  const total = cartItems.reduce((s, x) => s + x.price * x.qty, 0);
  const count = cartItems.reduce((s, x) => s + x.qty, 0);

  function add(id) { setCart({ ...cart, [id]: (cart[id] || 0) + 1 }); }
  function dec(id) {
    const q = (cart[id] || 0) - 1; const next = { ...cart };
    if (q <= 0) delete next[id]; else next[id] = q;
    setCart(next);
  }

  function placeOrder() {
    if (!name.trim()) return setErr('Нэрээ оруулна уу');
    if (!validPhone(phone)) return setErr('8 оронтой утас оруулна уу');
    if (!address.trim()) return setErr('Хүргэлтийн хаягаа оруулна уу');
    setErr('');
    onOrder({
      items: cartItems.map(x => ({ id: x.id, name: x.name, price: x.price, qty: x.qty })),
      total, customerName: name.trim(), phone, address: address.trim(), district,
    }).then(o => { setDone(o); setCart({}); setCheckout(false); });
  }

  if (done) {
    const hasBank = settings && settings.accountNumber;
    return (
      <div className="uz-page" style={{ maxWidth: 560 }}>
        <div className="uz-pay-required">
          <div className="uz-empty-icon">💳</div>
          <h1 className="uz-page-title" style={{ textAlign: 'center', marginBottom: 8 }}>Төлбөр хүлээгдэж байна</h1>
          <p style={{ textAlign: 'center', color: 'var(--ink-soft)', marginBottom: 24, fontSize: 14 }}>
            Захиалгын дугаар: <b style={{ color: 'var(--blue)' }}>{done.code}</b><br/>
            Нийт төлбөр: <b style={{ color: 'var(--ink)', fontSize: 18 }}>₮{fmt(done.total)}</b>
          </p>
          <p style={{ textAlign: 'center', marginBottom: 18, fontSize: 14, lineHeight: 1.5 }}>
            Доорх данс руу нийт төлбөрөө шилжүүлээд, <b>гүйлгээний утганд захиалгын дугаар ({done.code})</b>-аа бичнэ үү. Төлбөр баталгаажсан үед хүргэлт хийгдэнэ.
          </p>
          {hasBank ? (
            <div className="uz-bank-box uz-bank-box--lg" style={{ marginBottom: 18 }}>
              <div className="uz-bank-row"><span>Банк:</span> <b>{settings.bankName}</b></div>
              <div className="uz-bank-row"><span>Данс:</span> <b>{settings.accountNumber}</b> <CopyButton text={settings.accountNumber} /></div>
              <div className="uz-bank-row"><span>Эзэмшигч:</span> <b>{settings.accountHolder}</b></div>
              <div className="uz-bank-divider" />
              <div className="uz-bank-row"><span>Гүйлгээний утга:</span> <b>{fmtPhone(done.phone)}</b> <CopyButton text={done.phone} /></div>
              <div className="uz-bank-row"><span>Нийт дүн:</span> <b>₮{fmt(done.total)}</b> <CopyButton text={String(done.total)} /></div>
            </div>
          ) : (
            <div className="uz-bank-empty">Админ данс хараахан тохируулаагүй байна. Холбоо барих утсаар залгана уу.</div>
          )}
          {settings && settings.paymentLink && (
            <a href={settings.paymentLink} target="_blank" rel="noopener noreferrer" className="uz-pay-link-btn">
              💳 Шууд төлөх (QPay/SocialPay) →
            </a>
          )}
          <button className="uz-confirm-btn" onClick={() => { setDone(null); onBack(); }}>Нүүр буцах</button>
        </div>
      </div>
    );
  }

  if (checkout) {
    return (
      <div className="uz-page" style={{ maxWidth: 560 }}>
        <button className="uz-back" onClick={() => setCheckout(false)}>← Сагс руу буцах</button>
        <h1 className="uz-page-title">Захиалга баталгаажуулах</h1>
        <div className="uz-checkout">
          <div className="uz-checkout-items">
            {cartItems.map(x => (
              <div key={x.id} className="uz-co-item">
                <span className="uz-co-ico">{x.icon}</span>
                <span className="uz-co-name">{x.name} <small>× {x.qty}</small></span>
                <span className="uz-co-price">₮{fmt(x.price * x.qty)}</span>
              </div>
            ))}
            <div className="uz-co-total"><span>Нийт</span><b>₮{fmt(total)}</b></div>
          </div>
          <div className="uz-field"><label>Нэр *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Таны нэр" /></div>
          <div className="uz-field"><label>Утас *</label>
            <div className="uz-phone-input"><span className="uz-phone-prefix">+976</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9911-2233" /></div></div>
          <div className="uz-field"><label>Дүүрэг</label>
            <select value={district} onChange={e => setDistrict(e.target.value)}>{DISTRICTS.map(d => <option key={d.name}>{d.name}</option>)}</select></div>
          <div className="uz-field"><label>Хүргэлтийн хаяг *</label><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Хороо, байр, орц, тоот..." /></div>
          {err && <div className="uz-error">{err}</div>}
          <button className="uz-confirm-btn" onClick={placeOrder}>Захиалах · ₮{fmt(total)}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="uz-page">
      <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>
      <h1 className="uz-page-title">Сантехникийн материал</h1>
      <p className="uz-section-sub" style={{ marginTop: -16, marginBottom: 20 }}>Холигч, суултуур, холбогч, хоолой болон бусад материалыг захиалаарай.</p>
      <div className="uz-cat-tabs">
        {MATERIAL_CATEGORIES.map(c => <button key={c} className={`uz-cat-tab ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="uz-mat-grid">
        {list.map((m, i) => (
          <div key={m.id} className="uz-mat-card" style={{ animationDelay: `${i * 0.03}s` }}>
            <div className="uz-mat-icon">{m.icon}</div>
            <div className="uz-mat-name">{m.name}</div>
            <div className="uz-mat-price">₮{fmt(m.price)} <small>/ {m.unit}</small></div>
            {cart[m.id] ? (
              <div className="uz-qty">
                <button onClick={() => dec(m.id)}>−</button>
                <span>{cart[m.id]}</span>
                <button onClick={() => add(m.id)}>+</button>
              </div>
            ) : (
              <button className="uz-mat-add" onClick={() => add(m.id)}>+ Сагсанд</button>
            )}
          </div>
        ))}
      </div>

      {count > 0 && (
        <div className="uz-cart-bar">
          <div className="uz-cart-info"><b>{count}</b> бараа · ₮{fmt(total)}</div>
          <button className="uz-cart-btn" onClick={() => setCheckout(true)}>Захиалах →</button>
        </div>
      )}
    </div>
  );
}

// ============ BOOKING ============
function Booking({ service, customers, settings, initialDistrict, onCancel, onSubmit }) {
  const districts = (settings && settings.districts && settings.districts.length) ? settings.districts : DISTRICTS;
  const [district, setDistrict] = useState(initialDistrict || districts[0]);
  const [custName, setCustName] = useState('');
  const [address, setAddress] = useState('');
  const [mapLink, setMapLink] = useState('');
  const [phone, setPhone] = useState('');
  const [when, setWhen] = useState('now');
  const [schedTime, setSchedTime] = useState('');
  const [note, setNote] = useState('');
  const [useDiscount, setUseDiscount] = useState(false);
  const [err, setErr] = useState('');
  const custPhone = cleanPhone(phone);
  const myCoins = (custPhone && customers && customers[custPhone] && customers[custPhone].coins) || 0;
  const coinsForDisc = (settings && settings.customerCoinsForDiscount) || 5;
  const discAmt = (settings && settings.customerDiscountAmount) || 5000;
  const canDiscount = validPhone(phone) && myCoins >= coinsForDisc;
  function submit() {
    if (!custName.trim()) return setErr('Нэрээ оруулна уу');
    if (!address.trim()) return setErr('Дэлгэрэнгүй хаягаа оруулна уу');
    if (!validPhone(phone)) return setErr('Холбоо барих 8 оронтой утас оруулна уу');
    if (when === 'schedule' && !schedTime) return setErr('Цагаа сонгоно уу');
    setErr('');
    onSubmit({ serviceId: service.id, serviceName: service.name, serviceIcon: service.icon, priceMin: service.priceMin, priceMax: service.priceMax, district: district.name, eta: district.eta, customerName: custName.trim(), address: address.trim(), mapLink: mapLink.trim(), phone, when, schedTime, note: note.trim(), useDiscount: canDiscount && useDiscount });
  }
  return (
    <div className="uz-page">
      <button className="uz-back" onClick={onCancel}>← Үйлчилгээ рүү буцах</button>
      <div className="uz-booking">
        <div className="uz-booking-main">
          <h1 className="uz-page-title">Дуудлага өгөх</h1>
          <div className="uz-field"><label>Таны нэр *</label>
            <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Жишээ: Болд" /></div>
          <div className="uz-field"><label>Дүүрэг</label>
            <select value={district.name} onChange={e => setDistrict(districts.find(d => d.name === e.target.value))}>
              {districts.map(d => <option key={d.name} value={d.name}>{d.name} (~{d.eta} мин)</option>)}</select></div>
          <div className="uz-field"><label>Дэлгэрэнгүй хаяг *</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Хороо, байр, орц, тоот..." /></div>
          <div className="uz-field"><label>🗺 Газрын зургийн линк (заавал биш)</label>
            <input value={mapLink} onChange={e => setMapLink(e.target.value)} placeholder="Google Maps-аас 'Share' хийсэн линкээ оруул..." />
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, lineHeight: 1.5 }}>
              💡 <b>Хэрхэн:</b> Google Maps-руу ороод байршлаа нээ → "Share" → "Copy link" → энд оруул.<br/>
              Сантехникч хаягийн чинь газрын зураг шууд харах боломжтой болно.
            </div>
          </div>
          <div className="uz-field"><label>Холбоо барих утас *</label>
            <div className="uz-phone-input"><span className="uz-phone-prefix">+976</span>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9911-2233" /></div>
            {validPhone(phone) && myCoins > 0 && (
              <div className="uz-coin-info">🪙 Танд <b>{myCoins} coin</b> байна. {canDiscount ? `${coinsForDisc} coin = ₮${fmt(discAmt)} хямдрал!` : `${coinsForDisc} coin цуглуулбал ₮${fmt(discAmt)} хямдрал авна.`}</div>
            )}
          </div>
          {canDiscount && (
            <label className="uz-check uz-discount-check">
              <input type="checkbox" checked={useDiscount} onChange={e => setUseDiscount(e.target.checked)} />
              <span>🎁 <b>{coinsForDisc} coin ашиглаж ₮{fmt(discAmt)} хямдрал авах</b></span>
            </label>
          )}
          <div className="uz-field"><label>Хэзээ ирэх вэ?</label>
            <div className="uz-when-tabs">
              <button className={`uz-when-tab ${when === 'now' ? 'active' : ''}`} onClick={() => setWhen('now')}>⚡ Яаралтай (одоо)</button>
              <button className={`uz-when-tab ${when === 'schedule' ? 'active' : ''}`} onClick={() => setWhen('schedule')}>📅 Цаг товлох</button>
            </div></div>
          {when === 'schedule' && (<div className="uz-field uz-fade"><label>Товлох цаг</label>
            <input type="datetime-local" value={schedTime} onChange={e => setSchedTime(e.target.value)} /></div>)}
          <div className="uz-field"><label>Нэмэлт тайлбар (заавал биш)</label>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Асуудлаа товч тайлбарлана уу..." /></div>
          {err && <div className="uz-error">{err}</div>}
        </div>
        <aside className="uz-summary">
          <div className="uz-summary-card">
            <div className="uz-summary-service"><span className="uz-summary-icon">{service.icon}</span><span>{service.name}</span></div>
            <div className="uz-summary-rows">
              <div className="uz-summary-row"><span>Үйлчилгээний үнэ</span><span>₮{fmt(service.priceMin)}+</span></div>
              <div className="uz-summary-row"><span>Дуудлагын хураамж</span><span>₮{fmt((settings && settings.calloutFee) || CALLOUT_FEE)}</span></div>
              {canDiscount && useDiscount && (
                <div className="uz-summary-row" style={{ color: 'var(--green)' }}><span>🎁 Coin хямдрал</span><span>−₮{fmt(discAmt)}</span></div>
              )}
              <div className="uz-summary-row uz-summary-row--eta"><span>Ирэх хугацаа</span><span className="uz-summary-eta">~{district.eta} мин</span></div>
            </div>
            <div className="uz-summary-total"><span>Нийт (хамгийн багадаа)</span>
              <span className="uz-total-val">₮{fmt(service.priceMin + ((settings && settings.calloutFee) || CALLOUT_FEE) - (canDiscount && useDiscount ? discAmt : 0))}+</span></div>
            <div className="uz-fee-notice">⚠ Ажил хүнд эсвэл нэмэлт материал хэрэгтэй бол төлбөр нэмэгдэх боломжтой. Сантехникч очсоны дараа таныг мэдээллээ.</div>
            <button className="uz-confirm-btn" onClick={submit}>Дуудлага баталгаажуулах</button>
            <p className="uz-summary-note">Ажил дутуу эсвэл сантехникч цагтаа ирээгүй бол дуудлагын хураамжаа буцааж авах боломжтой.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============ MY BOOKINGS ============
function MyBookings({ bookings, hasPhone, onLookup, onNew, onRate, onDispute, onSendMessage, onBack, myCoins, settings, broadcasts }) {
  const [lookupPhone, setLookupPhone] = useState('');
  const coinsForDisc = (settings && settings.customerCoinsForDiscount) || 5;
  const discAmt = (settings && settings.customerDiscountAmount) || 5000;
  if (!hasPhone) {
    return (
      <div className="uz-page">
        <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>
        <h1 className="uz-page-title">Миний дуудлага</h1>
        <div className="uz-lookup">
          <p>Дуудлагаа хянахын тулд захиалга өгсөн утасны дугаараа оруулна уу:</p>
          <div className="uz-lookup-row">
            <div className="uz-phone-input"><span className="uz-phone-prefix">+976</span>
              <input type="tel" value={lookupPhone} onChange={e => setLookupPhone(e.target.value)} placeholder="9911-2233" onKeyDown={e => e.key === 'Enter' && validPhone(lookupPhone) && onLookup(lookupPhone)} /></div>
            <button className="uz-confirm-btn" style={{ width: 'auto', padding: '13px 24px' }} disabled={!validPhone(lookupPhone)} onClick={() => onLookup(lookupPhone)}>Хайх</button>
          </div>
        </div>
      </div>
    );
  }
  if (bookings.length === 0) {
    return (<div className="uz-page"><button className="uz-back" onClick={onBack}>← Нүүр буцах</button><div className="uz-empty"><div className="uz-empty-icon">📭</div><div className="uz-empty-title">Дуудлага алга байна</div>
      <button className="uz-confirm-btn" style={{ marginTop: 20, maxWidth: 240 }} onClick={onNew}>Шинэ дуудлага өгөх</button></div></div>);
  }
  return (<div className="uz-page"><button className="uz-back" onClick={onBack}>← Нүүр буцах</button><h1 className="uz-page-title">Миний дуудлага</h1>
    {myCoins > 0 && (
      <div className="uz-my-coins">
        <div className="uz-my-coins-icon">🪙</div>
        <div className="uz-my-coins-body">
          <div className="uz-my-coins-num">Танд <b>{myCoins} coin</b> байна</div>
          <div className="uz-my-coins-sub">{myCoins >= coinsForDisc ? `🎁 Дараагийн дуудлагадаа ₮${fmt(discAmt)} хямдрал авах боломжтой!` : `${coinsForDisc - myCoins} coin цуглуулбал ₮${fmt(discAmt)} хямдрал авна`}</div>
        </div>
      </div>
    )}
    <div className="uz-bookings">{bookings.map(b => <CustomerBookingCard key={b.id} b={b} onRate={onRate} onDispute={onDispute} onSendMessage={onSendMessage} settings={settings} broadcasts={broadcasts} />)}</div></div>);
}

function CustomerBookingCard({ b, onRate, onDispute, onSendMessage, settings, broadcasts }) {
  const arriveAt = b.createdAt + b.eta * 60000;
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((arriveAt - Date.now()) / 60000)));
  const [rating, setRating] = useState(0);
  const [ratingOnTime, setRatingOnTime] = useState(null); // null | true | false
  const [comment, setComment] = useState('');
  const [showDispute, setShowDispute] = useState(false);
  useEffect(() => {
    if (b.when !== 'now' || b.completed) return;
    const t = setInterval(() => setRemaining(Math.max(0, Math.ceil((arriveAt - Date.now()) / 60000))), 30000);
    return () => clearInterval(t);
  }, [arriveAt, b.when, b.completed]);
  const isEnRoute = b.accepted && b.when === 'now' && remaining > 0 && !b.completed;
  const canDispute = b.accepted && !b.disputed; // can report once a tech is assigned
  return (
    <div className={`uz-booking-card ${b.disputed ? 'uz-card-disputed' : ''}`}>
      <div className="uz-bc-left"><span className="uz-bc-icon">{b.serviceIcon}</span></div>
      <div className="uz-bc-body">
        <div className="uz-bc-top"><h3 className="uz-bc-name">{b.serviceName}</h3><span className="uz-bc-code">{b.code}</span></div>
        <div className="uz-bc-info">📍 {b.district} · {b.address}</div>
        {b.techName && <div className="uz-bc-info">👷 {b.techName} · +976 {fmtPhone(b.techPhone)}</div>}
        {b.note && <div className="uz-bc-note">"{b.note}"</div>}
        {b.paymentStatus === 'pending' && (() => {
          const callFee = (settings && settings.calloutFee) || CALLOUT_FEE;
          const promo = getActivePromo(broadcasts);
          const promoDisc = promo ? Math.round(callFee * promo.discountPct / 100) : 0;
          const finalAmount = callFee - promoDisc;
          return (
          <div className="uz-pay-pending-box">
            <div className="uz-pay-pending-warn">
              ⏳ <b>Төлбөр хүлээгдэж байна</b><br/>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#7a5a00' }}>⚠ Анхааруулга: Дуудлага зөвхөн төлбөр баталгаажсаны дараа идэвхжинэ.</span>
            </div>
            {promo && (
              <div className="uz-promo-applied" style={{ marginBottom: 12 }}>
                🎁 <b>{promo.title}</b><br/>
                <span style={{ fontSize: 12 }}>{promo.discountPct}% хямдрал автомат хэрэглэгдсэн!</span>
              </div>
            )}
            {settings && settings.accountNumber && (
              <div className="uz-pay-bank-info">
                <div className="uz-pay-bank-title">💳 Дансны мэдээлэл</div>
                <div className="uz-pay-bank-row"><span>Банк:</span><b>{settings.bankName || ''}</b></div>
                <div className="uz-pay-bank-row"><span>Данс (IBAN-тай):</span><b className="uz-pay-bank-acct">{fmtIBAN(settings.accountNumber)}</b><CopyButton value={settings.accountNumber} /></div>
                {settings.accountNumber.length === 20 && settings.accountNumber.startsWith('MN') && (
                  <div className="uz-pay-bank-row"><span>Данс (IBAN-гүй):</span><b className="uz-pay-bank-acct">{getAccountOnly(settings.accountNumber)}</b><CopyButton value={getAccountOnly(settings.accountNumber)} /></div>
                )}
                <div className="uz-pay-bank-row"><span>Эзэмшигч:</span><b>{settings.accountHolder || ''}</b></div>
                <div className="uz-pay-bank-row uz-pay-bank-amt"><span>Дүн:</span><b>{promoDisc > 0 && <span style={{ textDecoration: 'line-through', color: 'var(--ink-soft)', marginRight: 8, fontSize: 14 }}>₮{fmt(callFee)}</span>}₮{fmt(finalAmount)}</b></div>
                <div className="uz-pay-bank-row"><span>Гүйлгээний утга:</span><b className="uz-pay-bank-acct">{fmtPhone(b.phone)}</b><CopyButton value={b.phone} /></div>
                {settings.paymentLink && (
                  <a className="uz-pay-direct" href={settings.paymentLink} target="_blank" rel="noopener noreferrer">
                    💳 Шууд төлөх (QPay/SocialPay) →
                  </a>
                )}
              </div>
            )}
          </div>
          );
        })()}
        <div className="uz-bc-bottom">
          <span className={`uz-status ${b.disputed ? 'uz-status--dispute' : isEnRoute ? 'uz-status--active' : b.completed ? 'uz-status--done' : ''}`}>
            {isEnRoute && <span className="uz-status-dot" />}{b.status}
          </span>
          <span className="uz-bc-time">{timeAgo(b.createdAt)}</span>
        </div>
        {b.feeRefunded && <div className="uz-refund-note">💸 Дуудлагын хураамж ₮{fmt(b.calloutFee || CALLOUT_FEE)} буцаагдсан</div>}

        {b.adminArrivalTime && !b.completed && !b.disputed && (
          <div className="uz-arrival-note">🕐 Очих цаг: <b>{b.adminArrivalTime}</b></div>
        )}
        {b.extraWaitNote && !b.completed && !b.disputed && (
          <div className="uz-extrawait-note">ℹ {b.extraWaitNote}</div>
        )}

        {/* Rating */}
        {b.completed && !b.disputed && b.rating == null && (
          <div className="uz-rate-box-v2">
            <div className="uz-rate-question">
              <div className="uz-rate-q-title">⏱ Сантехникч цагтаа ирсэн үү?</div>
              <div className="uz-ontime-choice">
                <button className={`uz-choice-btn ${ratingOnTime === true ? 'on green' : ''}`} onClick={() => setRatingOnTime(true)}>✓ Тийм, цагтаа</button>
                <button className={`uz-choice-btn ${ratingOnTime === false ? 'on red' : ''}`} onClick={() => setRatingOnTime(false)}>✗ Үгүй, хоцорсон</button>
              </div>
            </div>
            <div className="uz-rate-question">
              <div className="uz-rate-q-title">⭐ Үнэлгээ өгөх</div>
              <div className="uz-stars" style={{ justifyContent: 'flex-start' }}>{[1,2,3,4,5].map(s => <button key={s} className={`uz-star ${rating >= s ? 'on' : ''}`} onClick={() => setRating(s)}>★</button>)}</div>
            </div>
            <div className="uz-rate-question">
              <div className="uz-rate-q-title">💬 Сэтгэгдэл (заавал биш)</div>
              <textarea className="uz-comment-input" rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Бусдад харагдах сэтгэгдэл..." />
            </div>
            <button className="uz-rate-submit" style={{ width: '100%', padding: '12px' }} disabled={!rating || ratingOnTime === null} onClick={() => onRate(b.id, rating, ratingOnTime, comment)}>Үнэлгээ илгээх</button>
          </div>
        )}
        {b.rating != null && (
          <div className="uz-rated">
            Таны үнэлгээ: {'★'.repeat(b.rating)}{'☆'.repeat(5 - b.rating)}
            {b.onTime !== null && b.onTime !== undefined && (
              <span style={{ marginLeft: 12, fontSize: 13, color: b.onTime ? 'var(--green)' : 'var(--red)' }}>
                · {b.onTime ? '✓ Цагтаа' : '✗ Хоцорсон'}
              </span>
            )}
          </div>
        )}

        {/* Dispute */}
        {canDispute && (
          !showDispute ? (
            <button className="uz-dispute-link" onClick={() => setShowDispute(true)}>⚠ Асуудал мэдээлэх / төлбөр буцаах</button>
          ) : (
            <div className="uz-dispute-box uz-fade">
              <span className="uz-rate-label">Юу болсон бэ?</span>
              <button className="uz-dispute-opt" onClick={() => onDispute(b.id, 'Сантехникч цагтаа ирээгүй')}>⏱ Цагтаа ирээгүй</button>
              <button className="uz-dispute-opt" onClick={() => onDispute(b.id, 'Ажил дутуу хийсэн')}>🔧 Ажил дутуу хийсэн</button>
              <button className="uz-dispute-cancel" onClick={() => setShowDispute(false)}>Болих</button>
            </div>
          )
        )}
        {onSendMessage && b.accepted && <ChatThread booking={b} myRole="customer" onSend={onSendMessage} compact />}
      </div>
      {b.accepted && b.when === 'now' && !b.completed && !b.disputed && (
        <div className="uz-bc-eta">{remaining > 0 ? (<><div className="uz-bc-eta-num">{remaining}</div><div className="uz-bc-eta-label">минут</div></>) : (<div className="uz-bc-arrived">✓<br/>Ирсэн</div>)}</div>
      )}
    </div>
  );
}

// ============ TECH ENTRY / REGISTER / BLOCKED ============
function TechEntry({ settings, onRegister, onLogin, onBack }) {
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [err, setErr] = useState('');
  const regFee = (settings && settings.registrationFee) || REGISTRATION_FEE;
  const callFee = (settings && settings.perCallFee) || PER_CALL_FEE;
  async function doLogin() {
    if (!validPhone(loginPhone)) return setErr('8 оронтой дугаар оруулна уу');
    if (!loginPass) return setErr('Нууц үгээ оруулна уу');
    const r = await onLogin(loginPhone, loginPass);
    if (r === 'notfound') setErr('Энэ дугаараар бүртгэл олдсонгүй');
    else if (r === 'wrongpass') setErr('Нууц үг буруу байна');
  }
  return (
    <div className="uz-page">
      {onBack && <button className="uz-back" onClick={onBack}>← Нүүр буцах</button>}
      <div className="uz-tech-hero">
        <h1 className="uz-page-title" style={{ marginBottom: 8 }}>Сантехникчээр ажиллах</h1>
        <p className="uz-section-sub" style={{ marginBottom: 28 }}>Дуудлага хүлээж авч, цагтаа очиж, орлогоо нэмэгдүүл.</p>
        <div className="uz-tech-perks">
          <div className="uz-perk"><div className="uz-perk-icon">💰</div><div><b>Тогтмол дуудлага</b><span>Платформоор дамжуулан дуудлага хүлээн авна</span></div></div>
          <div className="uz-perk"><div className="uz-perk-icon">🪙</div><div><b>Coin шагнал</b><span>Цагтаа очиж сайн үнэлгээ авбал coin цуглуулна</span></div></div>
          <div className="uz-perk"><div className="uz-perk-icon">🎁</div><div><b>Үнэгүй дуудлага</b><span>{COINS_FOR_FREE_CALL} coin = 1 дуудлага хураамжгүй</span></div></div>
        </div>
        <div className="uz-tech-fees">
          <div className="uz-fee-item"><span>Бүртгэлийн хураамж</span><b>{fmt(regFee)}₮</b><small>нэг удаа</small></div>
          <div className="uz-fee-item"><span>Дуудлага бүрийн хураамж</span><b>{fmt(callFee)}₮</b><small>эсвэл {COINS_FOR_FREE_CALL} coin</small></div>
        </div>
        <div className="uz-warn-note">⚠ Ажил дутуу хийсэн, цагтаа ирээгүй, муу үнэлгээ авсан тохиолдолд админ таныг блоклож болзошгүй.</div>
        <button className="uz-confirm-btn" style={{ maxWidth: 320 }} onClick={onRegister}>Бүртгүүлэх →</button>
        <div className="uz-tech-login">
          <p>Бүртгэлтэй юу? Утас, нууц үгээрээ нэвтэрнэ үү:</p>
          <div className="uz-field" style={{ maxWidth: 340 }}>
            <div className="uz-phone-input"><span className="uz-phone-prefix">+976</span>
              <input type="tel" value={loginPhone} onChange={e => { setLoginPhone(e.target.value); setErr(''); }} placeholder="9911-2233" /></div>
          </div>
          <div className="uz-field" style={{ maxWidth: 340 }}>
            <PasswordField value={loginPass} onChange={e => { setLoginPass(e.target.value); setErr(''); }} placeholder="Нууц үг" onKeyDown={e => e.key === 'Enter' && doLogin()} />
          </div>
          <button className="uz-confirm-btn" style={{ maxWidth: 340 }} onClick={doLogin}>Нэвтрэх</button>
          {err && <div className="uz-error" style={{ marginTop: 12, maxWidth: 340 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}

function TechBlocked({ tech, onBack }) {
  return (
    <div className="uz-page"><div className="uz-blocked">
      <div className="uz-blocked-icon">🚫</div>
      <h2 className="uz-blocked-title">Таны бүртгэл блоклогдсон</h2>
      <p className="uz-blocked-text">{tech.name}, таны сантехникчийн эрх түр хаагдсан байна. Ажил дутуу гүйцэтгэсэн эсвэл муу үнэлгээ авсантай холбоотой байж болзошгүй. Дэлгэрэнгүйг админтай холбогдож тодруулна уу.</p>
      <button className="uz-confirm-btn" style={{ maxWidth: 200 }} onClick={onBack}>Гарах</button>
    </div></div>
  );
}

function TechPending({ tech, settings, onRefresh, onBack }) {
  const hasBank = settings && settings.accountNumber;
  const regFee = (settings && settings.registrationFee) || REGISTRATION_FEE;
  return (
    <div className="uz-page"><div className="uz-pending">
      <div className="uz-pending-icon">⏳</div>
      <h2 className="uz-pending-title">Төлбөр хүлээгдэж байна</h2>
      <p className="uz-pending-text">
        Сайн уу, {tech.name}. Таны бүртгэл амжилттай үүссэн. Нэвтрэх эрх идэвхжихийн тулд
        бүртгэлийн <b>{fmt(regFee)}₮</b> хураамжаа доорх данс руу шилжүүлээд,
        гүйлгээний утганд утасны дугаараа ({fmtPhone(tech.phone)}) бичнэ үү.
        Админ төлбөрийг баталгаажуулсны дараа эрх нээгдэнэ.
      </p>
      {hasBank ? (
        <div className="uz-bank-box uz-bank-box--lg" style={{ textAlign: 'left', maxWidth: 420, margin: '0 auto 20px' }}>
          <div className="uz-bank-row"><span>Банк:</span> <b>{settings.bankName}</b></div>
          <div className="uz-bank-row"><span>Данс (IBAN-тай):</span> <b className="uz-pay-bank-acct">{fmtIBAN(settings.accountNumber)}</b> <CopyButton text={settings.accountNumber} /></div>
          {settings.accountNumber.length === 20 && settings.accountNumber.startsWith('MN') && (
            <div className="uz-bank-row"><span>Данс (IBAN-гүй):</span> <b className="uz-pay-bank-acct">{getAccountOnly(settings.accountNumber)}</b> <CopyButton text={getAccountOnly(settings.accountNumber)} /></div>
          )}
          <div className="uz-bank-row"><span>Эзэмшигч:</span> <b>{settings.accountHolder}</b></div>
          <div className="uz-bank-divider" />
          <div className="uz-bank-row"><span>Гүйлгээний утга:</span> <b>{fmtPhone(tech.phone)}</b> <CopyButton text={tech.phone} /></div>
        </div>
      ) : (
        <div className="uz-bank-empty" style={{ maxWidth: 360, margin: '0 auto 20px' }}>Админ данс хараахан тохируулаагүй байна.</div>
      )}
      {settings && settings.paymentLink && (
        <a href={settings.paymentLink} target="_blank" rel="noopener noreferrer" className="uz-pay-link-btn" style={{ maxWidth: 360, margin: '0 auto 16px' }}>
          💳 Шууд төлөх (QPay/SocialPay) →
        </a>
      )}
      <div className="uz-pending-actions">
        <button className="uz-confirm-btn" style={{ maxWidth: 240 }} onClick={onRefresh}>↻ Эрх нээгдсэн эсэхийг шалгах</button>
        <button className="uz-btn-ghost-sm" onClick={onBack}>Гарах</button>
      </div>
    </div></div>
  );
}

function TechRegister({ settings, services, onCancel, onSubmit }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [experience, setExperience] = useState(EXPERIENCE_LEVELS[1]);
  const [serviceArea, setServiceArea] = useState(DISTRICTS[0].name);
  const [about, setAbout] = useState('');
  const [specialties, setSpecialties] = useState([]);
  const [agreePunctual, setAgreePunctual] = useState(false);
  const [agreePay, setAgreePay] = useState(false);
  const [err, setErr] = useState('');
  const regFee = (settings && settings.registrationFee) || REGISTRATION_FEE;
  const callFee = (settings && settings.perCallFee) || PER_CALL_FEE;
  function toggleSpec(id) { setSpecialties(specialties.includes(id) ? specialties.filter(s => s !== id) : [...specialties, id]); }
  async function submit() {
    if (!name.trim()) return setErr('Нэрээ оруулна уу');
    if (!validPhone(phone)) return setErr('8 оронтой утасны дугаар оруулна уу');
    if (password.length < 4) return setErr('Нууц үг доод тал нь 4 тэмдэгт байх ёстой');
    if (specialties.length === 0) return setErr('Дор хаяж нэг мэргэшил сонгоно уу');
    if (!agreePunctual) return setErr('Цаг баримтлах нөхцөлийг зөвшөөрнө үү');
    if (!agreePay) return setErr('Хураамжийн нөхцөлийг зөвшөөрнө үү');
    setErr('');
    const res = await onSubmit({ name: name.trim(), phone, password, experience, serviceArea, about: about.trim(), specialties });
    if (res && res.err) setErr(res.err);
  }
  return (
    <div className="uz-page" style={{ maxWidth: 640 }}>
      <button className="uz-back" onClick={onCancel}>← Буцах</button>
      <h1 className="uz-page-title">Сантехникчийн бүртгэл</h1>
      <div className="uz-reg-form">
        <div className="uz-field"><label>Бүтэн нэр *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Жишээ: Дорж" /></div>
        <div className="uz-field"><label>Утасны дугаар * <small style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(таны нэвтрэх нэр)</small></label>
          <div className="uz-phone-input"><span className="uz-phone-prefix">+976</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9911-2233" /></div></div>
        <div className="uz-field"><label>Нууц үг *</label>
          <PasswordField value={password} onChange={e => setPassword(e.target.value)} placeholder="Доод тал нь 4 тэмдэгт" /></div>
        <div className="uz-field"><label>Ажлын туршлага *</label>
          <select value={experience} onChange={e => setExperience(e.target.value)}>{EXPERIENCE_LEVELS.map(l => <option key={l}>{l}</option>)}</select></div>
        <div className="uz-field"><label>Үндсэн үйлчилгээний бүс</label>
          <select value={serviceArea} onChange={e => setServiceArea(e.target.value)}>{DISTRICTS.map(d => <option key={d.name}>{d.name}</option>)}</select></div>
        <div className="uz-field"><label>Мэргэшил (олныг сонгож болно) *</label>
          <div className="uz-spec-grid">{services.map(s => (
            <button key={s.id} type="button" className={`uz-spec-chip ${specialties.includes(s.id) ? 'on' : ''}`} onClick={() => toggleSpec(s.id)}><span>{s.icon}</span> {s.name}</button>
          ))}</div></div>
        <div className="uz-field"><label>Өөрийн тухай / туршлагын тайлбар (заавал биш)</label>
          <textarea rows={3} value={about} onChange={e => setAbout(e.target.value)} placeholder="Ямар ажил хийж байсан, гэрчилгээ, ур чадвар гэх мэт..." /></div>
        <div className="uz-criteria">
          <label className="uz-check"><input type="checkbox" checked={agreePunctual} onChange={e => setAgreePunctual(e.target.checked)} />
            <span>Би дуудлагад <b>цагтаа очих</b>, ажлыг <b>бүрэн гүйцэтгэх</b> үүрэг хүлээж байна.</span></label>
          <label className="uz-check"><input type="checkbox" checked={agreePay} onChange={e => setAgreePay(e.target.checked)} />
            <span>Бүртгэлийн <b>{fmt(regFee)}₮</b>, дуудлага бүрийн <b>{fmt(callFee)}₮</b> (эсвэл {COINS_FOR_FREE_CALL} coin) хураамжийг зөвшөөрч байна.</span></label>
        </div>
        <div className="uz-pay-warn">
          📌 <b>Анхаар:</b> Бүртгэлийн {fmt(regFee)}₮ хураамжаа доорх данс руу шилжүүлээд, <b>гүйлгээний утганд бүртгүүлсэн утасны дугаараа</b> (таны нэвтрэх нэр) заавал бичнэ үү. Админ баталгаажуулсны дараа бүртгэл идэвхжинэ.
          {settings && settings.accountNumber ? (
            <div className="uz-bank-box" style={{ marginTop: 12 }}>
              <div className="uz-bank-row"><span>Банк:</span> <b>{settings.bankName}</b></div>
              <div className="uz-bank-row"><span>Данс (IBAN-тай):</span> <b className="uz-pay-bank-acct">{fmtIBAN(settings.accountNumber)}</b> <CopyButton text={settings.accountNumber} /></div>
              {settings.accountNumber.length === 20 && settings.accountNumber.startsWith('MN') && (
                <div className="uz-bank-row"><span>Данс (IBAN-гүй):</span> <b className="uz-pay-bank-acct">{getAccountOnly(settings.accountNumber)}</b> <CopyButton text={getAccountOnly(settings.accountNumber)} /></div>
              )}
              <div className="uz-bank-row"><span>Эзэмшигч:</span> <b>{settings.accountHolder}</b></div>
              <div className="uz-bank-divider" />
              <div className="uz-bank-row"><span>Гүйлгээний утга:</span> <b>{fmtPhone(phone)}</b> <CopyButton text={phone} /></div>
              <div className="uz-bank-row"><span>Дүн:</span> <b>₮{fmt(regFee)}</b> <CopyButton text={String(regFee)} /></div>
            </div>
          ) : (
            <div className="uz-bank-empty">Админ данс хараахан тохируулаагүй байна.</div>
          )}
        </div>
        {err && <div className="uz-error">{err}</div>}
        <button className="uz-confirm-btn" onClick={submit}>Бүртгэл дуусгах · {fmt(regFee)}₮ төлөх</button>
        <p className="uz-summary-note">Бодит төлбөр хийгдсэний дараа бүртгэл идэвхжинэ.</p>
      </div>
    </div>
  );
}

// ============ TECH DASHBOARD ============
function TechDashboard({ tech, bookings, settings, onAccept, onComplete, onRefresh, onSendMessage, onReplyWarning, onMarkWarningRead, onLogout }) {
  const [chatWarning, setChatWarning] = useState(null);
  const warnings = tech.warnings || [];
  const unreadWarnings = warnings.filter(w => !w.read);
  const isBlocked = tech.blockedUntil && tech.blockedUntil > Date.now();
  const blockDaysLeft = isBlocked ? Math.ceil((tech.blockedUntil - Date.now()) / (24 * 60 * 60 * 1000)) : 0;
  const [tab, setTab] = useState('available');
  const [acceptModal, setAcceptModal] = useState(null);
  const [showTopup, setShowTopup] = useState(false);
  const matchesSpec = (b) => tech.specialties.includes(b.serviceId);
  const available = bookings.filter(b => !b.accepted && !b.completed && !b.disputed && b.paymentStatus !== 'pending' && matchesSpec(b));
  const active = bookings.filter(b => b.accepted && !b.completed && b.techPhone === tech.phone);
  const done = bookings.filter(b => b.completed && b.techPhone === tech.phone);
  const onTimeRate = tech.completedCount ? Math.round((tech.onTimeCount / tech.completedCount) * 100) : 0;
  const avgRating = tech.ratingCount ? (tech.ratingSum / tech.ratingCount).toFixed(1) : '—';
  const freeCallsAvailable = Math.floor((tech.coins || 0) / COINS_FOR_FREE_CALL);
  return (
    <div className="uz-page">
      <div className="uz-dash-head">
        <div><h1 className="uz-page-title" style={{ marginBottom: 4 }}>Сайн уу, {tech.name} 👷 <span className="uz-live-tag">● Live</span></h1>
          <p className="uz-section-sub">{tech.experience} туршлага · +976 {fmtPhone(tech.phone)}{(tech.complaints || 0) > 0 ? ` · ⚠ ${tech.complaints} гомдол` : ''}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="uz-refresh-btn" onClick={onRefresh}>↻ Шинэчлэх</button>
          {onLogout && <button className="uz-refresh-btn" onClick={onLogout} style={{ background: '#fff5f4', color: 'var(--red)', borderColor: 'var(--red-soft)' }}>🚪 Гарах</button>}
        </div>
      </div>
      <div className="uz-stats">
        <div className="uz-stat uz-stat--coin"><div className="uz-stat-icon">🪙</div><div className="uz-stat-num">{tech.coins || 0}</div><div className="uz-stat-label">Coin</div>{freeCallsAvailable > 0 && <div className="uz-stat-extra">{freeCallsAvailable} үнэгүй</div>}</div>
        <div className="uz-stat"><div className="uz-stat-icon">💳</div><div className="uz-stat-num">₮{fmt(tech.balance)}</div><div className="uz-stat-label">Үлдэгдэл</div><button className="uz-topup" onClick={() => setShowTopup(true)}>+ Цэнэглэх</button></div>
        <div className="uz-stat"><div className="uz-stat-icon">✅</div><div className="uz-stat-num">{tech.completedCount || 0}</div><div className="uz-stat-label">Дууссан</div></div>
        <div className="uz-stat"><div className="uz-stat-icon">⏱</div><div className="uz-stat-num">{onTimeRate}<span className="uz-stat-pct">%</span></div><div className="uz-stat-label">Цагтаа</div></div>
        <div className="uz-stat"><div className="uz-stat-icon">⭐</div><div className="uz-stat-num">{avgRating}</div><div className="uz-stat-label">Үнэлгээ</div></div>
      </div>
      <div className="uz-coin-bar">
        <div className="uz-coin-bar-text"><b>Coin цуглуулах:</b> Цагтаа очиж сайн (4-5 ★) үнэлгээ авбал +1 coin. {COINS_FOR_FREE_CALL} coin = 1 дуудлага хураамжгүй.</div>
        <div className="uz-coin-progress">{Array.from({ length: COINS_FOR_FREE_CALL }).map((_, i) => (<span key={i} className={`uz-coin-pip ${(tech.coins || 0) % COINS_FOR_FREE_CALL > i ? 'on' : ''}`}>🪙</span>))}<span className="uz-coin-next">→ үнэгүй дуудлага</span></div>
      </div>

      {isBlocked && (
        <div className="uz-tech-block-notice">
          <div className="uz-tech-block-icon">🚫</div>
          <div>
            <div className="uz-tech-block-title">Та блоклогдсон байна</div>
            <div className="uz-tech-block-sub">{blockDaysLeft} хоног үлдсэн · Энэ хугацаанд шинэ дуудлага хүлээж авах боломжгүй</div>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="uz-tech-warnings">
          <div className="uz-tech-warnings-head">
            ⚠ Админ дараах сануулга илгээсэн байна ({warnings.length}) {unreadWarnings.length > 0 && <span className="uz-feedback-new" style={{ background: 'var(--red)' }}>{unreadWarnings.length} ШИНЭ</span>}
          </div>
          {warnings.slice(0, 3).map(w => {
            const labels = { general: '⚠ Анхааруулга', late: '⏰ Хоцорсон', incomplete: '❌ Ажил дутуу', block: '🚫 Блок' };
            const colors = { general: 'var(--gold)', late: 'var(--red)', incomplete: 'var(--red)', block: '#7a2222' };
            return (
              <div key={w.id} className={`uz-warn-item ${!w.read ? 'unread' : ''}`}>
                <div className="uz-warn-head">
                  <span className="uz-feedback-type-pill" style={{ background: colors[w.type] || colors.general }}>{labels[w.type] || labels.general}</span>
                  {w.days > 0 && <span className="uz-feedback-new" style={{ background: 'var(--red)' }}>{w.days} ХОНОГ БЛОК</span>}
                  {!w.read && <span className="uz-feedback-new">ШИНЭ</span>}
                  <span className="uz-feedback-time">{timeAgo(w.ts)}</span>
                </div>
                <div className="uz-feedback-msg">{w.message}</div>
                <button className="uz-detail-btn" onClick={() => {
                  if (!w.read && onMarkWarningRead) onMarkWarningRead(tech.phone, w.id);
                  setChatWarning(w);
                }}>💬 Хариу бичих ({(w.replies || []).length})</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="uz-dash-tabs">
        <button className={`uz-dash-tab ${tab === 'available' ? 'active' : ''}`} onClick={() => setTab('available')}>Шинэ {available.length > 0 && <span className="uz-badge">{available.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Идэвхтэй {active.length > 0 && <span className="uz-badge">{active.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>Дууссан</button>
      </div>
      {tab === 'available' && (available.length === 0 ? <div className="uz-empty-sm">Одоогоор шинэ дуудлага алга. Шинэ дуудлага ирэх үед автоматаар энд гарч ирнэ.</div>
        : <div className="uz-bookings">{available.map(b => <TechCallCard key={b.id} b={b} type="available" onAccept={() => setAcceptModal(b)} />)}</div>)}
      {tab === 'active' && (active.length === 0 ? <div className="uz-empty-sm">Идэвхтэй дуудлага алга.</div>
        : <div className="uz-bookings">{active.map(b => <TechCallCard key={b.id} b={b} type="active" onComplete={onComplete} onSendMessage={onSendMessage} />)}</div>)}
      {tab === 'done' && (done.length === 0 ? <div className="uz-empty-sm">Дууссан дуудлага алга.</div>
        : <div className="uz-bookings">{done.map(b => <TechCallCard key={b.id} b={b} type="done" onSendMessage={onSendMessage} />)}</div>)}
      {acceptModal && <AcceptModal b={acceptModal} tech={tech} settings={settings} onClose={() => setAcceptModal(null)} onConfirm={(m) => { onAccept(acceptModal, m); setAcceptModal(null); }} />}
      {chatWarning && <WarningChatModal tech={tech} warning={chatWarning} role="tech" onClose={() => setChatWarning(null)} onSend={(text) => onReplyWarning(tech.phone, chatWarning.id, 'tech', text)} />}
      {showTopup && <TopupModal tech={tech} settings={settings} onClose={() => setShowTopup(false)} />}
    </div>
  );
}

function TechCallCard({ b, type, onAccept, onComplete, onSendMessage }) {
  return (
    <div className={`uz-booking-card uz-tech-call uz-tech-call--${type}`}>
      <div className="uz-bc-left"><span className="uz-bc-icon">{b.serviceIcon}</span></div>
      <div className="uz-bc-body">
        <div className="uz-bc-top">
          <h3 className="uz-bc-name">{b.serviceName}</h3>
          <span className="uz-bc-code">{b.code}</span>
          {b.when === 'now' && <span className="uz-urgent-tag">⚡ Яаралтай</span>}
        </div>
        <div className="uz-tech-info-grid">
          <div className="uz-tech-info-item"><span>👤 Захиалагч:</span><b>{type === 'available' ? `${(b.customerName || '').charAt(0)}***` : b.customerName}</b></div>
          <div className="uz-tech-info-item"><span>📞 Утас:</span><b>{type === 'available' ? '🔒 Хүлээж авсаны дараа' : `+976 ${fmtPhone(b.phone)}`}</b></div>
          <div className="uz-tech-info-item"><span>📍 Дүүрэг:</span><b>{b.district}</b></div>
          <div className="uz-tech-info-item"><span>🏠 Хаяг:</span><b>{type === 'available' ? '🔒 Хүлээж авсаны дараа' : b.address}</b></div>
          <div className="uz-tech-info-item"><span>💵 Үнэ:</span><b>₮{fmt(b.priceMin)}+</b></div>
          <div className="uz-tech-info-item"><span>⏰ Цаг:</span><b>{b.when === 'now' ? 'Одоо' : b.schedTime || 'Товлосон'}</b></div>
        </div>
        {type === 'available' && (
          <div className="uz-locked-info">
            🔒 Дэлгэрэнгүй мэдээлэл, хаяг, утас зөвхөн дуудлага хүлээж авсаны дараа харагдана
          </div>
        )}
        {b.mapLink && type !== 'available' && (
          <a className="uz-map-btn" href={b.mapLink} target="_blank" rel="noopener noreferrer">
            🗺 Газрын зургаар харах →
          </a>
        )}
        {b.note && <div className="uz-bc-note">💬 "{b.note}"</div>}
        {type === 'done' && (<div className="uz-bc-bottom">
          <span className={`uz-status ${b.disputed ? 'uz-status--dispute' : b.onTime ? 'uz-status--done' : ''}`}>{b.disputed ? 'Гомдолтой' : b.status}</span>
          {b.coinAwarded && <span className="uz-bc-rating">+1🪙</span>}
          {b.rating != null && <span className="uz-bc-rating">{'★'.repeat(b.rating)}</span>}
        </div>)}
        {type === 'active' && onSendMessage && <ChatThread booking={b} myRole="tech" onSend={onSendMessage} compact />}
        {type === 'done' && onSendMessage && (b.messages || []).length > 0 && <ChatThread booking={b} myRole="tech" onSend={onSendMessage} compact />}
      </div>
      <div className="uz-bc-action">
        {type === 'available' && <button className="uz-accept-btn" onClick={onAccept}>Хүлээж авах →</button>}
        {type === 'active' && (
          <>
            <a className="uz-call-btn" href={`tel:+976${b.phone}`}>📞 Залгах</a>
            <button className="uz-ontime-btn" style={{ padding: '12px 20px', fontSize: 14 }} onClick={() => {
              if (window.confirm('Дуудлагыг дуусгасан гэж тэмдэглэх үү? Үйлчлүүлэгч цагтаа ирсэн эсэхийг үнэлэх болно.')) {
                onComplete(b);
              }
            }}>✓ Ажил дуусгах</button>
          </>
        )}
      </div>
    </div>
  );
}

function AcceptModal({ b, tech, settings, onClose, onConfirm }) {
  const callFee = (settings && settings.perCallFee) || PER_CALL_FEE;
  const canCoin = (tech.coins || 0) >= COINS_FOR_FREE_CALL;
  const canMoney = tech.balance >= callFee;
  return (
    <div className="uz-modal-overlay" onClick={onClose}>
      <div className="uz-modal" onClick={e => e.stopPropagation()}>
        <h3 className="uz-modal-title">Дуудлага хүлээж авах</h3>
        <p className="uz-modal-sub">{b.serviceName} · {b.district}</p>
        <p className="uz-modal-text">Хураамжийн төрлийг сонгоно уу:</p>
        <button className="uz-pay-option" disabled={!canMoney} onClick={() => onConfirm('money')}><span>💳 Үлдэгдлээс төлөх</span><b>−{fmt(callFee)}₮</b>{!canMoney && <small>Үлдэгдэл хүрэлцэхгүй</small>}</button>
        <button className="uz-pay-option uz-pay-option--coin" disabled={!canCoin} onClick={() => onConfirm('coin')}><span>🪙 Coin ашиглах (үнэгүй)</span><b>−{COINS_FOR_FREE_CALL} coin</b>{!canCoin && <small>Coin хүрэлцэхгүй ({tech.coins || 0}/{COINS_FOR_FREE_CALL})</small>}</button>
        <button className="uz-modal-cancel" onClick={onClose}>Болих</button>
      </div>
    </div>
  );
}

// ============ TOPUP MODAL ============
function TopupModal({ tech, settings, onClose }) {
  const hasBank = settings && settings.accountNumber;
  return (
    <div className="uz-modal-overlay" onClick={onClose}>
      <div className="uz-modal" onClick={e => e.stopPropagation()}>
        <h3 className="uz-modal-title">Үлдэгдэл цэнэглэх</h3>
        <p className="uz-modal-text">Доорх данс руу хүссэн дүнгээ шилжүүлж, <b>гүйлгээний утганд утасны дугаараа</b> бичнэ үү. Админ баталгаажуулсны дараа үлдэгдэлд тань нэмэгдэнэ.</p>
        {hasBank ? (
          <div className="uz-bank-box uz-bank-box--lg">
            <div><span>Банк:</span> <b>{settings.bankName}</b></div>
            <div><span>Данс:</span> <b>{settings.accountNumber}</b></div>
            <div><span>Эзэмшигч:</span> <b>{settings.accountHolder}</b></div>
            <div className="uz-bank-divider" />
            <div><span>Гүйлгээний утга:</span> <b>{fmtPhone(tech.phone)}</b></div>
          </div>
        ) : (
          <div className="uz-bank-empty">Админ данс хараахан тохируулаагүй байна. Дараа дахин оролдоно уу.</div>
        )}
        <button className="uz-modal-cancel" onClick={onClose}>Хаах</button>
      </div>
    </div>
  );
}

// ============ ADMIN ============
function AdminLogin({ onAuth, onBack }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (lockedUntil > Date.now()) {
      const update = () => {
        const left = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
        setSecondsLeft(left);
        if (left === 0) {
          setLockedUntil(0);
          setAttempts(0);
          setErr('');
        }
      };
      update();
      const i = setInterval(update, 1000);
      return () => clearInterval(i);
    }
  }, [lockedUntil]);

  async function submit() {
    if (busy) return;
    if (lockedUntil > Date.now()) return;
    if (!pw.trim()) return setErr('Нууц үг оруулна уу');
    setBusy(true);
    try {
      const ok = await checkAdminPassword(pw.trim());
      if (ok) {
        // Migrate plaintext to hash on first successful login if not already
        const stored = await loadObj(ADMIN_PWHASH_KEY);
        if (!stored || !stored.hash) await setAdminPassword(pw.trim());
        // Request notification permission for new bookings
        await requestNotificationPermission();
        onAuth();
      } else {
        const next = attempts + 1;
        setAttempts(next);
        if (next >= MAX_LOGIN_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_DURATION_MS);
          setErr(`Хэт олон удаа алдаа гарсан. 5 минут түгжигдэв.`);
        } else {
          setErr(`Нууц үг буруу байна (${MAX_LOGIN_ATTEMPTS - next} оролдлого үлдсэн)`);
        }
        setPw('');
      }
    } finally {
      setBusy(false);
    }
  }

  const isLocked = lockedUntil > Date.now();

  return (
    <div className="uz-auth-page">
      <div className="uz-auth-card">
        {onBack && <button className="uz-back" onClick={onBack} style={{ marginBottom: 12 }}>← Нүүр буцах</button>}
        <div className="uz-auth-logo"><span className="uz-logo-icon">🛡️</span><span className="uz-logo-text">Админ удирдлага</span></div>
        <p className="uz-auth-tagline">Зөвхөн эрх бүхий хүн нэвтэрнэ</p>
        {isLocked ? (
          <div className="uz-warn-blocked" style={{ textAlign: 'center', marginBottom: 16 }}>
            🚫 Хэт олон удаа буруу оруулсан тул түгжигдсэн<br/>
            <b style={{ fontSize: 20 }}>{Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, '0')}</b><br/>
            <small>Үлдсэн хугацаа</small>
          </div>
        ) : (
          <>
            <div className="uz-field"><label>Админ нууц үг</label>
              <PasswordField value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && submit()} autoFocus /></div>
            {err && <div className="uz-error">{err}</div>}
            <button className="uz-confirm-btn" onClick={submit} disabled={busy}>{busy ? 'Шалгаж байна...' : 'Нэвтрэх'}</button>
            <p className="uz-summary-note">🔒 5 удаа буруу оруулбал 5 минут түгжигдэнэ. Идэвхгүй үед 30 минутын дараа автомат гарна.</p>
          </>
        )}
      </div>
    </div>
  );
}

function AdminDashboard({ techs, bookings, customers, feedback, orgs, broadcasts, settings, services, materials, matOrders, onToggleBlock, onApproveTech, onRejectTech, onSetArrival, onSetExtraWait, onSaveSettings, onCreditTech, onSaveServices, onSaveMaterials, onSendMessage, onDeleteBooking, onMarkPaid, onMarkFeedbackRead, onDeleteFeedback, onApproveOrg, onDeleteOrg, onSendBroadcast, onDeleteBroadcast, onSendWarning, onReplyWarning, onUnblockTech, onRefresh, onLogout }) {
  const [detailBooking, setDetailBooking] = useState(null);
  const [confirmDlg, setConfirmDlg] = useState(null);
  const [warningTech, setWarningTech] = useState(null);
  const [chatWarning, setChatWarning] = useState(null); // { tech, warning }
  const [tab, setTab] = useState('overview');
  const uniqueCustomers = new Set(bookings.map(b => cleanPhone(b.phone))).size;
  const totalRevenue = bookings.filter(b => b.completed && !b.disputed).length * PER_CALL_FEE + techs.length * REGISTRATION_FEE;
  const completed = bookings.filter(b => b.completed).length;
  const disputes = bookings.filter(b => b.disputed);
  // Free tech checker: non-blocked tech matching specialty with no active call
  const freeTechCountFor = (booking) => techs.filter(t =>
    !t.blocked && t.specialties.includes(booking.serviceId) &&
    !bookings.some(x => x.techPhone === t.phone && x.accepted && !x.completed)
  ).length;
  const pending = bookings.filter(b => !b.accepted && !b.completed && !b.disputed);
  const sortedTechs = [...techs].sort((a, b) => {
    const ra = a.ratingCount ? a.ratingSum / a.ratingCount : 5;
    const rb = b.ratingCount ? b.ratingSum / b.ratingCount : 5;
    return ra - rb;
  });
  return (
    <div className="uz-page" style={{ maxWidth: 1100 }}>
      <div className="uz-dash-head">
        <div><h1 className="uz-page-title" style={{ marginBottom: 4 }}>Админ самбар 🛡️</h1>
          <p className="uz-section-sub">Бүх дуудлага, сантехникч, хэрэглэгчийг хянах</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="uz-refresh-btn" onClick={onRefresh}>↻ Шинэчлэх</button>
          <button className="uz-refresh-btn" onClick={async () => {
            if (!window.confirm('Бүх давхар бичигдсэн сантехникч/дуудлагуудыг устгах уу?\n\nЭнэ үйлдэл нь storage-аас давтагдсан бичлэгийг арилгана. Аюулгүй үйлдэл.')) return;
            const keys = [
              { key: 'usanzasvar:techs', by: 'phone' },
              { key: 'usanzasvar:bookings', by: 'id' },
              { key: 'usanzasvar:orgs', by: 'id' },
              { key: 'usanzasvar:feedback', by: 'id' },
              { key: 'usanzasvar:broadcasts', by: 'id' },
            ];
            let totalRemoved = 0;
            for (const { key, by } of keys) {
              try {
                const raw = await window.storage.get(key, true);
                if (raw && raw.value) {
                  const list = JSON.parse(raw.value);
                  if (Array.isArray(list)) {
                    const cleaned = dedupeBy(list, by);
                    totalRemoved += (list.length - cleaned.length);
                    if (cleaned.length !== list.length) {
                      await window.storage.set(key, JSON.stringify(cleaned), true);
                    }
                  }
                }
              } catch (e) {}
            }
            window.alert(`✅ ${totalRemoved} давхар бичлэг арилгагдлаа!\n\nДахин шинэчилнэ үү.`);
            onRefresh();
          }} style={{ background: '#e6f7ef', color: '#0d8a56', borderColor: '#b9e8d2' }}>🧹 Цэвэрлэх</button>
          {onLogout && <button className="uz-refresh-btn" onClick={onLogout} style={{ background: '#fff5f4', color: 'var(--red)', borderColor: 'var(--red-soft)' }}>🚪 Гарах</button>}
        </div>
        <div className="uz-stat"><div className="uz-stat-icon">📞</div><div className="uz-stat-num">{bookings.length}</div><div className="uz-stat-label">Нийт дуудлага</div></div>
        <div className="uz-stat"><div className="uz-stat-icon">✅</div><div className="uz-stat-num">{completed}</div><div className="uz-stat-label">Дууссан</div></div>
        <div className="uz-stat"><div className="uz-stat-icon">👷</div><div className="uz-stat-num">{techs.length}</div><div className="uz-stat-label">Сантехникч</div></div>
        <div className="uz-stat"><div className="uz-stat-icon">👥</div><div className="uz-stat-num">{uniqueCustomers}</div><div className="uz-stat-label">Хэрэглэгч</div></div>
        <div className="uz-stat uz-stat--coin"><div className="uz-stat-icon">💰</div><div className="uz-stat-num" style={{ fontSize: 18 }}>₮{fmt(totalRevenue)}</div><div className="uz-stat-label">Орлого</div></div>
        <div className="uz-stat"><div className="uz-stat-icon">⚠</div><div className="uz-stat-num" style={{ color: disputes.length ? '#c0392b' : undefined }}>{disputes.length}</div><div className="uz-stat-label">Гомдол</div></div>
      </div>

      <div className="uz-dash-tabs">
        <button className={`uz-dash-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Сантехникчид {techs.length > 0 && <span className="uz-badge">{techs.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'dispatch' ? 'active' : ''}`} onClick={() => setTab('dispatch')}>Хуваарилалт {pending.length > 0 && <span className="uz-badge">{pending.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'bookings' ? 'active' : ''}`} onClick={() => setTab('bookings')}>Дуудлага {bookings.length > 0 && <span className="uz-badge">{bookings.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'disputes' ? 'active' : ''}`} onClick={() => setTab('disputes')}>Гомдол {disputes.length > 0 && <span className="uz-badge" style={{ background: '#c0392b' }}>{disputes.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>Үйлчилгээ {services.length > 0 && <span className="uz-badge" style={{ background: '#8b9aa8' }}>{services.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'materials' ? 'active' : ''}`} onClick={() => setTab('materials')}>Материал {matOrders.length > 0 && <span className="uz-badge">{matOrders.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'feedback' ? 'active' : ''}`} onClick={() => setTab('feedback')}>📝 Санал хүсэлт {(feedback || []).filter(f => !f.read).length > 0 && <span className="uz-badge" style={{ background: '#d99a00' }}>{feedback.filter(f => !f.read).length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'orgs' ? 'active' : ''}`} onClick={() => setTab('orgs')}>🏢 Байгууллага {(orgs || []).filter(o => o.status === 'pending').length > 0 && <span className="uz-badge" style={{ background: '#16a085' }}>{orgs.filter(o => o.status === 'pending').length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'broadcasts' ? 'active' : ''}`} onClick={() => setTab('broadcasts')}>📢 Зар сурталчилгаа {(broadcasts || []).length > 0 && <span className="uz-badge" style={{ background: '#7a5af0' }}>{broadcasts.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Тохиргоо</button>
      </div>

      {/* TECHS */}
      {tab === 'overview' && (
        techs.length === 0 ? <div className="uz-empty-sm">Бүртгэлтэй сантехникч алга.</div> : (
          <div className="uz-admin-table">
            {sortedTechs.map(t => {
              const avg = t.ratingCount ? (t.ratingSum / t.ratingCount) : null;
              const onTimeRate = t.completedCount ? Math.round((t.onTimeCount / t.completedCount) * 100) : 0;
              const flagged = (avg != null && avg < 3) || (t.complaints || 0) > 0;
              const isPending = t.approved === false;
              return (
                <div key={t.phone} className={`uz-tech-row ${t.blocked ? 'blocked' : isPending ? 'pending' : flagged ? 'flagged' : ''}`}>
                  <div className="uz-tr-main">
                    <div className="uz-tr-name">{t.name} {t.blocked && <span className="uz-block-tag">БЛОКЛОГДСОН</span>}{isPending && <span className="uz-pending-tag">⏳ Төлбөр хүлээгдэж буй</span>}{!t.blocked && !isPending && flagged && <span className="uz-flag-tag">⚠ Анхаар</span>}</div>
                    <div className="uz-tr-sub">+976 {fmtPhone(t.phone)} · {t.experience}</div>
                  </div>
                  <div className="uz-tr-stats">
                    <span title="Үлдэгдэл" style={{ color: 'var(--blue)' }}>💳 ₮{fmt(t.balance || 0)}</span>
                    <span title="Дууссан">✅ {t.completedCount || 0}</span>
                    <span title="Цагтаа">⏱ {onTimeRate}%</span>
                    <span title="Үнэлгээ" style={{ color: avg != null && avg < 3 ? '#c0392b' : undefined }}>⭐ {avg != null ? avg.toFixed(1) : '—'}</span>
                    <span title="Гомдол" style={{ color: (t.complaints || 0) > 0 ? '#c0392b' : undefined }}>⚠ {t.complaints || 0}</span>
                    <span title="Coin">🪙 {t.coins || 0}</span>
                  </div>
                  <div className="uz-tr-actions">
                    {isPending ? (
                      <>
                        <button className="uz-approve-btn" onClick={() => onApproveTech(t.phone)}>✓ Нэвтрэх эрх олгох</button>
                        <button className="uz-reject-btn" onClick={() => onRejectTech(t.phone)}>Бүртгэл буцаах</button>
                      </>
                    ) : (
                      <>
                        <CreditControl onCredit={(amt) => onCreditTech(t.phone, amt)} currentBalance={t.balance || 0} />
                        <button className="uz-warn-btn" onClick={() => setWarningTech(t)}>⚠ Сануулга{(t.warnings || []).length > 0 ? ` (${t.warnings.length})` : ''}</button>
                        {t.blockedUntil && t.blockedUntil > Date.now() ? (
                          <button className="uz-block-btn unblock" onClick={() => onUnblockTech(t.phone)}>🔓 Блок цуцлах</button>
                        ) : (
                          <button className={`uz-block-btn ${t.blocked ? 'unblock' : ''}`} onClick={() => onToggleBlock(t.phone)}>
                            {t.blocked ? 'Блок цуцлах' : 'Блоклох'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* DISPATCH */}
      {tab === 'dispatch' && (
        pending.length === 0 ? <div className="uz-empty-sm">Хуваарилах хүлээгдэж буй дуудлага алга.</div> : (
          <div className="uz-bookings">{pending.map(b => (
            <DispatchCard key={b.id} b={b} freeCount={freeTechCountFor(b)} onSetArrival={onSetArrival} onSetExtraWait={onSetExtraWait} />
          ))}</div>
        )
      )}

      {/* BOOKINGS */}
      {tab === 'bookings' && (
        bookings.length === 0 ? <div className="uz-empty-sm">Дуудлага алга.</div> : (
          <div className="uz-bookings">{bookings.map(b => (
            <div key={b.id} className={`uz-booking-card ${b.disputed ? 'uz-card-disputed' : ''}`}>
              <div className="uz-bc-left"><span className="uz-bc-icon">{b.serviceIcon}</span></div>
              <div className="uz-bc-body">
                <div className="uz-bc-top"><h3 className="uz-bc-name">{b.serviceName}</h3><span className="uz-bc-code">{b.code}</span></div>
                <div className="uz-bc-info">👤 {b.customerName} · 📞 +976 {fmtPhone(b.phone)} · 📍 {b.district} · {b.address}</div>
                <div className="uz-bc-info">👷 {b.techName || '— хараахан аваагүй'} {b.techPhone ? `· +976 ${fmtPhone(b.techPhone)}` : ''}</div>
                {b.paymentStatus === 'pending' && (
                  <div className="uz-pay-pending" style={{ marginTop: 6 }}>
                    ⏳ <b>Төлбөр хүлээгдэж байна</b> — мөнгө орсон бол баталгаажуулна уу
                  </div>
                )}
                <div className="uz-bc-bottom">
                  <span className={`uz-status ${b.disputed ? 'uz-status--dispute' : b.completed ? 'uz-status--done' : ''}`}>{b.status}</span>
                  {b.rating != null && <span className="uz-bc-rating">{'★'.repeat(b.rating)}</span>}
                  <span className="uz-bc-time">{timeAgo(b.createdAt)}</span>
                  {(b.messages || []).length > 0 && <span className="uz-msg-count">💬 {b.messages.length}</span>}
                </div>
              </div>
              <div className="uz-bc-action" style={{ flexDirection: 'column', gap: 6 }}>
                {b.paymentStatus === 'pending' && onMarkPaid && (
                  <button className="uz-confirm-pay-btn" onClick={() => setConfirmDlg({
                    msg: `${b.code} дуудлагын төлбөр орсон уу?\n\nБаталгаажуулсны дараа сантехникч харж эхэлнэ.`,
                    action: () => onMarkPaid(b.id),
                    label: '✓ Тийм, төлбөр орсон',
                    variant: 'default',
                  })}>✓ Төлбөр орсон</button>
                )}
                <button className="uz-detail-btn" onClick={() => setDetailBooking(b)}>Дэлгэрэнгүй →</button>
                {onDeleteBooking && (
                  <button className="uz-del-btn" onClick={() => setConfirmDlg({
                    msg: `Дуудлага ${b.code} -г үүрд устгах уу?\n\nЭнэ үйлдлийг буцаах боломжгүй.`,
                    action: () => onDeleteBooking(b.id),
                    label: '🗑 Тийм, устгах',
                    variant: 'danger',
                  })}>🗑 Устгах</button>
                )}
              </div>
            </div>
          ))}</div>
        )
      )}

      {detailBooking && <BookingDetailModal b={detailBooking} onClose={() => setDetailBooking(null)} onSendMessage={onSendMessage} />}
      {warningTech && <WarningModal tech={warningTech} onClose={() => setWarningTech(null)} onSend={(type, msg, days) => { onSendWarning(warningTech.phone, type, msg, days); setWarningTech(null); }} onOpenChat={(w) => { setChatWarning({ tech: warningTech, warning: w }); setWarningTech(null); }} />}
      {chatWarning && <WarningChatModal tech={chatWarning.tech} warning={chatWarning.warning} role="admin" onClose={() => setChatWarning(null)} onSend={(text) => onReplyWarning(chatWarning.tech.phone, chatWarning.warning.id, 'admin', text)} />}
      <ConfirmDialog
        open={!!confirmDlg}
        message={confirmDlg?.msg || ''}
        confirmLabel={confirmDlg?.label || 'Тийм'}
        variant={confirmDlg?.variant || 'default'}
        onConfirm={() => { confirmDlg?.action(); setConfirmDlg(null); }}
        onCancel={() => setConfirmDlg(null)}
      />

      {/* DISPUTES */}
      {tab === 'disputes' && (
        disputes.length === 0 ? <div className="uz-empty-sm">Гомдол алга. 👍</div> : (
          <div className="uz-bookings">{disputes.map(b => (
            <div key={b.id} className="uz-booking-card uz-card-disputed">
              <div className="uz-bc-left"><span className="uz-bc-icon">⚠</span></div>
              <div className="uz-bc-body">
                <div className="uz-bc-top"><h3 className="uz-bc-name">{b.serviceName}</h3><span className="uz-bc-code">{b.code}</span></div>
                <div className="uz-bc-info">👤 {b.customerName} · 👷 {b.techName}</div>
                <div className="uz-dispute-reason">Шалтгаан: {b.disputeReason}</div>
                <div className="uz-refund-note">💸 ₮{fmt(b.calloutFee || CALLOUT_FEE)} буцаагдсан</div>
              </div>
            </div>
          ))}</div>
        )
      )}
      {tab === 'services' && (
        <ServiceEditor services={services} onSave={onSaveServices} />
      )}
      {tab === 'materials' && (
        <MaterialAdmin materials={materials} orders={matOrders} onSave={onSaveMaterials} />
      )}
      {tab === 'feedback' && (
        <FeedbackAdmin feedback={feedback || []} onMarkRead={onMarkFeedbackRead} onDelete={onDeleteFeedback} />
      )}
      {tab === 'orgs' && (
        <OrgsAdmin orgs={orgs || []} onApprove={onApproveOrg} onDelete={onDeleteOrg} />
      )}
      {tab === 'broadcasts' && (
        <BroadcastsAdmin broadcasts={broadcasts || []} onSend={onSendBroadcast} onDelete={onDeleteBroadcast} />
      )}
      {tab === 'settings' && (
        <BankSettings settings={settings} onSave={onSaveSettings} />
      )}
    </div>
  );
}

// ============ BROADCASTS ADMIN ============
function BroadcastsAdmin({ broadcasts, onSend, onDelete }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('all');
  const [discountPct, setDiscountPct] = useState('');
  const [expiresIn, setExpiresIn] = useState('0');
  const [confirmDel, setConfirmDel] = useState(null);
  function send() {
    if (!title.trim() || !message.trim()) { showToast('Гарчиг + Агуулга оруулна уу'); return; }
    const days = Number(expiresIn) || 0;
    const expiresAt = days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : null;
    onSend(title, message, audience, Number(discountPct) || 0, expiresAt);
    setTitle(''); setMessage(''); setAudience('all'); setDiscountPct(''); setExpiresIn('0');
  }
  return (
    <div>
      <div className="uz-settings-form" style={{ marginBottom: 20 }}>
        <h3 className="uz-settings-title" style={{ marginBottom: 8 }}>📢 Шинэ зар илгээх</h3>
        <p className="uz-settings-sub" style={{ marginBottom: 14 }}>Бүх хэрэглэгчдийн аппын дэлгэцэнд тэр даруй харагдана. Push notification ч ирнэ. Хямдрал тохируулбал төлбөрөөс автомат хасагдана.</p>
        <div className="uz-field"><label>Гарчиг *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Жишээ: 30% хямдрал!" maxLength={60} />
        </div>
        <div className="uz-field"><label>Агуулга *</label>
          <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Жишээ: Энэ долоо хоногт бүх дуудлагад 30% хямдрал. Хязгаартай!" maxLength={300} />
        </div>
        <div className="uz-field"><label>🎁 Хямдрал % (0-100, заавал биш)</label>
          <input type="number" min="0" max="100" value={discountPct} onChange={e => setDiscountPct(e.target.value)} placeholder="Жнь: 30" />
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6 }}>0-ээс бусад тоо оруулбал — энэ хямдрал бүх дуудлагад автомат хэрэгжинэ</div>
        </div>
        <div className="uz-field"><label>⏰ Хямдралын хугацаа (хоног, 0 = хязгааргүй)</label>
          <input type="number" min="0" max="365" value={expiresIn} onChange={e => setExpiresIn(e.target.value)} placeholder="Жнь: 7 хоног" />
        </div>
        <div className="uz-field"><label>Хэнд илгээх</label>
          <select value={audience} onChange={e => setAudience(e.target.value)}>
            <option value="all">🌐 Бүгдэд</option>
            <option value="customers">👤 Зөвхөн үйлчлүүлэгчдэд</option>
            <option value="techs">👷 Зөвхөн сантехникчдэд</option>
          </select>
        </div>
        <button className="uz-confirm-btn" onClick={send}>📢 Илгээх</button>
      </div>
      <h3 className="uz-section-title" style={{ marginBottom: 14 }}>Илгээсэн зар ({broadcasts.length})</h3>
      {broadcasts.length === 0 ? (
        <div className="uz-empty-sm">Зар алга байна.</div>
      ) : (
        <div className="uz-bookings">
          {broadcasts.map(b => {
            const expired = b.expiresAt && b.expiresAt < Date.now();
            return (
              <div key={b.id} className="uz-booking-card">
                <div className="uz-bc-body" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 16 }}>📢 {b.title}</b>
                    <span className="uz-bc-code">{b.audience === 'techs' ? '👷' : b.audience === 'customers' ? '👤' : '🌐'}</span>
                    {b.discountPct > 0 && <span className="uz-bc-code" style={{ background: '#ffeec8', color: '#7a5a00' }}>🎁 {b.discountPct}% хямдрал</span>}
                    {expired && <span className="uz-bc-code" style={{ background: '#fff5f4', color: 'var(--red)' }}>⏰ Дууссан</span>}
                    {b.expiresAt && !expired && <span className="uz-bc-code" style={{ background: '#e6f7ef', color: '#0d8a56' }}>{Math.ceil((b.expiresAt - Date.now()) / 86400000)} хоног үлдсэн</span>}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--ink)' }}>{b.message}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>{timeAgo(b.ts)}</div>
                </div>
                <button className="uz-cancel-btn" onClick={() => setConfirmDel(b)} style={{ marginLeft: 12 }}>Устгах</button>
              </div>
            );
          })}
        </div>
      )}
      {confirmDel && (
        <ConfirmDialog
          open={!!confirmDel}
          message={`"${confirmDel.title}" гэсэн зарыг устгах гэж байна.\n\nЭнэ үйлдлийг буцаах боломжгүй.`}
          confirmLabel="Устгах"
          cancelLabel="Болих"
          variant="danger"
          onConfirm={() => { onDelete(confirmDel.id); setConfirmDel(null); }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// ============ BANK SETTINGS (admin) ============
// ============ ORGS ADMIN ============
function OrgsAdmin({ orgs, onApprove, onDelete }) {
  const [confirmDlg, setConfirmDlg] = useState(null);
  if (orgs.length === 0) {
    return <div className="uz-empty-sm">Хараахан байгууллага бүртгүүлээгүй байна.</div>;
  }
  return (
    <div className="uz-feedback-admin">
      <p className="uz-settings-sub" style={{ marginBottom: 16 }}>Албан байгууллагуудаас ирсэн гэрээт үйлчилгээний хүсэлтүүд. Хураамж орсон тохиолдолд "✓ Идэвхжүүлэх" товч дарж эхлүүлнэ.</p>
      {orgs.map(o => (
        <div key={o.id} className={`uz-feedback-card ${o.status === 'pending' ? 'unread' : ''}`}>
          <div className="uz-feedback-head">
            <span className="uz-feedback-type-pill" style={{ background: o.status === 'active' ? 'var(--green)' : 'var(--gold)' }}>
              {o.status === 'active' ? '✓ Идэвхтэй' : '⏳ Хүлээгдэж буй'}
            </span>
            {o.status === 'pending' && <span className="uz-feedback-new">ШИНЭ</span>}
            <span className="uz-feedback-time">{timeAgo(o.createdAt)}</span>
          </div>
          <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 800, fontSize: 18, marginBottom: 8 }}>🏢 {o.companyName}</div>
          <div className="uz-feedback-meta">
            <span>👤 {o.contactName} {o.position && `(${o.position})`}</span>
            <span>📞 +976 {fmtPhone(o.phone)}</span>
          </div>
          <div className="uz-feedback-meta">
            <span>📍 {o.address}</span>
            {o.employees && <span>👥 {o.employees} ажилтан</span>}
          </div>
          {o.note && <div className="uz-feedback-msg">💬 {o.note}</div>}
          <div className="uz-feedback-actions">
            {o.status === 'pending' && (
              <button className="uz-feedback-read-btn" onClick={() => setConfirmDlg({
                msg: `${o.companyName}-г идэвхжүүлэх үү?\n\nХураамж нь орсон гэдгийг шалгасан байх ёстой.`,
                action: () => onApprove(o.id),
                label: '✓ Тийм, идэвхжүүлэх',
              })}>✓ Идэвхжүүлэх</button>
            )}
            <button className="uz-del-btn" onClick={() => setConfirmDlg({
              msg: 'Энэ байгууллагын мэдээллийг устгах уу?',
              action: () => onDelete(o.id),
              label: '🗑 Тийм, устгах',
              variant: 'danger',
            })}>🗑 Устгах</button>
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={!!confirmDlg}
        message={confirmDlg?.msg || ''}
        confirmLabel={confirmDlg?.label || 'Тийм'}
        variant={confirmDlg?.variant || 'default'}
        onConfirm={() => { confirmDlg?.action(); setConfirmDlg(null); }}
        onCancel={() => setConfirmDlg(null)}
      />
    </div>
  );
}

// ============ FEEDBACK ADMIN ============
function FeedbackAdmin({ feedback, onMarkRead, onDelete }) {
  const [confirmDlg, setConfirmDlg] = useState(null);
  if (feedback.length === 0) {
    return <div className="uz-empty-sm">Хараахан санал ирээгүй байна. Үйлчлүүлэгчид санал ирэх үед энд харагдана.</div>;
  }
  const typeLabel = { suggestion: '💡 Санал', complaint: '⚠ Гомдол', question: '❓ Асуулт', praise: '💚 Талархал' };
  const typeColor = { suggestion: 'var(--blue)', complaint: 'var(--red)', question: 'var(--gold)', praise: 'var(--green)' };
  return (
    <div className="uz-feedback-admin">
      <p className="uz-settings-sub" style={{ marginBottom: 16 }}>Үйлчлүүлэгчдээс ирсэн санал, гомдол, асуулт. Уншсаны дараа "✓ Уншсан" товчийг дарж тэмдэглэнэ.</p>
      {feedback.map(f => (
        <div key={f.id} className={`uz-feedback-card ${!f.read ? 'unread' : ''}`}>
          <div className="uz-feedback-head">
            <span className="uz-feedback-type-pill" style={{ background: typeColor[f.type] }}>{typeLabel[f.type] || f.type}</span>
            {!f.read && <span className="uz-feedback-new">ШИНЭ</span>}
            <span className="uz-feedback-time">{timeAgo(f.createdAt)}</span>
          </div>
          {(f.name || f.phone) && (
            <div className="uz-feedback-meta">
              {f.name && <span>👤 {f.name}</span>}
              {f.phone && <span>📞 +976 {fmtPhone(f.phone)}</span>}
            </div>
          )}
          <div className="uz-feedback-msg">{f.message}</div>
          <div className="uz-feedback-actions">
            {!f.read && <button className="uz-feedback-read-btn" onClick={() => onMarkRead(f.id)}>✓ Уншсан</button>}
            <button className="uz-del-btn" onClick={() => setConfirmDlg({
              msg: 'Энэ саналыг устгах уу?',
              action: () => onDelete(f.id),
              label: '🗑 Тийм, устгах',
              variant: 'danger',
            })}>🗑 Устгах</button>
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={!!confirmDlg}
        message={confirmDlg?.msg || ''}
        confirmLabel={confirmDlg?.label || 'Тийм'}
        variant={confirmDlg?.variant || 'default'}
        onConfirm={() => { confirmDlg?.action(); setConfirmDlg(null); }}
        onCancel={() => setConfirmDlg(null)}
      />
    </div>
  );
}

function BankSettings({ settings, onSave }) {
  const [bankName, setBankName] = useState(settings?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(settings?.accountNumber || '');
  const [accountHolder, setAccountHolder] = useState(settings?.accountHolder || '');
  const [contactPhone, setContactPhone] = useState(settings?.contactPhone || '');
  const [paymentLink, setPaymentLink] = useState(settings?.paymentLink || '');
  const [fbLink, setFbLink] = useState(settings?.fbLink || '');
  const [messengerLink, setMessengerLink] = useState(settings?.messengerLink || '');
  const [viberLink, setViberLink] = useState(settings?.viberLink || '');
  const [regFee, setRegFee] = useState(settings?.registrationFee || REGISTRATION_FEE);
  const [callFee, setCallFee] = useState(settings?.perCallFee || PER_CALL_FEE);
  const [calloutFee, setCalloutFeeState] = useState(settings?.calloutFee || CALLOUT_FEE);
  const [techCoinComp, setTechCoinComp] = useState(settings?.techCoinPerComplete ?? 1);
  const [techCoinsFree, setTechCoinsFree] = useState(settings?.techCoinsForFreeCall ?? COINS_FOR_FREE_CALL);
  const [custCoinComp, setCustCoinComp] = useState(settings?.customerCoinPerComplete ?? 1);
  const [custCoinsDisc, setCustCoinsDisc] = useState(settings?.customerCoinsForDiscount ?? 5);
  const [custDiscAmt, setCustDiscAmt] = useState(settings?.customerDiscountAmount ?? 5000);
  const [orgFee, setOrgFee] = useState(settings?.orgMonthlyFee ?? 300000);
  const [districts, setDistricts] = useState(settings?.districts && settings.districts.length ? settings.districts : DISTRICTS);
  const [dirty, setDirty] = useState(false);
  
  // Sync from settings when settings prop changes (e.g. on initial load or external update)
  // BUT ONLY if user hasn't edited (dirty=false)
  useEffect(() => {
    if (dirty || !settings) return;
    setBankName(settings.bankName || '');
    setAccountNumber(settings.accountNumber || '');
    setAccountHolder(settings.accountHolder || '');
    setContactPhone(settings.contactPhone || '');
    setPaymentLink(settings.paymentLink || '');
    setFbLink(settings.fbLink || '');
    setMessengerLink(settings.messengerLink || '');
    setViberLink(settings.viberLink || '');
    setRegFee(settings.registrationFee || REGISTRATION_FEE);
    setCallFee(settings.perCallFee || PER_CALL_FEE);
    setCalloutFeeState(settings.calloutFee || CALLOUT_FEE);
    setTechCoinComp(settings.techCoinPerComplete ?? 1);
    setTechCoinsFree(settings.techCoinsForFreeCall ?? COINS_FOR_FREE_CALL);
    setCustCoinComp(settings.customerCoinPerComplete ?? 1);
    setCustCoinsDisc(settings.customerCoinsForDiscount ?? 5);
    setCustDiscAmt(settings.customerDiscountAmount ?? 5000);
    setOrgFee(settings.orgMonthlyFee ?? 300000);
    setDistricts(settings.districts && settings.districts.length ? settings.districts : DISTRICTS);
  }, [settings, dirty]);
  
  function markDirty() { setDirty(true); }
  
  function updateDistrictEta(idx, eta) {
    const next = [...districts];
    next[idx] = { ...next[idx], eta: Number(eta) || 0 };
    setDistricts(next); setDirty(true);
  }
  const [err, setErr] = useState('');
  function save() {
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) return setErr('Банкны бүх талбарыг бөглөнө үү');
    if (regFee < 0 || callFee < 0) return setErr('Хураамж сөрөг утга байж болохгүй');
    setErr('');
    setDirty(false);
    onSave({
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountHolder: accountHolder.trim(),
      contactPhone: contactPhone.trim(),
      paymentLink: paymentLink.trim(),
      fbLink: fbLink.trim(),
      messengerLink: messengerLink.trim(),
      viberLink: viberLink.trim(),
      registrationFee: Number(regFee) || REGISTRATION_FEE,
      perCallFee: Number(callFee) || PER_CALL_FEE,
      calloutFee: Number(calloutFee) || CALLOUT_FEE,
      techCoinPerComplete: Number(techCoinComp) || 0,
      techCoinsForFreeCall: Number(techCoinsFree) || 2,
      customerCoinPerComplete: Number(custCoinComp) || 0,
      customerCoinsForDiscount: Number(custCoinsDisc) || 5,
      customerDiscountAmount: Number(custDiscAmt) || 5000,
      orgMonthlyFee: Number(orgFee) || 300000,
      districts: districts,
    });
  }
  return (
    <div className="uz-settings">
      <h3 className="uz-settings-title">💰 Хураамжууд</h3>
      <p className="uz-settings-sub">Үйлчлүүлэгчээс болон сантехникчээс авах хураамжуудыг тохируулна. Өөрчилсний дараа шинэ дуудлагуудад шууд тусна.</p>
      <div className="uz-settings-form" style={{ marginBottom: 28 }}>
        <div className="uz-field"><label>📞 Үйлчлүүлэгчийн дуудлагын хураамж (₮)</label>
          <input type="number" value={calloutFee} onChange={e => { setCalloutFeeState(e.target.value); markDirty(); }} placeholder="5000" />
          <small style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Үйлчлүүлэгч дуудлага өгөхөд урьдчилан төлнө</small></div>
        <div className="uz-field"><label>👷 Сантехникчийн нэг дуудлагын хураамж (₮)</label>
          <input type="number" value={callFee} onChange={e => { setCallFee(e.target.value); markDirty(); }} placeholder="5000" />
          <small style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Сантехникч дуудлага хүлээж авахдаа төлнө</small></div>
        <div className="uz-field"><label>📝 Сантехникчийн бүртгэлийн нэг удаагийн хураамж (₮)</label>
          <input type="number" value={regFee} onChange={e => { setRegFee(e.target.value); markDirty(); }} placeholder="10000" />
          <small style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Шинэ сантехникч бүртгүүлэхдээ нэг удаа төлнө</small></div>
      </div>

      <h3 className="uz-settings-title">🪙 Сантехникчийн coin шагнал</h3>
      <p className="uz-settings-sub">Сантехникч цагтаа ажил дуусгасан тохиолдолд хэдэн coin шагнах, хэдэн coin нь нэг дуудлагыг үнэгүй авах эрхтэйг тохируулна.</p>
      <div className="uz-settings-form" style={{ marginBottom: 28 }}>
        <div className="uz-field"><label>Цагтаа ажилласан 1 дуудлагад өгөх coin</label>
          <input type="number" value={techCoinComp} onChange={e => { setTechCoinComp(e.target.value); markDirty(); }} placeholder="1" /></div>
        <div className="uz-field"><label>Үнэгүй дуудлага авах coin тоо</label>
          <input type="number" value={techCoinsFree} onChange={e => { setTechCoinsFree(e.target.value); markDirty(); }} placeholder="2" /></div>
      </div>

      <h3 className="uz-settings-title">🎁 Үйлчлүүлэгчийн coin шагнал</h3>
      <p className="uz-settings-sub">Үйлчлүүлэгч дуудлагаа дуусгаснаар coin цуглуулна. Тогтсон тоонд хүрвэл дараагийн дуудлагадаа хямдрал авна.</p>
      <div className="uz-settings-form" style={{ marginBottom: 28 }}>
        <div className="uz-field"><label>1 дуудлагад өгөх coin</label>
          <input type="number" value={custCoinComp} onChange={e => { setCustCoinComp(e.target.value); markDirty(); }} placeholder="1" /></div>
        <div className="uz-field"><label>Хямдрал авах coin тоо</label>
          <input type="number" value={custCoinsDisc} onChange={e => { setCustCoinsDisc(e.target.value); markDirty(); }} placeholder="5" /></div>
        <div className="uz-field"><label>Хямдралын дүн (₮)</label>
          <input type="number" value={custDiscAmt} onChange={e => { setCustDiscAmt(e.target.value); markDirty(); }} placeholder="5000" /></div>
      </div>

      <h3 className="uz-settings-title">🏢 Албан байгууллагын сарын хураамж</h3>
      <p className="uz-settings-sub">Гэрээт үйлчилгээ авч буй байгууллагуудаас авах сарын суурь хураамж. Энэ дүн нь "Албан байгууллага" хэсэгт ил харагдана.</p>
      <div className="uz-settings-form" style={{ marginBottom: 28 }}>
        <div className="uz-field"><label>Сарын суурь хураамж (₮)</label>
          <input type="number" value={orgFee} onChange={e => { setOrgFee(e.target.value); markDirty(); }} placeholder="300000" /></div>
      </div>

      <h3 className="uz-settings-title">📍 Дүүрэг / Хотуудын ETA минут</h3>
      <p className="uz-settings-sub">Үйлчлүүлэгчид "Таны байршил" сонгох үед харагдах ойролцоогоор очих минутыг тохируулна. Бодит сантехникчдийн тоо, замын зайнаас хамаарч шинэчилнэ үү.</p>
      <div className="uz-settings-form" style={{ marginBottom: 28 }}>
        <div className="uz-district-grid">
          {districts.map((d, i) => (
            <div key={d.name} className="uz-district-item">
              <label>{d.name}</label>
              <div className="uz-district-input">
                <input type="number" value={d.eta} onChange={e => updateDistrictEta(i, e.target.value)} />
                <span>мин</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <h3 className="uz-settings-title">📞 Холбоо барих утас</h3>
      <p className="uz-settings-sub">Энэ дугаар сайтын хамгийн доод хэсэгт хэрэглэгчдэд харагдана.</p>
      <div className="uz-settings-form" style={{ marginBottom: 28 }}>
        <div className="uz-field"><label>Холбогдох утасны дугаар</label>
          <input value={contactPhone} onChange={e => { setContactPhone(e.target.value); markDirty(); }} placeholder="Жишээ: 7700-1234" /></div>
      </div>

      <h3 className="uz-settings-title">📘 Сошиал линкүүд (Facebook, Messenger, Viber)</h3>
      <p className="uz-settings-sub">Холбогдох цэсэнд тус тус харагдах болно. Хоосон үлдээвэл тэр товч харагдахгүй.</p>
      <div className="uz-settings-form" style={{ marginBottom: 28 }}>
        <div className="uz-field"><label>📘 Facebook хуудасны URL</label>
          <input value={fbLink} onChange={e => { setFbLink(e.target.value); markDirty(); }} placeholder="Жишээ: https://facebook.com/usanzasvar" /></div>
        <div className="uz-field"><label>💬 Messenger линк</label>
          <input value={messengerLink} onChange={e => { setMessengerLink(e.target.value); markDirty(); }} placeholder="Жишээ: https://m.me/usanzasvar" /></div>
        <div className="uz-field"><label>📱 Viber линк</label>
          <input value={viberLink} onChange={e => { setViberLink(e.target.value); markDirty(); }} placeholder="Жишээ: viber://chat?number=%2B97699112233" /></div>
      </div>
      <h3 className="uz-settings-title">🔗 Төлбөрийн холбоос (QPay, SocialPay г.м)</h3>
      <p className="uz-settings-sub">Үйлчлүүлэгчид "Шууд төлөх" товч гарах болно. QPay, SocialPay, банкны вэб эсвэл өөрийн төлбөрийн линкийг оруулна уу. Хоосон үлдээвэл товч харагдахгүй.</p>
      <div className="uz-settings-form" style={{ marginBottom: 28 }}>
        <div className="uz-field"><label>Төлбөрийн линк (URL)</label>
          <input value={paymentLink} onChange={e => { setPaymentLink(e.target.value); markDirty(); }} placeholder="Жишээ: https://qpay.mn/.... эсвэл https://i.socialpay.mn/..." /></div>
      </div>

      <h3 className="uz-settings-title">💳 Хүлээн авах банкны данс</h3>
      <p className="uz-settings-sub">Сантехникчид бүртгэл болон үлдэгдлийн хураамжаа энэ данс руу шилжүүлнэ.</p>
      <div className="uz-settings-form">
        <div className="uz-field"><label>Банкны нэр</label>
          <input value={bankName} onChange={e => { setBankName(e.target.value); markDirty(); }} placeholder="Жишээ: Хаан банк" /></div>
        <div className="uz-field"><label>Дансны дугаар</label>
          <input value={accountNumber} onChange={e => { setAccountNumber(e.target.value); markDirty(); }} placeholder="Жишээ: 5012345678" /></div>
        <div className="uz-field"><label>Данс эзэмшигчийн нэр</label>
          <input value={accountHolder} onChange={e => { setAccountHolder(e.target.value); markDirty(); }} placeholder="Жишээ: Б.Болд" /></div>
        {err && <div className="uz-error">{err}</div>}
        <button className="uz-confirm-btn" onClick={save}>Бүгдийг хадгалах</button>
      </div>

      <PasswordChange />
    </div>
  );
}

// ============ ADMIN PASSWORD CHANGE ============
function PasswordChange() {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(''); setMsg(null);
    if (!oldPw || !newPw || !confirmPw) return setErr('Бүх талбарыг бөглөнө үү');
    if (newPw.length < 8) return setErr('Шинэ нууц үг хамгийн багадаа 8 тэмдэгттэй байх ёстой');
    if (newPw !== confirmPw) return setErr('Шинэ нууц үг таарахгүй байна');
    if (newPw === oldPw) return setErr('Шинэ нууц үг хуучнаас өөр байх ёстой');
    setBusy(true);
    try {
      const ok = await checkAdminPassword(oldPw);
      if (!ok) { setErr('Хуучин нууц үг буруу байна'); return; }
      await setAdminPassword(newPw);
      setMsg('✅ Нууц үг амжилттай шинэчлэгдлээ! Дараагийн нэвтрэхэд шинэ нууц үгээр ор.');
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="uz-settings-form" style={{ marginTop: 30, background: '#fff8e1', border: '1px solid #f0d678', padding: 20 }}>
      <h3 className="uz-settings-title" style={{ marginBottom: 8 }}>🔐 Админ нууц үг солих</h3>
      <p className="uz-settings-sub" style={{ marginBottom: 14 }}>Аюулгүй байдлын үүднээс сар бүр шинэчлэхийг зөвлөж байна. Хамгийн багадаа 8 тэмдэгт, том ба жижиг үсэг, тоо ашиглавал илүү найдвартай.</p>
      <div className="uz-field"><label>Хуучин нууц үг</label>
        <PasswordField value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="••••••••" /></div>
      <div className="uz-field"><label>Шинэ нууц үг (8+ тэмдэгт)</label>
        <PasswordField value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="••••••••" /></div>
      <div className="uz-field"><label>Шинэ нууц үг (дахин)</label>
        <PasswordField value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="••••••••" /></div>
      {err && <div className="uz-error">{err}</div>}
      {msg && <div style={{ background: '#e6f7ef', color: '#0d8a56', padding: 12, borderRadius: 10, fontSize: 14, marginBottom: 10 }}>{msg}</div>}
      <button className="uz-confirm-btn" onClick={submit} disabled={busy}>{busy ? 'Шалгаж байна...' : '🔐 Нууц үг шинэчлэх'}</button>
    </div>
  );
}

// ============ SERVICE EDITOR (admin) ============
function ServiceEditor({ services, onSave }) {
  const [list, setList] = useState(() => JSON.parse(JSON.stringify(services)));
  const [dirty, setDirty] = useState(false);

  function update(i, field, value) {
    const next = list.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
    setList(next); setDirty(true);
  }
  function updateNum(i, field, value) {
    const v = value === '' ? null : Number(value);
    update(i, field, v);
  }
  function addService() {
    const id = 'svc' + Date.now().toString(36).slice(-5);
    setList([...list, { id, icon: '🔧', cat: 'Засвар', name: 'Шинэ үйлчилгээ', desc: '', priceMin: 10000, priceMax: 30000, duration: '30–60 мин' }]);
    setDirty(true);
  }
  function removeService(i) {
    setList(list.filter((_, idx) => idx !== i)); setDirty(true);
  }
  function save() { onSave(list); setDirty(false); }

  return (
    <div className="uz-svc-editor">
      <div className="uz-svc-head">
        <div>
          <h3 className="uz-settings-title">🛠 Үйлчилгээ, үнэ, хугацаа засах</h3>
          <p className="uz-settings-sub">Нэр, тайлбар, үнэ, хугацааг шууд засаад "Хадгалах" дарна. Хэрэглэгчийн нүүрэнд шууд тусна.</p>
        </div>
        <button className="uz-refresh-btn" onClick={addService}>+ Үйлчилгээ нэмэх</button>
      </div>

      <div className="uz-svc-list">
        {list.map((s, i) => (
          <div key={s.id} className="uz-svc-card">
            <div className="uz-svc-row1">
              <input className="uz-svc-icon-input" value={s.icon} onChange={e => update(i, 'icon', e.target.value)} maxLength={2} />
              <input className="uz-svc-name-input" value={s.name} onChange={e => update(i, 'name', e.target.value)} placeholder="Үйлчилгээний нэр" />
              <select className="uz-svc-cat" value={s.cat} onChange={e => update(i, 'cat', e.target.value)}>
                {SERVICE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <button className="uz-svc-del" onClick={() => removeService(i)} title="Устгах">🗑</button>
            </div>
            <textarea className="uz-svc-desc" rows={2} value={s.desc} onChange={e => update(i, 'desc', e.target.value)} placeholder="Тайлбар..." />
            <div className="uz-svc-row2">
              <label>Үнэ (₮)<input type="number" value={s.priceMin ?? ''} onChange={e => updateNum(i, 'priceMin', e.target.value)} /></label>
              <label>Хугацаа<input value={s.duration} onChange={e => update(i, 'duration', e.target.value)} placeholder="30–60 мин" /></label>
            </div>
          </div>
        ))}
      </div>

      <button className="uz-confirm-btn" style={{ maxWidth: 240, marginTop: 16 }} disabled={!dirty} onClick={save}>
        {dirty ? 'Өөрчлөлтийг хадгалах' : 'Хадгалагдсан ✓'}
      </button>
    </div>
  );
}

// ============ MATERIAL ADMIN (orders + catalog editor) ============
function MaterialAdmin({ materials, orders, onSave }) {
  const [sub, setSub] = useState('orders');
  const [list, setList] = useState(() => JSON.parse(JSON.stringify(materials)));
  const [dirty, setDirty] = useState(false);

  function update(i, field, value) { setList(list.map((m, idx) => idx === i ? { ...m, [field]: value } : m)); setDirty(true); }
  function updateNum(i, field, value) { update(i, field, value === '' ? 0 : Number(value)); }
  function addItem() {
    const id = 'mat' + Date.now().toString(36).slice(-5);
    setList([...list, { id, icon: '📦', cat: 'Бусад', name: 'Шинэ материал', price: 5000, unit: 'ш' }]); setDirty(true);
  }
  function removeItem(i) { setList(list.filter((_, idx) => idx !== i)); setDirty(true); }
  function save() { onSave(list); setDirty(false); }

  return (
    <div>
      <div className="uz-dash-tabs" style={{ marginBottom: 18 }}>
        <button className={`uz-dash-tab ${sub === 'orders' ? 'active' : ''}`} onClick={() => setSub('orders')}>Захиалга {orders.length > 0 && <span className="uz-badge">{orders.length}</span>}</button>
        <button className={`uz-dash-tab ${sub === 'catalog' ? 'active' : ''}`} onClick={() => setSub('catalog')}>Каталог засах</button>
      </div>

      {sub === 'orders' && (
        orders.length === 0 ? <div className="uz-empty-sm">Материалын захиалга алга.</div> : (
          <div className="uz-bookings">
            {orders.map(o => (
              <div key={o.id} className="uz-booking-card">
                <div className="uz-bc-left"><span className="uz-bc-icon">📦</span></div>
                <div className="uz-bc-body">
                  <div className="uz-bc-top"><h3 className="uz-bc-name">Захиалга</h3><span className="uz-bc-code">{o.code}</span></div>
                  <div className="uz-bc-info">👤 {o.customerName} · 📞 +976 {fmtPhone(o.phone)}</div>
                  <div className="uz-bc-info">📍 {o.district} · {o.address}</div>
                  <div className="uz-mat-order-items">
                    {o.items.map((it, k) => <div key={k}>{it.name} × {it.qty} — ₮{fmt(it.price * it.qty)}</div>)}
                  </div>
                  <div className="uz-bc-bottom">
                    <span className="uz-status uz-status--done">Нийт ₮{fmt(o.total)}</span>
                    <span className="uz-bc-time">{timeAgo(o.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {sub === 'catalog' && (
        <div className="uz-svc-editor">
          <div className="uz-svc-head">
            <div>
              <h3 className="uz-settings-title">📦 Материал, үнэ засах</h3>
              <p className="uz-settings-sub">Материалын нэр, ангилал, үнэ, нэгжийг засаад хадгална.</p>
            </div>
            <button className="uz-refresh-btn" onClick={addItem}>+ Материал нэмэх</button>
          </div>
          <div className="uz-svc-list">
            {list.map((m, i) => (
              <div key={m.id} className="uz-svc-card">
                <div className="uz-svc-row1">
                  <input className="uz-svc-icon-input" value={m.icon} onChange={e => update(i, 'icon', e.target.value)} maxLength={2} />
                  <input className="uz-svc-name-input" value={m.name} onChange={e => update(i, 'name', e.target.value)} placeholder="Материалын нэр" />
                  <select className="uz-svc-cat" value={m.cat} onChange={e => update(i, 'cat', e.target.value)}>
                    {MATERIAL_CATEGORIES.filter(c => c !== 'Бүгд').map(c => <option key={c}>{c}</option>)}
                  </select>
                  <button className="uz-svc-del" onClick={() => removeItem(i)} title="Устгах">🗑</button>
                </div>
                <div className="uz-svc-row2">
                  <label>Үнэ (₮)<input type="number" value={m.price} onChange={e => updateNum(i, 'price', e.target.value)} /></label>
                  <label>Нэгж<input value={m.unit} onChange={e => update(i, 'unit', e.target.value)} placeholder="ш / м" /></label>
                  <div />
                </div>
              </div>
            ))}
          </div>
          <button className="uz-confirm-btn" style={{ maxWidth: 240, marginTop: 16 }} disabled={!dirty} onClick={save}>
            {dirty ? 'Өөрчлөлтийг хадгалах' : 'Хадгалагдсан ✓'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============ CREDIT CONTROL (admin) ============
function CreditControl({ onCredit, currentBalance = 0 }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('add'); // 'add' | 'subtract'
  const [err, setErr] = useState('');
  function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setErr('Дүн оруулна уу'); return; }
    if (mode === 'subtract' && amt > currentBalance) {
      setErr(`Хасах боломжтой дүн: ₮${fmt(currentBalance)}`);
      return;
    }
    const finalAmt = mode === 'subtract' ? -amt : amt;
    onCredit(finalAmt);
    setAmount(''); setErr(''); setOpen(false); setMode('add');
  }
  if (!open) return <button className="uz-credit-toggle" onClick={() => setOpen(true)}>± Үлдэгдэл</button>;
  return (
    <div className="uz-credit-box-v2">
      <div className="uz-credit-mode-tabs">
        <button className={`uz-credit-mode-tab ${mode === 'add' ? 'active add' : ''}`} onClick={() => { setMode('add'); setErr(''); }}>+ Нэмэх</button>
        <button className={`uz-credit-mode-tab ${mode === 'subtract' ? 'active sub' : ''}`} onClick={() => { setMode('subtract'); setErr(''); }}>− Хасах</button>
      </div>
      <div className="uz-credit-row">
        <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setErr(''); }} placeholder="₮ дүн" autoFocus onKeyDown={e => e.key === 'Enter' && submit()} />
        <button className={mode === 'subtract' ? 'uz-credit-ok sub' : 'uz-credit-ok'} onClick={submit}>{mode === 'subtract' ? 'Хасах' : 'Нэмэх'}</button>
        <button className="uz-credit-cancel" onClick={() => { setOpen(false); setAmount(''); setMode('add'); setErr(''); }}>✕</button>
      </div>
      {err && <div className="uz-credit-err">{err}</div>}
    </div>
  );
}

// ============ DISPATCH CARD ============
function DispatchCard({ b, freeCount, onSetArrival, onSetExtraWait }) {
  const [arrival, setArrival] = useState(b.adminArrivalTime || '');
  const [extra, setExtra] = useState(b.extraWaitNote || '');
  const noFreeTech = freeCount === 0;
  return (
    <div className={`uz-dispatch-card ${noFreeTech ? 'no-free' : ''}`}>
      <div className="uz-dispatch-top">
        <div className="uz-bc-icon">{b.serviceIcon}</div>
        <div className="uz-dispatch-info">
          <div className="uz-bc-top"><h3 className="uz-bc-name">{b.serviceName}</h3><span className="uz-bc-code">{b.code}</span></div>
          <div className="uz-bc-info">👤 {b.customerName} · 📍 {b.district} · {b.address}</div>
          <div className="uz-bc-info">📞 +976 {fmtPhone(b.phone)} · {b.when === 'now' ? '⚡ Яаралтай' : '📅 Товлосон'}</div>
        </div>
        <div className={`uz-free-badge ${noFreeTech ? 'none' : 'ok'}`}>
          {noFreeTech ? '⚠ Чөлөөт сантехникч алга' : `✓ ${freeCount} чөлөөтэй`}
        </div>
      </div>

      <div className="uz-dispatch-controls">
        <div className="uz-dispatch-field">
          <label>🕐 Очих цаг тогтоох</label>
          <div className="uz-dispatch-row">
            <input value={arrival} onChange={e => setArrival(e.target.value)} placeholder="Жишээ: Өнөөдөр 15:30 эсвэл ~40 мин" />
            <button className="uz-dispatch-btn" disabled={!arrival.trim()} onClick={() => onSetArrival(b.id, arrival.trim())}>Мэдэгдэх</button>
          </div>
        </div>

        {noFreeTech && (
          <div className="uz-dispatch-field uz-fade">
            <label>ℹ Нэмэлт хүлээх хугацаа мэдэгдэх</label>
            <div className="uz-dispatch-row">
              <input value={extra} onChange={e => setExtra(e.target.value)} placeholder="Жишээ: Бүх сантехникч завгүй тул нэмэлт 30 мин хүлээнэ үү" />
              <button className="uz-dispatch-btn warn" disabled={!extra.trim()} onClick={() => onSetExtraWait(b.id, extra.trim())}>Илгээх</button>
            </div>
          </div>
        )}

        {b.adminArrivalTime && <div className="uz-dispatch-sent">✓ Очих цаг мэдэгдсэн: {b.adminArrivalTime}</div>}
        {b.extraWaitNote && <div className="uz-dispatch-sent warn">✓ Нэмэлт хугацаа мэдэгдсэн</div>}
      </div>
    </div>
  );
}

// ============ WARNING MODAL ============
function WarningModal({ tech, onClose, onSend, onOpenChat }) {
  const templates = {
    general: 'Эрхэм сантехникч, та манай үйлчилгээний дүрэм журмыг сахихыг хүсэж байна. Хэрэв тодорхой асуудал гарвал чатаар тайлбарлана уу.',
    late: 'Та сүүлийн дуудлагад 1 цагаас илүү хоцорсон байна. Үйлчлүүлэгч хүлээж залхав. Дахин ийм зүйл гарвал арга хэмжээ авна.',
    incomplete: 'Та ажлаа бүрэн дуусгаагүй гэсэн гомдол үйлчлүүлэгчээс ирсэн. Засварын ажил үргэлж бүрэн гүйцэт хийгдэх ёстой. Анхааралтай ажиллана уу.',
    block: 'Та дүрэм журам зөрчсөнтэй холбогдуулан тогтсон хугацаагаар блоклож байна. Энэ хугацаанд шинэ дуудлага хүлээж авах боломжгүй.',
  };
  const defaultDays = { general: 0, late: 0, incomplete: 0, block: 5 };
  const [type, setType] = useState('general');
  const [message, setMessage] = useState(templates.general);
  const [days, setDays] = useState(0);
  const [err, setErr] = useState('');
  function changeType(newType) {
    setType(newType);
    setMessage(templates[newType]);
    setDays(defaultDays[newType]);
  }
  function submit() {
    if (!message.trim() || message.trim().length < 5) return setErr('Сануулгын тайлбарыг дор хаяж 5 тэмдэгтээр бичнэ үү');
    setErr('');
    onSend(type, message.trim(), Number(days) || 0);
  }
  const warnings = tech.warnings || [];
  const isBlocked = tech.blockedUntil && tech.blockedUntil > Date.now();
  const blockDaysLeft = isBlocked ? Math.ceil((tech.blockedUntil - Date.now()) / (24 * 60 * 60 * 1000)) : 0;
  return (
    <div className="uz-modal-overlay" onClick={onClose}>
      <div className="uz-modal uz-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="uz-detail-head">
          <div>
            <h3 className="uz-modal-title">⚠ Анхааруулга & Сахилгын арга хэмжээ</h3>
            <p className="uz-modal-sub">👷 {tech.name} · +976 {fmtPhone(tech.phone)}</p>
          </div>
          <button className="uz-chat-close" onClick={onClose}>✕</button>
        </div>

        {isBlocked && (
          <div className="uz-warn-blocked">
            🚫 Энэ сантехникч <b>{blockDaysLeft} хоног блоклогдсон</b>. Энэ хугацаанд шинэ дуудлага хүлээж авах боломжгүй.
          </div>
        )}

        <div className="uz-warn-form">
          <h4 style={{ marginBottom: 10, fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: 15 }}>📤 Шинэ анхааруулга илгээх</h4>
          <div className="uz-field"><label>Төрөл</label>
            <div className="uz-feedback-types">
              <button className={`uz-feedback-type ${type === 'general' ? 'on' : ''}`} onClick={() => changeType('general')}>⚠ Анхааруулга</button>
              <button className={`uz-feedback-type ${type === 'late' ? 'on' : ''}`} onClick={() => changeType('late')}>⏰ Хоцорсон</button>
              <button className={`uz-feedback-type ${type === 'incomplete' ? 'on' : ''}`} onClick={() => changeType('incomplete')}>❌ Ажил дутуу</button>
              <button className={`uz-feedback-type ${type === 'block' ? 'on' : ''}`} onClick={() => changeType('block')}>🚫 Блок хийх</button>
            </div>
          </div>
          <div className="uz-field"><label>Тайлбар (тодорхой бичнэ үү) *</label>
            <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Яагаад анхааруулсан, юу хийх ёстой..." /></div>
          <div className="uz-field"><label>Блок хийх хоног (0 = блок хийхгүй)</label>
            <input type="number" min="0" max="365" value={days} onChange={e => setDays(e.target.value)} placeholder="0" />
            <small style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Жишээ: 5 → 5 хоног блок (тэр хугацаанд дуудлага авах боломжгүй)</small></div>
          {err && <div className="uz-error">{err}</div>}
          <button className="uz-confirm-btn" onClick={submit}>Илгээх</button>
        </div>

        <div style={{ marginTop: 22 }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: 15 }}>📋 Анхааруулгын түүх ({warnings.length})</h4>
          {warnings.length === 0 ? (
            <div className="uz-empty-sm" style={{ padding: 20 }}>Хараахан анхааруулга илгээгээгүй.</div>
          ) : (
            <div className="uz-warn-list">
              {warnings.map(w => <WarningItem key={w.id} w={w} onOpenChat={() => onOpenChat(w)} />)}
            </div>
          )}
        </div>

        <button className="uz-modal-cancel" onClick={onClose}>Хаах</button>
      </div>
    </div>
  );
}

function WarningItem({ w, onOpenChat }) {
  const labels = { general: '⚠ Анхааруулга', late: '⏰ Хоцорсон', incomplete: '❌ Ажил дутуу', block: '🚫 Блок' };
  const colors = { general: 'var(--gold)', late: 'var(--red)', incomplete: 'var(--red)', block: '#7a2222' };
  return (
    <div className="uz-warn-item">
      <div className="uz-warn-head">
        <span className="uz-feedback-type-pill" style={{ background: colors[w.type] || colors.general }}>{labels[w.type] || labels.general}</span>
        {w.days > 0 && <span className="uz-feedback-new" style={{ background: 'var(--red)' }}>{w.days} ХОНОГ БЛОК</span>}
        <span className="uz-feedback-time">{timeAgo(w.ts)}</span>
      </div>
      <div className="uz-feedback-msg">{w.message}</div>
      <button className="uz-detail-btn" onClick={onOpenChat}>💬 Чатлах ({(w.replies || []).length})</button>
    </div>
  );
}

// ============ WARNING CHAT MODAL ============
function WarningChatModal({ tech, warning, role, onClose, onSend }) {
  const [text, setText] = useState('');
  const bodyRef = useRef(null);
  const labels = { general: '⚠ Анхааруулга', late: '⏰ Хоцорсон', incomplete: '❌ Ажил дутуу', block: '🚫 Блок' };
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [warning?.replies?.length]);
  function send() {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  }
  const replies = warning?.replies || [];
  return (
    <div className="uz-modal-overlay" onClick={onClose} style={{ zIndex: 9001 }}>
      <div className="uz-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="uz-detail-head">
          <div>
            <h3 className="uz-modal-title">💬 {labels[warning?.type] || labels.general}</h3>
            <p className="uz-modal-sub">👷 {tech.name}</p>
          </div>
          <button className="uz-chat-close" onClick={onClose}>✕</button>
        </div>
        <div className="uz-warn-original">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>🛡 Админ:</div>
          {warning?.message}
        </div>
        <div className="uz-chat" style={{ marginTop: 14 }}>
          <div className="uz-chat-head">
            <span>💬 Хариулт ({replies.length})</span>
          </div>
          <div className="uz-chat-body" ref={bodyRef}>
            {replies.length === 0 ? (
              <div className="uz-chat-empty">Хариу бичсэн зүйл алга.</div>
            ) : replies.map(r => (
              <div key={r.id} className={`uz-chat-msg ${r.from === role ? 'mine' : ''}`}>
                <div className="uz-chat-from">{r.from === 'admin' ? '🛡 Админ' : '👷 Сантехникч'}</div>
                <div className="uz-chat-text">{r.text}</div>
                <div className="uz-chat-ts">{timeAgo(r.ts)}</div>
              </div>
            ))}
          </div>
          <div className="uz-chat-input">
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Хариу бичих..." onKeyDown={e => e.key === 'Enter' && send()} />
            <button className="uz-chat-send" onClick={send} disabled={!text.trim()}>Илгээх</button>
          </div>
        </div>
        <button className="uz-modal-cancel" onClick={onClose}>Хаах</button>
      </div>
    </div>
  );
}

// ============ BOOKING DETAIL MODAL ============
function BookingDetailModal({ b, onClose, onSendMessage }) {
  return (
    <div className="uz-modal-overlay" onClick={onClose}>
      <div className="uz-modal uz-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="uz-detail-head">
          <div>
            <h3 className="uz-modal-title">{b.serviceIcon} {b.serviceName}</h3>
            <p className="uz-modal-sub">{b.code} · {timeAgo(b.createdAt)}</p>
          </div>
          <button className="uz-chat-close" onClick={onClose}>✕</button>
        </div>

        <div className="uz-detail-grid">
          <div className="uz-detail-section">
            <h4>👤 Захиалагч</h4>
            <div className="uz-detail-row"><span>Нэр:</span><b>{b.customerName}</b></div>
            <div className="uz-detail-row"><span>Утас:</span><b>+976 {fmtPhone(b.phone)}</b></div>
            <div className="uz-detail-row"><span>Хаяг:</span><b>{b.address}</b></div>
            <div className="uz-detail-row"><span>Дүүрэг:</span><b>{b.district}</b></div>
          </div>

          <div className="uz-detail-section">
            <h4>👷 Сантехникч</h4>
            {b.techName ? (
              <>
                <div className="uz-detail-row"><span>Нэр:</span><b>{b.techName}</b></div>
                <div className="uz-detail-row"><span>Утас:</span><b>+976 {fmtPhone(b.techPhone)}</b></div>
                <div className="uz-detail-row"><span>Төлөв:</span><b>{b.payMethod === 'coin' ? '🪙 Coin' : '💳 Үлдэгдэл'}</b></div>
              </>
            ) : <div className="uz-detail-row"><span>—</span><b>Хараахан аваагүй</b></div>}
          </div>

          <div className="uz-detail-section">
            <h4>📋 Дуудлага</h4>
            <div className="uz-detail-row"><span>Үнэ:</span><b>₮{fmt(b.priceMin)}+</b></div>
            <div className="uz-detail-row"><span>ETA:</span><b>~{b.eta} мин</b></div>
            <div className="uz-detail-row"><span>Хэзээ:</span><b>{b.when === 'now' ? 'Яаралтай' : b.schedTime || '—'}</b></div>
            <div className="uz-detail-row"><span>Төлөв:</span><b>{b.status}</b></div>
            {b.adminArrivalTime && <div className="uz-detail-row"><span>Очих цаг:</span><b>{b.adminArrivalTime}</b></div>}
            {b.extraWaitNote && <div className="uz-detail-row"><span>Нэмэлт:</span><b>{b.extraWaitNote}</b></div>}
          </div>

          <div className="uz-detail-section">
            <h4>⭐ Үр дүн</h4>
            <div className="uz-detail-row"><span>Үнэлгээ:</span><b>{b.rating != null ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : '—'}</b></div>
            <div className="uz-detail-row"><span>Цагтаа:</span><b>{b.onTime === true ? '✓ Тийм' : b.onTime === false ? '✗ Үгүй' : '—'}</b></div>
            <div className="uz-detail-row"><span>Coin:</span><b>{b.coinAwarded ? '+1 🪙' : '—'}</b></div>
            {b.disputed && <div className="uz-detail-row"><span>Гомдол:</span><b style={{ color: 'var(--red)' }}>{b.disputeReason}</b></div>}
            {b.feeRefunded && <div className="uz-detail-row"><span>Буцаалт:</span><b style={{ color: 'var(--green)' }}>₮{fmt(b.calloutFee || CALLOUT_FEE)}</b></div>}
          </div>

          {b.note && (
            <div className="uz-detail-section" style={{ gridColumn: 'span 2' }}>
              <h4>💬 Захиалагчийн тэмдэглэл</h4>
              <p style={{ fontStyle: 'italic', color: 'var(--ink-soft)' }}>"{b.note}"</p>
            </div>
          )}
        </div>

        {onSendMessage && (
          <div style={{ marginTop: 18 }}>
            <ChatThread booking={b} myRole="admin" onSend={onSendMessage} />
          </div>
        )}

        <button className="uz-modal-cancel" onClick={onClose}>Хаах</button>
      </div>
    </div>
  );
}

// ============ FOOTER ============
function Footer({ settings }) {
  const phone = (settings && settings.contactPhone) || '7700-1234';
  const telHref = 'tel:' + phone.replace(/\D/g, '');
  const fbLink = settings && settings.fbLink;
  const messengerLink = settings && settings.messengerLink;
  const viberLink = settings && settings.viberLink;
  return (
    <footer className="uz-footer">
      <div className="uz-footer-inner">
        <div className="uz-logo"><span className="uz-logo-icon">💧</span><span className="uz-logo-text">Ус<span className="uz-logo-accent">Засвар</span></span></div>
        <div className="uz-footer-text">УсЗасвар — таны итгэлтэй сантехникч 💧</div>
        <div className="uz-footer-sub-text">24 цагийн дуудлагын үйлчилгээ · Улаанбаатар, Дархан, Эрдэнэт</div>
        <div className="uz-footer-contacts">
          <a href={telHref} className="uz-footer-phone">📞 {phone}</a>
          {fbLink && (
            <a href={fbLink} target="_blank" rel="noopener noreferrer" className="uz-footer-fb">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Facebook
            </a>
          )}
          {messengerLink && (
            <a href={messengerLink} target="_blank" rel="noopener noreferrer" className="uz-footer-msgr">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.652V24l4.088-2.242c1.092.301 2.246.464 3.443.464 6.627 0 12-4.974 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.26L19.752 8l-6.561 6.963z"/></svg>
              Messenger
            </a>
          )}
          {viberLink && (
            <a href={viberLink} target="_blank" rel="noopener noreferrer" className="uz-footer-viber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 0C9.473.028 5.333.344 3.018 2.467 1.297 4.187.693 6.7.624 9.81c-.062 3.103-.14 8.918 5.466 10.495v2.412s-.038.97.602 1.17c.79.244 1.243-.51 1.99-1.323l1.404-1.58c3.83.323 6.778-.418 7.111-.527.775-.252 5.16-.81 5.876-6.638.738-6.014-.36-9.808-2.34-11.534h-.005c-.6-.55-3-2.295-8.34-2.315 0 0-.388-.025-1.215-.025zm.044.687c.703 0 1.116.024 1.116.024 4.527.017 6.673 1.382 7.187 1.85 1.673 1.434 2.524 4.86 1.9 9.882-.602 4.864-4.16 5.172-4.816 5.384-.275.087-2.864.733-6.108.524 0 0-2.42 2.918-3.176 3.677-.118.119-.258.169-.35.149-.13-.033-.166-.187-.165-.412l.018-4.027C2.296 16.43 2.36 11.48 2.412 8.886c.064-2.611.55-4.74 1.992-6.16C6.41 .953 9.92.715 11.41.687zM11.45 4.5c-.293 0-.293.44 0 .44 2.264.014 4.13.787 5.617 2.272 1.488 1.484 2.243 3.519 2.272 6.107 0 .293.44.293.44 0v-.024C19.78 10.62 18.99 8.486 17.408 6.92c-1.582-1.572-3.564-2.405-5.94-2.422zm-3.696.61c-.207.013-.396.107-.575.275l-.022-.001s-.557.504-.83.84c-.255.31-.493.752-.493.752a3.71 3.71 0 0 0-.317.94c-.197.984-.024 2.064.387 3.13a17.07 17.07 0 0 0 1.13 2.435c.45.84.94 1.585 1.413 2.235.464.65 1.232 1.456 2.04 2.21.81.755 1.86 1.43 2.78 1.984.475.286.94.49 1.323.624.184.066.317.094.448.078.262-.025.66-.124.964-.295.16-.084.36-.225.5-.36.142-.137.265-.265.36-.385.097-.122.176-.275.176-.413 0-.13-.057-.247-.137-.317-.176-.155-.367-.342-.612-.6a14.45 14.45 0 0 0-1.4-1.21c-.298-.21-.617-.293-.798-.225-.224.084-.395.246-.55.42-.155.176-.305.36-.45.557-.143.196-.27.4-.4.617-.13.218-.272.456-.42.61-.146.157-.292.157-.585.063-.59-.188-1.245-.55-1.92-1.04-.675-.49-1.302-1.066-1.835-1.708-.534-.642-.95-1.295-1.236-1.97-.288-.673-.36-1.246-.252-1.55.06-.157.157-.298.286-.43.13-.13.27-.255.408-.36.137-.107.28-.21.4-.32.122-.108.214-.246.214-.422 0-.21-.084-.392-.234-.564-.144-.165-.36-.51-.59-.93a14.69 14.69 0 0 0-.857-1.45 6.4 6.4 0 0 0-.4-.55c-.073-.075-.197-.117-.317-.113zm3.762.687c-.297.014-.297.46 0 .446a3.91 3.91 0 0 1 3.873 3.873c0 .295.444.297.444 0a4.357 4.357 0 0 0-4.317-4.32zm.06 1.387c-.292.014-.292.443 0 .443 1.06.024 1.94.903 1.957 1.953 0 .29.443.29.443-.001-.024-1.288-1.108-2.37-2.398-2.395z"/></svg>
              Viber
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}

// ============ STYLES ============
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
.uz * { margin:0; padding:0; box-sizing:border-box; }
.uz { --bg:#f4f8fd; --ink:#0d1b2e; --ink-soft:#5a6a82; --blue:#0a6cff; --blue-dark:#0852c4; --blue-soft:#e4eefe; --blue-deep:#06173a; --green:#11a86a; --gold:#d99a00; --gold-soft:#fdf3d6; --red:#e2483f; --red-soft:#fde8e6; --card:#fff; --line:#e1e9f4;
  font-family:'Manrope',sans-serif; color:var(--ink); background:var(--bg); min-height:100vh; -webkit-font-smoothing:antialiased; }
.uz input,.uz textarea,.uz select,.uz button { font-family:inherit; }
.uz-fade { animation:uzFade .4s ease both; }
@keyframes uzFade { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:none;} }
@keyframes uzPulse { 0%{box-shadow:0 0 0 0 rgba(17,168,106,.6);} 70%{box-shadow:0 0 0 8px rgba(17,168,106,0);} 100%{box-shadow:0 0 0 0 rgba(17,168,106,0);} }

/* HEADER */
.uz-header { position:sticky; top:0; z-index:50; background:linear-gradient(135deg,var(--blue-deep) 0%,#0a2a66 60%,var(--blue-dark) 100%); border-bottom:1px solid var(--line); }
.uz-header-inner { max-width:1140px; margin:0 auto; padding:24px; display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.uz-logo { display:flex; align-items:center; gap:14px; background:none; border:none; cursor:pointer; }
.uz-logo-icon { font-size:52px; line-height:1; }
.uz-logo-text { font-family:'Manrope',sans-serif; font-weight:800; font-size:clamp(28px,4vw,46px); color:#fff; letter-spacing:-.02em; line-height:1; }
.uz-logo-accent { color:#5fa8ff; }
@media (max-width:560px){ .uz-logo-icon { font-size:38px; } .uz-logo-text { font-size:34px; } .uz-header-inner { padding:18px; } }
.uz-mode-switch { display:flex; background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:3px; gap:2px; }
.uz-mode-btn { background:none; border:none; cursor:pointer; padding:7px 13px; border-radius:8px; font-size:13px; font-weight:700; color:var(--ink-soft); transition:all .2s; }
.uz-mode-btn.active { background:var(--card); color:var(--blue); box-shadow:0 2px 6px -2px rgba(0,0,0,.15); }
.uz-nav { display:flex; align-items:center; gap:6px; margin-left:auto; }
.uz-nav-link { background:none; border:none; cursor:pointer; padding:9px 14px; border-radius:9px; font-size:14px; font-weight:600; color:var(--ink-soft); transition:all .2s; display:flex; align-items:center; gap:6px; }
.uz-nav-link:hover { background:var(--blue-soft); color:var(--blue); }
.uz-nav-link.active { color:var(--blue); background:var(--blue-soft); }
.uz-logout-btn { background:none; border:1px solid var(--line); width:34px; height:34px; border-radius:9px; cursor:pointer; color:var(--ink-soft); font-size:15px; }
.uz-logout-btn:hover { border-color:var(--red); color:var(--red); }
.uz-badge { background:var(--blue); color:#fff; font-size:11px; font-weight:700; min-width:18px; height:18px; border-radius:9px; display:inline-flex; align-items:center; justify-content:center; padding:0 5px; }
@media (max-width:760px){ .uz-mode-switch{order:3;width:100%;margin-top:6px;justify-content:center;} .uz-header-inner{flex-wrap:wrap;} .uz-nav{margin-left:0;} .uz-nav-link{padding:8px 10px;font-size:13px;} }

/* AUTH PAGE */
.uz-auth-page { display:flex; align-items:center; justify-content:center; padding:48px 20px; min-height:calc(100vh - 130px); }
.uz-auth-card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:32px; max-width:400px; width:100%; box-shadow:0 24px 60px -30px rgba(10,60,130,.35); }
.uz-auth-logo { display:flex; align-items:center; gap:8px; justify-content:center; }
.uz-auth-tagline { text-align:center; font-size:13px; color:var(--ink-soft); margin:6px 0 24px; }
.uz-auth-tabs { display:flex; background:var(--bg); border-radius:11px; padding:4px; gap:3px; margin-bottom:22px; }
.uz-auth-tab { flex:1; background:none; border:none; cursor:pointer; padding:10px; border-radius:8px; font-size:14px; font-weight:700; color:var(--ink-soft); transition:all .2s; }
.uz-auth-tab.active { background:var(--card); color:var(--blue); box-shadow:0 2px 6px -2px rgba(0,0,0,.15); }

/* SECTIONS / HERO / SERVICES (shared) */
.uz-hero { position:relative; background:linear-gradient(165deg,var(--blue-deep) 0%,#0a2a66 60%,#0a3a8a 100%); color:#fff; overflow:hidden; }
.uz-hero-inner { max-width:1140px; margin:0 auto; padding:60px 24px 68px; position:relative; z-index:2; }
.uz-hero-deco { position:absolute; inset:0; background:radial-gradient(circle at 85% 15%,rgba(10,108,255,.5) 0%,transparent 45%),radial-gradient(circle at 10% 90%,rgba(17,168,106,.25) 0%,transparent 40%); z-index:1; }
.uz-live-badge { display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.2); padding:7px 14px; border-radius:20px; font-size:13px; font-weight:600; margin-bottom:22px; }
.uz-live-dot { width:8px; height:8px; border-radius:50%; background:var(--green); animation:uzPulse 2s infinite; }
.uz-hero-title { font-family:'Manrope',sans-serif; font-weight:800; font-size:clamp(32px,5.5vw,52px); line-height:1.05; letter-spacing:-.025em; margin-bottom:18px; }
.uz-hl { color:#5fa8ff; }
.uz-hero-sub { font-size:17px; line-height:1.55; color:rgba(255,255,255,.78); max-width:520px; margin-bottom:32px; }
.uz-eta-picker { background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.15); border-radius:18px; padding:20px; display:flex; gap:20px; align-items:center; flex-wrap:wrap; max-width:620px; backdrop-filter:blur(8px); }
.uz-eta-field { flex:1; min-width:200px; }
.uz-eta-field label { display:block; font-size:12px; color:rgba(255,255,255,.6); margin-bottom:7px; font-weight:600; }
.uz-eta-field select { width:100%; background:rgba(255,255,255,.95); border:none; border-radius:10px; padding:12px 14px; font-size:15px; font-weight:600; color:var(--ink); outline:none; cursor:pointer; }
.uz-eta-result { display:flex; align-items:center; gap:18px; }
.uz-eta-block { text-align:center; }
.uz-eta-num { font-family:'Manrope',sans-serif; font-weight:800; font-size:32px; line-height:1; }
.uz-eta-num span { font-size:14px; font-weight:600; margin-left:2px; opacity:.7; }
.uz-eta-num--green { color:#4ade80; }
.uz-eta-label { font-size:11px; color:rgba(255,255,255,.6); margin-top:5px; }
.uz-eta-divider { width:1px; height:40px; background:rgba(255,255,255,.18); }
.uz-trust-row { display:flex; gap:22px; flex-wrap:wrap; margin-top:24px; font-size:14px; color:rgba(255,255,255,.82); font-weight:500; }
.uz-services { max-width:1140px; margin:0 auto; padding:60px 24px 40px; }
.uz-section-head { margin-bottom:26px; }
.uz-section-title { font-family:'Manrope',sans-serif; font-weight:700; font-size:clamp(20px,3vw,30px); letter-spacing:-.02em; }
.uz-section-sub { font-size:15px; color:var(--ink-soft); margin-top:6px; }
.uz-cat-tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:26px; }
.uz-cat-tab { background:var(--card); border:1px solid var(--line); border-radius:22px; padding:8px 17px; font-size:14px; font-weight:600; color:var(--ink-soft); cursor:pointer; transition:all .2s; }
.uz-cat-tab:hover { border-color:var(--blue); color:var(--blue); }
.uz-cat-tab.active { background:var(--blue); color:#fff; border-color:var(--blue); }
.uz-service-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:18px; }
.uz-service-card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:24px; display:flex; flex-direction:column; transition:all .25s cubic-bezier(.2,.8,.2,1); animation:uzFade .5s ease both; }
.uz-service-card:hover { transform:translateY(-4px); border-color:var(--blue); box-shadow:0 20px 44px -22px rgba(10,108,255,.5); }
.uz-service-icon { width:56px; height:56px; border-radius:15px; background:var(--blue-soft); display:flex; align-items:center; justify-content:center; font-size:28px; margin-bottom:18px; }
.uz-service-body { flex:1; }
.uz-service-name { font-family:'Manrope',sans-serif; font-weight:700; font-size:19px; margin-bottom:8px; letter-spacing:-.01em; }
.uz-service-desc { font-size:14px; line-height:1.55; color:var(--ink-soft); margin-bottom:16px; }
.uz-service-meta { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
.uz-meta-pill { font-size:12px; font-weight:600; color:var(--ink-soft); background:var(--bg); border:1px solid var(--line); padding:5px 11px; border-radius:8px; }
.uz-meta-pill--cat { color:var(--blue); background:var(--blue-soft); border-color:transparent; }
.uz-service-foot { display:flex; align-items:center; justify-content:space-between; padding-top:18px; border-top:1px solid var(--line); gap:12px; }
.uz-price { display:flex; flex-direction:column; }
.uz-price-from { font-size:11px; color:var(--ink-soft); font-weight:600; }
.uz-price-val { font-family:'Manrope',sans-serif; font-weight:700; font-size:18px; color:var(--ink); }
.uz-book-btn { background:var(--blue); color:#fff; border:none; border-radius:10px; padding:11px 18px; font-weight:700; font-size:14px; cursor:pointer; transition:all .2s; white-space:nowrap; }
.uz-book-btn:hover { background:var(--blue-dark); transform:translateX(2px); }

/* PAGE / FIELDS */
.uz-page { max-width:1000px; margin:0 auto; padding:clamp(20px,3vw,32px) clamp(14px,3vw,24px) 60px; }
.uz-back { background:var(--blue-soft); border:2px solid var(--blue); color:var(--blue); font-size:16px; font-weight:800; cursor:pointer; padding:12px 22px; margin-bottom:20px; border-radius:12px; display:inline-flex; align-items:center; gap:8px; transition:all .2s; }
.uz-back:hover { background:var(--blue); color:#fff; transform:translateX(-3px); }
.uz-back:hover { color:var(--blue); }
.uz-field { margin-bottom:18px; }
.uz-field label { display:block; font-size:13px; font-weight:600; color:var(--ink-soft); margin-bottom:7px; }
.uz-field input,.uz-field textarea,.uz-field select { width:100%; background:var(--card); border:1px solid var(--line); border-radius:11px; padding:13px 15px; font-size:15px; color:var(--ink); outline:none; transition:all .2s; }
.uz-field textarea { resize:vertical; line-height:1.5; }
.uz-field input:focus,.uz-field textarea:focus,.uz-field select:focus { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-soft); }
.uz-phone-input { display:flex; border:1px solid var(--line); border-radius:11px; overflow:hidden; background:var(--card); transition:all .2s; }
.uz-phone-input:focus-within { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-soft); }
.uz-phone-prefix { display:flex; align-items:center; padding:0 14px; background:var(--bg); font-weight:700; font-size:14px; color:var(--ink-soft); border-right:1px solid var(--line); }
.uz-phone-input input { flex:1; border:none; outline:none; padding:13px 15px; font-size:15px; background:transparent; }
.uz-pass-wrap { position:relative; }
.uz-pass-wrap input { width:100%; background:var(--card); border:1px solid var(--line); border-radius:11px; padding:13px 44px 13px 15px; font-size:15px; color:var(--ink); outline:none; transition:all .2s; }
.uz-pass-wrap input:focus { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-soft); }
.uz-pass-eye { position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; font-size:16px; padding:6px; line-height:1; opacity:.7; }
.uz-pass-eye:hover { opacity:1; }
.uz-when-tabs { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.uz-when-tab { background:var(--card); border:1.5px solid var(--line); border-radius:11px; padding:14px; font-size:14px; font-weight:600; color:var(--ink-soft); cursor:pointer; transition:all .2s; }
.uz-when-tab:hover { border-color:var(--blue); }
.uz-when-tab.active { border-color:var(--blue); background:var(--blue-soft); color:var(--blue); }
.uz-error { background:var(--red-soft); color:var(--red); padding:12px 16px; border-radius:10px; font-size:14px; margin-bottom:16px; }

/* BOOKING LAYOUT */
.uz-booking { display:grid; grid-template-columns:1fr 340px; gap:28px; align-items:start; }
@media (max-width:800px){ .uz-booking{grid-template-columns:1fr;} }
.uz-summary { position:sticky; top:90px; }
.uz-summary-card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:24px; }
.uz-summary-service { display:flex; align-items:center; gap:12px; font-family:'Manrope',sans-serif; font-weight:700; font-size:17px; padding-bottom:18px; border-bottom:1px solid var(--line); margin-bottom:18px; }
.uz-summary-icon { font-size:26px; }
.uz-summary-rows { display:flex; flex-direction:column; gap:12px; margin-bottom:18px; }
.uz-summary-row { display:flex; justify-content:space-between; font-size:14px; color:var(--ink-soft); }
.uz-summary-row span:last-child { font-weight:600; color:var(--ink); }
.uz-summary-eta { color:var(--green)!important; }
.uz-summary-total { display:flex; justify-content:space-between; align-items:center; padding-top:18px; border-top:1px solid var(--line); margin-bottom:20px; }
.uz-summary-total>span:first-child { font-weight:600; font-size:14px; }
.uz-total-val { font-family:'Manrope',sans-serif; font-weight:800; font-size:19px; color:var(--blue); }
.uz-confirm-btn { width:100%; background:var(--blue); color:#fff; border:none; border-radius:12px; padding:15px; font-size:15px; font-weight:700; cursor:pointer; transition:all .2s; }
.uz-confirm-btn:hover { background:var(--blue-dark); transform:translateY(-1px); }
.uz-confirm-btn:disabled { background:var(--line); color:var(--ink-soft); cursor:not-allowed; transform:none; }
.uz-summary-note { font-size:12px; color:var(--ink-soft); text-align:center; margin-top:12px; line-height:1.4; }

/* EMPTY */
.uz-empty { text-align:center; padding:70px 20px; }
.uz-empty-icon { font-size:48px; margin-bottom:14px; }
.uz-empty-title { font-family:'Manrope',sans-serif; font-size:22px; font-weight:700; }
.uz-empty-sm { text-align:center; padding:40px 20px; color:var(--ink-soft); font-size:14px; background:var(--card); border:1px dashed var(--line); border-radius:14px; }
.uz-lookup-row { display:flex; gap:10px; }

/* BOOKING CARDS */
.uz-bookings { display:flex; flex-direction:column; gap:14px; }
.uz-booking-card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; display:flex; gap:16px; align-items:flex-start; }
.uz-card-disputed { border-color:var(--red); background:var(--red-soft); }
.uz-bc-left { flex-shrink:0; }
.uz-bc-icon { display:flex; width:50px; height:50px; border-radius:13px; background:var(--blue-soft); align-items:center; justify-content:center; font-size:26px; }
.uz-bc-body { flex:1; min-width:0; overflow:hidden; word-wrap:break-word; }
.uz-bc-top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
.uz-bc-name { font-family:'Manrope',sans-serif; font-weight:700; font-size:17px; word-wrap:break-word; min-width:0; }
.uz-bc-code { font-size:12px; font-weight:700; color:var(--blue); background:var(--blue-soft); padding:3px 9px; border-radius:7px; white-space:nowrap; }
.uz-bc-info { font-size:13px; color:var(--ink-soft); margin-top:3px; word-wrap:break-word; }
.uz-bc-note { font-size:13px; color:var(--ink-soft); font-style:italic; margin-top:8px; word-wrap:break-word; }
.uz-bc-bottom { display:flex; align-items:center; gap:12px; margin-top:12px; flex-wrap:wrap; }
.uz-status { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:var(--ink-soft); background:var(--bg); border:1px solid var(--line); padding:5px 11px; border-radius:8px; }
.uz-status--active { color:var(--green); background:#e6f7ef; border-color:#b9e8d2; }
.uz-status--done { color:var(--blue); background:var(--blue-soft); border-color:transparent; }
.uz-status--dispute { color:var(--red); background:#fff; border-color:var(--red); }
.uz-status-dot { width:7px; height:7px; border-radius:50%; background:var(--green); animation:uzPulse 2s infinite; }
.uz-bc-time { font-size:12px; color:var(--ink-soft); }
.uz-bc-rating { font-size:13px; color:var(--gold); font-weight:700; }
.uz-bc-eta { flex-shrink:0; text-align:center; background:var(--blue-deep); color:#fff; border-radius:13px; padding:12px 16px; min-width:72px; }
.uz-bc-eta-num { font-family:'Manrope',sans-serif; font-weight:800; font-size:26px; line-height:1; }
.uz-bc-eta-label { font-size:11px; opacity:.7; margin-top:3px; }
.uz-bc-arrived { font-size:13px; font-weight:700; color:#4ade80; line-height:1.3; }
.uz-bc-action { flex-shrink:0; display:flex; flex-direction:column; gap:8px; align-items:stretch; min-width:130px; }

/* MOBILE: Stack card vertically */
@media (max-width:640px){
  .uz-booking-card { flex-direction:column; padding:14px; gap:12px; }
  .uz-bc-left { display:flex; align-items:center; gap:10px; }
  .uz-bc-action { width:100%; min-width:0; flex-direction:row; flex-wrap:wrap; }
  .uz-bc-action button, .uz-bc-action a { flex:1; min-width:120px; }
  .uz-bc-name { font-size:15px; }
  .uz-bc-info { font-size:12px; line-height:1.5; }
  .uz-bc-eta { width:100%; padding:8px; }
}
.uz-accept-btn { background:var(--blue); color:#fff; border:none; border-radius:10px; padding:11px 16px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-accept-btn:hover { background:var(--blue-dark); }
.uz-call-btn { display:flex; align-items:center; justify-content:center; gap:6px; background:linear-gradient(135deg, #16a085, #11876f); color:#fff; text-decoration:none; border:none; border-radius:10px; padding:12px 18px; font-weight:700; font-size:14px; cursor:pointer; white-space:nowrap; transition:transform .15s; }
.uz-call-btn:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(22,160,133,.3); }
.uz-complete-group { display:flex; flex-direction:column; gap:6px; }
.uz-complete-q { font-size:11px; color:var(--ink-soft); text-align:center; }
.uz-ontime-btn { background:var(--green); color:#fff; border:none; border-radius:9px; padding:9px 14px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-late-btn { background:var(--bg); color:var(--ink-soft); border:1px solid var(--line); border-radius:9px; padding:8px 14px; font-weight:600; font-size:12px; cursor:pointer; }

/* RATING + DISPUTE */
.uz-rate-box { margin-top:12px; padding-top:12px; border-top:1px solid var(--line); display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.uz-rate-box-v2 { margin-top:14px; padding:16px; border:1px solid var(--blue-soft); background:#f8fbff; border-radius:12px; display:flex; flex-direction:column; gap:14px; }
.uz-rate-question { display:flex; flex-direction:column; gap:8px; }
.uz-rate-q-title { font-size:13px; font-weight:700; color:var(--ink); }
.uz-ontime-choice { display:flex; gap:8px; flex-wrap:wrap; }
.uz-choice-btn { flex:1; background:var(--card); border:2px solid var(--line); border-radius:10px; padding:11px 14px; font-size:14px; font-weight:600; cursor:pointer; transition:all .2s; color:var(--ink-soft); min-width:130px; }
.uz-choice-btn:hover { border-color:var(--blue); }
.uz-choice-btn.on.green { border-color:var(--green); background:#e6f7ef; color:var(--green); }
.uz-choice-btn.on.red { border-color:var(--red); background:var(--red-soft); color:var(--red); }
.uz-rate-label { font-size:13px; color:var(--ink-soft); font-weight:600; }
.uz-stars { display:flex; gap:2px; }
.uz-star { background:none; border:none; font-size:24px; color:var(--line); cursor:pointer; transition:all .15s; line-height:1; }
.uz-star.on { color:var(--gold); }
.uz-star:hover { transform:scale(1.15); }
.uz-rate-submit { background:var(--blue); color:#fff; border:none; border-radius:8px; padding:8px 16px; font-weight:700; font-size:13px; cursor:pointer; }
.uz-rate-submit:disabled { background:var(--line); color:var(--ink-soft); cursor:not-allowed; }
.uz-rated { margin-top:12px; padding-top:12px; border-top:1px solid var(--line); font-size:14px; color:var(--gold); font-weight:700; letter-spacing:2px; }
.uz-dispute-link { background:none; border:none; color:var(--red); font-size:12px; font-weight:600; cursor:pointer; margin-top:10px; padding:0; }
.uz-dispute-link:hover { text-decoration:underline; }
.uz-dispute-box { margin-top:12px; padding-top:12px; border-top:1px solid var(--line); display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.uz-dispute-opt { background:var(--red-soft); color:var(--red); border:1px solid #f3c9c5; border-radius:9px; padding:8px 13px; font-size:13px; font-weight:600; cursor:pointer; }
.uz-dispute-opt:hover { background:var(--red); color:#fff; }
.uz-dispute-cancel { background:none; border:none; color:var(--ink-soft); font-size:13px; cursor:pointer; }
.uz-refund-note { margin-top:10px; font-size:13px; font-weight:600; color:var(--green); }
.uz-dispute-reason { margin-top:8px; font-size:13px; color:var(--red); font-weight:600; }

/* TECH ENTRY */
.uz-tech-hero { max-width:680px; }
.uz-tech-perks { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:24px; }
.uz-perk { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; display:flex; gap:12px; align-items:flex-start; }
.uz-perk-icon { font-size:24px; }
.uz-perk b { display:block; font-size:14px; margin-bottom:3px; }
.uz-perk span { font-size:12px; color:var(--ink-soft); line-height:1.4; }
.uz-tech-fees { display:flex; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
.uz-fee-item { flex:1; min-width:160px; background:var(--gold-soft); border:1px solid #f0e0b0; border-radius:14px; padding:16px 18px; }
.uz-fee-item span { font-size:13px; color:var(--ink-soft); display:block; }
.uz-fee-item b { font-family:'Manrope',sans-serif; font-size:24px; color:var(--gold); display:block; margin:2px 0; }
.uz-fee-item small { font-size:11px; color:var(--ink-soft); }
.uz-warn-note { background:var(--red-soft); border:1px solid #f3c9c5; border-radius:12px; padding:13px 16px; font-size:13px; color:var(--red); margin-bottom:20px; line-height:1.5; }
.uz-pay-warn { background:var(--blue-soft); border:1px solid #bcd6ff; border-radius:12px; padding:13px 16px; font-size:13px; color:var(--blue-dark); margin-bottom:16px; line-height:1.55; }
.uz-tech-login { margin-top:30px; padding-top:24px; border-top:1px solid var(--line); }
.uz-tech-login p { font-size:14px; color:var(--ink-soft); margin-bottom:14px; }
.uz-tech-login .uz-lookup-row { max-width:460px; }
.uz-tech-login .uz-phone-input { flex:1; }

/* BLOCKED */
.uz-blocked { text-align:center; padding:70px 20px; max-width:480px; margin:0 auto; }.uz-blocked-icon { font-size:56px; margin-bottom:16px; }
.uz-blocked-title { font-family:'Manrope',sans-serif; font-size:24px; font-weight:700; color:var(--red); margin-bottom:12px; }
.uz-blocked-text { font-size:14px; color:var(--ink-soft); line-height:1.6; margin-bottom:24px; }
.uz-pending { text-align:center; padding:56px 20px; max-width:520px; margin:0 auto; }
.uz-pending-icon { font-size:56px; margin-bottom:16px; }
.uz-pending-title { font-family:'Manrope',sans-serif; font-size:24px; font-weight:700; color:var(--gold); margin-bottom:12px; }
.uz-pending-text { font-size:14px; color:var(--ink-soft); line-height:1.6; margin-bottom:22px; }
.uz-pending-text b { color:var(--ink); }
.uz-pending-actions { display:flex; flex-direction:column; align-items:center; gap:10px; }
.uz-btn-ghost-sm { background:none; border:none; color:var(--ink-soft); font-size:13px; font-weight:600; cursor:pointer; }
.uz-btn-ghost-sm:hover { color:var(--ink); }

/* TECH REGISTER */
.uz-reg-form { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:28px; }
.uz-spec-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
@media (max-width:560px){ .uz-spec-grid{grid-template-columns:1fr;} }
.uz-spec-chip { display:flex; align-items:center; gap:7px; background:var(--bg); border:1.5px solid var(--line); border-radius:10px; padding:11px 13px; font-size:13px; font-weight:600; color:var(--ink-soft); cursor:pointer; transition:all .2s; text-align:left; }
.uz-spec-chip.on { border-color:var(--blue); background:var(--blue-soft); color:var(--blue); }
.uz-criteria { margin:6px 0 18px; display:flex; flex-direction:column; gap:12px; }
.uz-check { display:flex; gap:10px; align-items:flex-start; cursor:pointer; font-size:13px; line-height:1.5; color:var(--ink-soft); }
.uz-check input { margin-top:2px; width:18px; height:18px; accent-color:var(--blue); flex-shrink:0; cursor:pointer; }

/* DASHBOARD (tech + admin) */
.uz-dash-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:24px; }
.uz-refresh-btn { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 16px; font-weight:600; font-size:13px; color:var(--ink-soft); cursor:pointer; white-space:nowrap; }
.uz-refresh-btn:hover { border-color:var(--blue); color:var(--blue); }
.uz-stats { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:18px; }
.uz-stats--admin { grid-template-columns:repeat(6,1fr); }
@media (max-width:760px){ .uz-stats,.uz-stats--admin{grid-template-columns:repeat(3,1fr);} }
@media (max-width:460px){ .uz-stats,.uz-stats--admin{grid-template-columns:repeat(2,1fr);} }
.uz-stat { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; text-align:center; }
.uz-stat--coin { background:var(--gold-soft); border-color:#f0e0b0; }
.uz-stat-icon { font-size:20px; margin-bottom:6px; }
.uz-stat-num { font-family:'Manrope',sans-serif; font-weight:800; font-size:24px; line-height:1; }
.uz-stat--coin .uz-stat-num { color:var(--gold); }
.uz-stat-pct { font-size:14px; }
.uz-stat-label { font-size:11px; color:var(--ink-soft); margin-top:5px; font-weight:600; }
.uz-stat-extra { font-size:10px; color:var(--green); font-weight:700; margin-top:4px; }
.uz-topup { margin-top:8px; background:var(--blue); color:#fff; border:none; border-radius:7px; padding:5px 10px; font-size:11px; font-weight:700; cursor:pointer; }
.uz-coin-bar { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px 20px; margin-bottom:22px; display:flex; justify-content:space-between; align-items:center; gap:20px; flex-wrap:wrap; }
.uz-coin-bar-text { font-size:13px; color:var(--ink-soft); line-height:1.5; max-width:520px; }
.uz-coin-bar-text b { color:var(--ink); }
.uz-coin-progress { display:flex; align-items:center; gap:6px; }
.uz-coin-pip { font-size:22px; filter:grayscale(1); opacity:.35; transition:all .3s; }
.uz-coin-pip.on { filter:none; opacity:1; transform:scale(1.1); }
.uz-coin-next { font-size:11px; color:var(--ink-soft); margin-left:6px; }
.uz-dash-tabs { display:flex; gap:8px; margin-bottom:20px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.uz-dash-tab { background:none; border:none; border-bottom:2px solid transparent; cursor:pointer; padding:11px 14px; font-size:14px; font-weight:700; color:var(--ink-soft); transition:all .2s; display:flex; align-items:center; gap:7px; margin-bottom:-1px; }
.uz-dash-tab:hover { color:var(--blue); }
.uz-dash-tab.active { color:var(--blue); border-bottom-color:var(--blue); }

/* ADMIN TABLE */
.uz-admin-table { display:flex; flex-direction:column; gap:10px; }
.uz-tech-row { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px 18px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.uz-tech-row.flagged { border-color:#f0c14b; background:#fffdf5; }
.uz-tech-row.blocked { border-color:var(--red); background:var(--red-soft); opacity:.85; }
.uz-tr-main { flex:1; min-width:160px; }
.uz-tr-name { font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.uz-tr-sub { font-size:12px; color:var(--ink-soft); margin-top:2px; }
.uz-tr-stats { display:flex; gap:14px; font-size:13px; font-weight:600; color:var(--ink-soft); flex-wrap:wrap; }
.uz-block-tag { font-size:10px; font-weight:700; color:#fff; background:var(--red); padding:3px 8px; border-radius:6px; }
.uz-flag-tag { font-size:10px; font-weight:700; color:var(--gold); background:var(--gold-soft); padding:3px 8px; border-radius:6px; }
.uz-pending-tag { font-size:10px; font-weight:700; color:var(--gold); background:var(--gold-soft); border:1px solid #f0e0b0; padding:3px 8px; border-radius:6px; }
.uz-tech-row.pending { border-color:#f0c14b; background:#fffdf5; }
.uz-approve-btn { background:var(--green); color:#fff; border:none; border-radius:9px; padding:9px 14px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-approve-btn:hover { background:#0d8a56; }
.uz-reject-btn { background:var(--red-soft); color:var(--red); border:1px solid #f3c9c5; border-radius:9px; padding:9px 14px; font-weight:600; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-reject-btn:hover { background:var(--red); color:#fff; }
.uz-block-btn { background:var(--red); color:#fff; border:none; border-radius:9px; padding:9px 16px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-block-btn:hover { background:#c0392b; }
.uz-block-btn.unblock { background:var(--green); }
.uz-block-btn.unblock:hover { background:#0d8a56; }

/* BANK BOX */
.uz-bank-box { margin-top:12px; background:#fff; border:1px solid #bcd6ff; border-radius:10px; padding:12px 14px; font-size:13px; line-height:1.7; }
.uz-bank-box span { color:var(--ink-soft); display:inline-block; min-width:90px; }
.uz-bank-box b { color:var(--ink); }
.uz-bank-box--lg { font-size:14px; }
.uz-bank-divider { height:1px; background:var(--line); margin:8px 0; }
.uz-bank-empty { margin-top:12px; background:#fff; border:1px dashed var(--line); border-radius:10px; padding:14px; font-size:13px; color:var(--ink-soft); text-align:center; }

/* MATERIALS SHOP */
.uz-mat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:14px; }
.uz-mat-card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px 16px; text-align:center; display:flex; flex-direction:column; align-items:center; animation:uzFade .5s ease both; }
.uz-mat-card:hover { border-color:var(--blue); }
.uz-mat-icon { width:52px; height:52px; border-radius:13px; background:var(--blue-soft); display:flex; align-items:center; justify-content:center; font-size:26px; margin-bottom:12px; }
.uz-mat-name { font-size:14px; font-weight:600; line-height:1.35; margin-bottom:8px; flex:1; }
.uz-mat-price { font-family:'Manrope',sans-serif; font-weight:700; font-size:16px; color:var(--ink); margin-bottom:12px; }
.uz-mat-price small { font-size:11px; color:var(--ink-soft); font-weight:500; }
.uz-mat-add { width:100%; background:var(--blue-soft); color:var(--blue); border:none; border-radius:9px; padding:9px; font-weight:700; font-size:13px; cursor:pointer; transition:all .2s; }
.uz-mat-add:hover { background:var(--blue); color:#fff; }
.uz-qty { display:flex; align-items:center; gap:0; width:100%; border:1px solid var(--blue); border-radius:9px; overflow:hidden; }
.uz-qty button { flex:1; background:var(--blue-soft); color:var(--blue); border:none; padding:9px 0; font-size:16px; font-weight:700; cursor:pointer; }
.uz-qty button:hover { background:var(--blue); color:#fff; }
.uz-qty span { flex:1; text-align:center; font-weight:700; font-size:15px; }
.uz-cart-bar { position:sticky; bottom:16px; margin-top:24px; background:var(--blue-deep); color:#fff; border-radius:14px; padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; box-shadow:0 14px 34px -14px rgba(6,23,58,.6); }
.uz-cart-info b { font-family:'Manrope',sans-serif; font-size:18px; }
.uz-cart-btn { background:#fff; color:var(--blue-deep); border:none; border-radius:10px; padding:12px 22px; font-weight:700; font-size:15px; cursor:pointer; }
.uz-cart-btn:hover { background:#e8f0ff; }

/* CHECKOUT */
.uz-checkout { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:22px; }
.uz-checkout-items { border-bottom:1px solid var(--line); padding-bottom:16px; margin-bottom:18px; }
.uz-co-item { display:flex; align-items:center; gap:10px; padding:8px 0; font-size:14px; }
.uz-co-ico { font-size:18px; }
.uz-co-name { flex:1; }
.uz-co-name small { color:var(--ink-soft); }
.uz-co-price { font-weight:600; }
.uz-co-total { display:flex; justify-content:space-between; align-items:center; padding-top:12px; margin-top:6px; border-top:1px solid var(--line); font-size:15px; }
.uz-co-total b { font-family:'Manrope',sans-serif; font-size:20px; color:var(--blue); }
.uz-mat-order-items { font-size:12px; color:var(--ink-soft); margin-top:6px; line-height:1.6; }

/* SETTINGS */
.uz-settings { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px; max-width:480px; }
.uz-settings-title { font-family:'Manrope',sans-serif; font-size:18px; font-weight:700; margin-bottom:6px; }
.uz-settings-sub { font-size:13px; color:var(--ink-soft); line-height:1.5; margin-bottom:20px; }

/* SERVICE EDITOR */
.uz-svc-editor { max-width:640px; }
.uz-svc-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; flex-wrap:wrap; }
.uz-svc-list { display:flex; flex-direction:column; gap:14px; }
.uz-svc-card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; }
.uz-svc-row1 { display:flex; gap:8px; align-items:center; margin-bottom:10px; }
.uz-svc-icon-input { width:48px; text-align:center; font-size:20px; border:1px solid var(--line); border-radius:9px; padding:9px 0; outline:none; }
.uz-svc-name-input { flex:1; border:1px solid var(--line); border-radius:9px; padding:10px 12px; font-size:15px; font-weight:600; outline:none; }
.uz-svc-name-input:focus, .uz-svc-icon-input:focus { border-color:var(--blue); }
.uz-svc-cat { border:1px solid var(--line); border-radius:9px; padding:10px; font-size:13px; outline:none; background:var(--card); }
.uz-svc-del { background:var(--red-soft); border:none; border-radius:9px; width:38px; height:38px; cursor:pointer; font-size:15px; flex-shrink:0; }
.uz-svc-del:hover { background:#f9d2ce; }
.uz-svc-desc { width:100%; border:1px solid var(--line); border-radius:9px; padding:10px 12px; font-size:13px; resize:vertical; outline:none; margin-bottom:10px; line-height:1.5; }
.uz-svc-desc:focus { border-color:var(--blue); }
.uz-svc-row2 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
@media (max-width:540px){ .uz-svc-row2 { grid-template-columns:1fr; } }
.uz-svc-row2 label { font-size:11px; color:var(--ink-soft); font-weight:600; display:flex; flex-direction:column; gap:5px; }
.uz-svc-row2 input { border:1px solid var(--line); border-radius:9px; padding:9px 11px; font-size:14px; outline:none; color:var(--ink); }
.uz-svc-row2 input:focus { border-color:var(--blue); }

/* CREDIT CONTROL */
.uz-tr-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.uz-credit-toggle { background:var(--blue-soft); color:var(--blue); border:none; border-radius:9px; padding:9px 14px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-credit-toggle:hover { background:#d4e6ff; }
.uz-credit-box { display:flex; align-items:center; gap:6px; }
.uz-credit-box input { width:90px; border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:13px; outline:none; }
.uz-credit-box input:focus { border-color:var(--blue); }
.uz-credit-ok { background:var(--green); color:#fff; border:none; border-radius:8px; padding:8px 12px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-credit-ok.sub { background:var(--red); }
.uz-credit-cancel { background:var(--bg); color:var(--ink-soft); border:1px solid var(--line); border-radius:8px; padding:8px 10px; cursor:pointer; }

/* Credit Control v2 - add/subtract */
.uz-credit-box-v2 { display:flex; flex-direction:column; gap:6px; padding:8px; background:var(--bg); border-radius:10px; border:1px solid var(--line); }
.uz-credit-mode-tabs { display:flex; gap:4px; }
.uz-credit-mode-tab { flex:1; padding:6px 10px; border:1px solid var(--line); background:#fff; color:var(--ink-soft); border-radius:7px; cursor:pointer; font-weight:700; font-size:12px; }
.uz-credit-mode-tab.active.add { background:var(--green); color:#fff; border-color:var(--green); }
.uz-credit-mode-tab.active.sub { background:var(--red); color:#fff; border-color:var(--red); }
.uz-credit-row { display:flex; align-items:center; gap:5px; }
.uz-credit-row input { flex:1; min-width:80px; max-width:120px; border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:13px; outline:none; }
.uz-credit-row input:focus { border-color:var(--blue); }
.uz-credit-err { font-size:11px; color:var(--red); margin-top:2px; }

/* MODAL */
.uz-modal-overlay { position:fixed; inset:0; background:rgba(6,23,58,.55); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; z-index:200; padding:20px; animation:uzFade .2s ease; }
.uz-modal { background:var(--card); border-radius:20px; padding:28px; max-width:380px; width:100%; }
.uz-modal-title { font-family:'Manrope',sans-serif; font-weight:700; font-size:20px; }
.uz-modal-sub { font-size:14px; color:var(--ink-soft); margin:4px 0 18px; }
.uz-modal-text { font-size:13px; color:var(--ink-soft); margin-bottom:14px; }
.uz-pay-option { width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px; background:var(--bg); border:1.5px solid var(--line); border-radius:12px; padding:15px 18px; margin-bottom:10px; cursor:pointer; transition:all .2s; font-size:14px; font-weight:600; color:var(--ink); flex-wrap:wrap; }
.uz-pay-option:hover:not(:disabled) { border-color:var(--blue); background:var(--blue-soft); }
.uz-pay-option b { font-family:'Manrope',sans-serif; font-size:16px; }
.uz-pay-option--coin b { color:var(--gold); }
.uz-pay-option:disabled { opacity:.5; cursor:not-allowed; }
.uz-pay-option small { width:100%; font-size:11px; color:var(--red); font-weight:600; }
.uz-modal-cancel { width:100%; background:none; border:none; color:var(--ink-soft); font-weight:600; font-size:14px; cursor:pointer; padding:10px; margin-top:4px; }

/* ARRIVAL / EXTRA WAIT (customer) */
.uz-arrival-note { margin-top:10px; background:var(--blue-soft); color:var(--blue-dark); border-radius:9px; padding:9px 13px; font-size:13px; font-weight:600; }
.uz-arrival-note b { font-family:'Manrope',sans-serif; }
.uz-extrawait-note { margin-top:8px; background:var(--gold-soft); color:#8a6500; border:1px solid #f0e0b0; border-radius:9px; padding:9px 13px; font-size:13px; font-weight:600; line-height:1.4; }

/* DISPATCH (admin) */
.uz-dispatch-card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:18px; }
.uz-dispatch-card.no-free { border-color:#f0c14b; background:#fffdf5; }
.uz-dispatch-top { display:flex; gap:14px; align-items:flex-start; }
.uz-dispatch-info { flex:1; min-width:0; }
.uz-free-badge { flex-shrink:0; font-size:12px; font-weight:700; padding:6px 11px; border-radius:8px; white-space:nowrap; }
.uz-free-badge.ok { color:var(--green); background:#e6f7ef; }
.uz-free-badge.none { color:#c0392b; background:var(--red-soft); }
.uz-dispatch-controls { margin-top:16px; padding-top:16px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:14px; }
.uz-dispatch-field label { display:block; font-size:13px; font-weight:600; color:var(--ink); margin-bottom:7px; }
.uz-dispatch-row { display:flex; gap:10px; }
.uz-dispatch-row input { flex:1; background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:11px 14px; font-size:14px; outline:none; transition:all .2s; }
.uz-dispatch-row input:focus { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-soft); }
.uz-dispatch-btn { background:var(--blue); color:#fff; border:none; border-radius:10px; padding:11px 18px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-dispatch-btn:hover:not(:disabled) { background:var(--blue-dark); }
.uz-dispatch-btn.warn { background:var(--gold); }
.uz-dispatch-btn.warn:hover:not(:disabled) { background:#b88200; }
.uz-dispatch-btn:disabled { background:var(--line); color:var(--ink-soft); cursor:not-allowed; }
.uz-dispatch-sent { font-size:12px; font-weight:600; color:var(--green); }
.uz-dispatch-sent.warn { color:#8a6500; }

/* FOOTER + TOAST */
.uz-footer { background:var(--blue-deep); color:#fff; margin-top:20px; }
.uz-footer-inner { max-width:1140px; margin:0 auto; padding:30px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.uz-footer .uz-logo-text { color:#fff; }
.uz-footer-text { font-size:17px; color:#fff; font-weight:700; letter-spacing:-.01em; }
.uz-footer-sub-text { font-size:13px; color:rgba(255,255,255,.6); margin-top:4px; }
.uz-footer-phone { color:#fff; text-decoration:none; font-weight:700; font-size:16px; }
.uz-toast { position:fixed; bottom:28px; left:50%; transform:translateX(-50%); background:var(--green); color:#fff; padding:14px 24px; border-radius:12px; font-size:14px; font-weight:600; z-index:300; box-shadow:0 12px 30px -8px rgba(0,0,0,.4); animation:uzToast .3s ease both; }
@keyframes uzToast { from{opacity:0;transform:translate(-50%,12px);} to{opacity:1;transform:translate(-50%,0);} }

/* QUICK ACTIONS (customer home) */
.uz-quick-actions { max-width:1140px; margin:0 auto; padding:32px 24px 0; display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:680px){ .uz-quick-actions{grid-template-columns:1fr;} }

/* NEW HOME — 3 big cards */
.uz-home { max-width:1140px; margin:0 auto; padding:clamp(24px,4vw,48px) clamp(14px,3vw,24px) 60px; }
.uz-home-header { text-align:center; margin-bottom:40px; }
.uz-home-title { font-family:'Manrope',sans-serif; font-weight:800; font-size:clamp(32px,5vw,48px); letter-spacing:-.02em; line-height:1.1; margin-bottom:10px; }
.uz-home-sub { font-size:clamp(13px,1.5vw,17px); color:var(--ink-soft); }

/* DOWN ARROWS */
.uz-home-sub-row { display:flex; align-items:center; justify-content:center; gap:14px; flex-wrap:nowrap; }
.uz-arrow-down { font-size:32px; color:var(--blue); animation:uzBounce 1.5s ease-in-out infinite; line-height:1; flex-shrink:0; }
@media (max-width:560px){ .uz-home-sub-row { gap:10px; } .uz-arrow-down { font-size:24px; } .uz-home-sub { font-size:14px; } }
@keyframes uzBounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(8px); } }
.uz-home-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-bottom:32px; }
@media (max-width:860px){ .uz-home-cards{grid-template-columns:1fr;} }
.uz-home-card { background:var(--card); border:2px solid var(--line); border-radius:22px; padding:36px 28px; cursor:pointer; text-align:center; transition:all .25s cubic-bezier(.2,.8,.2,1); font-family:'Manrope',sans-serif; display:flex; flex-direction:column; align-items:center; gap:8px; min-height:240px; justify-content:center; }
.uz-home-card:hover { transform:translateY(-6px); }
.uz-home-card--call { background:linear-gradient(135deg,#16a085 0%,#0d8a6d 100%); border-color:transparent; color:#fff; }
.uz-home-card--call:hover { box-shadow:0 28px 60px -24px rgba(22,160,133,.55); }
.uz-home-card--mat { background:linear-gradient(135deg,var(--blue) 0%,var(--blue-dark) 100%); border-color:transparent; color:#fff; }
.uz-home-card--mat:hover { box-shadow:0 28px 60px -24px rgba(10,108,255,.7); }
.uz-home-card--tech { background:linear-gradient(135deg,var(--gold) 0%,#b88200 100%); border-color:transparent; color:#fff; }
.uz-home-card--tech:hover { box-shadow:0 28px 60px -24px rgba(217,154,0,.55); }
.uz-home-card-icon { font-size:clamp(48px,6vw,72px); line-height:1; margin-bottom:12px; }
.uz-home-card-title { font-family:'Manrope',sans-serif; font-weight:800; font-size:clamp(20px,2.4vw,30px); line-height:1.15; letter-spacing:-.02em; }
.uz-home-card-sub { font-size:clamp(12px,1.3vw,16px); opacity:.92; margin-top:6px; }
.uz-home-track { display:block; margin:0 auto; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px 30px; font-size:15px; font-weight:700; color:var(--ink); cursor:pointer; transition:all .2s; }
.uz-home-track:hover { border-color:var(--blue); color:var(--blue); transform:translateY(-2px); }

/* ORG BANNER (home) */
.uz-org-banner { display:flex; align-items:center; gap:18px; width:100%; max-width:1140px; margin:0 auto 22px; padding:24px 28px; background:linear-gradient(135deg,#06173a 0%,#0a2a66 100%); border:none; border-radius:18px; cursor:pointer; color:#fff; text-align:left; transition:all .25s; box-shadow:0 18px 40px -20px rgba(6,23,58,.5); font-family:'Manrope',sans-serif; }

/* Track booking button - prominent placement */
.uz-track-btn { display:flex; align-items:center; gap:16px; width:100%; max-width:1140px; margin:0 auto 22px; padding:20px 24px; background:linear-gradient(135deg, #16a085 0%, #11876f 100%); border:none; border-radius:18px; cursor:pointer; color:#fff; text-align:left; transition:all .25s; box-shadow:0 16px 40px -20px rgba(22,160,133,.5); font-family:'Manrope',sans-serif; }
.uz-track-btn:hover { transform:translateY(-3px); box-shadow:0 24px 50px -16px rgba(22,160,133,.6); }
.uz-track-btn-icon { font-size:36px; flex-shrink:0; background:rgba(255,255,255,.18); width:60px; height:60px; border-radius:14px; display:flex; align-items:center; justify-content:center; }
.uz-track-btn-body { flex:1; min-width:0; }
.uz-track-btn-title { font-size:18px; font-weight:800; margin-bottom:2px; }
.uz-track-btn-sub { font-size:13px; opacity:.9; line-height:1.35; }
.uz-track-btn-arrow { font-size:24px; opacity:.85; flex-shrink:0; }

@media (max-width:560px){
  .uz-track-btn { padding:16px 18px; gap:12px; }
  .uz-track-btn-icon { width:52px; height:52px; font-size:30px; }
  .uz-track-btn-title { font-size:16px; }
  .uz-track-btn-sub { font-size:12px; }
}
.uz-org-banner:hover { transform:translateY(-3px); box-shadow:0 24px 50px -16px rgba(6,23,58,.7); }
.uz-org-banner-left { flex-shrink:0; }
.uz-org-icon { font-size:48px; line-height:1; }
.uz-org-banner-body { flex:1; }
.uz-org-banner-title { font-size:22px; font-weight:800; letter-spacing:-.01em; line-height:1.2; margin-bottom:6px; }
.uz-org-banner-sub { font-size:14px; opacity:.85; line-height:1.5; }
.uz-org-banner-arrow { font-size:32px; font-weight:bold; flex-shrink:0; opacity:.7; transition:transform .2s; }
.uz-org-banner:hover .uz-org-banner-arrow { transform:translateX(6px); opacity:1; }
@media (max-width:640px){ .uz-org-banner-title{font-size:18px;} .uz-org-banner-sub{font-size:13px;} .uz-org-icon{font-size:38px;} }

/* ORG HERO (org page) */
.uz-org-hero { text-align:center; margin-bottom:30px; padding:30px 20px; background:linear-gradient(135deg,#06173a 0%,#0a2a66 100%); border-radius:20px; color:#fff; }
.uz-org-hero-icon { font-size:64px; margin-bottom:14px; }
.uz-org-hero-title { font-family:'Manrope',sans-serif; font-weight:800; font-size:clamp(24px,4vw,34px); line-height:1.15; letter-spacing:-.02em; margin-bottom:10px; }
.uz-org-hero-sub { font-size:16px; opacity:.9; line-height:1.5; }

/* ORG BENEFITS */
.uz-org-benefits { margin-bottom:24px; }
.uz-org-section-title { font-family:'Manrope',sans-serif; font-weight:800; font-size:22px; margin-bottom:14px; letter-spacing:-.01em; }
.uz-org-benefits-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
.uz-org-benefit { background:var(--card); border:1px solid var(--line); border-radius:13px; padding:14px 16px; display:flex; align-items:center; gap:12px; font-size:14px; font-weight:600; }
.uz-org-benefit span { font-size:24px; }
.uz-org-benefit b { color:var(--ink); font-weight:600; }

/* ORG ADVANTAGES */
.uz-org-adv-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }
.uz-org-adv { background:var(--card); border:1px solid var(--line); border-radius:15px; padding:20px; transition:all .2s; }
.uz-org-adv:hover { border-color:var(--blue); transform:translateY(-3px); box-shadow:0 14px 32px -16px rgba(10,108,255,.25); }
.uz-org-adv-icon { font-size:36px; margin-bottom:10px; line-height:1; }
.uz-org-adv-title { font-family:'Manrope',sans-serif; font-weight:800; font-size:16px; margin-bottom:6px; color:var(--ink); letter-spacing:-.01em; }
.uz-org-adv-desc { font-size:13px; color:var(--ink-soft); line-height:1.55; }

/* ORG PRICE CARD */
.uz-org-price-card { background:linear-gradient(135deg,#11a86a 0%,#0d8a56 100%); color:#fff; border-radius:18px; padding:28px; text-align:center; margin-bottom:30px; box-shadow:0 18px 40px -20px rgba(17,168,106,.55); }
.uz-org-price-label { font-size:14px; opacity:.9; margin-bottom:6px; text-transform:uppercase; letter-spacing:.08em; font-weight:700; }
.uz-org-price-value { font-family:'Manrope',sans-serif; font-weight:800; font-size:48px; letter-spacing:-.025em; line-height:1; }
.uz-org-price-value span { font-size:18px; font-weight:600; opacity:.85; margin-left:4px; }
.uz-org-price-note { font-size:13px; opacity:.92; margin-top:10px; line-height:1.5; }
.uz-org-price-deal { background:rgba(0,0,0,.25); border-radius:10px; padding:12px 14px; margin-top:14px; font-size:13px; line-height:1.55; text-align:left; }
.uz-org-price-deal b { font-weight:700; }

/* ORG EXCLUDED JOBS */
.uz-org-excluded { background:#fff8e1; border:1px solid #f0d678; border-radius:16px; padding:22px; margin-bottom:30px; }
.uz-org-excluded-list { display:flex; flex-direction:column; gap:8px; }
.uz-org-excluded-item { background:#fff; border:1px solid #f0e0b0; padding:11px 14px; border-radius:10px; font-size:14px; line-height:1.5; color:var(--ink); }
.uz-org-excluded-item b { color:#5f4500; font-weight:700; }

/* DISTRICT EDITOR */
.uz-district-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }
.uz-district-item { background:var(--bg); border:1px solid var(--line); border-radius:11px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
.uz-district-item label { font-size:13px; font-weight:700; color:var(--ink); }
.uz-district-input { display:flex; align-items:center; gap:8px; }
.uz-district-input input { flex:1; padding:8px 10px; border:1px solid var(--line); border-radius:8px; font-size:14px; outline:none; }
.uz-district-input input:focus { border-color:var(--blue); }
.uz-district-input span { font-size:13px; color:var(--ink-soft); font-weight:600; }

/* WARNINGS & BLOCK */
.uz-tech-block-notice { background:linear-gradient(135deg,#7a2222 0%,#5a1818 100%); color:#fff; border-radius:14px; padding:18px 20px; margin-bottom:20px; display:flex; align-items:center; gap:14px; box-shadow:0 14px 30px -14px rgba(122,34,34,.5); }
.uz-tech-block-icon { font-size:42px; line-height:1; }
.uz-tech-block-title { font-family:'Manrope',sans-serif; font-weight:800; font-size:20px; margin-bottom:4px; }
.uz-tech-block-sub { font-size:13px; opacity:.9; }
.uz-tech-warnings { background:#fff8e1; border:1px solid #f0d678; border-radius:14px; padding:16px; margin-bottom:20px; }
.uz-tech-warnings-head { font-family:'Manrope',sans-serif; font-weight:800; font-size:15px; color:#7a5a00; margin-bottom:12px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.uz-warn-list { display:flex; flex-direction:column; gap:10px; }
.uz-warn-item { background:#fff; border:1px solid var(--line); border-radius:11px; padding:14px; }
.uz-warn-item.unread { border-left:4px solid var(--red); background:#fff5f4; }
.uz-warn-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
.uz-warn-blocked { background:#7a2222; color:#fff; border-radius:10px; padding:14px; margin-bottom:18px; font-size:14px; }
.uz-warn-blocked b { color:#fff; }
.uz-warn-form { background:var(--bg); border-radius:12px; padding:18px; margin-bottom:8px; }
.uz-warn-original { background:#fff8e1; border:1px solid #f0d678; border-radius:11px; padding:14px; font-size:14px; color:#5f4500; line-height:1.55; }
.uz-warn-btn { background:#fff6d5; color:#7a5a00; border:1px solid #f0d678; border-radius:10px; padding:9px 14px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; transition:all .15s; }
.uz-warn-btn:hover { background:var(--gold); color:#fff; border-color:var(--gold); }

/* TRACK LINK (top-right header) */
.uz-track-link-wrap { margin-left:auto; }
.uz-track-link { background:linear-gradient(135deg,var(--blue) 0%,var(--blue-dark) 100%); color:#fff; border:none; border-radius:13px; padding:14px 22px; font-size:15px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:8px; transition:all .2s; box-shadow:0 8px 24px -8px rgba(10,108,255,.45); }
.uz-track-link:hover { transform:translateY(-2px); box-shadow:0 12px 30px -8px rgba(10,108,255,.6); }
@media (max-width:560px){ .uz-track-link { padding:11px 14px; font-size:13px; } }

/* ADMIN LOGIN BIG BUTTON */
.uz-admin-login-btn { display:block; width:100%; max-width:420px; margin:0 auto; background:var(--blue-deep); color:#fff; border:none; border-radius:16px; padding:24px 30px; font-family:'Manrope',sans-serif; font-size:20px; font-weight:800; cursor:pointer; letter-spacing:-.01em; transition:all .25s; box-shadow:0 16px 40px -20px rgba(6,23,58,.6); }

/* Install button on home page */
.uz-install-link { display:block; width:100%; max-width:420px; margin:12px auto; background:linear-gradient(135deg, #0a6cff, #06173a); color:#fff; border:none; border-radius:14px; padding:16px 20px; font-family:'Manrope',sans-serif; font-size:16px; font-weight:800; cursor:pointer; text-align:center; transition:all .25s; box-shadow:0 8px 24px -8px rgba(10,108,255,.5); }
.uz-install-link:hover { transform:translateY(-2px); box-shadow:0 12px 30px -8px rgba(10,108,255,.6); }

/* Install Modal */
.uz-install-modal { max-width:520px !important; padding:0 !important; overflow:hidden; max-height:90vh; overflow-y:auto; }
.uz-modal-x { position:absolute; top:14px; right:14px; background:rgba(255,255,255,.15); color:#fff; border:none; width:36px; height:36px; border-radius:50%; font-size:22px; font-weight:700; cursor:pointer; z-index:10; display:flex; align-items:center; justify-content:center; line-height:1; }
.uz-modal-x:hover { background:rgba(255,255,255,.25); }
.uz-install-hero { background:linear-gradient(135deg, #06173a 0%, #0a6cff 100%); color:#fff; padding:36px 24px 28px; text-align:center; position:relative; }
.uz-install-icon { font-size:48px; margin-bottom:8px; }
.uz-install-title { font-size:22px; font-weight:800; margin-bottom:6px; color:#fff; }
.uz-install-sub { font-size:13px; opacity:.9; }
.uz-install-benefits { display:flex; justify-content:space-around; padding:18px 16px; background:#f4f6fa; border-bottom:1px solid var(--line); }
.uz-install-benefit { display:flex; flex-direction:column; align-items:center; gap:4px; font-size:11px; font-weight:600; color:var(--ink); text-align:center; max-width:90px; }
.uz-install-benefit-icon { font-size:24px; }
.uz-install-tabs { display:flex; gap:6px; padding:16px 20px 0; background:#fff; }
.uz-install-tab { flex:1; padding:10px 14px; border-radius:10px; border:1px solid var(--line); background:#fff; color:var(--ink-soft); font-weight:700; font-size:13px; cursor:pointer; transition:all .15s; }
.uz-install-tab.active { background:var(--blue); color:#fff; border-color:var(--blue); }
.uz-install-steps { padding:16px 20px; background:#fff; }
.uz-install-step { display:flex; gap:12px; padding:12px; background:#f4f6fa; border-radius:12px; margin-bottom:8px; border-left:3px solid var(--blue); }
.uz-install-step-num { background:var(--blue); color:#fff; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; flex-shrink:0; }
.uz-install-step-body { flex:1; font-size:14px; line-height:1.45; color:var(--ink); }
.uz-install-step-body b { color:var(--blue); background:#d4e6ff; padding:1px 6px; border-radius:5px; font-weight:700; }
.uz-install-step-body small { display:block; margin-top:4px; font-size:12px; color:var(--ink-soft); font-weight:400; }
.uz-install-done { display:block; width:calc(100% - 40px); margin:0 20px 20px; background:var(--green); color:#fff; border:none; border-radius:12px; padding:14px; font-size:15px; font-weight:800; cursor:pointer; }
.uz-install-done:hover { background:#0d8a56; }
.uz-admin-login-btn:hover { background:#0a2a66; transform:translateY(-3px); box-shadow:0 24px 50px -16px rgba(6,23,58,.7); }

/* HELP LINK (home) */
.uz-help-link { display:block; width:100%; max-width:420px; margin:0 auto 14px; background:var(--gold-soft); color:#5f4500; border:1px solid #f0e0b0; border-radius:14px; padding:16px 22px; font-size:14px; font-weight:700; cursor:pointer; transition:all .2s; text-align:center; }
.uz-help-link:hover { background:var(--gold); color:#fff; border-color:var(--gold); transform:translateY(-2px); }

/* COIN HELP SECTION */
.uz-help-section--coin { background:linear-gradient(135deg,#fffbef 0%,#fff8e1 100%); border-color:#f0e0b0; }
.uz-coin-sec-title { font-family:'Manrope',sans-serif; font-weight:700; font-size:16px; margin:18px 0 10px; color:var(--ink); }
.uz-coin-list { list-style:none; padding-left:0; display:flex; flex-direction:column; gap:6px; }
.uz-coin-list li { font-size:14px; line-height:1.55; color:var(--ink); padding:8px 12px; background:rgba(255,255,255,.65); border-radius:9px; }
.uz-coin-list li b { color:#5f4500; font-weight:700; }

/* COPY BUTTON */
.uz-copy-btn { background:var(--blue-soft); color:var(--blue); border:none; border-radius:7px; padding:4px 10px; font-size:11px; font-weight:700; cursor:pointer; margin-left:8px; transition:all .15s; }
.uz-copy-btn:hover { background:var(--blue); color:#fff; }

/* PAYMENT REQUIRED */
.uz-pay-required { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:32px 28px; text-align:center; }
.uz-pay-required .uz-empty-icon { margin:0 auto 14px; }
.uz-bank-row { display:flex; align-items:center; gap:10px; padding:8px 0; flex-wrap:nowrap; }
.uz-bank-row > span { color:var(--ink-soft); width:140px; display:inline-block; flex-shrink:0; font-weight:600; }
.uz-bank-row > b { color:var(--ink); font-weight:700; flex:1; min-width:0; word-break:break-all; overflow-wrap:break-word; }

@media (max-width:680px){
  .uz-bank-row { flex-direction:column; align-items:stretch; gap:4px; padding:10px 0; }
  .uz-bank-row > span { width:100%; font-size:12px; }
  .uz-bank-row > b { font-size:16px; }
  .uz-bank-row .uz-copy-btn { align-self:flex-start; margin-top:4px; }
}

/* DELETE BOOKING BUTTON */
.uz-del-btn { background:var(--red-soft); color:var(--red); border:none; border-radius:10px; padding:11px 16px; font-weight:700; font-size:14px; cursor:pointer; white-space:nowrap; transition:all .15s; }
.uz-del-btn:hover { background:var(--red); color:#fff; }
.uz-confirm-pay-btn { background:var(--green); color:#fff; border:none; border-radius:10px; padding:13px 18px; font-weight:700; font-size:14px; cursor:pointer; white-space:nowrap; transition:all .15s; }
.uz-confirm-pay-btn:hover { background:#0d8a56; transform:translateY(-1px); }
.uz-detail-btn { background:var(--blue-soft); color:var(--blue); border:none; border-radius:10px; padding:11px 16px; font-weight:700; font-size:14px; cursor:pointer; white-space:nowrap; transition:all .15s; }
.uz-detail-btn:hover { background:var(--blue); color:#fff; }

/* PAYMENT PENDING */
.uz-pay-pending { background:linear-gradient(135deg,#fff6d5 0%,#ffe6a8 100%); border:1px solid #f0d678; border-radius:10px; padding:10px 14px; font-size:13px; color:#7a5a00; line-height:1.5; margin-top:8px; }

/* Pending payment box with bank info */
.uz-pay-pending-box { background:linear-gradient(135deg,#fff6d5 0%,#ffe6a8 100%); border:1px solid #f0d678; border-radius:14px; padding:14px; margin-top:10px; }
.uz-pay-pending-warn { font-size:14px; color:#7a5a00; line-height:1.5; margin-bottom:12px; }
.uz-pay-bank-info { background:#fff; border-radius:12px; padding:14px; }
.uz-pay-bank-title { font-weight:800; font-size:14px; margin-bottom:10px; color:var(--blue-deep); }
.uz-pay-bank-row { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--line); font-size:13px; flex-wrap:nowrap; }
.uz-pay-bank-row:last-child { border-bottom:none; }
.uz-pay-bank-row > span { color:var(--ink-soft); flex-shrink:0; width:140px; font-weight:600; }
.uz-pay-bank-row > b { color:var(--ink); flex:1; min-width:0; word-break:break-all; overflow-wrap:break-word; font-size:15px; }
.uz-pay-bank-acct { font-family:'Courier New',monospace !important; font-size:15px !important; letter-spacing:0.5px; font-weight:700 !important; word-break:break-all !important; overflow-wrap:break-word !important; }
.uz-pay-bank-amt { background:#e6f7ef; margin:6px -6px 6px; padding:10px 12px; border-radius:8px; border:none; }
.uz-pay-bank-amt > b { color:#0d8a56; font-size:20px !important; }
.uz-pay-direct { display:block; text-align:center; background:linear-gradient(135deg, var(--blue), var(--blue-deep)); color:#fff; padding:12px; border-radius:10px; font-weight:700; text-decoration:none; margin-top:10px; }
.uz-pay-direct:hover { transform:translateY(-1px); box-shadow:0 4px 10px rgba(10,108,255,.3); }

/* Mobile: stack vertically for small phones */
@media (max-width:680px){
  .uz-pay-bank-row { flex-direction:column; align-items:stretch; gap:6px; padding:12px 0; }
  .uz-pay-bank-row > span { width:100%; min-width:0; font-size:12px; }
  .uz-pay-bank-row > b { font-size:16px !important; line-height:1.4; }
  .uz-pay-bank-acct { font-size:17px !important; letter-spacing:1px; line-height:1.4; }
  .uz-pay-bank-row .uz-copy-btn { align-self:flex-start; margin-top:4px; }
  .uz-pay-bank-amt > b { font-size:22px !important; }
}

/* Very small phones */
@media (max-width:360px){
  .uz-pay-bank-info { padding:10px; }
  .uz-pay-bank-acct { font-size:15px !important; }
}

/* Active promo applied notice */
.uz-promo-applied { background:linear-gradient(135deg, #ff8c42, #d99a00); color:#fff; padding:14px 18px; border-radius:14px; text-align:center; font-size:15px; font-weight:700; margin-bottom:16px; box-shadow:0 4px 12px rgba(217,154,0,.3); animation:promoBlink 2s infinite; }
@keyframes promoBlink { 0%,100% { transform:scale(1); } 50% { transform:scale(1.02); } }
.uz-pay-pending b { color:#5a4400; }

/* PAYMENT LINK BUTTON (Direct Pay) */
.uz-pay-link-btn { display:flex; align-items:center; justify-content:center; width:100%; background:linear-gradient(135deg,#16a085 0%,#0d8a6d 100%); color:#fff; border:none; border-radius:13px; padding:16px 20px; font-family:'Manrope',sans-serif; font-size:16px; font-weight:800; cursor:pointer; margin-bottom:12px; text-decoration:none; transition:all .25s; box-shadow:0 10px 30px -12px rgba(22,160,133,.55); letter-spacing:-.01em; }
.uz-pay-link-btn:hover { transform:translateY(-2px); box-shadow:0 14px 36px -10px rgba(22,160,133,.7); color:#fff; text-decoration:none; }

/* FEEDBACK LINK (home) */
.uz-feedback-link { display:block; width:100%; max-width:420px; margin:0 auto 14px; background:#e6f7ef; color:#0d8a56; border:1px solid #b9e8d2; border-radius:14px; padding:16px 22px; font-size:14px; font-weight:700; cursor:pointer; transition:all .2s; text-align:center; }

/* Tier card */
.uz-tier-card { display:flex; align-items:center; gap:16px; padding:18px; border-radius:14px; color:#fff; margin-bottom:16px; box-shadow:0 4px 12px rgba(0,0,0,.1); }
.uz-tier-emoji { font-size:42px; line-height:1; }
.uz-tier-body { flex:1; }
.uz-tier-name { font-size:20px; font-weight:800; display:flex; align-items:center; gap:10px; }
.uz-tier-badge { font-size:11px; background:rgba(255,255,255,.25); padding:3px 10px; border-radius:20px; font-weight:600; }
.uz-tier-sub { font-size:12px; opacity:.95; margin-top:4px; }

/* Broadcast banner */
.uz-broadcast-banner { display:flex; align-items:center; gap:12px; background:linear-gradient(135deg, #fff8e1, #ffeec8); border:2px solid #f0d678; border-radius:14px; padding:14px 18px; margin-bottom:18px; position:relative; }

/* Session banner - shows when logged in as tech/admin */
.uz-session-banner { display:flex; align-items:center; gap:12px; background:linear-gradient(135deg, #16a085, #11876f); color:#fff; border-radius:14px; padding:14px 18px; margin-bottom:14px; cursor:pointer; transition:transform .15s, box-shadow .15s; }
.uz-session-banner:hover { transform:translateY(-2px); box-shadow:0 6px 14px rgba(22,160,133,.3); }
.uz-broadcast-icon { font-size:28px; flex-shrink:0; }
.uz-broadcast-body { flex:1; }
.uz-broadcast-title { font-size:15px; font-weight:800; color:#7a5a00; margin-bottom:4px; }
.uz-broadcast-msg { font-size:13px; color:#5a4500; line-height:1.4; }
.uz-broadcast-close { background:rgba(0,0,0,.08); color:#5a4500; border:none; border-radius:50%; width:32px; height:32px; font-size:22px; cursor:pointer; flex-shrink:0; line-height:1; }
.uz-broadcast-close:hover { background:rgba(0,0,0,.15); }

/* Map button in tech card */
.uz-map-btn { display:inline-flex; align-items:center; gap:6px; background:linear-gradient(135deg, #4285f4, #34a853); color:#fff; text-decoration:none; padding:10px 16px; border-radius:10px; font-weight:700; font-size:13px; margin:10px 0; transition:transform .15s; }
.uz-map-btn:hover { transform:translateY(-1px); box-shadow:0 4px 10px rgba(66,133,244,.3); }

/* Locked info notice for unaccepted calls */
.uz-locked-info { background:#fff8e1; border:1px dashed #f0d678; color:#7a5a00; padding:10px 14px; border-radius:10px; font-size:12px; font-weight:600; margin:8px 0; line-height:1.5; }

/* Comment input on rating */
.uz-comment-input { width:100%; padding:10px 12px; border:1px solid var(--line); border-radius:10px; font-size:14px; font-family:inherit; resize:vertical; min-height:60px; }
.uz-comment-input:focus { outline:none; border-color:var(--blue); }

/* Reviews */
.uz-reviews-stats { display:flex; gap:14px; background:#fff; border:1px solid var(--line); border-radius:14px; padding:18px; margin-bottom:16px; align-items:center; }
.uz-reviews-avg { text-align:center; padding:0 18px; border-right:1px solid var(--line); }
.uz-reviews-summary { flex:1; display:flex; flex-direction:column; gap:6px; }
.uz-reviews-row { display:flex; justify-content:space-between; align-items:center; font-size:13px; }
.uz-reviews-row b { font-size:14px; }
.uz-reviews-list { display:flex; flex-direction:column; gap:10px; }
.uz-review-card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px; }
.uz-review-head { display:flex; align-items:center; gap:10px; }
.uz-review-avatar { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg, var(--blue), var(--blue-deep)); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0; }
.uz-review-text { margin-top:8px; padding:10px 12px; background:#f8fafc; border-radius:8px; font-size:13px; color:var(--ink); font-style:italic; }

@media (max-width:560px){
  .uz-tier-card { padding:14px; gap:10px; }
  .uz-tier-emoji { font-size:32px; }
  .uz-tier-name { font-size:16px; flex-wrap:wrap; }
  .uz-broadcast-banner { padding:12px 14px; gap:10px; }
  .uz-broadcast-icon { font-size:22px; }
  .uz-broadcast-title { font-size:14px; }
  .uz-broadcast-msg { font-size:12px; }
  .uz-reviews-stats { flex-direction:column; gap:12px; padding:14px; }
  .uz-reviews-avg { border-right:none; border-bottom:1px solid var(--line); padding:0 0 12px; width:100%; }
}
.uz-feedback-link:hover { background:var(--green); color:#fff; border-color:var(--green); transform:translateY(-2px); }

/* FEEDBACK FORM */
.uz-feedback-form { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:24px; display:flex; flex-direction:column; gap:14px; }
.uz-feedback-types { display:flex; gap:8px; flex-wrap:wrap; }
.uz-feedback-type { background:var(--card); border:2px solid var(--line); color:var(--ink-soft); padding:10px 16px; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; }
.uz-feedback-type:hover { border-color:var(--blue); color:var(--blue); }
.uz-feedback-type.on { background:var(--blue); color:#fff; border-color:var(--blue); }

/* FEEDBACK ADMIN */
.uz-feedback-admin { display:flex; flex-direction:column; gap:14px; }
.uz-feedback-card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; transition:all .2s; }
.uz-feedback-card.unread { border-left:4px solid var(--gold); background:#fffbef; }
.uz-feedback-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
.uz-feedback-type-pill { color:#fff; padding:5px 11px; border-radius:7px; font-size:12px; font-weight:700; }
.uz-feedback-new { background:var(--gold); color:#fff; padding:3px 8px; border-radius:5px; font-size:10px; font-weight:800; letter-spacing:.05em; }
.uz-feedback-time { color:var(--ink-soft); font-size:12px; margin-left:auto; }
.uz-feedback-meta { display:flex; gap:14px; font-size:13px; color:var(--ink-soft); margin-bottom:10px; flex-wrap:wrap; }
.uz-feedback-msg { font-size:14px; line-height:1.55; color:var(--ink); padding:12px 14px; background:var(--bg); border-radius:10px; margin-bottom:12px; white-space:pre-wrap; }
.uz-feedback-actions { display:flex; gap:8px; flex-wrap:wrap; }
.uz-feedback-read-btn { background:var(--green); color:#fff; border:none; border-radius:8px; padding:8px 14px; font-weight:700; font-size:12px; cursor:pointer; }
.uz-feedback-read-btn:hover { background:#0d8a56; }

/* FEE NOTICE */
.uz-fee-notice { background:#fff6d5; border:1px solid #f0d678; color:#7a5a00; padding:10px 14px; border-radius:10px; font-size:12px; line-height:1.5; margin-bottom:10px; }

/* FOOTER CONTACTS */
.uz-footer-contacts { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.uz-footer-fb { display:inline-flex; align-items:center; gap:7px; background:#1877f2; color:#fff !important; padding:10px 16px; border-radius:11px; font-size:14px; font-weight:700; text-decoration:none; transition:all .2s; }
.uz-footer-fb:hover { background:#0f63d3; transform:translateY(-2px); }
.uz-footer-msgr { display:inline-flex; align-items:center; gap:7px; background:linear-gradient(135deg,#00b2ff 0%,#006aff 100%); color:#fff !important; padding:10px 16px; border-radius:11px; font-size:14px; font-weight:700; text-decoration:none; transition:all .2s; }
.uz-footer-msgr:hover { transform:translateY(-2px); box-shadow:0 8px 18px -8px rgba(0,106,255,.5); }
.uz-footer-viber { display:inline-flex; align-items:center; gap:7px; background:#665cac; color:#fff !important; padding:10px 16px; border-radius:11px; font-size:14px; font-weight:700; text-decoration:none; transition:all .2s; }
.uz-footer-viber:hover { background:#544991; transform:translateY(-2px); }

/* CUSTOMER COIN INFO IN BOOKING */
.uz-coin-info { margin-top:8px; padding:10px 13px; background:var(--gold-soft); border:1px solid #f0e0b0; border-radius:10px; font-size:13px; color:#8a6500; }
.uz-coin-info b { color:#5f4500; }
.uz-discount-check { background:linear-gradient(135deg,#16a085 0%,#0d8a6d 100%); color:#fff; padding:14px 18px; border-radius:12px; cursor:pointer; margin-bottom:16px; align-items:center; }
.uz-discount-check input { width:20px; height:20px; }

/* MY COINS DISPLAY */
.uz-my-coins { background:linear-gradient(135deg,var(--gold) 0%,#b88200 100%); color:#fff; border-radius:16px; padding:18px 22px; margin-bottom:22px; display:flex; align-items:center; gap:16px; box-shadow:0 12px 32px -12px rgba(217,154,0,.5); }
.uz-my-coins-icon { font-size:42px; line-height:1; }
.uz-my-coins-num { font-family:'Manrope',sans-serif; font-weight:800; font-size:20px; line-height:1.2; }
.uz-my-coins-num b { font-size:24px; }
.uz-my-coins-sub { font-size:13px; opacity:.9; margin-top:3px; }

/* HELP GUIDE */
.uz-help-section { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:24px 26px; margin-bottom:18px; }
.uz-help-head { display:flex; align-items:center; gap:14px; margin-bottom:18px; }
.uz-help-num { width:38px; height:38px; border-radius:50%; background:var(--blue); color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Manrope',sans-serif; font-weight:800; font-size:18px; flex-shrink:0; }
.uz-help-head h2 { font-family:'Manrope',sans-serif; font-size:21px; font-weight:700; letter-spacing:-.01em; }
.uz-help-steps { padding-left:0; list-style:none; counter-reset:step; }
.uz-help-steps li { position:relative; padding:10px 0 10px 36px; font-size:15px; line-height:1.55; color:var(--ink); border-bottom:1px dashed var(--line); counter-increment:step; }
.uz-help-steps li:last-child { border-bottom:none; }
.uz-help-steps li:before { content:counter(step); position:absolute; left:0; top:11px; width:24px; height:24px; border-radius:50%; background:var(--blue-soft); color:var(--blue); font-weight:700; font-size:12px; display:flex; align-items:center; justify-content:center; }
.uz-help-steps li b { color:var(--ink); font-weight:700; }
.uz-help-tip { margin-top:14px; padding:12px 14px; background:var(--gold-soft); border:1px solid #f0e0b0; border-radius:11px; font-size:13px; color:#8a6500; line-height:1.5; }
.uz-help-tip b { color:#5f4500; }
.uz-qa-card { display:flex; align-items:center; gap:18px; background:var(--card); border:2px solid var(--line); border-radius:18px; padding:24px; cursor:pointer; text-align:left; transition:all .25s; font-family:'Manrope',sans-serif; }
.uz-qa-card:hover { transform:translateY(-3px); box-shadow:0 20px 44px -22px rgba(10,108,255,.4); }
.uz-qa-primary { background:linear-gradient(135deg,var(--blue) 0%,var(--blue-dark) 100%); border-color:transparent; color:#fff; }
.uz-qa-primary:hover { border-color:transparent; box-shadow:0 20px 44px -18px rgba(10,108,255,.7); }
.uz-qa-secondary { background:var(--card); border-color:var(--blue-soft); color:var(--ink); }
.uz-qa-secondary:hover { border-color:var(--blue); }
.uz-qa-icon { font-size:42px; flex-shrink:0; }
.uz-qa-body { flex:1; }
.uz-qa-title { font-family:'Manrope',sans-serif; font-weight:800; font-size:22px; line-height:1.1; margin-bottom:4px; }
.uz-qa-sub { font-size:13px; opacity:.8; }
.uz-qa-arrow { font-size:24px; font-weight:bold; flex-shrink:0; opacity:.7; }
.uz-qa-card:hover .uz-qa-arrow { transform:translateX(4px); opacity:1; }

/* CHAT THREAD */
.uz-chat-toggle { display:inline-flex; align-items:center; gap:6px; background:var(--blue-soft); color:var(--blue); border:none; border-radius:9px; padding:8px 13px; font-weight:600; font-size:13px; cursor:pointer; margin-top:10px; }
.uz-chat-toggle:hover { background:var(--blue); color:#fff; }
.uz-chat { margin-top:12px; background:var(--bg); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
.uz-chat-head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--blue-soft); font-weight:700; font-size:13px; color:var(--blue-dark); }
.uz-chat-live { color:var(--green); font-size:11px; font-weight:700; margin-left:8px; animation:uzPulse 1.5s ease-in-out infinite; }
.uz-page-title { font-family:'Manrope',sans-serif; font-weight:800; font-size:clamp(22px,3vw,32px); letter-spacing:-.02em; margin-bottom:6px; line-height:1.15; word-wrap:break-word; overflow-wrap:break-word; }
.uz-live-tag { display:inline-block; color:var(--green); font-size:13px; font-weight:700; margin-left:10px; animation:uzPulse 1.5s ease-in-out infinite; vertical-align:middle; }
@media (max-width:560px){
  .uz-live-tag { display:inline; font-size:11px; margin-left:6px; }
  .uz-page-title { font-size:20px !important; }
  .uz-tech-warnings-head { font-size:13px !important; }
  body { overflow-x:hidden; }
  .uz-warn-head { gap:6px; }
  .uz-feedback-time { font-size:11px; }
  .uz-feedback-card { padding:14px; }
  .uz-feedback-msg { font-size:13px; padding:10px 12px; }
  .uz-feedback-meta { gap:8px; font-size:12px; flex-wrap:wrap; }
  .uz-tr-actions { flex-wrap:wrap; gap:6px; }
  .uz-tr-actions button { font-size:12px; padding:8px 10px; }
  .uz-modal { padding:18px; }
  .uz-modal-title { font-size:18px; }
  .uz-warn-form { padding:14px; }
  .uz-org-banner { padding:18px; gap:12px; }
  .uz-org-banner-arrow { font-size:24px; }
  .uz-stats { gap:8px; }
  .uz-stat { padding:10px; }
  .uz-stat-num { font-size:22px; }
  .uz-stat-label { font-size:11px; }
}
@keyframes uzPulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
.uz-chat-close { background:none; border:none; color:var(--ink-soft); font-size:14px; cursor:pointer; padding:4px 8px; }
.uz-chat-close:hover { color:var(--red); }
.uz-chat-body { max-height:240px; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px; }
.uz-chat-empty { text-align:center; color:var(--ink-soft); font-size:13px; padding:14px; font-style:italic; }
.uz-chat-msg { background:#fff; border-radius:10px; padding:8px 12px; max-width:80%; align-self:flex-start; }
.uz-chat-msg.mine { background:var(--blue); color:#fff; align-self:flex-end; }
.uz-chat-from { font-size:10px; font-weight:700; opacity:.7; margin-bottom:3px; }
.uz-chat-text { font-size:13px; line-height:1.4; }
.uz-chat-ts { font-size:10px; opacity:.55; margin-top:4px; }
.uz-chat-input { display:flex; padding:10px; gap:8px; border-top:1px solid var(--line); background:#fff; }
.uz-chat-input input { flex:1; border:1px solid var(--line); border-radius:8px; padding:9px 12px; font-size:13px; outline:none; }
.uz-chat-input input:focus { border-color:var(--blue); }
.uz-chat-send { background:var(--blue); color:#fff; border:none; border-radius:8px; padding:9px 14px; font-weight:700; font-size:13px; cursor:pointer; }
.uz-chat-send:disabled { background:var(--line); color:var(--ink-soft); cursor:not-allowed; }
.uz-msg-count { font-size:12px; color:var(--blue); font-weight:700; background:var(--blue-soft); padding:3px 8px; border-radius:7px; }

/* TECH CALL CARD IMPROVED */
.uz-tech-call { border-left:4px solid var(--blue); }
.uz-tech-call--available { border-left-color:var(--green); }
.uz-tech-call--active { border-left-color:var(--gold); background:#fffdf5; }
.uz-tech-call--done { border-left-color:var(--ink-soft); }
.uz-urgent-tag { font-size:10px; font-weight:700; color:#fff; background:var(--red); padding:3px 8px; border-radius:6px; margin-left:6px; }
.uz-tech-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; margin-top:8px; font-size:13px; }
@media (max-width:560px){ .uz-tech-info-grid{grid-template-columns:1fr;} }
.uz-tech-info-item span { color:var(--ink-soft); margin-right:5px; }
.uz-tech-info-item b { color:var(--ink); font-weight:600; }

/* DETAIL BUTTON + MODAL */
.uz-modal-lg { max-width:720px !important; max-height:90vh; overflow-y:auto; }
.uz-detail-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid var(--line); }
.uz-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
@media (max-width:580px){ .uz-detail-grid{grid-template-columns:1fr;} }
.uz-detail-section { background:var(--bg); border-radius:12px; padding:14px; }
.uz-detail-section h4 { font-family:'Manrope',sans-serif; font-size:14px; font-weight:700; margin-bottom:10px; color:var(--ink); }
.uz-detail-row { display:flex; justify-content:space-between; gap:10px; font-size:13px; padding:5px 0; }
.uz-detail-row span { color:var(--ink-soft); }
.uz-detail-row b { color:var(--ink); text-align:right; }
`;
