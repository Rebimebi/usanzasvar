import React, { useState, useEffect } from 'react';

// ============ STORAGE ============
const BOOKINGS_KEY = 'usanzasvar:bookings';
const TECHS_KEY = 'usanzasvar:techs';
const SETTINGS_KEY = 'usanzasvar:settings';
const ADMIN_PASSWORD = 'My96101613@@@';

async function loadList(key) {
  try { const r = await window.storage.get(key, true); return r && r.value ? JSON.parse(r.value) : []; }
  catch { return []; }
}
async function saveList(key, list) {
  try { await window.storage.set(key, JSON.stringify(list), true); return true; } catch { return false; }
}
async function loadObj(key) {
  try { const r = await window.storage.get(key, true); return r && r.value ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function saveObj(key, obj) {
  try { await window.storage.set(key, JSON.stringify(obj), true); return true; } catch { return false; }
}

// ============ DATA ============
const DISTRICTS = [
  { name: 'Сүхбаатар', eta: 18 }, { name: 'Чингэлтэй', eta: 20 },
  { name: 'Баянгол', eta: 22 }, { name: 'Баянзүрх', eta: 28 },
  { name: 'Хан-Уул', eta: 30 }, { name: 'Сонгинохайрхан', eta: 35 }, { name: 'Налайх', eta: 55 },
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
const CALLOUT_FEE = 10000, REGISTRATION_FEE = 10000, PER_CALL_FEE = 1000, COINS_FOR_FREE_CALL = 2;
const EXPERIENCE_LEVELS = ['1 жилээс бага', '1–3 жил', '3–5 жил', '5–10 жил', '10+ жил'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = (n) => Number(n).toLocaleString('en-US');
const cleanPhone = (p) => p.replace(/\D/g, '').slice(-8);
const validPhone = (p) => cleanPhone(p).length === 8;
const fmtPhone = (p) => { const c = cleanPhone(p); return c.length === 8 ? `${c.slice(0,4)}-${c.slice(4)}` : c; };
function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 60000);
  if (d < 1) return 'дөнгөж сая'; if (d < 60) return `${d} мин өмнө`;
  if (d < 1440) return `${Math.floor(d/60)} цагийн өмнө`; return `${Math.floor(d/1440)} өдрийн өмнө`;
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
  const [activeService, setActiveService] = useState(null);
  const [toast, setToast] = useState(null);
  const [myPhone, setMyPhone] = useState(null); // customer's phone for viewing bookings
  const [techPhone, setTechPhone] = useState(null);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [settings, setSettings] = useState({ bankName: '', accountNumber: '', accountHolder: '', contactPhone: '7700-1234' });
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [materials, setMaterials] = useState(DEFAULT_MATERIALS);
  const [matOrders, setMatOrders] = useState([]);

  useEffect(() => { (async () => {
    setBookings(await loadList(BOOKINGS_KEY));
    setTechs(await loadList(TECHS_KEY));
    const s = await loadObj(SETTINGS_KEY);
    if (s) setSettings(s);
    const sv = await loadList(SERVICES_KEY);
    if (sv && sv.length) setServices(sv);
    const mt = await loadList(MATERIALS_KEY);
    if (mt && mt.length) setMaterials(mt);
    setMatOrders(await loadList(MAT_ORDERS_KEY));
  })(); }, []);

  function showToast(m) { setToast(m); setTimeout(() => setToast(null), 2800); }
  async function refreshAll() {
    setBookings(await loadList(BOOKINGS_KEY));
    setTechs(await loadList(TECHS_KEY));
    const s = await loadObj(SETTINGS_KEY);
    if (s) setSettings(s);
    const sv = await loadList(SERVICES_KEY);
    if (sv && sv.length) setServices(sv);
    const mt = await loadList(MATERIALS_KEY);
    if (mt && mt.length) setMaterials(mt);
    setMatOrders(await loadList(MAT_ORDERS_KEY));
  }

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
    const next = [o, ...matOrders];
    setMatOrders(next); await saveList(MAT_ORDERS_KEY, next);
    showToast('Материалын захиалга амжилттай');
    return o;
  }

  async function saveSettings(s) {
    setSettings(s); await saveObj(SETTINGS_KEY, s);
    showToast('Банкны данс хадгалагдлаа');
  }
  async function creditTech(phone, amount) {
    const next = techs.map(t => t.phone === phone ? { ...t, balance: (t.balance || 0) + amount } : t);
    setTechs(next); await saveList(TECHS_KEY, next);
    const t = next.find(x => x.phone === phone);
    showToast(`${t.name}-ийн үлдэгдэлд ₮${fmt(amount)} нэмэгдлээ`);
  }

  // ---- Customer booking (no account — name + phone at booking) ----
  async function createBooking(data) {
    const booking = {
      id: uid(), ...data, customerName: data.customerName,
      createdAt: Date.now(), status: 'Сантехникч хайж байна',
      code: 'УЗ-' + Math.floor(1000 + Math.random() * 9000),
      techPhone: null, techName: null, accepted: false,
      completed: false, onTime: null, rating: null, coinAwarded: false,
      disputed: false, disputeReason: null, feeRefunded: false,
      adminArrivalTime: null, extraWaitNote: null,
    };
    const next = [booking, ...bookings];
    setBookings(next); await saveList(BOOKINGS_KEY, next);
    setMyPhone(cleanPhone(data.phone));
    showToast('Дуудлага амжилттай бүртгэгдлээ'); setView('mybookings');
  }
  async function rateBooking(bookingId, rating) {
    let next = bookings.map(b => b.id === bookingId ? { ...b, rating } : b);
    const b = next.find(x => x.id === bookingId);
    const techsNow = await loadList(TECHS_KEY);
    let updatedTechs = techsNow;
    if (b && b.techPhone) {
      const giveCoin = b.onTime && rating >= 4 && !b.coinAwarded;
      updatedTechs = techsNow.map(t => t.phone === b.techPhone ? {
        ...t, ratingSum: (t.ratingSum || 0) + rating, ratingCount: (t.ratingCount || 0) + 1,
        coins: (t.coins || 0) + (giveCoin ? 1 : 0),
      } : t);
      if (giveCoin) next = next.map(x => x.id === bookingId ? { ...x, coinAwarded: true } : x);
      await saveList(TECHS_KEY, updatedTechs); setTechs(updatedTechs);
    }
    setBookings(next); await saveList(BOOKINGS_KEY, next);
    showToast('Үнэлгээ илгээгдлээ. Баярлалаа!');
  }
  async function disputeBooking(bookingId, reason) {
    const next = bookings.map(b => b.id === bookingId
      ? { ...b, disputed: true, disputeReason: reason, feeRefunded: true, status: 'Гомдолтой · төлбөр буцаагдсан' } : b);
    setBookings(next); await saveList(BOOKINGS_KEY, next);
    const b = next.find(x => x.id === bookingId);
    if (b && b.techPhone) {
      const techsNow = await loadList(TECHS_KEY);
      const updated = techsNow.map(t => t.phone === b.techPhone ? { ...t, complaints: (t.complaints || 0) + 1 } : t);
      await saveList(TECHS_KEY, updated); setTechs(updated);
    }
    showToast('Гомдол хүлээн авлаа. Дуудлагын төлбөр буцаагдсан');
  }

  // ---- Technician ----
  async function registerTech(data) {
    if (techs.some(t => t.phone === cleanPhone(data.phone)))
      return { err: 'Энэ утасны дугаар аль хэдийн бүртгэлтэй байна' };
    const tech = {
      phone: cleanPhone(data.phone), password: data.password, name: data.name, experience: data.experience,
      serviceArea: data.serviceArea, about: data.about, specialties: data.specialties,
      registeredAt: Date.now(), balance: 0, coins: 0, approved: false,
      completedCount: 0, onTimeCount: 0, ratingSum: 0, ratingCount: 0, complaints: 0, blocked: false,
    };
    const next = [tech, ...techs.filter(t => t.phone !== tech.phone)];
    setTechs(next); await saveList(TECHS_KEY, next);
    setTechPhone(tech.phone); showToast('Бүртгэл хүлээн авлаа! Төлбөр баталгаажсаны дараа идэвхжинэ'); setView('techdash');
    return {};
  }
  function techLogin(phone, password) {
    const t = techs.find(x => x.phone === cleanPhone(phone));
    if (!t) return 'notfound';
    if (t.password !== password) return 'wrongpass';
    setTechPhone(t.phone); setView('techdash');
    return t.blocked ? 'blocked' : 'ok';
  }
  async function updateTech(phone, updater) {
    const next = techs.map(t => t.phone === phone ? updater(t) : t);
    setTechs(next); await saveList(TECHS_KEY, next);
  }
  async function acceptCall(booking, payMethod) {
    const tech = techs.find(t => t.phone === techPhone); if (!tech) return;
    if (payMethod === 'money' && tech.balance < PER_CALL_FEE) { showToast('Үлдэгдэл хүрэлцэхгүй байна'); return; }
    if (payMethod === 'coin' && (tech.coins || 0) < COINS_FOR_FREE_CALL) { showToast('Coin хүрэлцэхгүй байна'); return; }
    await updateTech(techPhone, t => payMethod === 'money' ? { ...t, balance: t.balance - PER_CALL_FEE } : { ...t, coins: t.coins - COINS_FOR_FREE_CALL });
    const next = bookings.map(b => b.id === booking.id ? { ...b, techPhone, techName: tech.name, accepted: true, payMethod, status: 'Сантехникч замдаа' } : b);
    setBookings(next); await saveList(BOOKINGS_KEY, next);
    showToast(payMethod === 'money' ? `Дуудлага авлаа (−${fmt(PER_CALL_FEE)}₮)` : `Дуудлага авлаа (−${COINS_FOR_FREE_CALL} coin)`);
  }
  async function completeCall(booking, onTime) {
    const next = bookings.map(b => b.id === booking.id ? { ...b, completed: true, onTime, status: onTime ? 'Дууссан (цагтаа)' : 'Дууссан (хоцорсон)' } : b);
    setBookings(next); await saveList(BOOKINGS_KEY, next);
    await updateTech(techPhone, t => ({ ...t, completedCount: (t.completedCount || 0) + 1, onTimeCount: (t.onTimeCount || 0) + (onTime ? 1 : 0) }));
    showToast('Дуудлага дууссан. Хэрэглэгчийн үнэлгээг хүлээнэ');
  }

  // ---- Admin ----
  async function toggleBlock(phone) {
    const next = techs.map(t => t.phone === phone ? { ...t, blocked: !t.blocked } : t);
    setTechs(next); await saveList(TECHS_KEY, next);
    const t = next.find(x => x.phone === phone);
    showToast(t.blocked ? `${t.name} блоклогдлоо` : `${t.name}-ийн блок цуцлагдлаа`);
  }
  async function approveTech(phone) {
    const next = techs.map(t => t.phone === phone ? { ...t, approved: true } : t);
    setTechs(next); await saveList(TECHS_KEY, next);
    const t = next.find(x => x.phone === phone);
    showToast(`${t.name}-д нэвтрэх эрх олголоо`);
  }
  async function rejectTech(phone) {
    const t = techs.find(x => x.phone === phone);
    const next = techs.filter(x => x.phone !== phone);
    setTechs(next); await saveList(TECHS_KEY, next);
    showToast(`${t ? t.name : 'Сантехникч'}-ийн бүртгэл буцаагдлаа`);
  }
  async function setArrivalTime(bookingId, time) {
    const next = bookings.map(b => b.id === bookingId
      ? { ...b, adminArrivalTime: time, status: b.accepted ? b.status : 'Очих цаг тогтоогдсон' } : b);
    setBookings(next); await saveList(BOOKINGS_KEY, next);
    showToast('Очих цаг хэрэглэгчид мэдэгдлээ');
  }
  async function setExtraWait(bookingId, note) {
    const next = bookings.map(b => b.id === bookingId
      ? { ...b, extraWaitNote: note, status: 'Нэмэлт хугацаа мэдэгдсэн' } : b);
    setBookings(next); await saveList(BOOKINGS_KEY, next);
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
        <Home services={services} onBook={(s) => { setActiveService(s); setView('booking'); }} />
      )}
      {mode === 'customer' && view === 'booking' && (
        <Booking service={activeService} onCancel={() => setView('home')} onSubmit={createBooking} />
      )}
      {mode === 'customer' && view === 'mybookings' && (
        <MyBookings bookings={myBookings} hasPhone={!!myPhone} onLookup={(p) => setMyPhone(cleanPhone(p))} onNew={() => setView('home')} onRate={rateBooking} onDispute={disputeBooking} />
      )}
      {mode === 'customer' && view === 'materials' && (
        <Materials materials={materials} onOrder={placeMaterialOrder} onBack={() => setView('home')} />
      )}

      {/* TECHNICIAN */}
      {mode === 'tech' && view === 'techentry' && (
        <TechEntry onRegister={() => setView('techreg')} onLogin={techLogin} />
      )}
      {mode === 'tech' && view === 'techreg' && (
        <TechRegister settings={settings} services={services} onCancel={() => setView('techentry')} onSubmit={registerTech} />
      )}
      {mode === 'tech' && view === 'techdash' && currentTech && (
        currentTech.blocked
          ? <TechBlocked tech={currentTech} onBack={() => { setTechPhone(null); setView('techentry'); }} />
          : currentTech.approved === false
            ? <TechPending tech={currentTech} settings={settings} onRefresh={refreshAll} onBack={() => { setTechPhone(null); setView('techentry'); }} />
            : <TechDashboard tech={currentTech} bookings={bookings} settings={settings} onAccept={acceptCall} onComplete={completeCall} onRefresh={refreshAll} />
      )}

      {/* ADMIN */}
      {mode === 'admin' && !adminAuthed && (
        <AdminLogin onAuth={() => { setAdminAuthed(true); refreshAll(); }} />
      )}
      {mode === 'admin' && adminAuthed && (
        <AdminDashboard techs={techs} bookings={bookings} settings={settings} services={services} materials={materials} matOrders={matOrders} onToggleBlock={toggleBlock} onApproveTech={approveTech} onRejectTech={rejectTech} onSetArrival={setArrivalTime} onSetExtraWait={setExtraWait} onSaveSettings={saveSettings} onCreditTech={creditTech} onSaveServices={saveServices} onSaveMaterials={saveMaterials} onRefresh={refreshAll} />
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
        <div className="uz-mode-switch">
          <button className={`uz-mode-btn ${mode === 'customer' ? 'active' : ''}`} onClick={() => setMode('customer')}>Хэрэглэгч</button>
          <button className={`uz-mode-btn ${mode === 'tech' ? 'active' : ''}`} onClick={() => setMode('tech')}>Сантехникч</button>
          <button className={`uz-mode-btn ${mode === 'admin' ? 'active' : ''}`} onClick={() => setMode('admin')}>Админ</button>
        </div>
        <nav className="uz-nav">
          {mode === 'customer' && (
            <>
              <button className={`uz-nav-link ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>Үйлчилгээ</button>
              <button className={`uz-nav-link ${view === 'materials' ? 'active' : ''}`} onClick={() => setView('materials')}>Материал</button>
              <button className={`uz-nav-link ${view === 'mybookings' ? 'active' : ''}`} onClick={() => setView('mybookings')}>
                Дуудлага {myCount > 0 && <span className="uz-badge">{myCount}</span>}
              </button>
            </>
          )}
          {mode === 'tech' && isTechLoggedIn && (
            <button className={`uz-nav-link ${view === 'techdash' ? 'active' : ''}`} onClick={() => setView('techdash')}>Самбар</button>
          )}
        </nav>
      </div>
    </header>
  );
}

// ============ HOME ============
function Home({ services, onBook }) {
  const [district, setDistrict] = useState(DISTRICTS[0]);
  const [cat, setCat] = useState('Бүгд');
  const cats = ['Бүгд', ...Array.from(new Set(services.map(s => s.cat)))];
  const list = cat === 'Бүгд' ? services : services.filter(s => s.cat === cat);
  const availableTechs = 4 + (district.eta < 25 ? 2 : 0);
  return (
    <>
      <section className="uz-hero">
        <div className="uz-hero-inner">
          <div className="uz-live-badge"><span className="uz-live-dot" /> Одоо ажиллаж байна · 24/7</div>
          <h1 className="uz-hero-title">Сантехникийн асуудлыг<br/><span className="uz-hl">тэр даруй</span> шийдье</h1>
          <p className="uz-hero-sub">Ил тод үнэ, тогтсон хугацаа. Захиалга өгөхөөсөө өмнө үнэ болон сантехникч хэдэн минутын дотор ирэхийг харна.</p>
          <div className="uz-eta-picker">
            <div className="uz-eta-field"><label>Таны байршил</label>
              <select value={district.name} onChange={e => setDistrict(DISTRICTS.find(d => d.name === e.target.value))}>
                {DISTRICTS.map(d => <option key={d.name} value={d.name}>{d.name} дүүрэг</option>)}
              </select></div>
            <div className="uz-eta-result">
              <div className="uz-eta-block"><div className="uz-eta-num">~{district.eta}<span>мин</span></div><div className="uz-eta-label">ойролцоогоор ирнэ</div></div>
              <div className="uz-eta-divider" />
              <div className="uz-eta-block"><div className="uz-eta-num uz-eta-num--green">{availableTechs}</div><div className="uz-eta-label">сантехникч сул байна</div></div>
            </div>
          </div>
          <div className="uz-trust-row"><span>✓ Дуудлагын хураамж {fmt(CALLOUT_FEE)}₮-өөс</span><span>✓ Баталгаат засвар</span><span>✓ Ажил дутуу бол төлбөр буцаана</span></div>
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
                <div className="uz-price"><span className="uz-price-from">{s.priceMax ? 'Үнэ' : 'Эхлэх үнэ'}</span>
                  <span className="uz-price-val">₮{fmt(s.priceMin)}{s.priceMax ? ` – ${fmt(s.priceMax)}` : '+'}</span></div>
                <button className="uz-book-btn" onClick={() => onBook(s)}>Дуудах →</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ============ MATERIALS SHOP (customer) ============
function Materials({ materials, onOrder, onBack }) {
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
    return (
      <div className="uz-page">
        <div className="uz-empty">
          <div className="uz-empty-icon">📦</div>
          <div className="uz-empty-title">Захиалга баталгаажлаа</div>
          <div className="uz-empty-sub">Захиалгын дугаар: <b>{done.code}</b><br/>Бид удахгүй танай дугаар луу залгаж хүргэлтийг зохицуулна.</div>
          <button className="uz-confirm-btn" style={{ marginTop: 22, maxWidth: 240 }} onClick={() => { setDone(null); onBack(); }}>Дуусгах</button>
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
function Booking({ service, onCancel, onSubmit }) {
  const [district, setDistrict] = useState(DISTRICTS[0]);
  const [custName, setCustName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [when, setWhen] = useState('now');
  const [schedTime, setSchedTime] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  function submit() {
    if (!custName.trim()) return setErr('Нэрээ оруулна уу');
    if (!address.trim()) return setErr('Дэлгэрэнгүй хаягаа оруулна уу');
    if (!validPhone(phone)) return setErr('Холбоо барих 8 оронтой утас оруулна уу');
    if (when === 'schedule' && !schedTime) return setErr('Цагаа сонгоно уу');
    setErr('');
    onSubmit({ serviceId: service.id, serviceName: service.name, serviceIcon: service.icon, priceMin: service.priceMin, priceMax: service.priceMax, district: district.name, eta: district.eta, customerName: custName.trim(), address: address.trim(), phone, when, schedTime, note: note.trim() });
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
            <select value={district.name} onChange={e => setDistrict(DISTRICTS.find(d => d.name === e.target.value))}>
              {DISTRICTS.map(d => <option key={d.name} value={d.name}>{d.name} (~{d.eta} мин)</option>)}</select></div>
          <div className="uz-field"><label>Дэлгэрэнгүй хаяг *</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Хороо, байр, орц, тоот..." /></div>
          <div className="uz-field"><label>Холбоо барих утас *</label>
            <div className="uz-phone-input"><span className="uz-phone-prefix">+976</span>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9911-2233" /></div></div>
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
              <div className="uz-summary-row"><span>Үйлчилгээний үнэ</span><span>₮{fmt(service.priceMin)}{service.priceMax ? `–${fmt(service.priceMax)}` : '+'}</span></div>
              <div className="uz-summary-row"><span>Дуудлагын хураамж</span><span>₮{fmt(CALLOUT_FEE)}</span></div>
              <div className="uz-summary-row uz-summary-row--eta"><span>Ирэх хугацаа</span><span className="uz-summary-eta">~{district.eta} мин</span></div>
            </div>
            <div className="uz-summary-total"><span>Нийт (ойролцоо)</span>
              <span className="uz-total-val">₮{fmt(service.priceMin + CALLOUT_FEE)}{service.priceMax ? `–${fmt(service.priceMax + CALLOUT_FEE)}` : '+'}</span></div>
            <button className="uz-confirm-btn" onClick={submit}>Дуудлага баталгаажуулах</button>
            <p className="uz-summary-note">Ажил дутуу эсвэл сантехникч цагтаа ирээгүй бол дуудлагын хураамжаа буцааж авах боломжтой.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============ MY BOOKINGS ============
function MyBookings({ bookings, hasPhone, onLookup, onNew, onRate, onDispute }) {
  const [lookupPhone, setLookupPhone] = useState('');
  if (!hasPhone) {
    return (
      <div className="uz-page">
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
    return (<div className="uz-page"><div className="uz-empty"><div className="uz-empty-icon">📭</div><div className="uz-empty-title">Дуудлага алга байна</div>
      <button className="uz-confirm-btn" style={{ marginTop: 20, maxWidth: 240 }} onClick={onNew}>Шинэ дуудлага өгөх</button></div></div>);
  }
  return (<div className="uz-page"><h1 className="uz-page-title">Миний дуудлага</h1>
    <div className="uz-bookings">{bookings.map(b => <CustomerBookingCard key={b.id} b={b} onRate={onRate} onDispute={onDispute} />)}</div></div>);
}

function CustomerBookingCard({ b, onRate, onDispute }) {
  const arriveAt = b.createdAt + b.eta * 60000;
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((arriveAt - Date.now()) / 60000)));
  const [rating, setRating] = useState(0);
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
        <div className="uz-bc-info">📍 {b.district} дүүрэг · {b.address}</div>
        {b.techName && <div className="uz-bc-info">👷 {b.techName} · +976 {fmtPhone(b.techPhone)}</div>}
        {b.note && <div className="uz-bc-note">"{b.note}"</div>}
        <div className="uz-bc-bottom">
          <span className={`uz-status ${b.disputed ? 'uz-status--dispute' : isEnRoute ? 'uz-status--active' : b.completed ? 'uz-status--done' : ''}`}>
            {isEnRoute && <span className="uz-status-dot" />}{b.status}
          </span>
          <span className="uz-bc-time">{timeAgo(b.createdAt)}</span>
        </div>
        {b.feeRefunded && <div className="uz-refund-note">💸 Дуудлагын хураамж ₮{fmt(CALLOUT_FEE)} буцаагдсан</div>}

        {b.adminArrivalTime && !b.completed && !b.disputed && (
          <div className="uz-arrival-note">🕐 Очих цаг: <b>{b.adminArrivalTime}</b></div>
        )}
        {b.extraWaitNote && !b.completed && !b.disputed && (
          <div className="uz-extrawait-note">ℹ {b.extraWaitNote}</div>
        )}

        {/* Rating */}
        {b.completed && !b.disputed && b.rating == null && (
          <div className="uz-rate-box">
            <span className="uz-rate-label">Үнэлгээ:</span>
            <div className="uz-stars">{[1,2,3,4,5].map(s => <button key={s} className={`uz-star ${rating >= s ? 'on' : ''}`} onClick={() => setRating(s)}>★</button>)}</div>
            <button className="uz-rate-submit" disabled={!rating} onClick={() => onRate(b.id, rating)}>Илгээх</button>
          </div>
        )}
        {b.rating != null && <div className="uz-rated">Таны үнэлгээ: {'★'.repeat(b.rating)}{'☆'.repeat(5 - b.rating)}</div>}

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
      </div>
      {b.accepted && b.when === 'now' && !b.completed && !b.disputed && (
        <div className="uz-bc-eta">{remaining > 0 ? (<><div className="uz-bc-eta-num">{remaining}</div><div className="uz-bc-eta-label">минут</div></>) : (<div className="uz-bc-arrived">✓<br/>Ирсэн</div>)}</div>
      )}
    </div>
  );
}

// ============ TECH ENTRY / REGISTER / BLOCKED ============
function TechEntry({ onRegister, onLogin }) {
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [err, setErr] = useState('');
  function doLogin() {
    if (!validPhone(loginPhone)) return setErr('8 оронтой дугаар оруулна уу');
    if (!loginPass) return setErr('Нууц үгээ оруулна уу');
    const r = onLogin(loginPhone, loginPass);
    if (r === 'notfound') setErr('Энэ дугаараар бүртгэл олдсонгүй');
    else if (r === 'wrongpass') setErr('Нууц үг буруу байна');
  }
  return (
    <div className="uz-page">
      <div className="uz-tech-hero">
        <h1 className="uz-page-title" style={{ marginBottom: 8 }}>Сантехникчээр ажиллах</h1>
        <p className="uz-section-sub" style={{ marginBottom: 28 }}>Дуудлага хүлээж авч, цагтаа очиж, орлогоо нэмэгдүүл.</p>
        <div className="uz-tech-perks">
          <div className="uz-perk"><div className="uz-perk-icon">💰</div><div><b>Тогтмол дуудлага</b><span>Платформоор дамжуулан дуудлага хүлээн авна</span></div></div>
          <div className="uz-perk"><div className="uz-perk-icon">🪙</div><div><b>Coin шагнал</b><span>Цагтаа очиж сайн үнэлгээ авбал coin цуглуулна</span></div></div>
          <div className="uz-perk"><div className="uz-perk-icon">🎁</div><div><b>Үнэгүй дуудлага</b><span>{COINS_FOR_FREE_CALL} coin = 1 дуудлага хураамжгүй</span></div></div>
        </div>
        <div className="uz-tech-fees">
          <div className="uz-fee-item"><span>Бүртгэлийн хураамж</span><b>{fmt(REGISTRATION_FEE)}₮</b><small>нэг удаа</small></div>
          <div className="uz-fee-item"><span>Дуудлага бүрийн хураамж</span><b>{fmt(PER_CALL_FEE)}₮</b><small>эсвэл {COINS_FOR_FREE_CALL} coin</small></div>
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
  return (
    <div className="uz-page"><div className="uz-pending">
      <div className="uz-pending-icon">⏳</div>
      <h2 className="uz-pending-title">Төлбөр хүлээгдэж байна</h2>
      <p className="uz-pending-text">
        Сайн уу, {tech.name}. Таны бүртгэл амжилттай үүссэн. Нэвтрэх эрх идэвхжихийн тулд
        бүртгэлийн <b>{fmt(REGISTRATION_FEE)}₮</b> хураамжаа доорх данс руу шилжүүлээд,
        гүйлгээний утганд утасны дугаараа ({fmtPhone(tech.phone)}) бичнэ үү.
        Админ төлбөрийг баталгаажуулсны дараа эрх нээгдэнэ.
      </p>
      {hasBank ? (
        <div className="uz-bank-box uz-bank-box--lg" style={{ textAlign: 'left', maxWidth: 360, margin: '0 auto 20px' }}>
          <div><span>Банк:</span> <b>{settings.bankName}</b></div>
          <div><span>Данс:</span> <b>{settings.accountNumber}</b></div>
          <div><span>Эзэмшигч:</span> <b>{settings.accountHolder}</b></div>
          <div className="uz-bank-divider" />
          <div><span>Гүйлгээний утга:</span> <b>{fmtPhone(tech.phone)}</b></div>
        </div>
      ) : (
        <div className="uz-bank-empty" style={{ maxWidth: 360, margin: '0 auto 20px' }}>Админ данс хараахан тохируулаагүй байна.</div>
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
            <span>Бүртгэлийн <b>{fmt(REGISTRATION_FEE)}₮</b>, дуудлага бүрийн <b>{fmt(PER_CALL_FEE)}₮</b> (эсвэл {COINS_FOR_FREE_CALL} coin) хураамжийг зөвшөөрч байна.</span></label>
        </div>
        <div className="uz-pay-warn">
          📌 <b>Анхаар:</b> Бүртгэлийн {fmt(REGISTRATION_FEE)}₮ хураамжаа доорх данс руу шилжүүлээд, <b>гүйлгээний утганд бүртгүүлсэн утасны дугаараа</b> (таны нэвтрэх нэр) заавал бичнэ үү. Админ баталгаажуулсны дараа бүртгэл идэвхжинэ.
          {settings && settings.accountNumber ? (
            <div className="uz-bank-box">
              <div><span>Банк:</span> <b>{settings.bankName}</b></div>
              <div><span>Данс:</span> <b>{settings.accountNumber}</b></div>
              <div><span>Эзэмшигч:</span> <b>{settings.accountHolder}</b></div>
            </div>
          ) : (
            <div className="uz-bank-empty">Админ данс хараахан тохируулаагүй байна.</div>
          )}
        </div>
        {err && <div className="uz-error">{err}</div>}
        <button className="uz-confirm-btn" onClick={submit}>Бүртгэл дуусгах · {fmt(REGISTRATION_FEE)}₮ төлөх</button>
        <p className="uz-summary-note">Бодит төлбөр хийгдсэний дараа бүртгэл идэвхжинэ.</p>
      </div>
    </div>
  );
}

// ============ TECH DASHBOARD ============
function TechDashboard({ tech, bookings, settings, onAccept, onComplete, onRefresh }) {
  const [tab, setTab] = useState('available');
  const [acceptModal, setAcceptModal] = useState(null);
  const [showTopup, setShowTopup] = useState(false);
  const matchesSpec = (b) => tech.specialties.includes(b.serviceId);
  const available = bookings.filter(b => !b.accepted && !b.completed && !b.disputed && matchesSpec(b));
  const active = bookings.filter(b => b.accepted && !b.completed && b.techPhone === tech.phone);
  const done = bookings.filter(b => b.completed && b.techPhone === tech.phone);
  const onTimeRate = tech.completedCount ? Math.round((tech.onTimeCount / tech.completedCount) * 100) : 0;
  const avgRating = tech.ratingCount ? (tech.ratingSum / tech.ratingCount).toFixed(1) : '—';
  const freeCallsAvailable = Math.floor((tech.coins || 0) / COINS_FOR_FREE_CALL);
  return (
    <div className="uz-page">
      <div className="uz-dash-head">
        <div><h1 className="uz-page-title" style={{ marginBottom: 4 }}>Сайн уу, {tech.name} 👷</h1>
          <p className="uz-section-sub">{tech.experience} туршлага · +976 {fmtPhone(tech.phone)}{(tech.complaints || 0) > 0 ? ` · ⚠ ${tech.complaints} гомдол` : ''}</p></div>
        <button className="uz-refresh-btn" onClick={onRefresh}>↻ Шинэчлэх</button>
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
      <div className="uz-dash-tabs">
        <button className={`uz-dash-tab ${tab === 'available' ? 'active' : ''}`} onClick={() => setTab('available')}>Шинэ {available.length > 0 && <span className="uz-badge">{available.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Идэвхтэй {active.length > 0 && <span className="uz-badge">{active.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>Дууссан</button>
      </div>
      {tab === 'available' && (available.length === 0 ? <div className="uz-empty-sm">Одоогоор шинэ дуудлага алга. ↻ Шинэчлэх дарж шалгаарай.</div>
        : <div className="uz-bookings">{available.map(b => <TechCallCard key={b.id} b={b} type="available" onAccept={() => setAcceptModal(b)} />)}</div>)}
      {tab === 'active' && (active.length === 0 ? <div className="uz-empty-sm">Идэвхтэй дуудлага алга.</div>
        : <div className="uz-bookings">{active.map(b => <TechCallCard key={b.id} b={b} type="active" onComplete={onComplete} />)}</div>)}
      {tab === 'done' && (done.length === 0 ? <div className="uz-empty-sm">Дууссан дуудлага алга.</div>
        : <div className="uz-bookings">{done.map(b => <TechCallCard key={b.id} b={b} type="done" />)}</div>)}
      {acceptModal && <AcceptModal b={acceptModal} tech={tech} onClose={() => setAcceptModal(null)} onConfirm={(m) => { onAccept(acceptModal, m); setAcceptModal(null); }} />}
      {showTopup && <TopupModal tech={tech} settings={settings} onClose={() => setShowTopup(false)} />}
    </div>
  );
}

function TechCallCard({ b, type, onAccept, onComplete }) {
  return (
    <div className="uz-booking-card">
      <div className="uz-bc-left"><span className="uz-bc-icon">{b.serviceIcon}</span></div>
      <div className="uz-bc-body">
        <div className="uz-bc-top"><h3 className="uz-bc-name">{b.serviceName}</h3><span className="uz-bc-code">{b.code}</span></div>
        <div className="uz-bc-info">📍 {b.district} дүүрэг · {b.address}</div>
        <div className="uz-bc-info">📞 +976 {fmtPhone(b.phone)}</div>
        <div className="uz-bc-info">💵 ₮{fmt(b.priceMin)}{b.priceMax ? `–${fmt(b.priceMax)}` : '+'} · {b.when === 'now' ? '⚡ Яаралтай' : '📅 Товлосон'}</div>
        {b.note && <div className="uz-bc-note">"{b.note}"</div>}
        {type === 'done' && (<div className="uz-bc-bottom">
          <span className={`uz-status ${b.disputed ? 'uz-status--dispute' : b.onTime ? 'uz-status--done' : ''}`}>{b.disputed ? 'Гомдолтой' : b.status}</span>
          {b.rating != null ? <span className="uz-bc-rating">{'★'.repeat(b.rating)}{b.coinAwarded ? ' · +1🪙' : ''}</span> : !b.disputed && <span className="uz-bc-time">үнэлгээ хүлээж байна</span>}
        </div>)}
      </div>
      <div className="uz-bc-action">
        {type === 'available' && <button className="uz-accept-btn" onClick={onAccept}>Хүлээж авах</button>}
        {type === 'active' && (<div className="uz-complete-group"><span className="uz-complete-q">Дуусгах:</span>
          <button className="uz-ontime-btn" onClick={() => onComplete(b, true)}>✓ Цагтаа</button>
          <button className="uz-late-btn" onClick={() => onComplete(b, false)}>Хоцорсон</button></div>)}
      </div>
    </div>
  );
}

function AcceptModal({ b, tech, onClose, onConfirm }) {
  const canCoin = (tech.coins || 0) >= COINS_FOR_FREE_CALL;
  const canMoney = tech.balance >= PER_CALL_FEE;
  return (
    <div className="uz-modal-overlay" onClick={onClose}>
      <div className="uz-modal" onClick={e => e.stopPropagation()}>
        <h3 className="uz-modal-title">Дуудлага хүлээж авах</h3>
        <p className="uz-modal-sub">{b.serviceName} · {b.district}</p>
        <p className="uz-modal-text">Хураамжийн төрлийг сонгоно уу:</p>
        <button className="uz-pay-option" disabled={!canMoney} onClick={() => onConfirm('money')}><span>💳 Үлдэгдлээс төлөх</span><b>−{fmt(PER_CALL_FEE)}₮</b>{!canMoney && <small>Үлдэгдэл хүрэлцэхгүй</small>}</button>
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
function AdminLogin({ onAuth }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  function submit() { if (pw.trim() === ADMIN_PASSWORD) onAuth(); else setErr('Нууц үг буруу байна'); }
  return (
    <div className="uz-auth-page">
      <div className="uz-auth-card">
        <div className="uz-auth-logo"><span className="uz-logo-icon">🛡️</span><span className="uz-logo-text">Админ удирдлага</span></div>
        <p className="uz-auth-tagline">Зөвхөн эрх бүхий хүн нэвтэрнэ</p>
        <div className="uz-field"><label>Админ нууц үг</label>
          <PasswordField value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && submit()} autoFocus /></div>
        {err && <div className="uz-error">{err}</div>}
        <button className="uz-confirm-btn" onClick={submit}>Нэвтрэх</button>
        <p className="uz-summary-note">Зөвхөн эрх бүхий хүн нэвтрэх боломжтой</p>
      </div>
    </div>
  );
}

function AdminDashboard({ techs, bookings, settings, services, materials, matOrders, onToggleBlock, onApproveTech, onRejectTech, onSetArrival, onSetExtraWait, onSaveSettings, onCreditTech, onSaveServices, onSaveMaterials, onRefresh }) {
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
        <button className="uz-refresh-btn" onClick={onRefresh}>↻ Шинэчлэх</button>
      </div>

      <div className="uz-stats uz-stats--admin">
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
        <button className={`uz-dash-tab ${tab === 'bookings' ? 'active' : ''}`} onClick={() => setTab('bookings')}>Дуудлага</button>
        <button className={`uz-dash-tab ${tab === 'disputes' ? 'active' : ''}`} onClick={() => setTab('disputes')}>Гомдол {disputes.length > 0 && <span className="uz-badge" style={{ background: '#c0392b' }}>{disputes.length}</span>}</button>
        <button className={`uz-dash-tab ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>Үйлчилгээ</button>
        <button className={`uz-dash-tab ${tab === 'materials' ? 'active' : ''}`} onClick={() => setTab('materials')}>Материал {matOrders.length > 0 && <span className="uz-badge">{matOrders.length}</span>}</button>
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
                        <CreditControl onCredit={(amt) => onCreditTech(t.phone, amt)} />
                        <button className={`uz-block-btn ${t.blocked ? 'unblock' : ''}`} onClick={() => onToggleBlock(t.phone)}>
                          {t.blocked ? 'Блок цуцлах' : 'Блоклох'}
                        </button>
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
                <div className="uz-bc-info">👤 {b.customerName} · 📍 {b.district} · {b.address}</div>
                <div className="uz-bc-info">👷 {b.techName || '— хараахан аваагүй'} {b.techPhone ? `· +976 ${fmtPhone(b.techPhone)}` : ''}</div>
                <div className="uz-bc-bottom">
                  <span className={`uz-status ${b.disputed ? 'uz-status--dispute' : b.completed ? 'uz-status--done' : ''}`}>{b.status}</span>
                  {b.rating != null && <span className="uz-bc-rating">{'★'.repeat(b.rating)}</span>}
                  <span className="uz-bc-time">{timeAgo(b.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}</div>
        )
      )}

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
                <div className="uz-refund-note">💸 ₮{fmt(CALLOUT_FEE)} буцаагдсан</div>
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
      {tab === 'settings' && (
        <BankSettings settings={settings} onSave={onSaveSettings} />
      )}
    </div>
  );
}

// ============ BANK SETTINGS (admin) ============
function BankSettings({ settings, onSave }) {
  const [bankName, setBankName] = useState(settings?.bankName || '');
  const [accountNumber, setAccountNumber] = useState(settings?.accountNumber || '');
  const [accountHolder, setAccountHolder] = useState(settings?.accountHolder || '');
  const [contactPhone, setContactPhone] = useState(settings?.contactPhone || '');
  const [err, setErr] = useState('');
  function save() {
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) return setErr('Банкны бүх талбарыг бөглөнө үү');
    setErr('');
    onSave({ bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountHolder: accountHolder.trim(), contactPhone: contactPhone.trim() });
  }
  return (
    <div className="uz-settings">
      <h3 className="uz-settings-title">📞 Холбоо барих утас</h3>
      <p className="uz-settings-sub">Энэ дугаар сайтын хамгийн доод хэсэгт хэрэглэгчдэд харагдана.</p>
      <div className="uz-settings-form" style={{ marginBottom: 28 }}>
        <div className="uz-field"><label>Холбогдох утасны дугаар</label>
          <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Жишээ: 7700-1234" /></div>
      </div>
      <h3 className="uz-settings-title">💳 Хүлээн авах банкны данс</h3>
      <p className="uz-settings-sub">Сантехникчид бүртгэл болон үлдэгдлийн хураамжаа энэ данс руу шилжүүлнэ. Мөнгө орсны дараа та сантехникчийн үлдэгдлийг гараар нэмнэ.</p>
      <div className="uz-settings-form">
        <div className="uz-field"><label>Банкны нэр</label>
          <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Жишээ: Хаан банк" /></div>
        <div className="uz-field"><label>Дансны дугаар</label>
          <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Жишээ: 5012345678" /></div>
        <div className="uz-field"><label>Данс эзэмшигчийн нэр</label>
          <input value={accountHolder} onChange={e => setAccountHolder(e.target.value)} placeholder="Жишээ: Б.Болд" /></div>
        {err && <div className="uz-error">{err}</div>}
        <button className="uz-confirm-btn" onClick={save}>Хадгалах</button>
      </div>
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
              <label>Үнэ доод (₮)<input type="number" value={s.priceMin ?? ''} onChange={e => updateNum(i, 'priceMin', e.target.value)} /></label>
              <label>Үнэ дээд (₮)<input type="number" value={s.priceMax ?? ''} onChange={e => updateNum(i, 'priceMax', e.target.value)} placeholder="хоосон = +" /></label>
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
function CreditControl({ onCredit }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    onCredit(amt); setAmount(''); setOpen(false);
  }
  if (!open) return <button className="uz-credit-toggle" onClick={() => setOpen(true)}>+ Үлдэгдэл</button>;
  return (
    <div className="uz-credit-box">
      <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₮ дүн" autoFocus
        onKeyDown={e => e.key === 'Enter' && submit()} />
      <button className="uz-credit-ok" onClick={submit}>Нэмэх</button>
      <button className="uz-credit-cancel" onClick={() => { setOpen(false); setAmount(''); }}>✕</button>
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

// ============ FOOTER ============
function Footer({ settings }) {
  const phone = (settings && settings.contactPhone) || '7700-1234';
  const telHref = 'tel:' + phone.replace(/\D/g, '');
  return (
    <footer className="uz-footer">
      <div className="uz-footer-inner">
        <div className="uz-logo"><span className="uz-logo-icon">💧</span><span className="uz-logo-text">Ус<span className="uz-logo-accent">Засвар</span></span></div>
        <div className="uz-footer-text">24 цагийн дуудлагын сантехникийн үйлчилгээ · Улаанбаатар</div>
        <a href={telHref} className="uz-footer-phone">📞 {phone}</a>
      </div>
    </footer>
  );
}

// ============ STYLES ============
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Manrope:wght@400;500;600;700&display=swap');
.uz * { margin:0; padding:0; box-sizing:border-box; }
.uz { --bg:#f4f8fd; --ink:#0d1b2e; --ink-soft:#5a6a82; --blue:#0a6cff; --blue-dark:#0852c4; --blue-soft:#e4eefe; --blue-deep:#06173a; --green:#11a86a; --gold:#d99a00; --gold-soft:#fdf3d6; --red:#e2483f; --red-soft:#fde8e6; --card:#fff; --line:#e1e9f4;
  font-family:'Manrope',sans-serif; color:var(--ink); background:var(--bg); min-height:100vh; -webkit-font-smoothing:antialiased; }
.uz input,.uz textarea,.uz select,.uz button { font-family:inherit; }
.uz-fade { animation:uzFade .4s ease both; }
@keyframes uzFade { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:none;} }
@keyframes uzPulse { 0%{box-shadow:0 0 0 0 rgba(17,168,106,.6);} 70%{box-shadow:0 0 0 8px rgba(17,168,106,0);} 100%{box-shadow:0 0 0 0 rgba(17,168,106,0);} }

/* HEADER */
.uz-header { position:sticky; top:0; z-index:50; background:rgba(244,248,253,.9); backdrop-filter:blur(12px); border-bottom:1px solid var(--line); }
.uz-header-inner { max-width:1140px; margin:0 auto; padding:13px 24px; display:flex; align-items:center; gap:14px; }
.uz-logo { display:flex; align-items:center; gap:8px; background:none; border:none; cursor:pointer; }
.uz-logo-icon { font-size:22px; }
.uz-logo-text { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:21px; color:var(--ink); letter-spacing:-.01em; }
.uz-logo-accent { color:var(--blue); }
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
.uz-hero-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(32px,5.5vw,52px); line-height:1.05; letter-spacing:-.025em; margin-bottom:18px; }
.uz-hl { color:#5fa8ff; }
.uz-hero-sub { font-size:17px; line-height:1.55; color:rgba(255,255,255,.78); max-width:520px; margin-bottom:32px; }
.uz-eta-picker { background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.15); border-radius:18px; padding:20px; display:flex; gap:20px; align-items:center; flex-wrap:wrap; max-width:620px; backdrop-filter:blur(8px); }
.uz-eta-field { flex:1; min-width:200px; }
.uz-eta-field label { display:block; font-size:12px; color:rgba(255,255,255,.6); margin-bottom:7px; font-weight:600; }
.uz-eta-field select { width:100%; background:rgba(255,255,255,.95); border:none; border-radius:10px; padding:12px 14px; font-size:15px; font-weight:600; color:var(--ink); outline:none; cursor:pointer; }
.uz-eta-result { display:flex; align-items:center; gap:18px; }
.uz-eta-block { text-align:center; }
.uz-eta-num { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:32px; line-height:1; }
.uz-eta-num span { font-size:14px; font-weight:600; margin-left:2px; opacity:.7; }
.uz-eta-num--green { color:#4ade80; }
.uz-eta-label { font-size:11px; color:rgba(255,255,255,.6); margin-top:5px; }
.uz-eta-divider { width:1px; height:40px; background:rgba(255,255,255,.18); }
.uz-trust-row { display:flex; gap:22px; flex-wrap:wrap; margin-top:24px; font-size:14px; color:rgba(255,255,255,.82); font-weight:500; }
.uz-services { max-width:1140px; margin:0 auto; padding:60px 24px 40px; }
.uz-section-head { margin-bottom:26px; }
.uz-section-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:30px; letter-spacing:-.02em; }
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
.uz-service-name { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:19px; margin-bottom:8px; letter-spacing:-.01em; }
.uz-service-desc { font-size:14px; line-height:1.55; color:var(--ink-soft); margin-bottom:16px; }
.uz-service-meta { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; }
.uz-meta-pill { font-size:12px; font-weight:600; color:var(--ink-soft); background:var(--bg); border:1px solid var(--line); padding:5px 11px; border-radius:8px; }
.uz-meta-pill--cat { color:var(--blue); background:var(--blue-soft); border-color:transparent; }
.uz-service-foot { display:flex; align-items:center; justify-content:space-between; padding-top:18px; border-top:1px solid var(--line); gap:12px; }
.uz-price { display:flex; flex-direction:column; }
.uz-price-from { font-size:11px; color:var(--ink-soft); font-weight:600; }
.uz-price-val { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:18px; color:var(--ink); }
.uz-book-btn { background:var(--blue); color:#fff; border:none; border-radius:10px; padding:11px 18px; font-weight:700; font-size:14px; cursor:pointer; transition:all .2s; white-space:nowrap; }
.uz-book-btn:hover { background:var(--blue-dark); transform:translateX(2px); }

/* PAGE / FIELDS */
.uz-page { max-width:1000px; margin:0 auto; padding:32px 24px 60px; }
.uz-page-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:30px; letter-spacing:-.02em; margin-bottom:24px; }
.uz-back { background:none; border:none; color:var(--ink-soft); font-size:14px; font-weight:600; cursor:pointer; padding:6px 0; margin-bottom:16px; }
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
.uz-summary-service { display:flex; align-items:center; gap:12px; font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:17px; padding-bottom:18px; border-bottom:1px solid var(--line); margin-bottom:18px; }
.uz-summary-icon { font-size:26px; }
.uz-summary-rows { display:flex; flex-direction:column; gap:12px; margin-bottom:18px; }
.uz-summary-row { display:flex; justify-content:space-between; font-size:14px; color:var(--ink-soft); }
.uz-summary-row span:last-child { font-weight:600; color:var(--ink); }
.uz-summary-eta { color:var(--green)!important; }
.uz-summary-total { display:flex; justify-content:space-between; align-items:center; padding-top:18px; border-top:1px solid var(--line); margin-bottom:20px; }
.uz-summary-total>span:first-child { font-weight:600; font-size:14px; }
.uz-total-val { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:19px; color:var(--blue); }
.uz-confirm-btn { width:100%; background:var(--blue); color:#fff; border:none; border-radius:12px; padding:15px; font-size:15px; font-weight:700; cursor:pointer; transition:all .2s; }
.uz-confirm-btn:hover { background:var(--blue-dark); transform:translateY(-1px); }
.uz-confirm-btn:disabled { background:var(--line); color:var(--ink-soft); cursor:not-allowed; transform:none; }
.uz-summary-note { font-size:12px; color:var(--ink-soft); text-align:center; margin-top:12px; line-height:1.4; }

/* EMPTY */
.uz-empty { text-align:center; padding:70px 20px; }
.uz-empty-icon { font-size:48px; margin-bottom:14px; }
.uz-empty-title { font-family:'Bricolage Grotesque',sans-serif; font-size:22px; font-weight:700; }
.uz-empty-sm { text-align:center; padding:40px 20px; color:var(--ink-soft); font-size:14px; background:var(--card); border:1px dashed var(--line); border-radius:14px; }
.uz-lookup-row { display:flex; gap:10px; }

/* BOOKING CARDS */
.uz-bookings { display:flex; flex-direction:column; gap:14px; }
.uz-booking-card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; display:flex; gap:16px; align-items:flex-start; }
.uz-card-disputed { border-color:var(--red); background:var(--red-soft); }
.uz-bc-left { flex-shrink:0; }
.uz-bc-icon { display:flex; width:50px; height:50px; border-radius:13px; background:var(--blue-soft); align-items:center; justify-content:center; font-size:26px; }
.uz-bc-body { flex:1; min-width:0; }
.uz-bc-top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
.uz-bc-name { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:17px; }
.uz-bc-code { font-size:12px; font-weight:700; color:var(--blue); background:var(--blue-soft); padding:3px 9px; border-radius:7px; }
.uz-bc-info { font-size:13px; color:var(--ink-soft); margin-top:3px; }
.uz-bc-note { font-size:13px; color:var(--ink-soft); font-style:italic; margin-top:8px; }
.uz-bc-bottom { display:flex; align-items:center; gap:12px; margin-top:12px; flex-wrap:wrap; }
.uz-status { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:var(--ink-soft); background:var(--bg); border:1px solid var(--line); padding:5px 11px; border-radius:8px; }
.uz-status--active { color:var(--green); background:#e6f7ef; border-color:#b9e8d2; }
.uz-status--done { color:var(--blue); background:var(--blue-soft); border-color:transparent; }
.uz-status--dispute { color:var(--red); background:#fff; border-color:var(--red); }
.uz-status-dot { width:7px; height:7px; border-radius:50%; background:var(--green); animation:uzPulse 2s infinite; }
.uz-bc-time { font-size:12px; color:var(--ink-soft); }
.uz-bc-rating { font-size:13px; color:var(--gold); font-weight:700; }
.uz-bc-eta { flex-shrink:0; text-align:center; background:var(--blue-deep); color:#fff; border-radius:13px; padding:12px 16px; min-width:72px; }
.uz-bc-eta-num { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:26px; line-height:1; }
.uz-bc-eta-label { font-size:11px; opacity:.7; margin-top:3px; }
.uz-bc-arrived { font-size:13px; font-weight:700; color:#4ade80; line-height:1.3; }
.uz-bc-action { flex-shrink:0; display:flex; align-items:center; }
.uz-accept-btn { background:var(--blue); color:#fff; border:none; border-radius:10px; padding:11px 16px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-accept-btn:hover { background:var(--blue-dark); }
.uz-complete-group { display:flex; flex-direction:column; gap:6px; }
.uz-complete-q { font-size:11px; color:var(--ink-soft); text-align:center; }
.uz-ontime-btn { background:var(--green); color:#fff; border:none; border-radius:9px; padding:9px 14px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap; }
.uz-late-btn { background:var(--bg); color:var(--ink-soft); border:1px solid var(--line); border-radius:9px; padding:8px 14px; font-weight:600; font-size:12px; cursor:pointer; }

/* RATING + DISPUTE */
.uz-rate-box { margin-top:12px; padding-top:12px; border-top:1px solid var(--line); display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
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
.uz-fee-item b { font-family:'Bricolage Grotesque',sans-serif; font-size:24px; color:var(--gold); display:block; margin:2px 0; }
.uz-fee-item small { font-size:11px; color:var(--ink-soft); }
.uz-warn-note { background:var(--red-soft); border:1px solid #f3c9c5; border-radius:12px; padding:13px 16px; font-size:13px; color:var(--red); margin-bottom:20px; line-height:1.5; }
.uz-pay-warn { background:var(--blue-soft); border:1px solid #bcd6ff; border-radius:12px; padding:13px 16px; font-size:13px; color:var(--blue-dark); margin-bottom:16px; line-height:1.55; }
.uz-tech-login { margin-top:30px; padding-top:24px; border-top:1px solid var(--line); }
.uz-tech-login p { font-size:14px; color:var(--ink-soft); margin-bottom:14px; }
.uz-tech-login .uz-lookup-row { max-width:460px; }
.uz-tech-login .uz-phone-input { flex:1; }

/* BLOCKED */
.uz-blocked { text-align:center; padding:70px 20px; max-width:480px; margin:0 auto; }.uz-blocked-icon { font-size:56px; margin-bottom:16px; }
.uz-blocked-title { font-family:'Bricolage Grotesque',sans-serif; font-size:24px; font-weight:700; color:var(--red); margin-bottom:12px; }
.uz-blocked-text { font-size:14px; color:var(--ink-soft); line-height:1.6; margin-bottom:24px; }
.uz-pending { text-align:center; padding:56px 20px; max-width:520px; margin:0 auto; }
.uz-pending-icon { font-size:56px; margin-bottom:16px; }
.uz-pending-title { font-family:'Bricolage Grotesque',sans-serif; font-size:24px; font-weight:700; color:var(--gold); margin-bottom:12px; }
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
.uz-stat-num { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:24px; line-height:1; }
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
.uz-mat-price { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:16px; color:var(--ink); margin-bottom:12px; }
.uz-mat-price small { font-size:11px; color:var(--ink-soft); font-weight:500; }
.uz-mat-add { width:100%; background:var(--blue-soft); color:var(--blue); border:none; border-radius:9px; padding:9px; font-weight:700; font-size:13px; cursor:pointer; transition:all .2s; }
.uz-mat-add:hover { background:var(--blue); color:#fff; }
.uz-qty { display:flex; align-items:center; gap:0; width:100%; border:1px solid var(--blue); border-radius:9px; overflow:hidden; }
.uz-qty button { flex:1; background:var(--blue-soft); color:var(--blue); border:none; padding:9px 0; font-size:16px; font-weight:700; cursor:pointer; }
.uz-qty button:hover { background:var(--blue); color:#fff; }
.uz-qty span { flex:1; text-align:center; font-weight:700; font-size:15px; }
.uz-cart-bar { position:sticky; bottom:16px; margin-top:24px; background:var(--blue-deep); color:#fff; border-radius:14px; padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; box-shadow:0 14px 34px -14px rgba(6,23,58,.6); }
.uz-cart-info b { font-family:'Bricolage Grotesque',sans-serif; font-size:18px; }
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
.uz-co-total b { font-family:'Bricolage Grotesque',sans-serif; font-size:20px; color:var(--blue); }
.uz-mat-order-items { font-size:12px; color:var(--ink-soft); margin-top:6px; line-height:1.6; }

/* SETTINGS */
.uz-settings { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px; max-width:480px; }
.uz-settings-title { font-family:'Bricolage Grotesque',sans-serif; font-size:18px; font-weight:700; margin-bottom:6px; }
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
.uz-credit-ok { background:var(--green); color:#fff; border:none; border-radius:8px; padding:8px 12px; font-weight:700; font-size:13px; cursor:pointer; }
.uz-credit-cancel { background:var(--bg); color:var(--ink-soft); border:1px solid var(--line); border-radius:8px; padding:8px 10px; cursor:pointer; }

/* MODAL */
.uz-modal-overlay { position:fixed; inset:0; background:rgba(6,23,58,.55); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; z-index:200; padding:20px; animation:uzFade .2s ease; }
.uz-modal { background:var(--card); border-radius:20px; padding:28px; max-width:380px; width:100%; }
.uz-modal-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:20px; }
.uz-modal-sub { font-size:14px; color:var(--ink-soft); margin:4px 0 18px; }
.uz-modal-text { font-size:13px; color:var(--ink-soft); margin-bottom:14px; }
.uz-pay-option { width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px; background:var(--bg); border:1.5px solid var(--line); border-radius:12px; padding:15px 18px; margin-bottom:10px; cursor:pointer; transition:all .2s; font-size:14px; font-weight:600; color:var(--ink); flex-wrap:wrap; }
.uz-pay-option:hover:not(:disabled) { border-color:var(--blue); background:var(--blue-soft); }
.uz-pay-option b { font-family:'Bricolage Grotesque',sans-serif; font-size:16px; }
.uz-pay-option--coin b { color:var(--gold); }
.uz-pay-option:disabled { opacity:.5; cursor:not-allowed; }
.uz-pay-option small { width:100%; font-size:11px; color:var(--red); font-weight:600; }
.uz-modal-cancel { width:100%; background:none; border:none; color:var(--ink-soft); font-weight:600; font-size:14px; cursor:pointer; padding:10px; margin-top:4px; }

/* ARRIVAL / EXTRA WAIT (customer) */
.uz-arrival-note { margin-top:10px; background:var(--blue-soft); color:var(--blue-dark); border-radius:9px; padding:9px 13px; font-size:13px; font-weight:600; }
.uz-arrival-note b { font-family:'Bricolage Grotesque',sans-serif; }
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
.uz-footer-text { font-size:13px; color:rgba(255,255,255,.6); }
.uz-footer-phone { color:#fff; text-decoration:none; font-weight:700; font-size:16px; }
.uz-toast { position:fixed; bottom:28px; left:50%; transform:translateX(-50%); background:var(--green); color:#fff; padding:14px 24px; border-radius:12px; font-size:14px; font-weight:600; z-index:300; box-shadow:0 12px 30px -8px rgba(0,0,0,.4); animation:uzToast .3s ease both; }
@keyframes uzToast { from{opacity:0;transform:translate(-50%,12px);} to{opacity:1;transform:translate(-50%,0);} }
`;
