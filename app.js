const STORAGE_KEY = "koperasi_checklist_shu_v1";
const SESSION_KEY = "koperasi_active_user_v1";
const AUTH_SCHEMA_VERSION = 2;
const API_URL = "api.php"; // Pastikan path ini benar
const CASHFLOW_FILE_URL = `${API_URL}?action=cashflow-file`;
const CASHFLOW_MAX_FILE_SIZE = 4 * 1024 * 1024;
const app = document.querySelector("#app");

const ADMIN_ACCOUNT = { id: "admin", name: "Admin Indosejuk", role: "Administrator", password: "admin123" };
const RATINGS = [
    { value: 1, label: "1 Bintang", score: 20 },
    { value: 2, label: "2 Bintang", score: 40 },
    { value: 3, label: "3 Bintang", score: 60 },
    { value: 4, label: "4 Bintang", score: 80 },
    { value: 5, label: "5 Bintang", score: 100 }
];

let APP_CONFIG = {
  admin: ADMIN_ACCOUNT,
  ratings: RATINGS,
  members: [], // Akan diisi dari API
  checklists: {} // Akan diisi dari API
};

let state = loadState();
let activeUser = sessionStorage.getItem(SESSION_KEY);
let activeTab = "dashboard";
let selectedTarget = null; // Akan di-set setelah data dimuat
let editingUserId = null;
let remoteSaveTimer = null;
let remoteReady = false;
let deferredInstallPrompt = null;
let needsRender = false;

function defaultAccounts(){ return { [ADMIN_ACCOUNT.id]: { id: ADMIN_ACCOUNT.id, memberId: null, name: ADMIN_ACCOUNT.name, role: ADMIN_ACCOUNT.role, password: ADMIN_ACCOUNT.password, type: "admin", status: "approved", createdAt: new Date().toISOString(), approvedAt: new Date().toISOString() } }; }
function loadState(){
  const fallback = { evaluations: {}, totalShu: 0, shuDistribution: defaultShuDistribution(), cashFlow: null, accounts: defaultAccounts(), signupRequests: [], passwordRequests: [], authSchemaVersion: AUTH_SCHEMA_VERSION, updatedAt: null };
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
  if(options.localOnly) return Promise.resolve(false);
  if(options.immediate) {
    clearTimeout(remoteSaveTimer);
    return pushRemoteState();
  }
  scheduleRemoteSave();
  return Promise.resolve(false);
}
function normalizeState(data){
  const fallback = { evaluations: {}, totalShu: 0, shuDistribution: defaultShuDistribution(), cashFlow: null, accounts: defaultAccounts(), signupRequests: [], passwordRequests: [], authSchemaVersion: AUTH_SCHEMA_VERSION, updatedAt: null };
  const clean = cleanLegacyFields(data || {});
  const admin = ADMIN_ACCOUNT;
  const savedAdmin = clean.accounts?.[admin.id] || {};
  return {
    ...fallback,
    ...clean,
    totalShu: Number(clean.totalShu || 0),
    shuDistribution: normalizeShuDistribution(clean.shuDistribution),
    cashFlow: normalizeCashFlow(clean.cashFlow),
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
function defaultShuDistribution(){ return { pengurus: 0.9, anggota: 0.1 }; }
function normalizeShuDistribution(value){
  const fallback = defaultShuDistribution();
  return {
    pengurus: normalizePercentValue(value?.pengurus, fallback.pengurus),
    anggota: normalizePercentValue(value?.anggota, fallback.anggota)
  };
}
function normalizeCashFlow(value){
  if(!value || typeof value !== "object" || !Array.isArray(value.sheets)) return null;
  const sheets = value.sheets
    .filter(sheet => sheet && typeof sheet.name === "string" && Array.isArray(sheet.rows))
    .map(sheet => ({
      name: sheet.name,
      rows: sheet.rows.map(row => Array.isArray(row) ? row.map(cell => cell ?? "") : [])
    }));
  if(!sheets.length) return null;
  return {
    fileName: String(value.fileName || "arus-kas.xlsx"),
    fileType: String(value.fileType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    fileDataUrl: typeof value.fileDataUrl === "string" ? value.fileDataUrl : "",
    importedAt: value.importedAt || null,
    selectedSheet: sheets.some(sheet => sheet.name === value.selectedSheet) ? value.selectedSheet : sheets[0].name,
    sheets
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
      const remoteState = normalizeState(result.state);
      const serverTime = result.updatedAt;
      const lastServerTime = localStorage.getItem("koperasi_last_server_time");
      
      if(serverTime === lastServerTime){
        remoteReady = true;
        const lastPushed = localStorage.getItem("koperasi_last_pushed_time");
        if(state.updatedAt && state.updatedAt !== lastPushed){
          pushRemoteState();
        }
        return;
      }
      
      if(state.updatedAt === remoteState.updatedAt){
        remoteReady = true;
        if(serverTime) localStorage.setItem("koperasi_last_server_time", serverTime);
        return;
      }
      
      state = remoteState;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if(serverTime) localStorage.setItem("koperasi_last_server_time", serverTime);
      localStorage.setItem("koperasi_last_pushed_time", state.updatedAt);
      remoteReady = true;
      
      const activeEl = document.activeElement;
      const isTyping = activeEl && ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName);
      if(!isTyping) {
        render();
        needsRender = false;
      } else {
        needsRender = true;
      }
    } else {
      remoteReady = true;
      if (state.updatedAt) pushRemoteState();
    }
  } catch(error) {
    remoteReady = false;
    console.warn(error.message || error);
  }
}
async function pushRemoteState(){
  try {
    clearTimeout(remoteSaveTimer);
    const pushedTime = state.updatedAt;
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ state })
    });
    if(!response.ok) throw new Error("Sinkron database gagal.");
    remoteReady = true;
    localStorage.setItem("koperasi_last_pushed_time", pushedTime);
    return true;
  } catch(error) {
    remoteReady = false;
    console.warn(error.message || error);
    return false;
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
function getRoleData(roleId){ return APP_CONFIG.members.find(r => r.id === roleId); }
function getEvaluatableMembers() {
    return Object.values(state.accounts)
        .filter(acc => acc.status === 'approved' && acc.type === 'member' && acc.role !== 'Anggota')
        .map(acc => {
            const roleData = getRoleData(acc.memberId);
            return {
                id: acc.id,
                name: acc.name,
                role: acc.role,
                focus: roleData?.focus || '',
                memberId: acc.memberId
            };
        });
}
function getMemberData(accountId) { return getEvaluatableMembers().find(m => m.id === accountId); }
function signupRoles(){
  return [
    ...APP_CONFIG.members.map(r => ({ id: r.id, label: r.role, name: r.role, role: r.role, type: "member" })),
    { id: "anggota", label: "Anggota", name: "Anggota", role: "Anggota", type: "general" }
  ];
}
function signupRole(id){ return signupRoles().find(role => role.id === id); }
function account(id){ return state.accounts?.[id]; }
function activeAccount(){ return account(activeUser); }
function isAdmin(){ return activeAccount()?.type === "admin"; }
function isChecklistMember(id){ const acc = account(id); return Boolean(acc?.memberId && getRoleData(acc.memberId) && acc.role !== "Anggota" && acc.status === "approved"); }
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
function parseRupiah(value){ return Number(String(value || "").replace(/[^\d,]/g, "").replace(",", ".")) || 0; }
function pct(value){ return `${Math.round((value||0)*100)}%`; }
function normalizePercentValue(value, fallback = 0){
  if(value === null || value === undefined || value === "") return fallback;
  if(typeof value === "number" && Number.isFinite(value)) return clampPercent(value > 1 ? value / 100 : value, fallback);
  const text = String(value).trim();
  if(!text) return fallback;
  const numeric = parseLocalizedNumber(text.replace("%", ""));
  if(!Number.isFinite(numeric)) return fallback;
  return clampPercent(text.includes("%") || numeric > 1 ? numeric / 100 : numeric, fallback);
}
function parseLocalizedNumber(value){
  const text = String(value || "").replace(/[^\d,.-]/g, "");
  if(!text) return NaN;
  if(text.includes(",") && text.includes(".")) return Number(text.replace(/\./g, "").replace(",", "."));
  if(text.includes(",")) return Number(text.replace(",", "."));
  return Number(text);
}
function clampPercent(value, fallback){
  if(!Number.isFinite(value) || value < 0) return fallback;
  return Math.min(value, 1);
}
function parseSpreadsheetMoney(value){
  if(typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  return parseRupiah(value);
}
function safe(text){ return String(text ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
function key(evaluatorId, targetId){ return `${evaluatorId}__${targetId}`; }
function ratingOptions(){ return RATINGS || []; }
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
function setEvaluation(evaluation){
  state.evaluations[key(evaluation.evaluatorId,evaluation.targetId)] = evaluation;
  saveState();
}
function allEvaluationRows(){ return Object.values(state.evaluations || {}).filter(e => e && e.evaluatorId !== e.targetId); }
function calculateTarget(targetId, roleId){
  const items = APP_CONFIG.checklists[roleId];
  if (!items) {
    return { targetId, evaluatorCount: 0, totalAnswers: 0, assessedWeight: 0, scoreWeight: 0, seriousness: 0, category: "Belum Serius", completed: 0, progress: 0, pending: 0 };
  }
  const rows = allEvaluationRows().filter(e => e.targetId === targetId);
  let scoreWeight = 0, assessedWeight = 0, completed = 0, progress = 0, pending = 0, totalAnswers = 0;
  const evaluatableMembers = getEvaluatableMembers();
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
  const rows = getEvaluatableMembers().map(m => ({...calculateTarget(m.id, m.memberId), member:m}));
  const totalSeriousness = rows.reduce((a,r)=>a+r.seriousness,0);
  const distribution = normalizeShuDistribution(state.shuDistribution);
  return rows.map(r => {
    const pengurusPct = totalSeriousness === 0 ? (r.seriousness > 0 ? distribution.pengurus / rows.length : 0) : (r.seriousness / totalSeriousness) * distribution.pengurus;
    return {...r, shuPct: pengurusPct, shuNominal: (state.totalShu||0) * pengurusPct};
  });
}
function registeredUsers(){
  return Object.values(state.accounts || {}).filter(acc => acc.id !== ADMIN_ACCOUNT.id && acc.status === "approved");
}
function registeredShuRows(){
  const users = registeredUsers();
  const pengurusUsers = users.filter(acc => acc.role !== "Anggota" && acc.memberId);
  const anggota = users.filter(acc => acc.role === "Anggota");
  const totalSeriousness = pengurusUsers.reduce((sum, acc) => sum + (calculateTarget(acc.id, acc.memberId).seriousness || 0), 0);
  const distribution = normalizeShuDistribution(state.shuDistribution);
  const nonMemberRows = pengurusUsers.map(acc => {
    const base = calculateTarget(acc.id, acc.memberId);
    base.shuPct = totalSeriousness > 0 ? (base.seriousness / totalSeriousness) * distribution.pengurus : (pengurusUsers.length > 0 ? distribution.pengurus / pengurusUsers.length : 0);
    return { ...base, member: { id: acc.id, name: acc.name, role: acc.role }, account: acc, shuPct: base.shuPct || 0, shuNominal: (state.totalShu || 0) * (base.shuPct || 0) };
  });
  const anggotaPct = anggota.length ? distribution.anggota / anggota.length : 0;
  const anggotaRows = anggota.map(acc => ({ targetId: acc.id, member: { id: acc.id, name: acc.name, role: "Anggota" }, account: acc, evaluatorCount: 0, seriousness: 0, category: "Anggota", completed: 0, progress: 0, pending: 0, shuPct: anggotaPct, shuNominal: (state.totalShu || 0) * anggotaPct }));
  return [...nonMemberRows, ...anggotaRows];
}
function registeredDashboardRows(){
  return registeredShuRows().map(row => ({ ...row, shuPct: row.shuPct || 0, shuNominal: row.shuNominal || 0 }));
}
function approvedChecklistAccounts(){ return registeredUsers().filter(acc => acc.memberId && getRoleData(acc.memberId) && acc.role !== "Anggota"); }
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

async function render(){
  if(activeUser === ADMIN_ACCOUNT.id && !canShowAdminLogin()){
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
    if(id === ADMIN_ACCOUNT.id && !canShowAdminLogin()){
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
    activeUser = id; sessionStorage.setItem(SESSION_KEY,id); activeTab = isAdmin() ? "admin" : "dashboard"; render();
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
    const baseId = (profile.nama || 'user').split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const accountId = `${baseId}_${Date.now()}`;
    state.signupRequests.unshift({ id: `req_${Date.now()}`, accountId, memberId: memberId === "anggota" ? null : memberId, name: profile.nama, role: selected.role, password, note, profile, status: "pending", requestedAt: new Date().toISOString(), decidedAt: null, decidedBy: null });
    saveState();
    document.querySelector("#signup-error").classList.add("hidden");
    document.querySelector("#signup-message").textContent = "Sign up terkirim. Tunggu admin melakukan approval sebelum login.";
    document.querySelector("#signup-message").classList.remove("hidden");
    e.target.reset();
    document.querySelector("#signup-note").value = personalInfoTemplate();
  });
}
function loginOptions(){
  const admin = ADMIN_ACCOUNT;
  const emptyOption = `<option value="" selected disabled>Pilih akun</option>`;
  const adminOption = canShowAdminLogin() ? `<option value="${admin.id}">${admin.name} — ${admin.role}</option>` : "";
  if(canShowAdminLogin()) return `${emptyOption}${adminOption}`;
  const approvedMemberOptions = Object.values(state.accounts || {})
    .filter(acc => acc.status === "approved" && acc.id !== ADMIN_ACCOUNT.id)
    .map(acc => `<option value="${acc.id}">${safe(acc.name)} — ${safe(acc.role)}</option>`)
    .join("");
  return `${emptyOption}${adminOption}${approvedMemberOptions}`;
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
  if (!selectedTarget) {
    const members = getEvaluatableMembers();
    selectedTarget = members.find(m => m.id !== activeUser)?.id || members[0]?.id;
  }

  app.innerHTML = document.querySelector("#shell-template").innerHTML;
  document.querySelector("#active-user").textContent = accountLabel(activeAccount());
  refreshInstallButton();
  document.querySelector("#install-app-btn").onclick = installApp;
  if(isAdmin() && !["admin","profile","admin-evaluations","cashflow","settings"].includes(activeTab)) activeTab = "admin";
  document.querySelector(".admin-tab").classList.toggle("hidden", !isAdmin());
  document.querySelectorAll(".admin-only-tab").forEach(btn => btn.classList.toggle("hidden", !isAdmin()));
  document.querySelector('[data-tab="settings"]').classList.toggle("hidden", !isAdmin());
  document.querySelectorAll('[data-tab="dashboard"], [data-tab="input"], [data-tab="evaluations"], [data-tab="shu"]').forEach(btn => btn.classList.toggle("hidden", isAdmin()));
  document.querySelectorAll('[data-tab="input"], [data-tab="evaluations"]').forEach(btn => btn.classList.toggle("hidden", !isChecklistMember(activeUser)));
  if(!isAdmin() && ["admin","admin-evaluations","cashflow","settings"].includes(activeTab)) activeTab = "dashboard";
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
  if(activeTab === "admin-evaluations") { view.innerHTML = adminEvaluationsView(); bindOpenCashFlowButtons(); return; }
  if(activeTab === "cashflow") { view.innerHTML = cashFlowView(); bindCashFlowView(); return; }
  if(activeTab === "dashboard") { view.innerHTML = dashboardView(); bindDashboardView(); }
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
  const openFileButton = state.cashFlow?.fileDataUrl ? `<button class="ghost open-cashflow-file" type="button">Buka File Arus Kas</button>` : "";
  return `<div class="grid cards">
    <article class="card metric"><span>User Approved</span><strong>${registeredUsers().length}</strong></article>
    <article class="card metric"><span>Rata-rata Keseriusan</span><strong>${pct(avg)}</strong></article>
    <article class="card metric"><span>Nilai Tertinggi</span><strong>${top ? safe(top.member.name) : "-"}</strong><small>${top ? pct(top.seriousness) : ""}</small></article>
    <article class="card metric"><span>Data Penilaian Masuk</span><strong>${evalCount}</strong></article>
  </div>
  <div class="grid ${showRules ? "two" : ""}" style="margin-top:18px">
    <section class="card">
      <div class="toolbar"><div class="kpi-title"><h2>Nilai Keseriusan Pengurus</h2><span class="badge ${countVery ? 'good':'bad'}">${countVery} Sangat Serius</span></div><div class="actions">${openFileButton}</div></div>
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
function bindDashboardView(){
  bindOpenCashFlowButtons();
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
    <tr><td><strong>${safe(r.member.name)}</strong></td><td>${safe(r.member.role)}</td><td>${r.evaluatorCount}/${Math.max(0, getEvaluatableMembers().length - 1)}</td><td><strong>${pct(r.seriousness)}</strong></td><td><span class="badge ${badgeClass(r.category)}">${r.category}</span></td>${withShu?`<td>${pct(r.shuPct)}</td><td class="currency">${rupiah(r.shuNominal)}</td>`:''}<td><div class="progress"><i style="width:${Math.round(r.seriousness*100)}%"></i></div></td></tr>`).join("")}</tbody></table>`;
}
function inputView(){
  if(!isChecklistMember(activeUser)) return `<section class="card"><h2>Akses Anggota</h2><p class="muted">Akun anggota tidak memiliki akses pengisian checklist pengurus.</p></section>`;
  const targets = approvedChecklistAccounts().filter(acc => acc.id !== activeUser);
  if(!targets.find(t => t.id === selectedTarget)) selectedTarget = targets[0]?.id;
  if(!targets.length) return `<section class="card"><h2>Isi Checklist Pengurus Lain</h2><div class="empty">Belum ada user pengurus approved lain untuk dinilai.</div></section>`;
  const targetAccount = account(selectedTarget);
  const roleData = getRoleData(targetAccount.memberId);
  const ev = getEvaluation(activeUser, targetAccount.id);
  const items = APP_CONFIG.checklists[targetAccount.memberId];
  return `<section class="card">
    <h2>Isi Checklist Pengurus Lain</h2>
    <p class="muted">Login sebagai <strong>${safe(activeAccount().name)}</strong>. Target penilaian hanya user pengurus yang sudah approved admin.</p>
    <div class="member-picker">${targets.map(acc => `<button class="member-card ${acc.id===selectedTarget?'active':''}" data-target="${acc.id}"><strong>${safe(acc.name)}</strong><br><span class="muted">${safe(acc.role)}</span></button>`).join("")}</div>
  </section>
  <section class="card" style="margin-top:18px">
    <div class="toolbar"><div><h2>Checklist: ${safe(targetAccount.name)}</h2><p class="muted">${safe(targetAccount.role)} | Fokus: ${safe(roleData?.focus)}</p></div><div class="actions"><button id="save-checklist" class="primary">Simpan Checklist</button><button id="reset-current" class="ghost">Kosongkan Form Ini</button></div></div>
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
    const targetMember = getMemberData(selectedTarget);
    const form = document.querySelector("#checklist-form");
    const items = {};
    const current = getEvaluation(activeUser, selectedTarget);
    try {
      for(const item of APP_CONFIG.checklists[targetMember.memberId]){
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
    toast("Checklist berhasil disimpan.");
    renderView();
  };
  document.querySelector("#reset-current").onclick = () => {
    if(confirm("Kosongkan penilaian Anda untuk pengurus ini?")){ delete state.evaluations[key(activeUser,selectedTarget)]; saveState(); toast("Penilaian dikosongkan."); renderView(); }
  };
}
function evaluationsView(){
  const rows = allEvaluationRows().sort((a,b)=>(b.submittedAt||"").localeCompare(a.submittedAt||""));
  return `<section class="card"><div class="toolbar"><div><h2>Hasil Penilaian</h2><p class="muted">User hanya melihat hasil penilaian tanpa identitas pemberi nilai.</p></div></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Dinilai</th><th>Tanggal</th><th>Ringkasan Nilai</th></tr></thead><tbody>${rows.map(ev=>evaluationRow(ev, false)).join("")}</tbody></table></div>`:'<div class="empty">Belum ada checklist yang disimpan.</div>'}</section>`;
}
function evaluationRow(ev, showEvaluator = true){
  const targetAccount = account(ev.targetId);
  const evaluatorAccount = account(ev.evaluatorId);
  const counts = {1:0,2:0,3:0,4:0,5:0};
  Object.values(ev.items||{}).forEach(a => { const rating = answerRating(a); if(counts[rating] !== undefined) counts[rating]++; });
  const proofCount = Object.values(ev.items||{}).filter(a => a.proof || a.proofFile).length;
  const resultCells = `<td>${safe(targetAccount?.name)}</td><td>${ev.submittedAt ? new Date(ev.submittedAt).toLocaleString('id-ID') : '-'}</td><td>${[5,4,3,2,1].map(rate => `${ratingStars(rate)}: ${counts[rate]}`).join("<br>")}<br>Bukti: ${proofCount}</td>`;
  return showEvaluator ? `<tr><td><strong>${safe(evaluatorAccount?.name)}</strong></td>${resultCells}</tr>` : `<tr>${resultCells}</tr>`;
}
function shuView(){
  const rows = registeredShuRows();
  const distribution = normalizeShuDistribution(state.shuDistribution);
  return `<section class="card"><div class="toolbar"><div><h2>Pembagian SHU Otomatis</h2><p class="muted">Pengurus mendapat ${pct(distribution.pengurus)} SHU berdasarkan proporsi nilai. Anggota mendapat ${pct(distribution.anggota)} SHU, dibagi rata jika lebih dari satu anggota approved.</p></div><button class="ghost" onclick="window.print()">Cetak</button></div><label style="max-width:360px">Input Total SHU<span class="rupiah-wrap"><span>Rp</span><input id="total-shu" type="text" inputmode="numeric" autocomplete="off" value="${rupiahInput(state.totalShu)}" placeholder="0" /></span></label><div id="shu-table">${rows.length ? `<div class="table-wrap" style="margin-top:16px">${summaryTable(rows, true)}</div>` : '<div class="empty">Belum ada user approved untuk pembagian SHU.</div>'}</div></section>`;
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
function cashFlowView(){
  const cashFlow = state.cashFlow;
  const distribution = normalizeShuDistribution(state.shuDistribution);
  const selected = selectedCashFlowSheet();
  const sheets = cashFlow?.sheets || [];
  return `<div class="grid cards">
    <article class="card metric"><span>Total SHU</span><strong>${rupiah(state.totalShu)}</strong></article>
    <article class="card metric"><span>SHU Pengurus</span><strong>${pct(distribution.pengurus)}</strong></article>
    <article class="card metric"><span>SHU Anggota</span><strong>${pct(distribution.anggota)}</strong></article>
    <article class="card metric"><span>Sheet Terbaca</span><strong>${sheets.length}</strong></article>
  </div>
  <section class="card" style="margin-top:18px">
    <div class="toolbar">
      <div><h2>Arus Kas</h2><p class="muted">Import file XLSX laporan kas. Nilai Dashboard!H17 mengisi Total SHU, SHU!C11 mengisi persen pengurus, dan SHU!C9 mengisi persen anggota.</p></div>
      <div class="actions">
        <label class="primary file-action">Import XLSX<input id="cashflow-import" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="hidden"></label>
        ${cashFlow?.fileDataUrl ? `<button class="ghost open-cashflow-file" type="button">Buka File</button>` : ""}
      </div>
    </div>
    ${cashFlow ? `<div class="note">File: <strong>${safe(cashFlow.fileName)}</strong>${cashFlow.importedAt ? `, diimport ${new Date(cashFlow.importedAt).toLocaleString("id-ID")}` : ""}. Perubahan pada tabel di bawah disimpan ke aplikasi dan langsung memperbarui SHU jika menyentuh sel rujukan.</div>` : '<div class="empty">Belum ada file arus kas. Import file XLSX untuk menampilkan dan menyinkronkan data.</div>'}
    ${cashFlow ? cashFlowWorkbookPanel(selected, sheets) : ""}
  </section>`;
}
function cashFlowWorkbookPanel(selected, sheets){
  if(!selected) return "";
  return `<div class="toolbar cashflow-toolbar">
    <label>Sheet<select id="cashflow-sheet">${sheets.map(sheet => `<option value="${safe(sheet.name)}" ${sheet.name === selected.name ? "selected" : ""}>${safe(sheet.name)}</option>`).join("")}</select></label>
    <div class="cashflow-cells"><span>Dashboard!H17: <strong>${rupiah(state.totalShu)}</strong></span><span>SHU!C11: <strong>${pct(normalizeShuDistribution(state.shuDistribution).pengurus)}</strong></span><span>SHU!C9: <strong>${pct(normalizeShuDistribution(state.shuDistribution).anggota)}</strong></span></div>
  </div>
  <div class="table-wrap cashflow-table">${cashFlowSheetTable(selected)}</div>`;
}
function selectedCashFlowSheet(){
  const cashFlow = state.cashFlow;
  if(!cashFlow?.sheets?.length) return null;
  return cashFlow.sheets.find(sheet => sheet.name === cashFlow.selectedSheet) || cashFlow.sheets[0];
}
function cashFlowSheetTable(sheet){
  const rowCount = Math.max(20, Math.min(160, sheet.rows.length || 0));
  const usedCols = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
  const colCount = Math.max(8, Math.min(40, usedCols || 0));
  const headers = Array.from({length: colCount}, (_, index) => `<th>${columnName(index)}</th>`).join("");
  const body = Array.from({length: rowCount}, (_, rowIndex) => {
    const cells = Array.from({length: colCount}, (_, colIndex) => {
      const value = sheet.rows[rowIndex]?.[colIndex] ?? "";
      return `<td><input class="cash-cell" data-row="${rowIndex}" data-col="${colIndex}" value="${safe(value)}" aria-label="${columnName(colIndex)}${rowIndex + 1}"></td>`;
    }).join("");
    return `<tr><th class="row-head">${rowIndex + 1}</th>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr><th class="row-head"></th>${headers}</tr></thead><tbody>${body}</tbody></table>`;
}
function bindCashFlowView(){
  const importInput = document.querySelector("#cashflow-import");
  if(importInput){
    importInput.onchange = async event => {
      const file = event.target.files?.[0];
      if(!file) return;
      try {
        await importCashFlowFile(file);
      } catch(error) {
        toast(error.message || "Import XLSX gagal.");
      } finally {
        importInput.value = "";
      }
    };
  }
  bindOpenCashFlowButtons();
  const sheetSelect = document.querySelector("#cashflow-sheet");
  if(sheetSelect){
    sheetSelect.onchange = event => {
      state.cashFlow.selectedSheet = event.target.value;
      saveState();
      renderView();
    };
  }
  document.querySelectorAll(".cash-cell").forEach(input => {
    input.onchange = event => {
      const sheet = selectedCashFlowSheet();
      if(!sheet) return;
      const row = Number(event.target.dataset.row);
      const col = Number(event.target.dataset.col);
      while(sheet.rows.length <= row) sheet.rows.push([]);
      while(sheet.rows[row].length <= col) sheet.rows[row].push("");
      sheet.rows[row][col] = event.target.value;
      syncCashFlowShu();
      saveState();
      renderView();
    };
  });
}
async function importCashFlowFile(file){
  if(!/\.xlsx$/i.test(file.name)) throw new Error("File harus berformat .xlsx.");
  if(file.size > CASHFLOW_MAX_FILE_SIZE) throw new Error("Ukuran file XLSX maksimal 4 MB.");
  const buffer = await file.arrayBuffer();
  const sheets = await parseXlsxWorkbook(buffer);
  const fileDataUrl = await readFileAsDataUrl(file);
  state.cashFlow = { fileName: file.name, fileType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileDataUrl, importedAt: new Date().toISOString(), selectedSheet: sheets[0]?.name || "", sheets };
  syncCashFlowShu();
  saveState();
  toast("File arus kas berhasil diimport.");
  renderView();
}
async function openCashFlowFile(){
  const cashFlow = state.cashFlow;
  if(!cashFlow?.fileDataUrl){ toast("File arus kas belum tersedia."); return; }
  const url = `${CASHFLOW_FILE_URL}&t=${encodeURIComponent(cashFlow.importedAt || state.updatedAt || Date.now())}`;
  if(navigator.canShare && navigator.share){
    try {
      const response = await fetch(url, { cache: "no-store" });
      if(response.ok){
        const blob = await response.blob();
        const file = new File([blob], cashFlow.fileName || "arus-kas.xlsx", { type: blob.type || cashFlow.fileType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        if(navigator.canShare({ files: [file] })){
          await navigator.share({ files: [file], title: file.name });
          return;
        }
      }
    } catch(error) {
      if(error?.name === "AbortError") return;
    }
  }
  window.open(url, "_blank", "noopener");
}
function bindOpenCashFlowButtons(){
  document.querySelectorAll(".open-cashflow-file").forEach(button => button.onclick = openCashFlowFile);
}
function syncCashFlowShu(){
  const cashFlow = state.cashFlow;
  if(!cashFlow?.sheets?.length) return;
  const total = cashFlowCell("dashboard", 16, 7);
  const pengurus = cashFlowCell("shu", 10, 2);
  const anggota = cashFlowCell("shu", 8, 2);
  state.totalShu = parseSpreadsheetMoney(total);
  state.shuDistribution = {
    pengurus: normalizePercentValue(pengurus, 0.9),
    anggota: normalizePercentValue(anggota, 0.1)
  };
}
function cashFlowCell(sheetName, rowIndex, colIndex){
  const sheet = state.cashFlow?.sheets?.find(item => item.name.trim().toLowerCase() === sheetName);
  return sheet?.rows?.[rowIndex]?.[colIndex] ?? "";
}
function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File tidak bisa dibaca."));
    reader.readAsDataURL(file);
  });
}
async function parseXlsxWorkbook(buffer){
  if(!window.DecompressionStream) throw new Error("Browser belum mendukung pembacaan XLSX. Gunakan Chrome atau Edge terbaru.");
  const files = await unzipXlsxFiles(buffer);
  const workbookXml = textFile(files, "xl/workbook.xml");
  const relsXml = textFile(files, "xl/_rels/workbook.xml.rels");
  if(!workbookXml || !relsXml) throw new Error("Struktur XLSX tidak valid.");
  const sharedStrings = parseSharedStrings(textFile(files, "xl/sharedStrings.xml"));
  const rels = parseWorkbookRelationships(relsXml);
  const sheets = parseWorkbookSheets(workbookXml, rels)
    .map(sheet => ({ name: sheet.name, rows: parseWorksheetRows(textFile(files, sheet.path), sharedStrings) }))
    .filter(sheet => sheet.rows.length);
  if(!sheets.length) throw new Error("Tidak ada sheet yang bisa dibaca dari file XLSX.");
  return sheets;
}
async function unzipXlsxFiles(buffer){
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocd = findZipEnd(view);
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = {};
  for(let i = 0; i < entryCount; i++){
    if(view.getUint32(offset, true) !== 0x02014b50) throw new Error("Central directory XLSX rusak.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + fileNameLength)).replace(/\\/g, "/");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    if(!name.endsWith("/")){
      files[name] = method === 0 ? compressed : await inflateRaw(compressed, method);
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return files;
}
function findZipEnd(view){
  for(let offset = view.byteLength - 22; offset >= 0; offset--){
    if(view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("File XLSX tidak valid.");
}
async function inflateRaw(bytes, method){
  if(method !== 8) throw new Error("Metode kompresi XLSX tidak didukung.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function textFile(files, path){
  const bytes = files[path];
  return bytes ? new TextDecoder("utf-8").decode(bytes) : "";
}
function xmlDoc(xml){
  return new DOMParser().parseFromString(xml || "<root/>", "application/xml");
}
function xmlChildren(node, name){
  return Array.from(node.getElementsByTagName("*")).filter(item => item.localName === name);
}
function parseSharedStrings(xml){
  if(!xml) return [];
  return xmlChildren(xmlDoc(xml), "si").map(si => xmlChildren(si, "t").map(t => t.textContent || "").join(""));
}
function parseWorkbookRelationships(xml){
  return Object.fromEntries(xmlChildren(xmlDoc(xml), "Relationship").map(rel => {
    const target = rel.getAttribute("Target") || "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`.replace(/\/[^/]+\/\.\.\//g, "/");
    return [rel.getAttribute("Id"), path.replace(/\\/g, "/")];
  }));
}
function parseWorkbookSheets(xml, rels){
  return xmlChildren(xmlDoc(xml), "sheet").map(sheet => {
    const relId = sheet.getAttribute("r:id") || sheet.getAttribute("id");
    return { name: sheet.getAttribute("name") || "Sheet", path: rels[relId] };
  }).filter(sheet => sheet.path);
}
function parseWorksheetRows(xml, sharedStrings){
  if(!xml) return [];
  const rows = [];
  xmlChildren(xmlDoc(xml), "c").forEach(cell => {
    const ref = cell.getAttribute("r") || "";
    const position = cellRefToIndexes(ref);
    if(!position) return;
    const value = readCellValue(cell, sharedStrings);
    while(rows.length <= position.row) rows.push([]);
    rows[position.row][position.col] = value;
  });
  return rows.map(row => row.map(cell => cell ?? ""));
}
function readCellValue(cell, sharedStrings){
  const type = cell.getAttribute("t");
  if(type === "inlineStr") return xmlChildren(cell, "t").map(t => t.textContent || "").join("");
  const value = xmlChildren(cell, "v")[0]?.textContent ?? "";
  if(type === "s") return sharedStrings[Number(value)] ?? "";
  if(type === "b") return value === "1" ? "TRUE" : "FALSE";
  if(value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}
function cellRefToIndexes(ref){
  const match = /^([A-Z]+)(\d+)$/i.exec(ref);
  if(!match) return null;
  return { row: Number(match[2]) - 1, col: columnIndex(match[1]) };
}
function columnIndex(name){
  return name.toUpperCase().split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}
function columnName(index){
  let name = "";
  let value = index + 1;
  while(value > 0){
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
}
function adminEvaluationsView(){
  const evaluations = allEvaluationRows().sort((a,b)=>(b.submittedAt||"").localeCompare(a.submittedAt||""));
  const shuRows = registeredShuRows();
  const distribution = normalizeShuDistribution(state.shuDistribution);
  const assessedUsers = new Set(evaluations.map(ev => ev.targetId)).size;
  const openFileButton = state.cashFlow?.fileDataUrl ? `<button class="ghost open-cashflow-file" type="button">Buka File Arus Kas</button>` : "";
  return `<div class="grid cards">
    <article class="card metric"><span>Aktivitas Penilaian</span><strong>${evaluations.length}</strong></article>
    <article class="card metric"><span>User Dinilai</span><strong>${assessedUsers}</strong></article>
    <article class="card metric"><span>Total SHU</span><strong>${rupiah(state.totalShu)}</strong></article>
    <article class="card metric"><span>Pengurus / Anggota</span><strong>${pct(distribution.pengurus)} / ${pct(distribution.anggota)}</strong></article>
  </div>
  <section class="card" style="margin-top:18px">
    <div class="toolbar"><div><h2>Aktivitas Penilaian User</h2><p class="muted">Admin dapat melihat siapa yang memberi penilaian, siapa yang dinilai, tanggal, dan ringkasan hasil.</p></div><div class="actions">${openFileButton}</div></div>
    ${evaluations.length ? `<div class="table-wrap"><table><thead><tr><th>Evaluator</th><th>Dinilai</th><th>Tanggal</th><th>Ringkasan Nilai</th></tr></thead><tbody>${evaluations.map(ev => evaluationRow(ev, true)).join("")}</tbody></table></div>` : '<div class="empty">Belum ada aktivitas penilaian.</div>'}
  </section>
  <section class="card" style="margin-top:18px">
    <div class="toolbar"><div><h2>Data Pembagian SHU Semua User</h2><p class="muted">Tabel ini memakai data user approved, total SHU, persentase arus kas, dan hasil penilaian terbaru.</p></div><button class="ghost" onclick="window.print()">Cetak</button></div>
    ${shuRows.length ? `<div class="table-wrap">${summaryTable(shuRows, true)}</div>` : '<div class="empty">Belum ada user approved untuk pembagian SHU.</div>'}
  </section>`;
}
function adminView(){
  const requests = state.signupRequests || [];
  const passwordRequests = state.passwordRequests || [];
  const pending = requests.filter(req => req.status === "pending");
  const pendingPassword = passwordRequests.filter(req => req.status === "pending");
  const approved = visibleAccounts().filter(acc => acc.status === "approved");
  const rejected = requests.filter(req => req.status === "rejected");
  const openFileButton = state.cashFlow?.fileDataUrl ? `<button class="ghost open-cashflow-file" type="button">Buka File Arus Kas</button>` : "";
  return `<div class="grid cards">
    <article class="card metric"><span>Request Pending</span><strong>${pending.length}</strong></article>
    <article class="card metric"><span>Ganti Password</span><strong>${pendingPassword.length}</strong></article>
    <article class="card metric"><span>Akun Approved</span><strong>${approved.length}</strong></article>
    <article class="card metric"><span>Request Rejected</span><strong>${rejected.length}</strong></article>
  </div>
  ${openFileButton ? `<section class="card" style="margin-top:18px"><div class="actions">${openFileButton}</div></section>` : ""}
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
  return Object.values(state.accounts || {}).filter(acc => acc.id !== ADMIN_ACCOUNT.id);
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
  const locked = acc.id === ADMIN_ACCOUNT.id;
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
      <label>Status<select id="edit-user-status" ${acc.id === ADMIN_ACCOUNT.id ? "disabled" : ""}><option value="approved" ${acc.status === "approved" ? "selected" : ""}>Approved</option><option value="pending" ${acc.status === "pending" ? "selected" : ""}>Pending</option><option value="rejected" ${acc.status === "rejected" ? "selected" : ""}>Rejected</option></select></label>
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
  bindOpenCashFlowButtons();
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
      if(id !== ADMIN_ACCOUNT.id) acc.status = document.querySelector("#edit-user-status").value;
      if(password) acc.password = await hashPassword(password);
      saveState();
      editingUserId = null;
      toast("Data user disimpan.");
      renderView();
    };
  }
}
async function deleteUser(id){
  if(id === ADMIN_ACCOUNT.id){ toast("Akun admin tidak bisa dihapus."); return; }
  const acc = account(id);
  if(!acc) return;
  if(!confirm(`Hapus user ${acc.name}?`)) return;
  delete state.accounts[id];
  Object.keys(state.evaluations || {}).forEach(evKey => {
    const ev = state.evaluations[evKey];
    if(ev?.evaluatorId === id || ev?.targetId === id) delete state.evaluations[evKey];
  });
  state.passwordRequests = (state.passwordRequests || []).filter(req => req.accountId !== id);
  if(activeUser === id){
    sessionStorage.removeItem(SESSION_KEY);
    activeUser = null;
    activeTab = "dashboard";
  }
  await saveState({ immediate: true });
  toast("User dihapus.");
  await render();
}
async function decideSignup(requestId, status){
  const req = state.signupRequests.find(item => item.id === requestId);
  if(!req) return;
  req.status = status;
  req.decidedAt = new Date().toISOString();
  req.decidedBy = activeUser;
  if(status === "approved"){
    const accountId = req.accountId;
    const existing = account(accountId) || {};
    const hashedPassword = await hashPassword(req.password);
    state.accounts[accountId] = { ...existing, id: accountId, memberId: req.memberId || null, name: req.name, role: req.role, profile: req.profile || parsePersonalInfo(req.note), password: hashedPassword, type: "member", status: "approved", createdAt: existing.createdAt || req.requestedAt, approvedAt: req.decidedAt };
    toast(`Akun ${req.name} disetujui.`);
  } else {
    toast(`Request ${req.name} ditolak.`);
  }
  await saveState({ immediate: true });
  await renderView();
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
  await saveState({ immediate: true });
  await renderView();
}
function settingsView(){
  const acc = activeAccount();
  const pendingPassword = (state.passwordRequests || []).filter(req => req.accountId === activeUser && req.status === "pending").length;
  const passwordPanel = isAdmin() ? "" : `<section class="card" style="margin-top:18px"><h2>Ajukan Ganti Password</h2><p class="muted">Password baru akan aktif setelah admin melakukan approval.</p>${pendingPassword ? `<div class="note">Ada ${pendingPassword} request ganti password yang masih menunggu approval admin.</div>` : ""}<form id="password-change-form" class="stack" style="margin-top:14px"><label>Password Baru<span class="password-wrap"><input id="new-password" type="password" autocomplete="new-password" minlength="6" placeholder="Minimal 6 karakter" required /><button id="toggle-new-password" class="icon-btn" type="button" aria-label="Lihat password baru">Lihat</button></span></label><label>Catatan untuk Admin<textarea id="password-change-note" placeholder="Contoh: mohon approve ganti password saya."></textarea></label><button class="primary" type="submit">Ajukan Ganti Password</button><p id="password-change-message" class="success hidden"></p><p id="password-change-error" class="error hidden"></p></form></section>`;
  const adminUserPanel = isAdmin() ? userManagementSection() : "";
  const openFileButton = state.cashFlow?.fileDataUrl ? `<button class="ghost open-cashflow-file" type="button">Buka File Arus Kas</button>` : "";
  const backupPanel = isAdmin() ? `<section class="card" style="margin-top:18px"><div class="toolbar"><div><h2>Backup Database Server</h2><p class="muted">Daftar file backup database (.sql) yang dibuat otomatis oleh server atau secara manual.</p></div><button id="generate-backup" class="primary" type="button">Buat Backup Sekarang</button></div><div id="backup-list"><div class="empty">Memuat data backup...</div></div></section>` : "";
  return `<section class="card"><h2>Pengaturan</h2><div class="grid two"><div><h3>Data Database</h3><p class="muted">Data disimpan ke MySQL melalui <code>api.php</code>, dengan salinan cadangan di browser jika koneksi database belum tersedia.</p><div class="actions">${openFileButton}<button id="clear-data" class="danger">Hapus Semua Data</button></div></div><div><h3>Akun Aktif</h3><div class="user-cell settings-user">${accountAvatar(acc, true)}<p><strong>${safe(acc?.name || "-")}</strong><br><span class="muted">${safe(acc?.role || "-")}</span></p></div><p class="muted">Pengurus dan anggota dibuat melalui sign up, lalu diverifikasi admin.</p><p class="muted">Status sinkron database: ${remoteReady ? "aktif" : "menunggu koneksi API"}.</p></div></div></section>${adminUserPanel}${backupPanel}${passwordPanel}`;
}
function bindSettingsView(){
  if(isAdmin()) {
    bindUserManagementControls();
    loadServerBackups();
    const genBtn = document.querySelector("#generate-backup");
    if(genBtn) {
      genBtn.onclick = async () => {
        genBtn.disabled = true;
        const oldText = genBtn.textContent;
        genBtn.textContent = "Memproses...";
        try {
          const res = await fetch(`${API_URL}?action=generate_backup`, { cache: "no-store" });
          if(!res.ok) throw new Error("Gagal membuat backup.");
          const data = await res.json();
          if(!data.ok) throw new Error(data.error || "Gagal membuat backup.");
          toast("Backup berhasil dibuat.");
          loadServerBackups();
        } catch(e) {
          toast(e.message || "Gagal membuat backup.");
        } finally {
          genBtn.disabled = false;
          genBtn.textContent = oldText;
        }
      };
    }
  }
  bindPasswordPanel();
  bindOpenCashFlowButtons();
  document.querySelector("#clear-data").onclick = async () => { if(confirm("Hapus semua data penilaian, akun, request sign up, request ganti password, arus kas, dan total SHU di browser ini?")){ state = { evaluations:{}, totalShu:0, shuDistribution: defaultShuDistribution(), cashFlow: null, accounts: defaultAccounts(), signupRequests: [], passwordRequests: [], authSchemaVersion: AUTH_SCHEMA_VERSION, updatedAt:null}; await saveState({ immediate: true }); toast("Data dihapus."); await renderView(); } };
}
async function loadServerBackups() {
  const list = document.querySelector("#backup-list");
  if(!list) return;
  try {
    const res = await fetch(`${API_URL}?action=list_backups`, { cache: "no-store" });
    if(!res.ok) throw new Error("Gagal memuat list backup.");
    const data = await res.json();
    if(!data.backups || !data.backups.length) {
      list.innerHTML = `<div class="empty">Belum ada file backup di server. Pastikan cron job backup.php sudah berjalan.</div>`;
      return;
    }
    list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Nama File</th><th>Ukuran</th><th>Waktu Backup</th><th>Aksi</th></tr></thead><tbody>${data.backups.map(b => `<tr><td><strong>${safe(b.name)}</strong></td><td>${Math.max(1, Math.round(b.size/1024))} KB</td><td>${new Date(b.time * 1000).toLocaleString('id-ID')}</td><td><a href="${API_URL}?action=download_backup&file=${encodeURIComponent(b.name)}" class="ghost" style="text-decoration:none; display:inline-block; padding:8px 12px;">Download</a></td></tr>`).join("")}</tbody></table></div>`;
  } catch(e) {
    list.innerHTML = `<div class="error note">Gagal memuat data: ${safe(e.message)}</div>`;
  }
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

async function main() {
  try {
    const response = await fetch(`${API_URL}?action=get_app_data`, { cache: "no-store" });
    if (!response.ok) {
      let errMsg = 'Gagal memuat data aplikasi dari server.';
      try {
        const raw = await response.text();
        try {
          const errData = JSON.parse(raw);
          if (errData.error) errMsg = errData.error;
        } catch(e) {
          errMsg += ' Respons server: ' + raw.substring(0, 150);
        }
      } catch(e){}
      throw new Error(errMsg);
    }
    const data = await response.json();
    APP_CONFIG.members = data.members;
    APP_CONFIG.checklists = data.checklists;
  } catch (error) {
    console.error("Tidak bisa memuat data awal aplikasi:", error);
    app.innerHTML = `<div class="card error-card"><h2>Gagal Memuat Aplikasi</h2><p>Tidak dapat terhubung ke database untuk memuat data awal. Pastikan file <code>config.php</code> sudah benar dan koneksi internet stabil.</p><p class="muted">${safe(error.message)}</p></div>`;
    return;
  }

  await render();
  setupInstallPrompt();
  await pullRemoteState();
  setInterval(pullRemoteState, 5000);

  document.addEventListener("focusout", () => {
    setTimeout(async () => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName);
      if (!isTyping && needsRender) {
        needsRender = false;
        await render();
      }
    }, 100);
  });
}

main();
