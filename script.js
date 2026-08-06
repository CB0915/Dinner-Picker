// ============================================================
// STATE
// ============================================================
let selectedCuisines = new Set();
let surpriseMode = false;
let customCuisineVal = '';
let selectedRadius = null;
let coords = null;
let currentPlaces = [];
let currentPick = null;
let currentSortMode = 'distance';
let currentWheelRotation = 0;
let cravingWheelRotation = 0;
const wheelColors = ['#B23A2C', '#4A7856', '#8B6F47', '#5A5245', '#C9873E', '#6E7F5C'];

const RADIUS_TIERS = [850, 13000, 20000];
const RADIUS_LABELS = { 850: 'walking distance', 13000: 'a short drive', 20000: 'the widest search radius' };

const STORAGE_STATE_KEY = 'dinnerTicket_state_v1';
const STORAGE_EXCLUDED_KEY = 'dinnerTicket_excluded_v1';

let excludedMap = new Map(); // id -> name
try {
  const rawExcluded = localStorage.getItem(STORAGE_EXCLUDED_KEY);
  if (rawExcluded) {
    JSON.parse(rawExcluded).forEach(item => excludedMap.set(item.id, item.name));
  }
} catch (e) { /* localStorage unavailable, proceed without persistence */ }

function saveExcluded(){
  try {
    const arr = [...excludedMap.entries()].map(([id, name]) => ({ id, name }));
    localStorage.setItem(STORAGE_EXCLUDED_KEY, JSON.stringify(arr));
  } catch (e) { /* ignore */ }
}

function saveState(){
  try {
    localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify({
      cuisines: [...selectedCuisines],
      surpriseMode,
      customCuisineVal,
      radius: selectedRadius
    }));
  } catch (e) { /* ignore */ }
}

function describeRadius(r){
  return RADIUS_LABELS[r] || ((r / 1000).toFixed(1) + 'km');
}

// ============================================================
// INIT / DATELINE
// ============================================================
const dateline = document.getElementById('dateline');
dateline.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();

// ============================================================
// CRAVING GRID (multi-select, Surprise Me is exclusive)
// ============================================================
const cuisineGrid = document.getElementById('cuisineGrid');
cuisineGrid.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const val = chip.dataset.val;

    if (val === '') {
      surpriseMode = !surpriseMode;
      if (surpriseMode) {
        selectedCuisines.clear();
        cuisineGrid.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        document.getElementById('customCuisine').value = '';
        customCuisineVal = '';
      } else {
        chip.classList.remove('selected');
      }
    } else {
      surpriseMode = false;
      cuisineGrid.querySelector('.chip[data-val=""]').classList.remove('selected');
      if (selectedCuisines.has(val)) {
        selectedCuisines.delete(val);
        chip.classList.remove('selected');
      } else {
        selectedCuisines.add(val);
        chip.classList.add('selected');
      }
    }
    updateState();
  });
});

document.getElementById('customCuisine').addEventListener('input', (e) => {
  customCuisineVal = e.target.value.trim().toLowerCase();
  if (customCuisineVal) {
    surpriseMode = false;
    cuisineGrid.querySelector('.chip[data-val=""]').classList.remove('selected');
  }
  updateState();
});

// ============================================================
// DISTANCE GRID (single-select)
// ============================================================
const distGrid = document.getElementById('distGrid');
distGrid.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    distGrid.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    selectedRadius = parseInt(chip.dataset.val, 10);
    updateState();
  });
});

function getActiveCravings(){
  const list = [...selectedCuisines];
  if (customCuisineVal) list.push(customCuisineVal);
  return list;
}

function updateState(){
  const cravingCount = surpriseMode ? 1 : getActiveCravings().length;
  const count = cravingCount + (selectedRadius ? 1 : 0);
  document.getElementById('itemCount').textContent = count + ' item' + (count === 1 ? '' : 's') + ' selected';
  const cuisineReady = surpriseMode || getActiveCravings().length > 0;
  const ready = cuisineReady && selectedRadius && coords;
  document.getElementById('readyState').textContent = ready ? 'ready to fire' : 'not ready';
  document.getElementById('sendBtn').disabled = !ready;
  saveState();
}

// ============================================================
// RESTORE LAST SESSION'S PICKS
// ============================================================
function restoreState(){
  try {
    const raw = localStorage.getItem(STORAGE_STATE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);

    if (saved.surpriseMode) {
      const wildcardChip = cuisineGrid.querySelector('.chip[data-val=""]');
      if (wildcardChip) wildcardChip.click();
    } else if (Array.isArray(saved.cuisines)) {
      saved.cuisines.forEach(val => {
        const chip = cuisineGrid.querySelector(`.chip[data-val="${val}"]`);
        if (chip) chip.click();
      });
    }

    if (saved.customCuisineVal) {
      const input = document.getElementById('customCuisine');
      input.value = saved.customCuisineVal;
      input.dispatchEvent(new Event('input'));
    }

    if (saved.radius) {
      const distChip = distGrid.querySelector(`.chip[data-val="${saved.radius}"]`);
      if (distChip) distChip.click();
    }
  } catch (e) { /* ignore malformed/blocked storage */ }
}
restoreState();

// ============================================================
// GEOLOCATION
// ============================================================
function locateUser(){
  const locStatus = document.getElementById('locStatus');
  locStatus.classList.add('pending');
  locStatus.innerHTML = 'finding your table... <button id="retryLoc">retry</button>';
  document.getElementById('retryLoc').addEventListener('click', locateUser);

  if (!navigator.geolocation) {
    locStatus.innerHTML = 'geolocation not supported on this browser <button id="retryLoc">retry</button>';
    document.getElementById('retryLoc').addEventListener('click', locateUser);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      locStatus.classList.remove('pending');
      locStatus.innerHTML = `table located ✓ (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}) <button id="retryLoc">refresh</button>`;
      document.getElementById('retryLoc').addEventListener('click', locateUser);
      updateState();
    },
    (err) => {
      locStatus.innerHTML = 'location permission denied — enable it in Settings and retry <button id="retryLoc">retry</button>';
      document.getElementById('retryLoc').addEventListener('click', locateUser);
    }
  );
}
locateUser();

function haversine(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildAddress(tags){
  const parts = [];
  if (tags['addr:housenumber'] && tags['addr:street']) parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
  else if (tags['addr:street']) parts.push(tags['addr:street']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  return parts.join(', ');
}

// ============================================================
// SEARCH (with auto-widen and exclude filtering)
// ============================================================
const CHAIN_BLOCKLIST = [
  'mcdonald', 'burger king', 'wendy', 'taco bell', 'kfc', 'popeyes',
  'chick-fil-a', 'chickfila', 'subway', 'domino', 'pizza hut', 'papa john',
  'arby', 'sonic drive', 'jack in the box', 'dairy queen', 'chipotle',
  'panda express', 'panera', 'five guys', 'in-n-out', 'in n out',
  'whataburger', 'culver', 'hardee', 'carl' + String.fromCharCode(39) + 's jr', 'jimmy john',
  'little caesars', 'white castle', 'del taco', 'raising cane',
  'zaxby', 'bojangles', 'checkers', 'rally' + String.fromCharCode(39) + 's', 'long john silver'
];

const STORAGE_CUSTOM_BLOCKLIST_KEY = 'dinnerTicket_customBlocklist_v1';
let customBlocklist = [];
try {
  const rawCustom = localStorage.getItem(STORAGE_CUSTOM_BLOCKLIST_KEY);
  if (rawCustom) customBlocklist = JSON.parse(rawCustom);
} catch (e) { /* ignore */ }

function saveCustomBlocklist(){
  try { localStorage.setItem(STORAGE_CUSTOM_BLOCKLIST_KEY, JSON.stringify(customBlocklist)); } catch (e) { /* ignore */ }
}

function getFullBlocklist(){
  return CHAIN_BLOCKLIST.concat(customBlocklist);
}

async function fetchPlacesAtRadius(radius){
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="restaurant"](around:${radius},${coords.lat},${coords.lng});
    );
    out center 60;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query
  });

  if (!response.ok) {
    throw new Error(`Overpass returned status ${response.status}`);
  }

  const data = await response.json();
  let places = (data.elements || []).filter(p => p.tags && p.tags.name);

  const blocklist = getFullBlocklist();
  places = places.filter(p => {
    const name = (p.tags.name || '').toLowerCase();
    return !blocklist.some(chain => name.includes(chain));
  });

  places = places.filter(p => !excludedMap.has(`${p.type}/${p.id}`));

  places.forEach(p => {
    p._dist = haversine(coords.lat, coords.lng, p.lat, p.lon);
  });

  return places;
}

function showLoadingStatus(text){
  const resultsArea = document.getElementById('resultsArea');
  resultsArea.innerHTML = `<div class="status-msg" id="loadingStatus" role="status" aria-live="polite">${text}</div>`;
}

function startLoadingAnimation(baseText){
  let seconds = 0;
  let dotCount = 0;
  const interval = setInterval(() => {
    seconds += 0.5;
    dotCount = (dotCount + 1) % 4;
    const target = document.getElementById('loadingStatus');
    if (target) target.textContent = `${baseText}${'.'.repeat(dotCount)} (${seconds.toFixed(1)}s)`;
  }, 500);
  return () => clearInterval(interval);
}

async function searchRestaurants(){
  const resultsArea = document.getElementById('resultsArea');
  const btn = document.getElementById('sendBtn');
  btn.disabled = true;
  btn.textContent = 'SEARCHING...';

  const startIdx = Math.max(0, RADIUS_TIERS.indexOf(selectedRadius));
  const activeCravings = getActiveCravings();
  let places = [];
  let usedRadius = selectedRadius;
  let widened = false;

  try {
    for (let i = startIdx; i < RADIUS_TIERS.length; i++) {
      usedRadius = RADIUS_TIERS[i];
      const baseText = i > startIdx
        ? `no matches within ${describeRadius(RADIUS_TIERS[i - 1])} — widening to ${describeRadius(usedRadius)}`
        : `looking around ${describeRadius(usedRadius)}`;
      showLoadingStatus(baseText);
      const stopAnim = startLoadingAnimation(baseText);

      let raw;
      try {
        raw = await fetchPlacesAtRadius(usedRadius);
      } finally {
        stopAnim();
      }

      let filtered = raw;
      if (!surpriseMode && activeCravings.length > 0) {
        filtered = raw.filter(p => {
          const cuisine = (p.tags.cuisine || '').toLowerCase();
          const name = (p.tags.name || '').toLowerCase();
          return activeCravings.some(needle => cuisine.includes(needle) || name.includes(needle));
        });
      }

      if (filtered.length > 0) {
        places = filtered;
        widened = i > startIdx;
        break;
      }
    }
  } catch (err) {
    resultsArea.innerHTML = `<div class="status-msg error" role="alert">Search failed: ${err.message}. The free OpenStreetMap server may be busy — try again in a moment.</div>`;
    btn.disabled = false;
    btn.textContent = 'FIND MY SPOT →';
    return;
  }

  if (places.length === 0) {
    const cravingNote = (!surpriseMode && activeCravings.length > 0)
      ? `no ${activeCravings.join(' / ')} spots tagged nearby in OpenStreetMap's data, even after widening all the way out`
      : `no spots found nearby, even at the widest search distance`;
    resultsArea.innerHTML = `<div class="status-msg" role="status" aria-live="polite">${cravingNote} — try a different craving, or double check your location. (Rural/small-town areas often have sparser tagging.)</div>`;
    btn.disabled = false;
    btn.textContent = 'FIND MY SPOT →';
    return;
  }

  places.sort((a, b) => a._dist - b._dist);
  places = places.slice(0, 8);
  currentPlaces = places;
  currentPick = places[0];
  currentSortMode = 'distance';

  renderResultsArea(widened, usedRadius);

  btn.disabled = false;
  btn.textContent = 'FIND ANOTHER SPOT →';
}

document.getElementById('sendBtn').addEventListener('click', searchRestaurants);

// ============================================================
// RESULTS RENDERING (sort toggle + exclude button)
// ============================================================
function renderResultsArea(widened, usedRadius){
  const resultsArea = document.getElementById('resultsArea');
  const widenNote = widened
    ? `<div class="status-msg" role="status" aria-live="polite">widened the search to ${describeRadius(usedRadius)} since nothing matched closer</div>`
    : '';

  resultsArea.innerHTML = `
    ${widenNote}
    <div class="section-label" style="margin-top:20px;">
      TONIGHT'S OPTIONS
      <span style="flex:none; display:flex; gap:6px;">
        <button type="button" class="small-btn active" id="sortDistBtn">closest</button>
        <button type="button" class="small-btn" id="sortAlphaBtn">a-z</button>
      </span>
    </div>
    <div class="results" id="resultsList"></div>
    <button type="button" class="send-btn" id="wheelToggleBtn" style="background:transparent; color:var(--stamp-red); border:1.5px solid var(--stamp-red); margin-top:8px;">🎡 SPIN FOR RANDOM PICK</button>
    <div id="wheelWrapper" style="display:none;">
      <div style="font-family:'IBM Plex Mono', monospace; font-size:9.5px; letter-spacing:1.5px; color:var(--stamp-red); text-align:center; margin-top:14px;">PICKING A WINNER</div>
      <div id="wheelArea" style="margin-top:6px; display:flex; justify-content:center;"></div>
      <button type="button" class="send-btn" id="spinBtn" style="background:var(--ready-green); margin-top:10px;">🎡 SPIN</button>
      <div class="status-msg" id="spinResult" style="display:none;" role="status" aria-live="polite"></div>
    </div>
  `;

  document.getElementById('sortDistBtn').addEventListener('click', () => setSortMode('distance'));
  document.getElementById('sortAlphaBtn').addEventListener('click', () => setSortMode('alpha'));
  document.getElementById('spinBtn').addEventListener('click', spinWheel);
  document.getElementById('wheelToggleBtn').addEventListener('click', () => {
    const wrapper = document.getElementById('wheelWrapper');
    const toggleBtn = document.getElementById('wheelToggleBtn');
    const isHidden = wrapper.style.display === 'none';
    wrapper.style.display = isHidden ? 'block' : 'none';
    toggleBtn.textContent = isHidden ? '▲ HIDE WHEEL' : '🎡 SPIN FOR RANDOM PICK';
  });

  renderResultsList();
}

function setSortMode(mode){
  currentSortMode = mode;
  document.getElementById('sortDistBtn').classList.toggle('active', mode === 'distance');
  document.getElementById('sortAlphaBtn').classList.toggle('active', mode === 'alpha');

  if (mode === 'distance') {
    currentPlaces.sort((a, b) => a._dist - b._dist);
  } else {
    currentPlaces.sort((a, b) => a.tags.name.localeCompare(b.tags.name));
  }
  renderResultsList();
}

function renderResultsList(){
  const list = document.getElementById('resultsList');
  list.innerHTML = '';

  currentPlaces.forEach((place, i) => {
    const isPick = place === currentPick;
    const tags = place.tags;
    const distMiles = (place._dist / 1609.34).toFixed(1);
    const address = buildAddress(tags);
    const cuisine = tags.cuisine ? tags.cuisine.replace(/_/g, ' ') : '';
    const appleMapsUrl = `https://maps.apple.com/?ll=${place.lat},${place.lon}&q=${encodeURIComponent(tags.name)}`;
    const osmUrl = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=19/${place.lat}/${place.lon}`;

    const card = document.createElement('div');
    card.className = 'result-card' + (isPick ? ' pick' : '');
    card.id = `card-${i}`;
    card.innerHTML = `
      <button type="button" class="exclude-btn" data-idx="${i}" title="Not tonight — hide this spot" aria-label="Hide ${tags.name} from future searches">✕</button>
      <div class="pick-flag" style="display:${isPick ? 'block' : 'none'};">★ TONIGHT'S PICK</div>
      <div class="result-name">#${i + 1} ${tags.name}</div>
      <div class="result-meta">
        ${distMiles} mi away
        ${cuisine ? ' · ' + cuisine : ''}<br>
        ${address || 'address not mapped'}
        ${tags.phone ? '<br>' + tags.phone : ''}
      </div>
      <a class="result-link" href="${appleMapsUrl}" target="_blank">open in Apple Maps →</a>
      <a class="result-link" href="${osmUrl}" target="_blank">view on map →</a>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('.exclude-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      excludePlace(parseInt(btn.dataset.idx, 10));
    });
  });

  currentWheelRotation = 0;
  buildWheel(currentPlaces.length);
}

function excludePlace(idx){
  const place = currentPlaces[idx];
  if (!place) return;

  excludedMap.set(`${place.type}/${place.id}`, place.tags.name);
  saveExcluded();
  updateExcludedButtonLabel();

  currentPlaces.splice(idx, 1);
  if (currentPick === place) {
    currentPick = currentPlaces[0] || null;
  }

  if (currentPlaces.length === 0) {
    document.getElementById('resultsArea').innerHTML = `<div class="status-msg" role="status" aria-live="polite">you excluded everything from this search — hit "Find My Spot" again to search fresh</div>`;
    return;
  }
  renderResultsList();
}

// ============================================================
// MANAGE EXCLUDED PANEL
// ============================================================
function updateExcludedButtonLabel(){
  const btn = document.getElementById('manageExcludedBtn');
  if (btn) btn.textContent = `⚙️ EXCLUDED (${excludedMap.size})`;
}

function renderExcludedPanel(){
  const panel = document.getElementById('excludedPanel');
  if (excludedMap.size === 0) {
    panel.innerHTML = `<div>nothing excluded yet — tap the ✕ on a result card to hide it from future searches.</div>`;
    return;
  }
  const rows = [...excludedMap.entries()].map(([id, name]) => `
    <div class="manage-row">
      <span>${name}</span>
      <button type="button" data-id="${id}" aria-label="Remove ${name} from excluded list">remove</button>
    </div>
  `).join('');
  panel.innerHTML = `<div style="margin-bottom:6px;">these spots are hidden from future searches:</div>${rows}`;

  panel.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      excludedMap.delete(btn.dataset.id);
      saveExcluded();
      updateExcludedButtonLabel();
      renderExcludedPanel();
    });
  });
}

document.getElementById('manageExcludedBtn').addEventListener('click', () => {
  const panel = document.getElementById('excludedPanel');
  document.getElementById('blocklistPanel').style.display = 'none';
  if (panel.style.display === 'none') {
    renderExcludedPanel();
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
});
updateExcludedButtonLabel();

// ============================================================
// MANAGE "ALWAYS SKIP" CHAIN BLOCKLIST PANEL
// ============================================================
function updateBlocklistButtonLabel(){
  const btn = document.getElementById('manageBlocklistBtn');
  if (btn) btn.textContent = `🚫 ALWAYS SKIP (${customBlocklist.length})`;
}

function renderBlocklistPanel(){
  const panel = document.getElementById('blocklistPanel');
  const rows = customBlocklist.map((name, idx) => `
    <div class="manage-row">
      <span>${name}</span>
      <button type="button" data-idx="${idx}" aria-label="Remove ${name} from always-skip list">remove</button>
    </div>
  `).join('');

  panel.innerHTML = `
    <div style="margin-bottom:6px;">chains listed here are always filtered out of every search, in addition to the built-in list (McDonald's, Subway, etc.):</div>
    ${rows || '<div style="margin-bottom:6px; font-style:italic;">no custom entries yet</div>'}
    <div style="display:flex; gap:6px; margin-top:8px;">
      <input type="text" id="newBlocklistInput" placeholder="e.g. some chain name" style="flex:1; font-family:'IBM Plex Mono', monospace; font-size:11px; padding:5px 7px; border:1px solid var(--line); background:var(--paper); color:var(--ink); border-radius:2px;">
      <button type="button" id="addBlocklistBtn" style="padding:5px 10px;">add</button>
    </div>
  `;

  panel.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      customBlocklist.splice(parseInt(btn.dataset.idx, 10), 1);
      saveCustomBlocklist();
      updateBlocklistButtonLabel();
      renderBlocklistPanel();
    });
  });

  document.getElementById('addBlocklistBtn').addEventListener('click', () => {
    const input = document.getElementById('newBlocklistInput');
    const val = input.value.trim().toLowerCase();
    if (val && !customBlocklist.includes(val)) {
      customBlocklist.push(val);
      saveCustomBlocklist();
      updateBlocklistButtonLabel();
      renderBlocklistPanel();
    }
  });
}

document.getElementById('manageBlocklistBtn').addEventListener('click', () => {
  const panel = document.getElementById('blocklistPanel');
  document.getElementById('excludedPanel').style.display = 'none';
  if (panel.style.display === 'none') {
    renderBlocklistPanel();
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
});
updateBlocklistButtonLabel();

function updateSoundToggleLabel(){
  const btn = document.getElementById('soundToggleBtn');
  if (!btn) return;
  btn.textContent = soundEnabled ? '🔊 SOUND ON' : '🔇 SOUND OFF';
  btn.classList.toggle('active', soundEnabled);
  btn.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
}

document.getElementById('soundToggleBtn').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  try { localStorage.setItem('dinnerTicket_sound_v1', soundEnabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
  updateSoundToggleLabel();
  if (soundEnabled) ensureAudioContext(); // unlock audio on this user gesture
});
updateSoundToggleLabel();

// ============================================================
// DARK MODE
// ============================================================
let darkModeEnabled = false;
try {
  const savedDark = localStorage.getItem('dinnerTicket_darkMode_v1');
  if (savedDark !== null) {
    darkModeEnabled = savedDark === 'on';
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    darkModeEnabled = true; // no saved preference yet — follow the system setting
  }
} catch (e) { /* ignore */ }

function applyDarkMode(){
  document.body.classList.toggle('dark-mode', darkModeEnabled);
  const btn = document.getElementById('darkModeToggleBtn');
  if (btn) {
    btn.textContent = darkModeEnabled ? '☀️ LIGHT MODE' : '🌙 DARK MODE';
    btn.classList.toggle('active', darkModeEnabled);
    btn.setAttribute('aria-pressed', darkModeEnabled ? 'true' : 'false');
  }
}
applyDarkMode();

document.getElementById('darkModeToggleBtn').addEventListener('click', () => {
  darkModeEnabled = !darkModeEnabled;
  try { localStorage.setItem('dinnerTicket_darkMode_v1', darkModeEnabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
  applyDarkMode();
});

// ============================================================
// WHEEL GEOMETRY HELPERS
// ============================================================
function polarToCartesian(cx, cy, r, angleDeg){
  const a = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function describeSlice(cx, cy, r, startAngle, endAngle){
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = (endAngle - startAngle) <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

// ============================================================
// WHEEL SOUND EFFECTS (Web Audio API, no external files)
// ============================================================
let soundEnabled = true;
try {
  const savedSound = localStorage.getItem('dinnerTicket_sound_v1');
  if (savedSound !== null) soundEnabled = savedSound === 'on';
} catch (e) { /* ignore */ }

function ensureAudioContext(){
  if (!window._dinnerAudioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    window._dinnerAudioCtx = new AC();
  }
  if (window._dinnerAudioCtx.state === 'suspended') {
    window._dinnerAudioCtx.resume();
  }
  return window._dinnerAudioCtx;
}

function playTick(){
  if (!soundEnabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 850;
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.045);
}

function playLandingChime(){
  if (!soundEnabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const freqs = [523.25, 659.25, 783.99];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const start = ctx.currentTime + i * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

// Reads the wheel's live rotation each frame and fires a tick whenever
// it crosses into a new slice — ticks naturally slow down as the
// CSS transition decelerates, like a real spinning wheel.
function runTickLoop(svgEl, sliceCount, durationMs){
  const segAngle = 360 / sliceCount;
  let lastSegment = null;
  const startTime = performance.now();

  function frame(now){
    const elapsed = now - startTime;
    const style = getComputedStyle(svgEl).transform;
    let angle = 0;
    if (style && style !== 'none') {
      const matrix = style.match(/matrix\(([^)]+)\)/);
      if (matrix) {
        const parts = matrix[1].split(',').map(Number);
        angle = Math.atan2(parts[1], parts[0]) * (180 / Math.PI);
        if (angle < 0) angle += 360;
      }
    }
    const seg = Math.floor(angle / segAngle);
    if (seg !== lastSegment) {
      lastSegment = seg;
      playTick();
    }
    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    }
  }
  requestAnimationFrame(frame);
}

// ============================================================
// RESULTS WHEEL (random restaurant pick)
// ============================================================
function buildWheel(n){
  const wheelArea = document.getElementById('wheelArea');
  if (!wheelArea) return;
  const size = 260;
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  const segAngle = 360 / n;

  let slicesHtml = '';
  for (let i = 0; i < n; i++) {
    const startAngle = i * segAngle;
    const endAngle = (i + 1) * segAngle;
    const midAngle = startAngle + segAngle / 2;
    const labelPos = polarToCartesian(cx, cy, r * 0.62, midAngle);
    const color = wheelColors[i % wheelColors.length];
    slicesHtml += `<path d="${describeSlice(cx, cy, r, startAngle, endAngle)}" fill="${color}" stroke="var(--paper)" stroke-width="2"/>`;
    slicesHtml += `<text x="${labelPos.x}" y="${labelPos.y}" fill="var(--paper)" font-family="IBM Plex Mono, monospace" font-size="18" font-weight="600" text-anchor="middle" dominant-baseline="middle">${i + 1}</text>`;
  }

  wheelArea.innerHTML = `
    <div style="position:relative; width:${size}px;">
      <div style="position:absolute; top:-4px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:12px solid transparent; border-right:12px solid transparent; border-top:18px solid var(--stamp-red); z-index:2;"></div>
      <svg id="wheelSvg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transition: transform 3.2s cubic-bezier(0.15, 0.7, 0.1, 1); transform: rotate(${currentWheelRotation}deg); display:block;">
        ${slicesHtml}
      </svg>
    </div>
  `;
}

function spinWheel(){
  const n = currentPlaces.length;
  if (n === 0) return;

  const spinBtn = document.getElementById('spinBtn');
  const spinResult = document.getElementById('spinResult');
  spinBtn.disabled = true;
  spinBtn.textContent = 'SPINNING...';
  spinResult.style.display = 'none';

  const segAngle = 360 / n;
  const chosenIndex = Math.floor(Math.random() * n);
  const segmentCenter = chosenIndex * segAngle + segAngle / 2;
  const jitter = (Math.random() - 0.5) * (segAngle * 0.5);
  const targetWithinSpin = (360 - segmentCenter - jitter + 360) % 360;

  const extraSpins = 5 + Math.floor(Math.random() * 2);
  const currentMod = ((currentWheelRotation % 360) + 360) % 360;
  const delta = ((targetWithinSpin - currentMod) + 360) % 360;
  currentWheelRotation += extraSpins * 360 + delta;

  const svg = document.getElementById('wheelSvg');
  svg.style.transform = `rotate(${currentWheelRotation}deg)`;
  runTickLoop(svg, n, 3300);

  setTimeout(() => {
    currentPick = currentPlaces[chosenIndex];
    currentPlaces.forEach((p, i) => {
      const card = document.getElementById(`card-${i}`);
      if (!card) return;
      const flag = card.querySelector('.pick-flag');
      if (i === chosenIndex) {
        card.classList.add('pick');
        flag.style.display = 'block';
        flag.textContent = '★ THE WHEEL HAS SPOKEN';
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        card.classList.remove('pick');
        flag.style.display = 'none';
      }
    });
    playLandingChime();
    spinResult.style.display = 'block';
    spinResult.textContent = `🎡 landed on #${chosenIndex + 1}: ${currentPlaces[chosenIndex].tags.name}`;
    spinBtn.disabled = false;
    spinBtn.textContent = '🎡 SPIN AGAIN';
  }, 3300);
}

// ============================================================
// CRAVING WHEEL (random cuisine pick)
// ============================================================
const cravingWheelOptions = [
  { label: 'Italian', val: 'italian' },
  { label: 'Mexican', val: 'mexican' },
  { label: 'Sushi', val: 'sushi' },
  { label: 'Thai', val: 'thai' },
  { label: 'Burgers', val: 'burger' },
  { label: 'Pizza', val: 'pizza' },
  { label: 'Indian', val: 'indian' },
  { label: 'BBQ', val: 'bbq' },
  { label: 'Ramen', val: 'ramen' },
  { label: 'Wildcard', val: '' }
];

function buildCravingWheel(){
  const wheelArea = document.getElementById('cravingWheelArea');
  const n = cravingWheelOptions.length;
  const size = 220;
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  const segAngle = 360 / n;

  let slicesHtml = '';
  for (let i = 0; i < n; i++) {
    const startAngle = i * segAngle;
    const endAngle = (i + 1) * segAngle;
    const midAngle = startAngle + segAngle / 2;
    const labelPos = polarToCartesian(cx, cy, r * 0.6, midAngle);
    const color = wheelColors[i % wheelColors.length];
    slicesHtml += `<path d="${describeSlice(cx, cy, r, startAngle, endAngle)}" fill="${color}" stroke="var(--paper)" stroke-width="2"/>`;
    slicesHtml += `<text x="${labelPos.x}" y="${labelPos.y}" fill="var(--paper)" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" text-anchor="middle" dominant-baseline="middle" transform="rotate(${midAngle}, ${labelPos.x}, ${labelPos.y})">${cravingWheelOptions[i].label}</text>`;
  }

  wheelArea.innerHTML = `
    <div style="position:relative; width:${size}px;">
      <div style="position:absolute; top:-4px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:10px solid transparent; border-right:10px solid transparent; border-top:16px solid var(--ready-green); z-index:2;"></div>
      <svg id="cravingWheelSvg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transition: transform 3s cubic-bezier(0.15, 0.7, 0.1, 1); transform: rotate(${cravingWheelRotation}deg); display:block;">
        ${slicesHtml}
      </svg>
    </div>
  `;
}
buildCravingWheel();

function spinCravingWheel(){
  const n = cravingWheelOptions.length;
  const spinBtn = document.getElementById('cravingSpinBtn');
  const resultEl = document.getElementById('cravingWheelResult');
  spinBtn.disabled = true;
  spinBtn.textContent = 'SPINNING...';
  resultEl.style.display = 'none';

  const segAngle = 360 / n;
  const chosenIndex = Math.floor(Math.random() * n);
  const segmentCenter = chosenIndex * segAngle + segAngle / 2;
  const jitter = (Math.random() - 0.5) * (segAngle * 0.5);
  const targetWithinSpin = (360 - segmentCenter - jitter + 360) % 360;

  const extraSpins = 5 + Math.floor(Math.random() * 2);
  const currentMod = ((cravingWheelRotation % 360) + 360) % 360;
  const delta = ((targetWithinSpin - currentMod) + 360) % 360;
  cravingWheelRotation += extraSpins * 360 + delta;

  const svg = document.getElementById('cravingWheelSvg');
  svg.style.transform = `rotate(${cravingWheelRotation}deg)`;
  runTickLoop(svg, n, 3100);

  setTimeout(() => {
    const opt = cravingWheelOptions[chosenIndex];

    selectedCuisines.clear();
    surpriseMode = false;
    customCuisineVal = '';
    document.getElementById('customCuisine').value = '';
    cuisineGrid.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    const chipEl = cuisineGrid.querySelector(`.chip[data-val="${opt.val}"]`);
    if (chipEl) chipEl.click();

    playLandingChime();
    resultEl.style.display = 'block';
    resultEl.textContent = `🎡 the wheel says: ${opt.label}`;
    spinBtn.disabled = false;
    spinBtn.textContent = "🎡 SPIN AGAIN";
  }, 3100);
}

document.getElementById('cravingWheelToggleBtn').addEventListener('click', () => {
  const wrapper = document.getElementById('cravingWheelWrapper');
  const toggleBtn = document.getElementById('cravingWheelToggleBtn');
  const isHidden = wrapper.style.display === 'none';
  wrapper.style.display = isHidden ? 'block' : 'none';
  toggleBtn.textContent = isHidden ? '▲ HIDE CRAVING WHEEL' : "🎡 CAN'T DECIDE? SPIN FOR A CRAVING";
});

document.getElementById('cravingSpinBtn').addEventListener('click', spinCravingWheel);
