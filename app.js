const KEY = 'focus_v1';
const $ = (s) => document.querySelector(s);
const LABELS = { work: 'Время сосредоточиться', short: 'Короткий перерыв', long: 'Длинный перерыв — отдохните' };
const PROJECT_COLORS = ['#e8553f', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#14b8a6'];
const RING = 2 * Math.PI * 100;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- Состояние ----------
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return d; } catch { /* ignore */ }
  return demo();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } }

function demo() {
  const projects = [
    { id: 'p1', name: 'Учёба', color: PROJECT_COLORS[0] },
    { id: 'p2', name: 'Работа', color: PROJECT_COLORS[1] },
    { id: 'p3', name: 'Свой проект', color: PROJECT_COLORS[2] },
  ];
  const sessions = [];
  for (let i = 1; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const n = 2 + Math.floor(Math.random() * 6);
    for (let k = 0; k < n; k++) sessions.push({ date: iso(d), min: 25, project: projects[Math.floor(Math.random() * 3)].id });
  }
  return {
    settings: { work: 25, short: 5, long: 15, every: 4, auto: false, sound: true },
    projects,
    current: 'p1',
    sessions,
  };
}

const db = load();
const timer = { phase: 'work', endsAt: 0, left: db.settings.work * 60, running: false, count: 0 };
let tick = null;

const duration = (phase) => db.settings[phase] * 60;

// ---------- Таймер (по отметкам времени — не сбивается в фоне) ----------
function start() {
  if (timer.running) return;
  timer.running = true;
  timer.endsAt = Date.now() + timer.left * 1000;
  tick = setInterval(update, 250);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  render();
}
function pause() {
  if (!timer.running) return;
  timer.running = false;
  timer.left = Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
  clearInterval(tick);
  render();
}
function setPhase(phase, autostart = false) {
  pause();
  timer.phase = phase;
  timer.left = duration(phase);
  document.body.dataset.phase = phase;
  render();
  if (autostart) start();
}
function update() {
  timer.left = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  if (timer.left === 0) finish();
  else render();
}
function finish() {
  clearInterval(tick);
  timer.running = false;
  const was = timer.phase;
  if (was === 'work') {
    db.sessions.push({ date: iso(new Date()), min: db.settings.work, project: db.current });
    timer.count++;
    save();
  }
  notify(was === 'work' ? 'Помидор готов! 🍅 Время отдохнуть.' : 'Перерыв окончен — снова за работу!');
  const next = was === 'work' ? (timer.count % db.settings.every === 0 ? 'long' : 'short') : 'work';
  setPhase(next, db.settings.auto);
  renderStats();
}

function notify(text) {
  if (db.settings.sound) chime();
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification('Фокус', { body: text, icon: 'icon.svg' }); } catch { /* ignore */ }
  }
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.65);
    });
  } catch { /* без звука */ }
}

// ---------- Отрисовка ----------
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function render() {
  const total = duration(timer.phase);
  $('#time').textContent = mmss(timer.left);
  $('#label').textContent = LABELS[timer.phase];
  $('#bar').style.strokeDasharray = RING;
  $('#bar').style.strokeDashoffset = RING * (1 - timer.left / total);
  $('#startBtn').textContent = timer.running ? 'Пауза' : timer.left < total ? 'Продолжить' : 'Старт';
  document.querySelectorAll('.phase').forEach((b) => b.classList.toggle('is-active', b.dataset.phase === timer.phase));
  const inCycle = timer.count % db.settings.every;
  $('#dots').innerHTML = Array.from({ length: db.settings.every }, (_, i) => `<i class="${i < inCycle ? 'is-done' : ''}"></i>`).join('');
  document.title = timer.running ? `${mmss(timer.left)} · ${timer.phase === 'work' ? 'Фокус' : 'Перерыв'}` : 'Фокус';
}

function renderProjects() {
  $('#projectSelect').innerHTML = db.projects.map((p) => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
  $('#projectSelect').value = db.current;
}

function renderStats() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });
  const week = db.sessions.filter((s) => s.date >= iso(monday));
  const byDay = days.map((d) => week.filter((s) => s.date === iso(d)));
  const max = Math.max(60, ...byDay.map((list) => list.reduce((a, s) => a + s.min, 0)));
  const color = (id) => db.projects.find((p) => p.id === id)?.color ?? '#999';

  $('#bars').innerHTML = days.map((d, i) => {
    const list = byDay[i];
    const total = list.reduce((a, s) => a + s.min, 0);
    const segs = db.projects.map((p) => {
      const m = list.filter((s) => s.project === p.id).reduce((a, s) => a + s.min, 0);
      return m ? `<i style="height:${(m / max) * 100}%;background:${p.color}"></i>` : '';
    }).join('');
    return `<div class="bar-col ${iso(d) === iso(now) ? 'is-today' : ''}" title="${hm(total)}">
      <div class="bar-col__stack">${segs}</div>
      <small>${d.toLocaleDateString('ru-RU', { weekday: 'short' })}</small>
    </div>`;
  }).join('');

  const totalMin = week.reduce((a, s) => a + s.min, 0);
  $('#weekTotal').textContent = `${hm(totalMin)} · ${week.length} 🍅`;
  $('#projectStats').innerHTML = db.projects.map((p) => {
    const m = week.filter((s) => s.project === p.id).reduce((a, s) => a + s.min, 0);
    return `<li><span class="sw" style="background:${color(p.id)}"></span>${escapeHTML(p.name)}<b>${hm(m)}</b></li>`;
  }).join('');
}

const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)} ч ${min % 60 ? `${min % 60} мин` : ''}`.trim() : `${min} мин`);
const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderSettings() {
  document.querySelectorAll('[data-setting]').forEach((inp) => {
    const v = db.settings[inp.dataset.setting];
    if (inp.type === 'checkbox') inp.checked = v; else inp.value = v;
  });
}

// ---------- События ----------
$('#startBtn').onclick = () => (timer.running ? pause() : start());
$('#resetBtn').onclick = () => setPhase(timer.phase);
// Пропуск не засчитывает помидор — просто переходим к следующему этапу
$('#skipBtn').onclick = () => setPhase(timer.phase === 'work' ? 'short' : 'work');
document.querySelector('.phases').addEventListener('click', (e) => {
  const b = e.target.closest('[data-phase]');
  if (b && b.dataset.phase !== timer.phase) setPhase(b.dataset.phase);
});
$('#projectSelect').onchange = (e) => { db.current = e.target.value; save(); };
$('#newProject').onclick = () => {
  const name = prompt('Название проекта');
  if (!name?.trim()) return;
  const p = { id: `p${Date.now()}`, name: name.trim().slice(0, 30), color: PROJECT_COLORS[db.projects.length % PROJECT_COLORS.length] };
  db.projects.push(p);
  db.current = p.id;
  save();
  renderProjects();
  renderStats();
};
document.querySelector('.settings').addEventListener('change', (e) => {
  const inp = e.target.closest('[data-setting]');
  if (!inp) return;
  const k = inp.dataset.setting;
  if (inp.type === 'checkbox') db.settings[k] = inp.checked;
  else {
    const v = Math.round(Number(inp.value));
    db.settings[k] = Math.min(Number(inp.max), Math.max(Number(inp.min), Number.isFinite(v) ? v : db.settings[k]));
    inp.value = db.settings[k];
  }
  save();
  if (!timer.running && k === timer.phase) timer.left = duration(timer.phase);
  render();
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    timer.running ? pause() : start();
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && timer.running) update(); });

renderProjects();
renderSettings();
renderStats();
setPhase('work');
