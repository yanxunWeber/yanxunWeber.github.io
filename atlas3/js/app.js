const COLORS = {
  亚洲: "#c24b2a",
  欧洲: "#2f6f8f",
  非洲: "#b0893e",
  北美洲: "#3d7a5a",
  南美洲: "#7a4e8a",
  大洋洲: "#1f8a8a",
  南极洲: "#5c6b7a",
};

const CONTINENTS = ["全部", ...Object.keys(COLORS)];
const cache = new Map();
let activeContinent = "全部";
let query = "";
let selectedId = null;
let map;
let cluster;
const markers = new Map();

const listEl = document.getElementById("list");
const listPanel = document.querySelector(".list-panel");
const phoneQuery = window.matchMedia("(max-width: 860px)");
const countEl = document.getElementById("count");
const detailEl = document.getElementById("detail");
const heroEl = document.getElementById("hero");
const thumbsEl = document.getElementById("thumbs");

function hash(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function poster(place) {
  const h = hash(place.name + place.country);
  const sky = `hsl(${h % 360} 42% ${58 + (h % 12)}%)`;
  const land = `hsl(${(h >> 8) % 360} 36% 32%)`;
  const sun = `hsl(${(h >> 16) % 60} 80% 62%)`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 460">
      <rect width="800" height="460" fill="${sky}"/>
      <circle cx="${120 + (h % 520)}" cy="${80 + (h % 90)}" r="46" fill="${sun}"/>
      <path d="M0 300 L140 190 L250 280 L390 150 L520 270 L660 180 L800 290 V460 H0 Z" fill="${land}"/>
      <path d="M0 360 H800 V460 H0 Z" fill="rgba(255,255,255,.28)"/>
      <text x="40" y="420" font-size="42" font-family="Palatino,serif" fill="white">${place.name}</text>
    </svg>`)}`;
}

function visiblePlaces() {
  const q = query.trim().toLowerCase();
  return PLACES.filter((place) => {
    if (activeContinent !== "全部" && place.continent !== activeContinent) return false;
    if (!q) return true;
    return [place.name, place.country, place.continent, place.wikiEn, place.blurb]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

function renderFilters() {
  const root = document.getElementById("filters");
  root.innerHTML = CONTINENTS.map((name) => {
    const n = name === "全部" ? PLACES.length : PLACES.filter((p) => p.continent === name).length;
    return `<button type="button" class="chip${name === activeContinent ? " active" : ""}" data-continent="${name}">${name} ${n}</button>`;
  }).join("");
  root.onclick = (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    activeContinent = button.dataset.continent;
    renderFilters();
    render();
  };
}

function renderList(places) {
  listEl.innerHTML = places.map((place) => `
    <button type="button" class="place${place.id === selectedId ? " active" : ""}" data-id="${place.id}" role="option">
      <span class="swatch" style="background:${COLORS[place.continent]}22">${place.emoji}</span>
      <span><strong>${place.name}</strong><span>${place.country} · ${place.continent}</span></span>
      <i class="dot" style="background:${COLORS[place.continent]}"></i>
    </button>`).join("");
}

function syncMarkers(places) {
  cluster.clearLayers();
  const shown = new Set(places.map((p) => p.id));
  for (const place of places) cluster.addLayer(markers.get(place.id));
  markers.forEach((marker, id) => {
    const element = marker.getElement?.();
    if (element) element.style.opacity = shown.has(id) ? "1" : "0.25";
  });
}

function render() {
  const places = visiblePlaces();
  countEl.textContent = `${places.length} / ${PLACES.length} 处`;
  renderList(places);
  syncMarkers(places);
}

function select(place, fly = true) {
  selectedId = place.id;
  detailEl.hidden = false;
  document.getElementById("detail-meta").textContent = `${place.emoji}  ${place.country} · ${place.continent}`;
  document.getElementById("detail-title").textContent = place.name;
  document.getElementById("detail-blurb").textContent = place.blurb;
  document.getElementById("detail-coords").textContent = `${place.lat.toFixed(4)}°, ${place.lng.toFixed(4)}°`;
  document.getElementById("detail-extract").textContent = place.blurb;
  document.getElementById("detail-link").href = `https://zh.wikipedia.org/wiki/${encodeURIComponent(place.wikiZh)}`;
  showLocalImage(place);
  renderList(visiblePlaces());
  if (phoneQuery.matches) listPanel.classList.remove("open");
  if (fly) map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 5), { duration: 0.8 });
  markers.get(place.id).openTooltip();
  loadStory(place);
}

function showLocalImage(place) {
  const src = place.image || poster(place);
  const img = document.createElement("img");
  img.alt = place.name;
  img.src = src;
  if (place.image) img.onerror = () => { img.src = poster(place); };
  heroEl.replaceChildren(img);
  thumbsEl.innerHTML = "";
}

async function wikiSummary(lang, title) {
  const response = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

async function loadStory(place) {
  if (!cache.has(place.id)) {
    const job = (async () => {
      try { return await wikiSummary("zh", place.wikiZh); }
      catch { try { return await wikiSummary("en", place.wikiEn); } catch { return null; } }
    })();
    cache.set(place.id, job);
  }
  const summary = await cache.get(place.id);
  if (selectedId !== place.id || !summary) return;
  if (summary.extract) document.getElementById("detail-extract").textContent = summary.extract;
  const link = summary.content_urls?.desktop?.page;
  if (link) document.getElementById("detail-link").href = link;
}

function buildMap() {
  map = L.map("map", { worldCopyJump: true, minZoom: 2 }).setView([22, 12], 2);
  L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}", {
    subdomains: ["1", "2", "3", "4"],
    attribution: "&copy; 高德地图",
    maxZoom: 18,
    updateWhenIdle: phoneQuery.matches,
  }).addTo(map);
  cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 42 });
  for (const place of PLACES) {
    const pinSize = phoneQuery.matches ? 22 : 14;
    const icon = L.divIcon({
      className: "",
      html: `<div class="pin" style="background:${COLORS[place.continent]}"></div>`,
      iconSize: [pinSize, pinSize],
      iconAnchor: [pinSize / 2, pinSize / 2],
    });
    const marker = L.marker([place.lat, place.lng], { icon }).bindTooltip(place.name, { direction: "top", offset: [0, -8] });
    marker.on("click", () => select(place, false));
    markers.set(place.id, marker);
  }
  map.addLayer(cluster);
}

document.getElementById("list").addEventListener("click", (event) => {
  const button = event.target.closest(".place");
  if (!button) return;
  select(PLACES.find((place) => place.id === button.dataset.id));
});
document.getElementById("search").addEventListener("input", (event) => {
  query = event.target.value;
  render();
});
document.getElementById("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const first = visiblePlaces()[0];
  if (first) select(first);
});
document.getElementById("random-btn").addEventListener("click", () => {
  const places = visiblePlaces();
  if (!places.length) return;
  select(places[Math.floor(Math.random() * places.length)]);
});
document.getElementById("list-toggle").addEventListener("click", () => {
  const open = listPanel.classList.toggle("open");
  if (open) detailEl.hidden = true;
  setTimeout(() => map.invalidateSize(), 50);
});
document.getElementById("close-detail").addEventListener("click", () => {
  detailEl.hidden = true;
  selectedId = null;
  renderList(visiblePlaces());
});

buildMap();
renderFilters();
render();
