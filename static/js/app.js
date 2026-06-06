/* =============================================
   TIKETKU — APP.JS
   ============================================= */

const state = {
  bioskop: { film: null, jam: null, kursi: [] },
  konser:  { acara: null, kategori: null, qty: 1 },
  bus:     { rute: null, jam: null, kursi: [] },
};
let DB = {};
let tiketTerakhir = null;
let riwayatCache  = {};   // kode → objek tiket, untuk cetak dari riwayat

function rupiah(n) { return "Rp " + n.toLocaleString("id-ID"); }
function tglFmt(s) {
  if (!s) return "";
  const [y,m,d] = s.split("-");
  const bln = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${parseInt(d)} ${bln[parseInt(m)-1]} ${y}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const [bio, kon, bus] = await Promise.all([
    fetch("/api/data/bioskop").then(r => r.json()),
    fetch("/api/data/konser").then(r => r.json()),
    fetch("/api/data/bus").then(r => r.json()),
  ]);
  DB.bioskop = bio; DB.konser = kon; DB.bus = bus;
  renderBioskop(); renderKonser(); renderBus();

  document.getElementById("btn-bioskop").addEventListener("click", pesanBioskop);
  document.getElementById("btn-konser").addEventListener("click",  pesanKonser);
  document.getElementById("btn-bus").addEventListener("click",     pesanBus);

  document.getElementById("konser-minus").addEventListener("click", () => {
    if (state.konser.qty > 1) { state.konser.qty--; document.getElementById("konser-qty").value = state.konser.qty; updateSummary("konser"); }
  });
  document.getElementById("konser-plus").addEventListener("click", () => {
    if (state.konser.qty < 10) { state.konser.qty++; document.getElementById("konser-qty").value = state.konser.qty; updateSummary("konser"); }
  });

  const today = new Date().toISOString().split("T")[0];
  document.getElementById("tanggal-bus").min   = today;
  document.getElementById("tanggal-bus").value = today;
  document.getElementById("tanggal-bus").addEventListener("change", () => {
    if (state.bus.rute && state.bus.jam)
      loadKursiBus(state.bus.rute.id, document.getElementById("tanggal-bus").value, state.bus.jam);
  });

  document.getElementById("tab-riwayat-btn").addEventListener("click", loadRiwayat);
});

/* ── BIOSKOP ─────────────────────────────────── */
function renderBioskop() {
  const el = document.getElementById("list-film");
  el.innerHTML = "";
  DB.bioskop.film.forEach(f => {
    const btn = document.createElement("div");
    btn.className = "list-group-item list-group-item-action rounded mb-2";
    btn.style.cursor = "pointer";
    btn.innerHTML = `<div class="fw-semibold"><i class="bi bi-camera-reel me-1 text-danger"></i>${f.judul}</div>
                     <small class="text-muted">${f.jam.length} jadwal tersedia</small>`;
    btn.addEventListener("click", () => {
      document.querySelectorAll("#list-film .list-group-item").forEach(x => x.classList.remove("active","text-white","bg-danger","border-danger"));
      btn.classList.add("active","text-white","bg-danger","border-danger");
      state.bioskop.film = f; state.bioskop.jam = null; state.bioskop.kursi = [];
      renderJam("list-jam-bioskop", f.jam, "bioskop");
      document.getElementById("grid-kursi-bioskop").innerHTML =
        `<p class="text-muted small"><i class="bi bi-info-circle me-1"></i>Pilih jam tayang untuk melihat kursi.</p>`;
      updateSummary("bioskop");
    });
    el.appendChild(btn);
  });
  document.getElementById("grid-kursi-bioskop").innerHTML =
    `<p class="text-muted small"><i class="bi bi-info-circle me-1"></i>Pilih film terlebih dahulu.</p>`;
}

function renderJam(containerId, jamList, jenis) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  jamList.forEach(jam => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline-danger btn-sm fw-semibold";
    btn.textContent = jam;
    btn.addEventListener("click", () => {
      el.querySelectorAll("button").forEach(b => b.classList.replace("btn-danger","btn-outline-danger"));
      btn.classList.replace("btn-outline-danger","btn-danger");
      state[jenis].jam = jam; state[jenis].kursi = [];
      updateSummary(jenis);
      if (jenis === "bioskop" && state.bioskop.film)
        loadKursiBioskop(state.bioskop.film.id, jam);
      if (jenis === "bus" && state.bus.rute)
        loadKursiBus(state.bus.rute.id, document.getElementById("tanggal-bus").value, jam);
    });
    el.appendChild(btn);
  });
}

async function loadKursiBioskop(film_id, jam) {
  document.getElementById("grid-kursi-bioskop").innerHTML =
    `<p class="text-muted small"><i class="bi bi-hourglass-split me-1"></i>Memuat kursi...</p>`;
  const res  = await fetch(`/api/kursi/bioskop?film_id=${film_id}&jam=${encodeURIComponent(jam)}`);
  const data = await res.json();
  renderGridBioskop(data.terisi);
}

function renderGridBioskop(terisi) {
  const grid = document.getElementById("grid-kursi-bioskop");
  grid.innerHTML = ""; state.bioskop.kursi = []; updateSummary("bioskop");
  DB.bioskop.baris.forEach(b => {
    const row = document.createElement("div");
    row.className = "d-flex align-items-center gap-1 mb-1";
    const lbl = document.createElement("span");
    lbl.style.cssText = "width:20px;font-size:12px;font-weight:600;color:#6c757d;text-align:right;";
    lbl.textContent = b; row.appendChild(lbl);
    for (let k = 1; k <= DB.bioskop.kolom; k++) {
      const kode = b + k, s = document.createElement("div");
      s.className = "seat " + (terisi.includes(kode) ? "taken" : "available");
      s.textContent = kode; s.title = kode;
      if (!terisi.includes(kode)) s.addEventListener("click", () => toggleKursi(kode, s, "bioskop"));
      row.appendChild(s);
    }
    grid.appendChild(row);
  });
}

/* ── KONSER ──────────────────────────────────── */
function renderKonser() {
  const elAcara = document.getElementById("list-acara");
  elAcara.innerHTML = "";
  DB.konser.acara.forEach(a => {
    const btn = document.createElement("div");
    btn.className = "list-group-item list-group-item-action rounded mb-2";
    btn.style.cursor = "pointer";
    btn.innerHTML = `<div class="fw-semibold"><i class="bi bi-stars me-1 text-danger"></i>${a.nama}</div>
                     <small class="text-muted"><i class="bi bi-calendar2 me-1"></i>${tglFmt(a.tanggal)}</small>`;
    btn.addEventListener("click", async () => {
      document.querySelectorAll("#list-acara .list-group-item").forEach(x => x.classList.remove("active","text-white","bg-danger","border-danger"));
      btn.classList.add("active","text-white","bg-danger","border-danger");
      state.konser.acara = a; state.konser.kategori = null;
      const res = await fetch(`/api/kursi/konser?acara_id=${a.id}`);
      renderKategoriKonser(await res.json());
      updateSummary("konser");
    });
    elAcara.appendChild(btn);
  });
  renderKategoriKonser({});
}

function renderKategoriKonser(terisiMap) {
  const elKat = document.getElementById("list-kategori");
  elKat.innerHTML = "";
  DB.konser.kategori.forEach(k => {
    const terisiN = terisiMap[k.kode] || 0, sisa = k.total - terisiN, habis = sisa <= 0;
    const btn = document.createElement("div");
    btn.className = "list-group-item list-group-item-action rounded mb-2 d-flex justify-content-between align-items-center" + (habis ? " opacity-50" : "");
    btn.style.cursor = habis ? "not-allowed" : "pointer";
    btn.innerHTML = `<div><span class="fw-bold">${k.label}</span>
      <small class="text-muted d-block">Sisa: ${sisa} tiket${habis ? ' — <span class="text-danger">HABIS</span>' : ""}</small></div>
      <span class="badge bg-danger fs-6">${rupiah(k.harga)}</span>`;
    if (!habis) btn.addEventListener("click", () => {
      document.querySelectorAll("#list-kategori .list-group-item").forEach(x => x.classList.remove("active","text-white","bg-danger","border-danger"));
      btn.classList.add("active","text-white","bg-danger","border-danger");
      btn.querySelector(".badge").classList.replace("bg-danger","bg-light");
      btn.querySelector(".badge").style.color = "#dc3545";
      state.konser.kategori = k; updateSummary("konser");
    });
    elKat.appendChild(btn);
  });
}

/* ── BUS ─────────────────────────────────────── */
function renderBus() {
  const el = document.getElementById("list-rute");
  el.innerHTML = "";
  DB.bus.rute.forEach(r => {
    const btn = document.createElement("div");
    btn.className = "list-group-item list-group-item-action rounded mb-2";
    btn.style.cursor = "pointer";
    btn.innerHTML = `<div class="fw-semibold"><i class="bi bi-arrow-right-circle-fill me-1 text-danger"></i>${r.asal} → ${r.tujuan}</div>
                     <small class="text-muted">${rupiah(DB.bus.harga[r.id])} / kursi · ${r.jam.length} jadwal</small>`;
    btn.addEventListener("click", () => {
      document.querySelectorAll("#list-rute .list-group-item").forEach(x => x.classList.remove("active","text-white","bg-danger","border-danger"));
      btn.classList.add("active","text-white","bg-danger","border-danger");
      state.bus.rute = r; state.bus.jam = null; state.bus.kursi = [];
      renderJam("list-jam-bus", r.jam, "bus");
      document.getElementById("grid-kursi-bus").innerHTML =
        `<p class="text-muted small"><i class="bi bi-info-circle me-1"></i>Pilih jam keberangkatan untuk melihat kursi.</p>`;
      updateSummary("bus");
    });
    el.appendChild(btn);
  });
  document.getElementById("grid-kursi-bus").innerHTML =
    `<p class="text-muted small"><i class="bi bi-info-circle me-1"></i>Pilih rute terlebih dahulu.</p>`;
}

async function loadKursiBus(rute_id, tanggal, jam) {
  document.getElementById("grid-kursi-bus").innerHTML =
    `<p class="text-muted small"><i class="bi bi-hourglass-split me-1"></i>Memuat kursi...</p>`;
  const res  = await fetch(`/api/kursi/bus?rute_id=${rute_id}&tanggal=${tanggal}&jam=${encodeURIComponent(jam)}`);
  const data = await res.json();
  renderGridBus(data.terisi);
}

function renderGridBus(terisi) {
  const grid = document.getElementById("grid-kursi-bus");
  grid.innerHTML = ""; state.bus.kursi = []; updateSummary("bus");
  const header = document.createElement("div");
  header.className = "d-flex align-items-center gap-1 mb-1";
  header.innerHTML = `<span style="width:20px;"></span>
    <span class="seat" style="background:transparent;border:none;font-weight:700;color:#6c757d;">A</span>
    <span class="seat" style="background:transparent;border:none;font-weight:700;color:#6c757d;">B</span>
    <span class="seat-aisle"></span>
    <span class="seat" style="background:transparent;border:none;font-weight:700;color:#6c757d;">C</span>
    <span class="seat" style="background:transparent;border:none;font-weight:700;color:#6c757d;">D</span>`;
  grid.appendChild(header);
  DB.bus.baris.forEach(b => {
    const row = document.createElement("div");
    row.className = "d-flex align-items-center gap-1 mb-1";
    const lbl = document.createElement("span");
    lbl.style.cssText = "width:20px;font-size:12px;font-weight:600;color:#6c757d;text-align:right;";
    lbl.textContent = b; row.appendChild(lbl);
    ["A","B",null,"C","D"].forEach(k => {
      if (k === null) { const a = document.createElement("span"); a.className = "seat-aisle"; row.appendChild(a); return; }
      const kode = b + k, s = document.createElement("div");
      s.className = "seat " + (terisi.includes(kode) ? "taken" : "available");
      s.textContent = kode;
      if (!terisi.includes(kode)) s.addEventListener("click", () => toggleKursi(kode, s, "bus"));
      row.appendChild(s);
    });
    grid.appendChild(row);
  });
}

/* ── TOGGLE / SUMMARY ────────────────────────── */
function toggleKursi(kode, el, jenis) {
  const arr = state[jenis].kursi, idx = arr.indexOf(kode);
  if (idx >= 0) { arr.splice(idx,1); el.classList.replace("selected","available"); }
  else          { arr.push(kode);    el.classList.replace("available","selected"); }
  updateSummary(jenis);
}

function updateSummary(jenis) {
  if (jenis === "bioskop") {
    const div = document.getElementById("summary-bioskop"), { kursi } = state.bioskop;
    if (!kursi.length) { div.innerHTML = `<p class="text-muted small">Pilih kursi untuk melihat harga</p>`; return; }
    div.innerHTML = summaryHTML([["Harga per kursi",rupiah(DB.bioskop.harga)],["Kursi dipilih",kursi.join(", ")],["Jumlah",kursi.length+" kursi"]], DB.bioskop.harga*kursi.length);
  }
  if (jenis === "konser") {
    const div = document.getElementById("summary-konser"), { kategori, qty } = state.konser;
    if (!kategori) { div.innerHTML = `<p class="text-muted small">Pilih kategori untuk melihat harga</p>`; return; }
    div.innerHTML = summaryHTML([["Kategori",kategori.label],["Harga per tiket",rupiah(kategori.harga)],["Jumlah",qty+" tiket"]], kategori.harga*qty);
  }
  if (jenis === "bus") {
    const div = document.getElementById("summary-bus"), { rute, kursi } = state.bus;
    if (!rute||!kursi.length) { div.innerHTML = `<p class="text-muted small">Pilih kursi untuk melihat harga</p>`; return; }
    const h = DB.bus.harga[rute.id];
    div.innerHTML = summaryHTML([["Rute",rute.asal+" → "+rute.tujuan],["Harga per kursi",rupiah(h)],["Kursi dipilih",kursi.join(", ")],["Jumlah",kursi.length+" kursi"]], h*kursi.length);
  }
}

function summaryHTML(rows, total) {
  return `<table class="table table-sm table-borderless mb-0"><tbody>
    ${rows.map(([l,v])=>`<tr><td class="text-muted small py-1">${l}</td><td class="text-end fw-semibold small py-1">${v}</td></tr>`).join("")}
    </tbody><tfoot><tr class="border-top"><td class="fw-bold text-danger pt-2">Total</td>
    <td class="text-end fw-bold text-danger fs-5 pt-2">${rupiah(total)}</td></tr></tfoot></table>`;
}

/* ── PESAN ───────────────────────────────────── */
async function pesanBioskop() {
  const { film, jam, kursi } = state.bioskop, nama = document.getElementById("nama-bioskop").value.trim();
  if (!film) return showAlert("Pilih film terlebih dahulu!");
  if (!jam)  return showAlert("Pilih jam tayang terlebih dahulu!");
  if (!kursi.length) return showAlert("Pilih minimal satu kursi!");
  if (!nama) return showAlert("Masukkan nama pemesan!");
  const res = await fetch("/api/pesan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jenis:"bioskop",film_id:film.id,jam,kursi,nama})});
  const data = await res.json();
  if (data.sukses) { tampilModal(data); await loadKursiBioskop(film.id, jam); }
  else showAlert(data.pesan);
}

async function pesanKonser() {
  const { acara, kategori, qty } = state.konser, nama = document.getElementById("nama-konser").value.trim();
  if (!acara)    return showAlert("Pilih acara terlebih dahulu!");
  if (!kategori) return showAlert("Pilih kategori kursi!");
  if (!nama)     return showAlert("Masukkan nama pemesan!");
  const kursi = Array.from({length:qty},(_,i) => kategori.kode+(i+1));
  const res = await fetch("/api/pesan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jenis:"konser",acara_id:acara.id,kategori:kategori.kode,kursi,nama})});
  const data = await res.json();
  if (data.sukses) {
    tampilModal(data);
    const r = await fetch(`/api/kursi/konser?acara_id=${acara.id}`);
    renderKategoriKonser(await r.json());
    state.konser.kategori = null;
  } else showAlert(data.pesan);
}

async function pesanBus() {
  const { rute, jam, kursi } = state.bus, nama = document.getElementById("nama-bus").value.trim(), tanggal = document.getElementById("tanggal-bus").value;
  if (!rute) return showAlert("Pilih rute terlebih dahulu!");
  if (!jam)  return showAlert("Pilih jam keberangkatan!");
  if (!kursi.length) return showAlert("Pilih minimal satu kursi!");
  if (!nama) return showAlert("Masukkan nama penumpang!");
  const res = await fetch("/api/pesan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jenis:"bus",rute_id:rute.id,jam,tanggal,kursi,nama})});
  const data = await res.json();
  if (data.sukses) { tampilModal(data); await loadKursiBus(rute.id, tanggal, jam); }
  else showAlert(data.pesan);
}

/* ── RIWAYAT ─────────────────────────────────── */
async function loadRiwayat() {
  const div = document.getElementById("list-riwayat");
  div.innerHTML = `<p class="text-muted small text-center py-3"><i class="bi bi-hourglass-split me-1"></i>Memuat...</p>`;
  const tikets = await fetch("/api/riwayat").then(r => r.json());
  if (!tikets.length) {
    div.innerHTML = `<p class="text-muted text-center py-4"><i class="bi bi-inbox me-2"></i>Belum ada tiket yang dibeli.</p>`;
    return;
  }
  // Cache tiket agar tombol cetak bisa mengaksesnya
  riwayatCache = {};
  tikets.forEach(t => { riwayatCache[t.kode] = t; });

  div.innerHTML = tikets.map(t => `
    <div class="card mb-2 border-start border-danger border-3">
      <div class="card-body py-2">
        <div class="d-flex justify-content-between align-items-start">
          <div><span class="badge bg-danger me-1">${t.jenis}</span>
               <span class="font-monospace fw-bold small text-danger">${t.kode}</span></div>
          <span class="fw-bold text-danger">${rupiah(t.total)}</span>
        </div>
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="mt-1 small"><strong>${t.nama}</strong> · ${t.detail}
              ${t.jam ? "· "+t.jam : ""}${t.tanggal ? " · "+tglFmt(t.tanggal) : ""}${t.kategori ? " · "+t.kategori : ""}</div>
            <div class="text-muted small">Kursi: ${t.kursi} · ${t.waktu}</div>
          </div>
          <button class="btn btn-danger fw-semibold" onclick="cetakTiketByKode('${t.kode}')">
            <i class="bi bi-printer-fill me-1"></i> Cetak Tiket
          </button>
        </div>
      </div>
    </div>`).join("");
}

// Cetak tiket berdasarkan kode dari riwayat
function cetakTiketByKode(kode) {
  const t = riwayatCache[kode];
  if (!t) return showAlert("Data tiket tidak ditemukan.");
  cetakTiketData(t);
}

/* ── MODAL ───────────────────────────────────── */
function tampilModal(t) {
  tiketTerakhir = t;
  const rows = [
    ["Jenis Tiket",t.jenis],["Nama",t.nama],
    [t.jenis==="Bus"?"Rute":t.jenis==="Bioskop"?"Film":"Acara",t.detail],
    t.tanggal?["Tanggal",tglFmt(t.tanggal)]:null,
    t.jam?["Jam",t.jam]:null, t.kategori?["Kategori",t.kategori]:null,
    ["Kursi",t.kursi],["Jumlah",t.jumlah+" tiket"],["Waktu Pesan",t.waktu],
  ].filter(Boolean);
  document.getElementById("modal-body-tiket").innerHTML = `
    <div class="text-center bg-light rounded py-3 mb-3">
      <div class="text-muted small mb-1">Kode Tiket</div>
      <div class="fw-bold fs-4 text-danger font-monospace">${t.kode}</div>
    </div>
    <table class="table table-sm table-borderless mb-0"><tbody>
      ${rows.map(([l,v])=>`<tr><td class="text-muted small">${l}</td><td class="fw-semibold small text-end">${v}</td></tr>`).join("")}
    </tbody><tfoot><tr class="border-top"><td class="fw-bold text-danger pt-2">Total Bayar</td>
      <td class="text-end fw-bold text-danger fs-5 pt-2">${rupiah(t.total)}</td></tr></tfoot></table>`;
  new bootstrap.Modal(document.getElementById("modalTiket")).show();
}

/* ── CETAK ───────────────────────────────────── */
function cetakTiketData(t) {
  if (!t) return;
  const rows = [["Jenis",t.jenis],["Nama",t.nama],
    [t.jenis==="Bus"?"Rute":t.jenis==="Bioskop"?"Film":"Acara",t.detail],
    t.tanggal?["Tanggal",tglFmt(t.tanggal)]:null,t.jam?["Jam",t.jam]:null,
    t.kategori?["Kategori",t.kategori]:null,
    ["Kursi",t.kursi],["Jumlah",t.jumlah+" tiket"],["Waktu",t.waktu],
  ].filter(Boolean).map(([l,v])=>`<tr><td style="color:#666;width:45%">${l}</td><td style="font-weight:600">${v}</td></tr>`).join("");
  document.getElementById("print-area").innerHTML = `
    <div class="print-ticket">
      <h2 style="text-align:center;margin-bottom:4px">🎟 MetaTiket</h2>
      <p style="text-align:center;color:#888;font-size:12px;margin:0 0 12px">Tiket Resmi</p>
      <div style="text-align:center;font-size:24px;font-weight:700;letter-spacing:3px;color:#dc3545;border:2px dashed #ddd;border-radius:8px;padding:10px;margin-bottom:12px">${t.kode}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>
      <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;color:#dc3545;border-top:2px solid #ddd;margin-top:10px;padding-top:10px">
        <span>Total Bayar</span><span>${rupiah(t.total)}</span></div>
      <p style="text-align:center;font-size:11px;color:#999;margin-top:14px">Tunjukkan tiket ini saat masuk · MetaTiket © 2026</p>
    </div>`;
  window.print();
}

// Dipanggil dari modal setelah beli tiket
function cetakTiket() { cetakTiketData(tiketTerakhir); }

function showAlert(pesan) { alert("⚠️ " + pesan); }