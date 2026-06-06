from flask import Flask, render_template, request, jsonify
import datetime, random, string, json, os

app = Flask(__name__)

DATA_FILE = "tiket_data.json"

# ==============================================================
# DATA MASTER  (tidak pernah berubah)
# ==============================================================

MASTER_BIOSKOP = {
    "film": [
        {"id": "F1", "judul": "Avengers: Secret Wars",  "jam": ["10:00","13:00","16:00","19:00","21:30"]},
        {"id": "F2", "judul": "Petualangan Sherina 3",  "jam": ["09:00","11:30","14:00","17:00","20:00"]},
        {"id": "F3", "judul": "Dune: Part Three",        "jam": ["12:00","15:30","18:30","21:00"]},
    ],
    "baris": ["A","B","C","D","E"],
    "kolom": 8,
    "harga": 50000,
}

MASTER_KONSER = {
    "acara": [
        {"id": "K1", "nama": "Coldplay: Music of the Spheres", "tanggal": "2026-07-12"},
        {"id": "K2", "nama": "Dewa 19 Reunion Tour",           "tanggal": "2026-08-03"},
        {"id": "K3", "nama": "Jakarta Jazz Festival 2026",     "tanggal": "2026-09-20"},
    ],
    "kategori": [
        {"kode": "VIP",     "label": "VIP",     "harga": 1500000, "total": 20},
        {"kode": "GOLD",    "label": "Gold",    "harga":  750000, "total": 50},
        {"kode": "SILVER",  "label": "Silver",  "harga":  350000, "total": 100},
        {"kode": "REGULER", "label": "Reguler", "harga":  150000, "total": 200},
    ],
}

MASTER_BUS = {
    "rute": [
        {"id": "R1", "asal": "Jakarta", "tujuan": "Bandung",    "jam": ["06:00","08:30","11:00","14:00","17:00","20:00"]},
        {"id": "R2", "asal": "Jakarta", "tujuan": "Yogyakarta", "jam": ["07:00","10:00","15:00","21:00"]},
        {"id": "R3", "asal": "Jakarta", "tujuan": "Surabaya",   "jam": ["08:00","12:00","18:00","22:00"]},
        {"id": "R4", "asal": "Bandung", "tujuan": "Yogyakarta", "jam": ["09:00","13:00","19:00"]},
        {"id": "R5", "asal": "Jakarta", "tujuan": "Semarang",   "jam": ["07:30","12:30","20:30"]},
    ],
    "harga": {"R1":75000,"R2":150000,"R3":200000,"R4":120000,"R5":130000},
    "baris": [str(i) for i in range(1, 11)],
}

# ==============================================================
# STATE PERSISTEN
#   bioskop_terisi : { "F1|10:00"            : ["A1","B2"] }
#   bus_terisi     : { "R1|2026-06-05|06:00" : ["1A","2B"] }
#   konser_terisi  : { "K1|VIP"              : 3 }
#   tiket          : [ { ... }, ... ]
# ==============================================================

def load_state():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"bioskop_terisi": {}, "bus_terisi": {}, "konser_terisi": {}, "tiket": []}

def save_state():
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(STATE, f, indent=2, ensure_ascii=False)

STATE = load_state()

# ==============================================================
# HELPER
# ==============================================================

def kode_tiket():
    return "TKT-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=5))

def waktu_sekarang():
    return datetime.datetime.now().strftime("%d %b %Y, %H:%M")

# ==============================================================
# HALAMAN
# ==============================================================

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/admin")
def admin():
    return render_template("admin.html")

# ==============================================================
# API — DATA MASTER
# ==============================================================

@app.route("/api/data/bioskop")
def api_data_bioskop():
    return jsonify(MASTER_BIOSKOP)

@app.route("/api/data/konser")
def api_data_konser():
    return jsonify(MASTER_KONSER)

@app.route("/api/data/bus")
def api_data_bus():
    return jsonify(MASTER_BUS)

# ==============================================================
# API — KURSI TERISI (dinamis per sesi)
# ==============================================================

@app.route("/api/kursi/bioskop")
def api_kursi_bioskop():
    key = f"{request.args.get('film_id')}|{request.args.get('jam')}"
    return jsonify({"terisi": STATE["bioskop_terisi"].get(key, [])})

@app.route("/api/kursi/bus")
def api_kursi_bus():
    key = f"{request.args.get('rute_id')}|{request.args.get('tanggal')}|{request.args.get('jam')}"
    return jsonify({"terisi": STATE["bus_terisi"].get(key, [])})

@app.route("/api/kursi/konser")
def api_kursi_konser():
    acara_id = request.args.get("acara_id", "")
    result = {
        kat["kode"]: STATE["konser_terisi"].get(f"{acara_id}|{kat['kode']}", 0)
        for kat in MASTER_KONSER["kategori"]
    }
    return jsonify(result)

# ==============================================================
# API — RIWAYAT
# ==============================================================

@app.route("/api/riwayat")
def api_riwayat():
    return jsonify(list(reversed(STATE["tiket"])))

# ==============================================================
# API — PESAN
# ==============================================================

@app.route("/api/pesan", methods=["POST"])
def api_pesan():
    data  = request.get_json()
    jenis = data.get("jenis")

    # ── BIOSKOP ──────────────────────────────────────────────
    if jenis == "bioskop":
        film_id = data.get("film_id")
        jam     = data.get("jam")
        kursi   = data.get("kursi", [])
        nama    = data.get("nama", "").strip()

        film = next((f for f in MASTER_BIOSKOP["film"] if f["id"] == film_id), None)
        if not film:
            return jsonify({"sukses": False, "pesan": "Film tidak ditemukan."})

        key    = f"{film_id}|{jam}"
        terisi = STATE["bioskop_terisi"].setdefault(key, [])
        bentrok = [k for k in kursi if k in terisi]
        if bentrok:
            return jsonify({"sukses": False, "pesan": f"Kursi {', '.join(bentrok)} sudah terisi."})

        terisi.extend(kursi)
        total = MASTER_BIOSKOP["harga"] * len(kursi)
        tiket = {
            "kode": kode_tiket(), "jenis": "Bioskop", "nama": nama,
            "detail": film["judul"], "jam": jam,
            "kursi": ", ".join(kursi), "jumlah": len(kursi),
            "total": total, "waktu": waktu_sekarang(), "_key": key,
        }
        STATE["tiket"].append(tiket)
        save_state()
        return jsonify({**tiket, "sukses": True})

    # ── KONSER ───────────────────────────────────────────────
    elif jenis == "konser":
        acara_id      = data.get("acara_id")
        kategori_kode = data.get("kategori")
        kursi         = data.get("kursi", [])
        nama          = data.get("nama", "").strip()

        acara    = next((a for a in MASTER_KONSER["acara"]    if a["id"]   == acara_id),      None)
        kategori = next((k for k in MASTER_KONSER["kategori"] if k["kode"] == kategori_kode), None)
        if not acara or not kategori:
            return jsonify({"sukses": False, "pesan": "Acara atau kategori tidak valid."})

        key_kat  = f"{acara_id}|{kategori_kode}"
        terisi_n = STATE["konser_terisi"].get(key_kat, 0)
        sisa     = kategori["total"] - terisi_n
        if len(kursi) > sisa:
            return jsonify({"sukses": False, "pesan": f"Sisa tiket {kategori['label']} hanya {sisa}."})

        STATE["konser_terisi"][key_kat] = terisi_n + len(kursi)
        total = kategori["harga"] * len(kursi)
        tiket = {
            "kode": kode_tiket(), "jenis": "Konser", "nama": nama,
            "detail": acara["nama"], "tanggal": acara["tanggal"],
            "kategori": kategori["label"],
            "kursi": ", ".join(kursi), "jumlah": len(kursi),
            "total": total, "waktu": waktu_sekarang(), "_key": key_kat,
        }
        STATE["tiket"].append(tiket)
        save_state()
        return jsonify({**tiket, "sukses": True})

    # ── BUS ──────────────────────────────────────────────────
    elif jenis == "bus":
        rute_id = data.get("rute_id")
        jam     = data.get("jam")
        tanggal = data.get("tanggal")
        kursi   = data.get("kursi", [])
        nama    = data.get("nama", "").strip()

        rute = next((r for r in MASTER_BUS["rute"] if r["id"] == rute_id), None)
        if not rute:
            return jsonify({"sukses": False, "pesan": "Rute tidak ditemukan."})

        key    = f"{rute_id}|{tanggal}|{jam}"
        terisi = STATE["bus_terisi"].setdefault(key, [])
        bentrok = [k for k in kursi if k in terisi]
        if bentrok:
            return jsonify({"sukses": False, "pesan": f"Kursi {', '.join(bentrok)} sudah terisi."})

        terisi.extend(kursi)
        harga = MASTER_BUS["harga"][rute_id]
        total = harga * len(kursi)
        tiket = {
            "kode": kode_tiket(), "jenis": "Bus", "nama": nama,
            "detail": f"{rute['asal']} → {rute['tujuan']}",
            "tanggal": tanggal, "jam": jam,
            "kursi": ", ".join(kursi), "jumlah": len(kursi),
            "total": total, "waktu": waktu_sekarang(), "_key": key,
        }
        STATE["tiket"].append(tiket)
        save_state()
        return jsonify({**tiket, "sukses": True})

    return jsonify({"sukses": False, "pesan": "Jenis tiket tidak dikenal."})

# ==============================================================
# API — ADMIN
# ==============================================================

@app.route("/api/admin/tiket")
def api_admin_tiket():
    return jsonify(list(reversed(STATE["tiket"])))

@app.route("/api/admin/batalkan/<kode>", methods=["POST"])
def api_admin_batalkan(kode):
    tiket = next((t for t in STATE["tiket"] if t["kode"] == kode), None)
    if not tiket:
        return jsonify({"sukses": False, "pesan": "Tiket tidak ditemukan."})

    key        = tiket.get("_key", "")
    jenis      = tiket["jenis"]
    kursi_list = [k.strip() for k in tiket["kursi"].split(",")]

    if jenis == "Bioskop":
        buf = STATE["bioskop_terisi"].get(key, [])
        STATE["bioskop_terisi"][key] = [k for k in buf if k not in kursi_list]
    elif jenis == "Bus":
        buf = STATE["bus_terisi"].get(key, [])
        STATE["bus_terisi"][key] = [k for k in buf if k not in kursi_list]
    elif jenis == "Konser":
        STATE["konser_terisi"][key] = max(0, STATE["konser_terisi"].get(key, 0) - len(kursi_list))

    STATE["tiket"] = [t for t in STATE["tiket"] if t["kode"] != kode]
    save_state()
    return jsonify({"sukses": True})

@app.route("/api/admin/reset", methods=["POST"])
def api_admin_reset():
    STATE["bioskop_terisi"] = {}
    STATE["bus_terisi"]     = {}
    STATE["konser_terisi"]  = {}
    STATE["tiket"]          = []
    save_state()
    return jsonify({"sukses": True})

# ==============================================================

if __name__ == "__main__":
    app.run(debug=True)