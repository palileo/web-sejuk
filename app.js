const STORAGE_KEY = "koperasi_checklist_shu_v1";
const SESSION_KEY = "koperasi_active_user_v1";
const AUTH_SCHEMA_VERSION = 2;
const API_URL = "api.php";
const app = document.querySelector("#app");
let state = loadState();
let activeUser = sessionStorage.getItem(SESSION_KEY);
let activeTab = "dashboard";
let selectedTarget = APP_DATA.members.find(m => m.id !== activeUser)?.id || APP_DATA.members[0].id;
let editingUserId = null;
let remoteSaveTimer = null;
let remoteReady = false;
let deferredInstallPrompt = null;

function defaultAccounts(){
  const admin = APP_DATA.admin;
  return {
    [admin.id]: { id: admin.id, memberId: null, name: admin.name, role: admin.role, password: admin.password, type: "admin", status: "approved", createdAt: new Date().toISOString(), approvedAt: new Date().toISOString() }
  };
}
function loadState(){
  const fallback = { evaluations: {}, totalShu: 0, accounts: defaultAccounts(), signupRequests: [], passwordRequests: [], authSchemaVersion: AUTH_SCHEMA_VERSION, updatedAt: null };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    const shouldResetUsers = saved.authSchemaVersion !== AUTH_SCHEMA_VERSION;
    const accounts = shouldResetUsers ? fallback.accounts : cleanLegacyFields({ ...fallback.accounts, ...(saved.accounts || {}) });
    const signupRequests = shouldResetUsers ? [] : cleanLegacyFields(saved.signupRequests || []);
    const passwordRequests = shouldResetUsers ? [] : cleanLegacyFields(saved.passwordRequests || []);
    return normalizeState({ ...fallback, ...saved, accounts, signupRequests, passwordRequests });
  }
  catch { return fallback; }
}
function saveState(options = {}){
  state.authSchemaVersion = AUTH_SCHEMA_VERSION;
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if(!options.localOnly) scheduleRemoteSave();
}
function normalizeState(data){
  const fallback = { evaluations: {}, totalShu: 0, accounts: defaultAccounts(), signupRequests: [], passwordRequests: [], authSchemaVersion: AUTH_SCHEMA_VERSION, updatedAt: null };
  const clean = cleanLegacyFields(data || {});
  const admin = APP_DATA.admin;
  const savedAdmin = clean.accounts?.[admin.id] || {};
  return {
    ...fallback,
    ...clean,
    totalShu: Number(clean.totalShu || 0),
    accounts: cleanLegacyFields({
      ...fallback.accounts,
      ...(clean.accounts || {}),
      [admin.id]: {
        ...fallback.accounts[admin.id],
        ...savedAdmin,
        id: admin.id,
        memberId: null,
        name: savedAdmin.name || admin.name,
        role: admin.role,
        password: savedAdmin.password || admin.password,
        type: "admin",
        status: "approved"
      }
    }),
    signupRequests: cleanLegacyFields(clean.signupRequests || []),
    passwordRequests: cleanLegacyFields(clean.passwordRequests || []),
    authSchemaVersion: AUTH_SCHEMA_VERSION
  };
}
async function hashPassword(text) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
function scheduleRemoteSave(){
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(pushRemoteState, 550);
}
async function pullRemoteState(){
  try {
    const response = await fetch(API_URL, { headers: { "Accept": "application/json" }, cache: "no-store" });
    if(!response.ok) throw new Error("API database belum siap.");
    const result = await response.json();
    if(result?.state){
      state = normalizeState(result.state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      remoteReady = true;
      render();
    } else {
      remoteReady = true;
      pushRemoteState();
    }
  } catch(error) {
    remoteReady = false;
    console.warn(error.message || error);
  }
}
async function pushRemoteState(){
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ state })
    });
    if(!response.ok) throw new Error("Sinkron database gagal.");
    remoteReady = true;
  } catch(error) {
    remoteReady = false;
    console.warn(error.message || error);
  }
}
function cleanLegacyFields(value){
  const omit = "em" + "ail";
  if(Array.isArray(value)) return value.map(item => cleanLegacyFields(item));
  if(value && typeof value === "object"){
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== omit).map(([key, item]) => [key, cleanLegacyFields(item)]));
  }
  return value;
}
function member(id){ return APP_DATA.members.find(m => m.id === id); }
function signupRoles(){
  return [
    ...APP_DATA.members.map(m => ({ id: m.id, label: m.role, name: m.role, role: m.role, type: "member" })),
    { id: "anggota", label: "Anggota", name: "Anggota", role: "Anggota", type: "general" }
  ];
}
function signupRole(id){ return signupRoles().find(role => role.id === id); }
function account(id){ return state.accounts?.[id]; }
function activeAccount(){ return account(activeUser); }
function isAdmin(){ return activeAccount()?.type === "admin"; }
function isChecklistMember(id){
  const acc = account(id);
  return Boolean(acc?.memberId && member(acc.memberId) && acc.role !== "Anggota" && acc.status === "approved");
}
function accountLabel(acc){
  if(!acc) return "-";
  return `${acc.name} (${acc.role})`;
}
function accountAvatar(acc, small = false){
  const cls = small ? "mini-avatar" : "avatar";
  const photo = acc?.photo?.dataUrl;
  const initial = safe((acc?.name || "U").slice(0, 1).toUpperCase());
  return `<span class="${cls}">${photo ? `<img src="${safe(photo)}" alt="Foto ${safe(acc?.name || "")}">` : initial}</span>`;
}
function personalInfoTemplate(){
  return "Nama:\nAlamat:\nTanggal Lahir:\nNomor WA:";
}
function parsePersonalInfo(text){
  const info = { nama: "", alamat: "", tanggalLahir: "", nomorWa: "" };
  String(text || "").split(/\r?\n/).forEach(line => {
    const [rawKey, ...rest] = line.split(":");
    const key = String(rawKey || "").trim().toLowerCase();
    const value = rest.join(":").trim();
    if(key === "nama") info.nama = value;
    if(key === "alamat") info.alamat = value;
    if(key === "tanggal lahir") info.tanggalLahir = value;
    if(key === "nomor wa" || key === "nomor whatsapp") info.nomorWa = value;
  });
  return info;
}
function personalInfoText(info){
  if(!info) return "-";
  return `Nama: ${safe(info.nama || "-")}<br>Alamat: ${safe(info.alamat || "-")}<br>Tanggal Lahir: ${safe(info.tanggalLahir || "-")}<br>Nomor WA: ${safe(info.nomorWa || "-")}`;
}
function extraSignupNote(text){
  return String(text || "").split(/\r?\n/).filter(line => !/^\s*(nama|alamat|tanggal lahir|nomor wa|nomor whatsapp)\s*:/i.test(line)).join("\n").trim();
}
function rupiah(value){ return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value||0)); }
function rupiahInput(value){ return Number(value || 0).toLocaleString("id-ID"); }
function parseRupiah(value){ return Number(String(value || "").replace(/[^\d]/g, "")) || 0; }
function pct(value){ return `${Math.round((value||0)*100)}%`; }
function safe(text){ return String(text ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
function key(evaluatorId, targetId){ return `${evaluatorId}__${targetId}`; }
function ratingOptions(){ return APP_DATA.ratings || []; }
function legacyStatusScore(status){
  const legacy = { "Belum Dikerjakan": 0, "Dalam Proses": 50, "Selesai": 100, "Tidak Relevan": null };
  return Object.prototype.hasOwnProperty.call(legacy, status) ? legacy[status] : undefined;
}
function answerScore(answer){
  const rating = Number(answer?.rating || 0);
  if(rating) return ratingOptions().find(item => item.value === rating)?.score;
  return legacyStatusScore(answer?.status);
}
function answerRating(answer){
  const rating = Number(answer?.rating || 0);
  if(rating) return rating;
  const score = legacyStatusScore(answer?.status);
  return score === null || score === undefined ? 0 : Math.max(1, Math.round(score / 20));
}
function ratingStars(value){
  const rating = Number(value || 0);
  return `<span class="stars" aria-label="${rating} dari 5 bintang">${Array.from({length:5}, (_, i) => i < rating ? "★" : "☆").join("")}</span>`;
}
function category(value){
  if(value >= .85) return "Sangat Serius";
  if(value >= .70) return "Serius";
  if(value >= .50) return "Perlu Ditingkatkan";
  return "Belum Serius";
}
function badgeClass(cat){ return cat === "Sangat Serius" ? "good" : cat === "Serius" ? "info" : cat === "Perlu Ditingkatkan" ? "mid" : "bad"; }
function getEvaluation(evaluatorId, targetId){
  return state.evaluations[key(evaluatorId,targetId)] || { evaluatorId, targetId, items:{}, submittedAt:null };
}
function setEvaluation(evaluation){ state.evaluations[key(evaluation.evaluatorId,evaluation.targetId)] = evaluation; saveState(); }
function allEvaluationRows(){
  const approvedIds = new Set(approvedChecklistAccounts().map(acc => acc.memberId));
  return Object.values(state.evaluations || {}).filter(e => e && e.evaluatorId !== e.targetId && approvedIds.has(e.evaluatorId) && approvedIds.has(e.targetId));
}
function calculateTarget(targetId){
  const items = APP_DATA.checklists[targetId];
  const rows = allEvaluationRows().filter(e => e.targetId === targetId);
  let scoreWeight = 0, assessedWeight = 0, completed = 0, progress = 0, pending = 0, totalAnswers = 0;
  rows.forEach(ev => {
    items.forEach(item => {
      const answer = ev.items[item.no] || {};
      const sc = answerScore(answer);
      const rating = answerRating(answer);
      if(sc !== null && sc !== undefined) totalAnswers++;
      if(rating >= 5) completed++;
      if(rating >= 3 && rating < 5) progress++;
      if(rating > 0 && rating < 3) pending++;
      if(sc !== null && sc !== undefined){ assessedWeight += item.weight; scoreWeight += (sc * item.weight / 100); }
    });
  });
  const seriousness = assessedWeight === 0 ? 0 : scoreWeight / assessedWeight;
  return { targetId, evaluatorCount: rows.length, totalAnswers, assessedWeight, scoreWeight, seriousness, category: category(seriousness), completed, progress, pending };
}
function summary(){
  const rows = APP_DATA.members.map(m => ({...calculateTarget(m.id), member:m}));
  const totalSeriousness = rows.reduce((a,r)=>a+r.seriousness,0);
  return rows.map(r => {
    const pengurusPct = totalSeriousness === 0 ? 0 : (r.seriousness / totalSeriousness) * 0.9;
    return {...r, shuPct: pengurusPct, shuNominal: (state.totalShu||0) * pengurusPct};
  });
}
function registeredUsers(){
  return Object.values(state.accounts || {}).filter(acc => acc.id !== APP_DATA.admin.id && acc.status === "approved");
}
function registeredShuRows(){
  const baseRows = summary();
  const baseByMember = Object.fromEntries(baseRows.map(row => [row.member.id, row]));
  const users = registeredUsers();
  const nonMembers = users.filter(acc => acc.role !== "Anggota" && acc.memberId && baseByMember[acc.memberId]);
  const anggota = users.filter(acc => acc.role === "Anggota" || !acc.memberId);
  const nonMemberRows = nonMembers.map(acc => {
    const base = baseByMember[acc.memberId];
    return { ...base, member: { id: acc.id, name: acc.name, role: acc.role }, account: acc, shuPct: base.shuPct || 0, shuNominal: (state.totalShu || 0) * (base.shuPct || 0) };
  });
  const anggotaPct = anggota.length ? 0.1 / anggota.length : 0;
  const anggotaRows = anggota.map(acc => ({ targetId: acc.id, member: { id: acc.id, name: acc.name, role: "Anggota" }, account: acc, evaluatorCount: 0, seriousness: 0, category: "Anggota", completed: 0, progress: 0, pending: 0, shuPct: anggotaPct, shuNominal: (state.totalShu || 0) * anggotaPct }));
  return [...nonMemberRows, ...anggotaRows];
}
function registeredDashboardRows(){
  return registeredShuRows().map(row => ({ ...row, shuPct: row.shuPct || 0, shuNominal: row.shuNominal || 0 }));
}
function approvedChecklistAccounts(){
  return registeredUsers().filter(acc => acc.memberId && member(acc.memberId) && acc.role !== "Anggota");
}
function toast(message){
  const el = document.createElement("div"); el.className = "toast"; el.textContent = message; document.body.appendChild(el);
  setTimeout(()=>el.remove(),2200);
}
function setupInstallPrompt(){
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    refreshInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    refreshInstallButton();
    toast("Aplikasi berhasil diinstal.");
  });
  if("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(error => console.warn(error.message || error));
    });
  }
}
function isStandaloneApp(){
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isAdminLoginPath(){
  return window.location.pathname.replace(/\/+$/, "") === "/admin";
}
function canShowAdminLogin(){
  return isAdminLoginPath() && !isStandaloneApp();
}
function refreshInstallButton(){
  const button = document.querySelector("#install-app-btn");
  if(!button) return;
  button.classList.toggle("hidden", isStandaloneApp());
}
async function installApp(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    refreshInstallButton();
    return;
  }
  toast("Buka menu browser, lalu pilih Tambahkan ke layar utama.");
}

function render(){
  if(activeUser === APP_DATA.admin.id && !canShowAdminLogin()){
    sessionStorage.removeItem(SESSION_KEY);
    activeUser = null;
    activeTab = "dashboard";
  }
  if(activeUser && (!activeAccount() || activeAccount().status !== "approved")){
    sessionStorage.removeItem(SESSION_KEY);
    activeUser = null;
  }
  activeUser ? renderShell() : renderLogin();
}
function renderLogin(){
  app.innerHTML = document.querySelector("#login-template").innerHTML;
  const select = document.querySelector("#login-user");
  const signupSelect = document.querySelector("#signup-member");
  select.innerHTML = loginOptions();
  signupSelect.innerHTML = signupRoles().map(role => `<option value="${role.id}">${safe(role.label)}</option>`).join("");
  document.querySelector("#signup-note").value = personalInfoTemplate();
  bindPasswordToggle("#login-password", "#toggle-password");
  bindPasswordToggle("#signup-password", "#toggle-signup-password");
  document.querySelector("#signup-open").addEventListener("click", () => switchAuthPanel("signup"));
  document.querySelector("#signup-back").addEventListener("click", () => switchAuthPanel("login"));
  if(canShowAdminLogin()){
    document.querySelector("#signup-open").classList.add("hidden");
    document.querySelector(".hint-box")?.classList.add("hidden");
  }
  document.querySelector("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const id = select.value;
    const pass = document.querySelector("#login-password").value;
    const acc = account(id);
    if(!id){
      showLoginError("Pilih akun terlebih dahulu.");
      return;
    }
    if(id === APP_DATA.admin.id && !canShowAdminLogin()){
      showLoginError("Akun admin hanya bisa login dari halaman /admin di browser.");
      return;
    }
    
    let isValid = false;
    if(acc) {
      if(acc.password.length === 64 && /^[a-f0-9]{64}$/i.test(acc.password)) {
        const hashedPass = await hashPassword(pass);
        isValid = (acc.password === hashedPass);
      } else {
        isValid = (acc.password === pass);
      }
    }

    if(!acc || !isValid){
      showLoginError("Akun atau password tidak sesuai.");
      return;
    }
    if(acc.status === "pending"){
      showLoginError("Akun masih menunggu approval admin.");
      return;
    }
    if(acc.status === "rejected"){
      showLoginError("Akun ditolak admin. Hubungi admin untuk pemeriksaan ulang.");
      return;
    }
    activeUser = id; sessionStorage.setItem(SESSION_KEY,id); selectedTarget = APP_DATA.members.find(m => m.id !== activeUser)?.id; activeTab = isAdmin() ? "admin" : "dashboard"; render();
  });
  document.querySelector("#signup-form").addEventListener("submit", e => {
    e.preventDefault();
    const memberId = signupSelect.value;
    const selected = signupRole(memberId);
    const password = document.querySelector("#signup-password").value;
    const note = document.querySelector("#signup-note").value.trim();
    const profile = parsePersonalInfo(note);
    if(password.length < 6){
      showSignupError("Password minimal 6 karakter.");
      return;
    }
    if(!profile.nama){
      showSignupError("Nama wajib diisi pada catatan untuk admin.");
      return;
    }
    const existingPending = memberId !== "anggota" && state.signupRequests.some(req => req.memberId === memberId && req.status === "pending");
    if(existingPending){
      showSignupError("Request untuk akses ini masih menunggu keputusan admin.");
      return;
    }
    const accountId = memberId === "anggota" ? `anggota_${Date.now()}` : memberId;
    state.signupRequests.unshift({ id: `req_${Date.now()}`, accountId, memberId: memberId === "anggota" ? null : memberId, name: profile.nama, role: selected.role, password, note, profile, status: "pending", requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null });
    saveState();
    document.querySelector("#signup-error").classList.add("hidden");
    document.querySelector("#signup-message").textContent = "Sign up terkirim. Tunggu admin melakukan approval sebelum login.";
    document.querySelector("#signup-message").classList.remove("hidden");
  });
}
function loginOptions(){
  const admin = APP_DATA.admin;
  const emptyOption = `<option value="" selected disabled>Pilih akun</option>`;
  const adminOption = canShowAdminLogin() ? `<option value="${admin.id}">${admin.name} — ${admin.role}</option>` : "";
  if(canShowAdminLogin()) return `${emptyOption}${adminOption}`;
  const extraOptions = Object.values(state.accounts || {})
    .filter(acc => acc.status === "approved" && acc.id !== APP_DATA.admin.id && !member(acc.id))
    .map(acc => `<option value="${acc.id}">${safe(acc.name)} — ${safe(acc.role)}</option>`)
    .join("");
  const approvedMemberOptions = Object.values(state.accounts || {})
    .filter(acc => acc.status === "approved" && acc.id !== APP_DATA.admin.id && member(acc.id))
    .map(acc => `<option value="${acc.id}">${safe(acc.name)} — ${safe(acc.role)}</option>`)
    .join("");
  return `${emptyOption}${adminOption}${approvedMemberOptions}${extraOptions}`;
}
function bindPasswordToggle(inputSelector, buttonSelector){
  document.querySelector(buttonSelector).addEventListener("click", () => {
    const input = document.querySelector(inputSelector);
    const button = document.querySelector(buttonSelector);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Sembunyi" : "Lihat";
    button.setAttribute("aria-label", show ? "Sembunyikan password" : "Lihat password");
  });
}
function showLoginError(message){
  const error = document.querySelector("#login-error");
  error.textContent = message;
  error.classList.remove("hidden");
}
function showSignupError(message){
  const error = document.querySelector("#signup-error");
  error.textContent = message;
  error.classList.remove("hidden");
}
function switchAuthPanel(panel){
  document.querySelector("#login-form").classList.toggle("hidden", panel !== "login");
  document.querySelector("#signup-form").classList.toggle("hidden", panel !== "signup");
  const titles = { signup: "Sign Up Pengguna", login: "Sign In Checklist SHU" };
  document.querySelector(".login-heading h1").textContent = titles[panel] || titles.login;
}
function renderShell(){
  app.innerHTML = document.querySelector("#shell-template").innerHTML;
  document.querySelector("#active-user").textContent = accountLabel(activeAccount());
  refreshInstallButton();
  document.querySelector("#install-app-btn").onclick = installApp;
  if(isAdmin() && !["admin","profile","settings"].includes(activeTab)) activeTab = "admin";
  document.querySelector(".admin-tab").classList.toggle("hidden", !isAdmin());
  document.querySelector('[data-tab="settings"]').classList.toggle("hidden", !isAdmin());
  document.querySelectorAll('[data-tab="dashboard"], [data-tab="input"], [data-tab="evaluations"], [data-tab="shu"]').forEach(btn => btn.classList.toggle("hidden", isAdmin()));
  document.querySelectorAll('[data-tab="input"], [data-tab="evaluations"]').forEach(btn => btn.classList.toggle("hidden", !isChecklistMember(activeUser)));
  if(!isAdmin() && activeTab === "settings") activeTab = "dashboard";
  if(!isChecklistMember(activeUser) && ["input","evaluations"].includes(activeTab)) activeTab = "dashboard";
  document.querySelector("#logout-btn").onclick = () => { sessionStorage.removeItem(SESSION_KEY); activeUser = null; activeTab = "dashboard"; render(); };
  document.querySelectorAll(".tabs button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === activeTab);
    btn.onclick = () => { activeTab = btn.dataset.tab; renderView(); document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active", b.dataset.tab===activeTab)); };
  });
  renderView();
}
function renderView(){
  const view = document.querySelector("#view");
  if(activeTab === "admin") { view.innerHTML = adminView(); bindAdminView(); return; }
  if(activeTab === "dashboard") view.innerHTML = dashboardView();
  if(activeTab === "profile") { view.innerHTML = profileView(); bindProfileView(); }
  if(activeTab === "input") { view.innerHTML = inputView(); bindInputView(); }
  if(activeTab === "evaluations") view.innerHTML = evaluationsView();
  if(activeTab === "shu") { view.innerHTML = shuView(); bindShuView(); }
  if(activeTab === "settings") { view.innerHTML = settingsView(); bindSettingsView(); }
}
function dashboardView(){
  const rows = registeredDashboardRows();
  const avg = rows.length ? rows.reduce((a,r)=>a+r.seriousness,0)/rows.length : 0;
  const top = [...rows].sort((a,b)=>b.seriousness-a.seriousness)[0];
  const countVery = rows.filter(r=>r.category==="Sangat Serius").length;
  const evalCount = allEvaluationRows().length;
  const showRules = isChecklistMember(activeUser);
  return `<div class="grid cards">
    <article class="card metric"><span>User Approved</span><strong>${registeredUsers().length}</strong></article>
    <article class="card metric"><span>Rata-rata Keseriusan</span><strong>${pct(avg)}</strong></article>
    <article class="card metric"><span>Nilai Tertinggi</span><strong>${top ? safe(top.member.name) : "-"}</strong><small>${top ? pct(top.seriousness) : ""}</small></article>
    <article class="card metric"><span>Data Penilaian Masuk</span><strong>${evalCount}</strong></article>
  </div>
  <div class="grid ${showRules ? "two" : ""}" style="margin-top:18px">
    <section class="card">
      <div class="kpi-title"><h2>Nilai Keseriusan Pengurus</h2><span class="badge ${countVery ? 'good':'bad'}">${countVery} Sangat Serius</span></div>
      ${rows.length ? `<div class="table-wrap">${summaryTable(rows, false)}</div>` : '<div class="empty">Belum ada user approved.</div>'}
    </section>
    ${showRules ? `<aside class="card">
      <h2>Aturan Penilaian</h2>
      <p class="muted">Mengikuti Data Penilaian Pembagian SHU: 1 sampai 5 bintang, setiap bintang bernilai 20 poin.</p>
      <div class="note">Nilai akhir setiap pengurus dihitung dari seluruh checklist yang masuk dari pengurus lain. Penilai yang sama dapat memperbarui jawaban kapan saja.</div>
      <h3>Kategori</h3>
      <p><span class="badge good">Sangat Serius ≥85%</span></p><p><span class="badge info">Serius ≥70%</span></p><p><span class="badge mid">Perlu Ditingkatkan ≥50%</span></p><p><span class="badge bad">Belum Serius &lt;50%</span></p>
    </aside>` : ""}
  </div>`;
}
function profileView(){
  const acc = activeAccount();
  const profile = acc?.profile || {};
  const photo = acc?.photo?.dataUrl || "";
  const pendingPassword = (state.passwordRequests || []).filter(req => req.accountId === activeUser && req.status === "pending").length;
  const passwordPanel = isAdmin() ? `<section class="card" style="margin-top:18px"><h2>Ganti Password Admin</h2><p class="muted">Password akan dienkripsi (hash) sebelum disimpan ke database.</p><form id="admin-password-form" class="stack" style="margin-top:14px"><label>Password Baru<span class="password-wrap"><input id="admin-new-password" type="password" autocomplete="new-password" minlength="6" placeholder="Minimal 6 karakter" required /><button id="toggle-admin-password" class="icon-btn" type="button" aria-label="Lihat password baru">Lihat</button></span></label><button class="primary" type="submit">Simpan Password</button><p id="admin-password-message" class="success hidden"></p><p id="admin-password-error" class="error hidden"></p></form></section>` : `<section class="card" style="margin-top:18px"><h2>Ganti Password</h2><p class="muted">Password baru aktif setelah admin melakukan approval.</p>${pendingPassword ? `<div class="note">Ada ${pendingPassword} request ganti password yang masih menunggu approval admin.</div>` : ""}<form id="password-change-form" class="stack" style="margin-top:14px"><label>Password Baru<span class="password-wrap"><input id="new-password" type="password" autocomplete="new-password" minlength="6" placeholder="Minimal 6 karakter" required /><button id="toggle-new-password" class="icon-btn" type="button" aria-label="Lihat password baru">Lihat</button></span></label><label>Catatan untuk Admin<textarea id="password-change-note" placeholder="Contoh: mohon approve ganti password saya."></textarea></label><button class="primary" type="submit">Ajukan Ganti Password</button><p id="password-change-message" class="success hidden"></p><p id="password-change-error" class="error hidden"></p></form></section>`;
  return `<section class="card profile-card">
    <div class="profile-head">
      <div class="avatar">${photo ? `<img src="${safe(photo)}" alt="Foto profil ${safe(acc?.name || "")}">` : safe((acc?.name || "U").slice(0,1).toUpperCase())}</div>
      <div>
        <h2>${safe(acc?.name || "-")}</h2>
        <p class="muted">${safe(acc?.role || "-")}</p>
        <span class="badge ${isChecklistMember(activeUser) ? "info" : acc?.role === "Anggota" ? "good" : "mid"}">${safe(acc?.type || "user")}</span>
      </div>
    </div>
    <form id="profile-form" class="stack" style="margin-top:18px">
      <div class="auth-grid">
        <label>Nama Lengkap<input id="profile-nama" value="${safe(profile.nama || acc?.name || "")}" required /></label>
        <label>Nomor WA<input id="profile-wa" value="${safe(profile.nomorWa || "")}" inputmode="tel" /></label>
      </div>
      <div class="auth-grid">
        <label>Tanggal Lahir<input id="profile-birth" type="date" value="${safe(profile.tanggalLahir || "")}" /></label>
        <div class="field-label"><span>Foto Profil</span><div class="upload-actions"><label class="file-picker" for="profile-photo">Pilih File<input id="profile-photo" type="file" accept="image/*" /></label><label class="file-picker" for="profile-camera">Kamera<input id="profile-camera" type="file" accept="image/*" capture="user" /></label></div></div>
      </div>
      <label>Alamat<textarea id="profile-address" placeholder="Alamat lengkap">${safe(profile.alamat || "")}</textarea></label>
      <div class="actions"><button class="primary" type="submit">Simpan Profil</button></div>
    </form>
  </section>${passwordPanel}`;
}
function bindProfileView(){
  const form = document.querySelector("#profile-form");
  form.onsubmit = async e => {
    e.preventDefault();
    const acc = activeAccount();
    if(!acc) return;
    const file = document.querySelector("#profile-photo").files[0] || document.querySelector("#profile-camera").files[0];
    try {
      if(file) acc.photo = await convertImageToWebp(file);
    } catch(error) {
      toast(error.message || "Foto profil gagal diproses.");
      return;
    }
    acc.profile = {
      nama: document.querySelector("#profile-nama").value.trim(),
      alamat: document.querySelector("#profile-address").value.trim(),
      tanggalLahir: document.querySelector("#profile-birth").value,
      nomorWa: document.querySelector("#profile-wa").value.trim()
    };
    acc.name = acc.profile.nama || acc.name;
    saveState();
    toast("Profil disimpan.");
    renderShell();
  };
  bindPasswordPanel();
}
function summaryTable(rows, withShu){
  return `<table><thead><tr><th>Nama</th><th>Jabatan</th><th>Evaluator</th><th>Nilai</th><th>Kategori</th>${withShu?'<th>Persentase SHU</th><th>Nominal SHU</th>':''}<th>Progress</th></tr></thead><tbody>${rows.map(r=>`
    <tr><td><strong>${safe(r.member.name)}</strong></td><td>${safe(r.member.role)}</td><td>${r.evaluatorCount}/${APP_DATA.members.length-1}</td><td><strong>${pct(r.seriousness)}</strong></td><td><span class="badge ${badgeClass(r.category)}">${r.category}</span></td>${withShu?`<td>${pct(r.shuPct)}</td><td class="currency">${rupiah(r.shuNominal)}</td>`:''}<td><div class="progress"><i style="width:${Math.round(r.seriousness*100)}%"></i></div></td></tr>`).join("")}</tbody></table>`;
}
function inputView(){
  if(!isChecklistMember(activeUser)) return `<section class="card"><h2>Akses Anggota</h2><p class="muted">Akun anggota tidak memiliki akses pengisian checklist pengurus.</p></section>`;
  const targets = approvedChecklistAccounts().filter(acc => acc.memberId !== activeUser);
  if(!targets.find(t => t.memberId === selectedTarget)) selectedTarget = targets[0]?.memberId;
  if(!targets.length) return `<section class="card"><h2>Isi Checklist Pengurus Lain</h2><div class="empty">Belum ada user pengurus approved lain untuk dinilai.</div></section>`;
  const target = member(selectedTarget);
  const ev = getEvaluation(activeUser, selectedTarget);
  const items = APP_DATA.checklists[selectedTarget];
  return `<section class="card">
    <h2>Isi Checklist Pengurus Lain</h2>
    <p class="muted">Login sebagai <strong>${safe(activeAccount().name)}</strong>. Target penilaian hanya user pengurus yang sudah approved admin.</p>
    <div class="member-picker">${targets.map(acc => `<button class="member-card ${acc.memberId===selectedTarget?'active':''}" data-target="${acc.memberId}"><strong>${safe(acc.name)}</strong><br><span class="muted">${safe(acc.role)}</span></button>`).join("")}</div>
  </section>
  <section class="card" style="margin-top:18px">
    <div class="toolbar"><div><h2>Checklist: ${safe(target.name)}</h2><p class="muted">${safe(target.role)} | Fokus: ${safe(target.focus)}</p></div><div class="actions"><button id="save-checklist" class="primary">Simpan Checklist</button><button id="reset-current" class="ghost">Kosongkan Form Ini</button></div></div>
    <form id="checklist-form" class="checklist-form">${items.map(item => {
      const ans = ev.items[item.no] || {};
      const rating = answerRating(ans);
      return `<article class="check-item"><div class="check-num">${item.no}</div><div><h3>${safe(item.task)}</h3><p class="muted">Area: ${safe(item.area)} • Frekuensi: ${safe(item.frequency)} • Bobot: ${item.weight}</p><div class="check-fields"><div class="field-label"><span>Nilai Bintang</span><div class="rating-group" role="radiogroup" aria-label="Nilai untuk ${safe(item.task)}">${ratingOptions().map(rate=>`<label class="star-choice"><input type="radio" name="rating-${item.no}" value="${rate.value}" ${rating===rate.value?'checked':''}><span>${"★".repeat(rate.value)}</span><small>${rate.score}</small></label>`).join("")}</div></div><div class="field-label"><span>Bukti / Link</span><input name="proof-${item.no}" value="${safe(ans.proof||"")}" placeholder="Tempel link bukti bila ada" /><div class="upload-actions"><label class="file-picker" for="file-${item.no}">Pilih File<input id="file-${item.no}" name="file-${item.no}" type="file" accept="image/*" /></label><label class="file-picker" for="camera-${item.no}">Kamera<input id="camera-${item.no}" name="camera-${item.no}" type="file" accept="image/*" capture="environment" /></label></div>${proofPreview(ans)}</div><label>Catatan Evaluasi<textarea name="note-${item.no}" placeholder="Catatan singkat">${safe(ans.note||"")}</textarea></label></div></div></article>`;
    }).join("")}</form>
    <p class="footer-note">Terakhir disimpan: ${ev.submittedAt ? new Date(ev.submittedAt).toLocaleString('id-ID') : 'belum pernah'}</p>
  </section>`;
}
function proofPreview(ans){
  const file = ans?.proofFile;
  if(!file?.dataUrl) return "";
  return `<a class="proof-preview" href="${safe(file.dataUrl)}" target="_blank" rel="noopener"><img src="${safe(file.dataUrl)}" alt="Bukti ${safe(file.name || "")}" /><span>${safe(file.name || "bukti.webp")}</span></a>`;
}
function convertImageToWebp(file){
  return new Promise((resolve, reject) => {
    if(!file) return resolve(null);
    if(!file.type.startsWith("image/")) return reject(new Error("File bukti harus berupa gambar."));
    if(file.size > 8 * 1024 * 1024) return reject(new Error("Ukuran gambar maksimal 8 MB."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca gambar."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Gambar tidak valid."));
      img.onload = () => {
        const maxSize = 1600;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/webp", 0.82);
        resolve({ name: `${file.name.replace(/\.[^.]+$/, "") || "bukti"}.webp`, type: "image/webp", size: Math.round((dataUrl.length * 3) / 4), dataUrl, convertedAt: new Date().toISOString() });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function bindInputView(){
  document.querySelectorAll(".member-card:not([disabled])").forEach(btn => btn.onclick = () => { selectedTarget = btn.dataset.target; renderView(); });
  document.querySelector("#save-checklist").onclick = async () => {
    if(activeUser === selectedTarget){ toast("Pengurus tidak boleh menilai diri sendiri."); return; }
    const form = document.querySelector("#checklist-form");
    const items = {};
    const current = getEvaluation(activeUser, selectedTarget);
    try {
      for(const item of APP_DATA.checklists[selectedTarget]){
        const existing = current.items[item.no] || {};
        const file = form[`file-${item.no}`].files[0] || form[`camera-${item.no}`].files[0];
        const proofFile = file ? await convertImageToWebp(file) : existing.proofFile || null;
        const rating = Number(form[`rating-${item.no}`].value);
        if(!rating) throw new Error(`Nilai bintang nomor ${item.no} belum dipilih.`);
        items[item.no] = { rating, proof: form[`proof-${item.no}`].value.trim(), proofFile, note: form[`note-${item.no}`].value.trim() };
      }
    } catch(error) {
      toast(error.message || "Upload bukti gagal.");
      return;
    }
    setEvaluation({ evaluatorId: activeUser, targetId: selectedTarget, items, submittedAt: new Date().toISOString() });
    toast("Checklist berhasil disimpan."); renderView();
  };
  document.querySelector("#reset-current").onclick = () => {
    if(confirm("Kosongkan penilaian Anda untuk pengurus ini?")){ delete state.evaluations[key(activeUser,selectedTarget)]; saveState(); renderView(); }
  };
}
function evaluationsView(){
  const rows = allEvaluationRows().sort((a,b)=>(b.submittedAt||"").localeCompare(a.submittedAt||""));
  return `<section class="card"><div class="toolbar"><div><h2>Data Penilaian Pembagian SHU</h2><p class="muted">Semua data bintang dari masing-masing pengurus dibaca otomatis untuk dashboard dan SHU.</p></div><button class="ghost" onclick="downloadJson()">Unduh Backup JSON</button></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Evaluator</th><th>Dinilai</th><th>Tanggal</th><th>Ringkasan Nilai</th></tr></thead><tbody>${rows.map(ev=>evaluationRow(ev)).join("")}</tbody></table></div>`:'<div class="empty">Belum ada checklist yang disimpan.</div>'}</section>`;
}
function evaluationRow(ev){
  const counts = {1:0,2:0,3:0,4:0,5:0};
  Object.values(ev.items||{}).forEach(a => { const rating = answerRating(a); if(counts[rating] !== undefined) counts[rating]++; });
  const proofCount = Object.values(ev.items||{}).filter(a => a.proof || a.proofFile).length;
  return `<tr><td><strong>${safe(member(ev.evaluatorId)?.name)}</strong></td><td>${safe(member(ev.targetId)?.name)}</td><td>${ev.submittedAt ? new Date(ev.submittedAt).toLocaleString('id-ID') : '-'}</td><td>${[5,4,3,2,1].map(rate => `${ratingStars(rate)}: ${counts[rate]}`).join("<br>")}<br>Bukti: ${proofCount}</td></tr>`;
}
function shuView(){
  const rows = registeredShuRows();
  return `<section class="card"><div class="toolbar"><div><h2>Pembagian SHU Otomatis</h2><p class="muted">Pengurus mendapat 90% SHU berdasarkan proporsi nilai. Anggota mendapat 10% SHU, dibagi rata jika lebih dari satu anggota approved.</p></div><button class="ghost" onclick="window.print()">Cetak</button></div><label style="max-width:360px">Input Total SHU<span class="rupiah-wrap"><span>Rp</span><input id="total-shu" type="text" inputmode="numeric" autocomplete="off" value="${rupiahInput(state.totalShu)}" placeholder="0" /></span></label><div id="shu-table">${rows.length ? `<div class="table-wrap" style="margin-top:16px">${summaryTable(rows, true)}</div>` : '<div class="empty">Belum ada user approved untuk pembagian SHU.</div>'}</div></section>`;
}
function bindShuView(){
  const input = document.querySelector("#total-shu");
  input.addEventListener("input", e => {
    state.totalShu = parseRupiah(e.target.value);
    e.target.value = rupiahInput(state.totalShu);
    saveState();
    const rows = registeredShuRows();
    document.querySelector("#shu-table").innerHTML = rows.length ? `<div class="table-wrap" style="margin-top:16px">${summaryTable(rows, true)}</div>` : '<div class="empty">Belum ada user approved untuk pembagian SHU.</div>';
  });
}
function adminView(){
  const requests = state.signupRequests || [];
  const passwordRequests = state.passwordRequests || [];
  const pending = requests.filter(req => req.status === "pending");
  const pendingPassword = passwordRequests.filter(req => req.status === "pending");
  const approved = visibleAccounts().filter(acc => acc.status === "approved");
  const rejected = requests.filter(req => req.status === "rejected");
  return `<div class="grid cards">
    <article class="card metric"><span>Request Pending</span><strong>${pending.length}</strong></article>
    <article class="card metric"><span>Ganti Password</span><strong>${pendingPassword.length}</strong></article>
    <article class="card metric"><span>Akun Approved</span><strong>${approved.length}</strong></article>
    <article class="card metric"><span>Request Rejected</span><strong>${rejected.length}</strong></article>
  </div>
  <section class="card" style="margin-top:18px">
    <div class="toolbar"><div><h2>Verifikasi Pengguna Baru</h2><p class="muted">Approve untuk mengaktifkan akun. Reject untuk menolak request sign up.</p></div></div>
    ${pending.length ? `<div class="table-wrap"><table><thead><tr><th>Akses</th><th>Data Diri</th><th>Catatan</th><th>Tanggal</th><th>Aksi</th></tr></thead><tbody>${pending.map(req => requestRow(req, true)).join("")}</tbody></table></div>` : '<div class="empty">Tidak ada request pending.</div>'}
  </section>
  <section class="card" style="margin-top:18px">
    <div class="toolbar"><div><h2>Approval Ganti Password</h2><p class="muted">Approve untuk mengaktifkan password baru. Reject untuk membatalkan request.</p></div></div>
    ${pendingPassword.length ? `<div class="table-wrap"><table><thead><tr><th>Akun</th><th>Catatan</th><th>Tanggal</th><th>Aksi</th></tr></thead><tbody>${pendingPassword.map(req => passwordRequestRow(req, true)).join("")}</tbody></table></div>` : '<div class="empty">Tidak ada request ganti password pending.</div>'}
  </section>
  <section class="card" style="margin-top:18px">
    <h2>Riwayat Ganti Password</h2>
    ${passwordRequests.length ? `<div class="table-wrap"><table><thead><tr><th>Akun</th><th>Catatan</th><th>Status</th><th>Tanggal</th><th>Diputuskan</th></tr></thead><tbody>${passwordRequests.map(req => passwordRequestRow(req, false)).join("")}</tbody></table></div>` : '<div class="empty">Belum ada request ganti password.</div>'}
  </section>
  <section class="card" style="margin-top:18px">
    <h2>Riwayat Request</h2>
    ${requests.length ? `<div class="table-wrap"><table><thead><tr><th>Akses</th><th>Data Diri</th><th>Catatan</th><th>Status</th><th>Tanggal</th><th>Diputuskan</th></tr></thead><tbody>${requests.map(req => requestRow(req, false)).join("")}</tbody></table></div>` : '<div class="empty">Belum ada request sign up.</div>'}
  </section>
  ${userManagementSection()}
  <section class="card" style="margin-top:18px">
    <h2>Akun Aktif</h2>
    <div class="table-wrap"><table><thead><tr><th>Akun</th><th>Tipe</th><th>Status</th></tr></thead><tbody>${visibleAccounts().map(acc => `<tr><td><div class="user-cell">${accountAvatar(acc, true)}<div><strong>${safe(acc.name)}</strong><br><span class="muted">${safe(acc.role)}</span></div></div></td><td>${safe(acc.type)}</td><td>${statusBadge(acc.status)}</td></tr>`).join("")}</tbody></table></div>
  </section>`;
}
function visibleAccounts(){
  return Object.values(state.accounts || {}).filter(acc => acc.id !== APP_DATA.admin.id);
}
function userManagementSection(){
  return `<section class="card" style="margin-top:18px">
    <h2>Manajemen User</h2>
    <p class="muted">Edit data user atau hapus akun yang tidak dipakai. Akun admin utama tidak bisa dihapus.</p>
    ${userEditPanel()}
    <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Akun</th><th>Tipe</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${visibleAccounts().map(acc => userRow(acc)).join("")}</tbody></table></div>
  </section>`;
}
function userRow(acc){
  const locked = acc.id === APP_DATA.admin.id;
  return `<tr><td><div class="user-cell">${accountAvatar(acc, true)}<div><strong>${safe(acc.name)}</strong><br><span class="muted">${safe(acc.role)}</span></div></div></td><td>${safe(acc.type)}</td><td>${statusBadge(acc.status)}</td><td><div class="actions"><button class="ghost edit-user" data-user="${acc.id}" type="button">Edit</button>${locked ? "" : `<button class="danger delete-user" data-user="${acc.id}" type="button">Hapus</button>`}</div></td></tr>`;
}
function userEditPanel(){
  const acc = editingUserId ? account(editingUserId) : null;
  if(!acc) return "";
  const roles = acc.type === "admin" ? [{ id: "Administrator", label: "Administrator" }] : signupRoles().map(role => ({ id: role.role, label: role.label }));
  return `<form id="user-edit-form" class="stack note">
    <h3>Edit User</h3>
    <input id="edit-user-id" type="hidden" value="${safe(acc.id)}" />
    <div class="auth-grid">
      <label>Nama Tampilan<input id="edit-user-name" value="${safe(acc.name)}" required /></label>
      <label>Peran<select id="edit-user-role">${roles.map(role => `<option value="${safe(role.id)}" ${acc.role === role.id ? "selected" : ""}>${safe(role.label)}</option>`).join("")}</select></label>
    </div>
    <div class="auth-grid">
      <label>Status<select id="edit-user-status" ${acc.id === APP_DATA.admin.id ? "disabled" : ""}><option value="approved" ${acc.status === "approved" ? "selected" : ""}>Approved</option><option value="pending" ${acc.status === "pending" ? "selected" : ""}>Pending</option><option value="rejected" ${acc.status === "rejected" ? "selected" : ""}>Rejected</option></select></label>
      <label>Password Baru<input id="edit-user-password" type="password" minlength="6" placeholder="Kosongkan jika tidak diganti" /></label>
    </div>
    <div class="actions"><button class="primary" type="submit">Simpan User</button><button id="cancel-edit-user" class="ghost" type="button">Batal</button></div>
    <p id="user-edit-error" class="error hidden"></p>
  </form>`;
}
function requestRow(req, withActions){
  const profile = req.profile || parsePersonalInfo(req.note);
  const rawNote = extraSignupNote(req.note);
  if(!withActions){
    const decided = req.decidedAt ? new Date(req.decidedAt).toLocaleString("id-ID") : "-";
    return `<tr><td><strong>${safe(req.name)}</strong><br><span class="muted">${safe(req.role)}</span></td><td>${personalInfoText(profile)}</td><td>${safe(rawNote || "-")}</td><td>${statusBadge(req.status)}</td><td>${new Date(req.requestedAt).toLocaleString("id-ID")}</td><td>${decided}</td></tr>`;
  }
  const action = `<div class="actions"><button class="primary approve-request" data-request="${req.id}" type="button">Approve</button><button class="danger reject-request" data-request="${req.id}" type="button">Reject</button></div>`;
  return `<tr><td><strong>${safe(req.name)}</strong><br><span class="muted">${safe(req.role)}</span></td><td>${personalInfoText(profile)}</td><td>${safe(rawNote || "-")}</td><td>${new Date(req.requestedAt).toLocaleString("id-ID")}</td><td>${action}</td></tr>`;
}
function statusBadge(status){
  const classes = { approved: "good", pending: "mid", rejected: "bad" };
  const labels = { approved: "Approved", pending: "Pending", rejected: "Rejected" };
  return `<span class="badge ${classes[status] || "info"}">${labels[status] || safe(status)}</span>`;
}
function bindAdminView(){
  document.querySelectorAll(".approve-request").forEach(btn => btn.onclick = () => decideSignup(btn.dataset.request, "approved"));
  document.querySelectorAll(".reject-request").forEach(btn => btn.onclick = () => decideSignup(btn.dataset.request, "rejected"));
  document.querySelectorAll(".approve-password-request").forEach(btn => btn.onclick = () => decidePasswordRequest(btn.dataset.request, "approved"));
  document.querySelectorAll(".reject-password-request").forEach(btn => btn.onclick = () => decidePasswordRequest(btn.dataset.request, "rejected"));
  bindUserManagementControls();
}
function bindUserManagementControls(){
  document.querySelectorAll(".edit-user").forEach(btn => btn.onclick = () => { editingUserId = btn.dataset.user; renderView(); });
  document.querySelectorAll(".delete-user").forEach(btn => btn.onclick = () => deleteUser(btn.dataset.user));
  const form = document.querySelector("#user-edit-form");
  if(form){
    document.querySelector("#cancel-edit-user").onclick = () => { editingUserId = null; renderView(); };
    form.onsubmit = async e => {
      e.preventDefault();
      const id = document.querySelector("#edit-user-id").value;
      const acc = account(id);
      if(!acc) return;
      const password = document.querySelector("#edit-user-password").value;
      if(password && password.length < 6){
        document.querySelector("#user-edit-error").textContent = "Password minimal 6 karakter.";
        document.querySelector("#user-edit-error").classList.remove("hidden");
        return;
      }
      acc.name = document.querySelector("#edit-user-name").value.trim() || acc.name;
      acc.role = document.querySelector("#edit-user-role").value;
      if(id !== APP_DATA.admin.id) acc.status = document.querySelector("#edit-user-status").value;
      if(password) acc.password = await hashPassword(password);
      saveState();
      editingUserId = null;
      toast("Data user disimpan.");
      renderView();
    };
  }
}
function deleteUser(id){
  if(id === APP_DATA.admin.id){ toast("Akun admin tidak bisa dihapus."); return; }
  const acc = account(id);
  if(!acc) return;
  if(!confirm(`Hapus user ${acc.name}?`)) return;
  delete state.accounts[id];
  Object.keys(state.evaluations || {}).forEach(evKey => {
    const ev = state.evaluations[evKey];
    if(ev?.evaluatorId === id || ev?.targetId === id || ev?.evaluatorId === acc.memberId || ev?.targetId === acc.memberId) delete state.evaluations[evKey];
  });
  state.passwordRequests = (state.passwordRequests || []).filter(req => req.accountId !== id);
  if(activeUser === id){
    sessionStorage.removeItem(SESSION_KEY);
    activeUser = null;
    activeTab = "dashboard";
  }
  saveState();
  toast("User dihapus.");
  render();
}
async function decideSignup(requestId, status){
  const req = state.signupRequests.find(item => item.id === requestId);
  if(!req) return;
  req.status = status;
  req.decidedAt = new Date().toISOString();
  req.decidedBy = activeUser;
  if(status === "approved"){
    const accountId = req.accountId || req.memberId;
    const existing = account(accountId) || {};
    const hashedPassword = await hashPassword(req.password);
    state.accounts[accountId] = { ...existing, id: accountId, memberId: req.memberId || null, name: req.name, role: req.role, profile: req.profile || parsePersonalInfo(req.note), password: hashedPassword, type: "member", status: "approved", createdAt: existing.createdAt || req.requestedAt, approvedAt: req.decidedAt };
    toast(`Akun ${req.name} disetujui.`);
  } else {
    toast(`Request ${req.name} ditolak.`);
  }
  saveState();
  renderView();
}
function passwordRequestRow(req, withActions){
  if(!withActions){
    const decided = req.decidedAt ? new Date(req.decidedAt).toLocaleString("id-ID") : "-";
    return `<tr><td><strong>${safe(req.name)}</strong><br><span class="muted">${safe(req.role)}</span></td><td>${safe(req.note || "-")}</td><td>${statusBadge(req.status)}</td><td>${new Date(req.requestedAt).toLocaleString("id-ID")}</td><td>${decided}</td></tr>`;
  }
  return `<tr><td><strong>${safe(req.name)}</strong><br><span class="muted">${safe(req.role)}</span></td><td>${safe(req.note || "-")}</td><td>${new Date(req.requestedAt).toLocaleString("id-ID")}</td><td><div class="actions"><button class="primary approve-password-request" data-request="${req.id}" type="button">Approve</button><button class="danger reject-password-request" data-request="${req.id}" type="button">Reject</button></div></td></tr>`;
}
async function decidePasswordRequest(requestId, status){
  const req = state.passwordRequests.find(item => item.id === requestId);
  if(!req) return;
  req.status = status;
  req.decidedAt = new Date().toISOString();
  req.decidedBy = activeUser;
  if(status === "approved"){
    const acc = account(req.accountId);
    if(acc) acc.password = await hashPassword(req.newPassword);
    toast(`Password ${req.name} disetujui.`);
  } else {
    toast(`Request password ${req.name} ditolak.`);
  }
  saveState();
  renderView();
}
function settingsView(){
  const acc = activeAccount();
  const pendingPassword = (state.passwordRequests || []).filter(req => req.accountId === activeUser && req.status === "pending").length;
  const passwordPanel = isAdmin() ? "" : `<section class="card" style="margin-top:18px"><h2>Ajukan Ganti Password</h2><p class="muted">Password baru akan aktif setelah admin melakukan approval.</p>${pendingPassword ? `<div class="note">Ada ${pendingPassword} request ganti password yang masih menunggu approval admin.</div>` : ""}<form id="password-change-form" class="stack" style="margin-top:14px"><label>Password Baru<span class="password-wrap"><input id="new-password" type="password" autocomplete="new-password" minlength="6" placeholder="Minimal 6 karakter" required /><button id="toggle-new-password" class="icon-btn" type="button" aria-label="Lihat password baru">Lihat</button></span></label><label>Catatan untuk Admin<textarea id="password-change-note" placeholder="Contoh: mohon approve ganti password saya."></textarea></label><button class="primary" type="submit">Ajukan Ganti Password</button><p id="password-change-message" class="success hidden"></p><p id="password-change-error" class="error hidden"></p></form></section>`;
  const adminUserPanel = isAdmin() ? userManagementSection() : "";
  return `<section class="card"><h2>Pengaturan & Backup</h2><div class="grid two"><div><h3>Data Database</h3><p class="muted">Data disimpan ke MySQL melalui <code>api.php</code>, dengan salinan cadangan di browser jika koneksi database belum tersedia.</p><div class="actions"><button id="export-json" class="primary">Unduh Backup JSON</button><label class="ghost" style="display:inline-flex;align-items:center;gap:8px">Impor JSON<input id="import-json" type="file" accept="application/json" class="hidden"></label><button id="clear-data" class="danger">Hapus Semua Data</button></div></div><div><h3>Akun Aktif</h3><div class="user-cell settings-user">${accountAvatar(acc, true)}<p><strong>${safe(acc?.name || "-")}</strong><br><span class="muted">${safe(acc?.role || "-")}</span></p></div><p class="muted">Pengurus dan anggota dibuat melalui sign up, lalu diverifikasi admin.</p><p class="muted">Status sinkron database: ${remoteReady ? "aktif" : "menunggu koneksi API"}.</p></div></div></section>${adminUserPanel}${passwordPanel}`;
}
function bindSettingsView(){
  document.querySelector("#export-json").onclick = downloadJson;
  if(isAdmin()) bindUserManagementControls();
  bindPasswordPanel();
  document.querySelector("#clear-data").onclick = () => { if(confirm("Hapus semua data penilaian, akun, request sign up, request ganti password, dan total SHU di browser ini?")){ state = { evaluations:{}, totalShu:0, accounts: defaultAccounts(), signupRequests: [], passwordRequests: [], authSchemaVersion: AUTH_SCHEMA_VERSION, updatedAt:null}; saveState(); toast("Data dihapus."); renderView(); } };
  document.querySelector("#import-json").onchange = (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader(); reader.onload = () => { try { const data = cleanLegacyFields(JSON.parse(reader.result)); state = { evaluations: data.evaluations || {}, totalShu: Number(data.totalShu||0), accounts: { ...defaultAccounts(), ...(data.accounts || {}) }, signupRequests: data.signupRequests || [], passwordRequests: data.passwordRequests || [], authSchemaVersion: AUTH_SCHEMA_VERSION, updatedAt: data.updatedAt || new Date().toISOString() }; saveState(); toast("Backup berhasil diimpor."); renderView(); } catch { toast("File JSON tidak valid."); } }; reader.readAsText(file);
  };
}
function bindPasswordPanel(){
  const passwordForm = document.querySelector("#password-change-form");
  if(passwordForm){
    bindPasswordToggle("#new-password", "#toggle-new-password");
    passwordForm.onsubmit = e => {
      e.preventDefault();
      const password = document.querySelector("#new-password").value;
      const note = document.querySelector("#password-change-note").value.trim();
      if(password.length < 6){
        document.querySelector("#password-change-error").textContent = "Password minimal 6 karakter.";
        document.querySelector("#password-change-error").classList.remove("hidden");
        return;
      }
      const existingPending = (state.passwordRequests || []).some(req => req.accountId === activeUser && req.status === "pending");
      if(existingPending){
        document.querySelector("#password-change-error").textContent = "Masih ada request ganti password yang menunggu approval admin.";
        document.querySelector("#password-change-error").classList.remove("hidden");
        return;
      }
      const acc = activeAccount();
      state.passwordRequests.unshift({ id: `pwd_${Date.now()}`, accountId: activeUser, name: acc.name, role: acc.role, newPassword: password, note, status: "pending", requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null });
      saveState();
      document.querySelector("#password-change-error").classList.add("hidden");
      document.querySelector("#password-change-message").textContent = "Request ganti password terkirim. Tunggu approval admin.";
      document.querySelector("#password-change-message").classList.remove("hidden");
      passwordForm.reset();
    };
  }
  const adminPasswordForm = document.querySelector("#admin-password-form");
  if(adminPasswordForm){
    bindPasswordToggle("#admin-new-password", "#toggle-admin-password");
    adminPasswordForm.onsubmit = async e => {
      e.preventDefault();
      const password = document.querySelector("#admin-new-password").value;
      if(password.length < 6){
        document.querySelector("#admin-password-error").textContent = "Password minimal 6 karakter.";
        document.querySelector("#admin-password-error").classList.remove("hidden");
        return;
      }
      const acc = activeAccount();
      if(acc) {
        acc.password = await hashPassword(password);
        saveState();
        document.querySelector("#admin-password-error").classList.add("hidden");
        document.querySelector("#admin-password-message").textContent = "Password berhasil diubah dan dienkripsi.";
        document.querySelector("#admin-password-message").classList.remove("hidden");
        adminPasswordForm.reset();
      }
    };
  }
}
function downloadJson(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = `backup-checklist-shu-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
}
render();
setupInstallPrompt();
pullRemoteState();
