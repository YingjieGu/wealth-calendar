#!/usr/bin/env python3
"""
Wealth Calendar Sidecar - Bazi, Natal Chart & Almanac Service
==============================================================================
Zero-dependency (stdlib only) JSON HTTP server.
Listen on 127.0.0.1:<port>, default 47821.

Endpoints:
  GET  /health          → {"status":"ok","version":"0.1"}
  POST /bazi/paipan     → Bazi (Four Pillars) with Dayun & LiuNian
  POST /chart/natal     → Natal chart (planet positions, aspects, ascendant)
  GET  /almanac/today   → Today's almanac (吉凶宜忌, 神煞方位 etc.)

Requires: lunar-python, pyswisseph
"""

import json
import sys
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, date

import lunar_python
from lunar_python import Solar, Lunar

try:
    import swisseph as swe
    HAS_SWISSEPH = True
except ImportError:
    HAS_SWISSEPH = False
    print("[sidecar] WARNING: pyswisseph not available, /chart/natal disabled")

# --- Optional speech modules (lazy) ---
import io
import os
import asyncio
import threading

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")  # China-friendly HF mirror
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")  # hf-mirror has no xet CAS server; force plain HTTP
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

_asr_model = None
_asr_model_size = None
_asr_lock = threading.Lock()

def get_asr_model(size="base"):
    """Lazily load faster-whisper model (thread-safe)."""
    global _asr_model, _asr_model_size
    if _asr_model is not None and _asr_model_size == size:
        return _asr_model
    with _asr_lock:
        if _asr_model is not None and _asr_model_size == size:
            return _asr_model
        from faster_whisper import WhisperModel
        print(f"[sidecar] loading faster-whisper model '{size}' ...", flush=True)
        _asr_model = WhisperModel(size, device="cpu", compute_type="int8", download_root=MODEL_DIR)
        _asr_model_size = size
        print("[sidecar] ASR model ready", flush=True)
        return _asr_model

def transcribe_audio(audio_bytes, language="zh"):
    """Transcribe audio bytes (webm/wav/mp3 all supported via PyAV)."""
    model = get_asr_model()
    segments, info = model.transcribe(io.BytesIO(audio_bytes), language=language)
    text = "".join(s.text for s in segments).strip()
    return {"text": text, "language": info.language, "duration": round(info.duration, 2) if info.duration else None}

async def synthesize_speech(text, voice="zh-CN-XiaoxiaoNeural"):
    """Synthesize speech via edge-tts, return mp3 bytes."""
    import edge_tts
    communicate = edge_tts.Communicate(text, voice)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    return buf.getvalue()

# --- TTS 诊断日志（tts-error.log，由 Electron 注入 userData 路径） ---
_TTS_LOG_PATH = None

def _resolve_tts_log_path():
    global _TTS_LOG_PATH
    if _TTS_LOG_PATH is None:
        base = os.environ.get("WC_USER_DATA_DIR")
        _TTS_LOG_PATH = os.path.join(base, "debug", "tts-error.log") if base else None
    return _TTS_LOG_PATH

def _log_tts_error(msg):
    p = _resolve_tts_log_path()
    if not p:
        return
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat()}] {msg}\n")
    except Exception:
        pass

def edge_tts_available():
    """edge-tts 是否可用（缺依赖/网络情况在调用时才能暴露，这里只报 import）。"""
    try:
        import edge_tts
        return True, getattr(edge_tts, "__version__", "unknown")
    except Exception as e:
        return False, str(e)

VERSION = "0.1"

# ---------------------------------------------------------------------------
# Zodiac helpers
# ---------------------------------------------------------------------------
ZODIAC_SIGNS = [
    "白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座",
    "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"
]

ZODIAC_SIGNS_EN = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
]

def lon_to_zodiac(lon_deg):
    """Convert ecliptic longitude to zodiac sign + degrees + minutes + seconds."""
    sign_idx = int(lon_deg // 30)
    deg = int(lon_deg % 30)
    total_min = (lon_deg % 1) * 60
    min_part = int(total_min)
    sec_part = int(round((total_min - min_part) * 60))
    if sec_part == 60:
        sec_part = 0
        min_part += 1
    if min_part == 60:
        min_part = 0
        deg += 1
    if deg == 30:
        deg = 0
        sign_idx = (sign_idx + 1) % 12
    return {
        "sign": ZODIAC_SIGNS[sign_idx],
        "signEn": ZODIAC_SIGNS_EN[sign_idx],
        "degree": deg,
        "minute": min_part,
        "second": sec_part,
        "longitude": round(lon_deg, 6),
        "label": f"{ZODIAC_SIGNS[sign_idx]} {deg}°{min_part:02d}′{sec_part:02d}″"
    }

# ---------------------------------------------------------------------------
# Planet definitions for natal chart
# ---------------------------------------------------------------------------
PLANETS = {
    "Sun":     {"id": swe.SUN,     "label": "太阳"},
    "Moon":    {"id": swe.MOON,    "label": "月亮"},
    "Mercury": {"id": swe.MERCURY, "label": "水星"},
    "Venus":   {"id": swe.VENUS,   "label": "金星"},
    "Mars":    {"id": swe.MARS,    "label": "火星"},
    "Jupiter": {"id": swe.JUPITER, "label": "木星"},
    "Saturn":  {"id": swe.SATURN,  "label": "土星"},
    "Uranus":  {"id": swe.URANUS,  "label": "天王星"},
    "Neptune": {"id": swe.NEPTUNE, "label": "海王星"},
    "Pluto":   {"id": swe.PLUTO,   "label": "冥王星"},
}

# ---------------------------------------------------------------------------
# Aspect definitions
# ---------------------------------------------------------------------------
ASPECTS = [
    ("conjunction", "合", 0, 8),
    ("sextile",    "六合", 60, 8),
    ("square",     "刑", 90, 8),
    ("trine",      "三合", 120, 8),
    ("opposition",  "冲", 180, 8),
]

def angle_diff(a, b):
    d = abs(a - b) % 360
    if d > 180:
        d = 360 - d
    return d

# ---------------------------------------------------------------------------
# Bazi helpers
# ---------------------------------------------------------------------------

# Wuxing element mapping for tian-gan / di-zhi
TIAN_GAN_WUXING = {
    "甲": "木", "乙": "木",
    "丙": "火", "丁": "火",
    "戊": "土", "己": "土",
    "庚": "金", "辛": "金",
    "壬": "水", "癸": "水",
}

DI_ZHI_WUXING = {
    "子": "水", "丑": "土", "寅": "木", "卯": "木",
    "辰": "土", "巳": "火", "午": "火", "未": "土",
    "申": "金", "酉": "金", "戌": "土", "亥": "水",
}

def split_ganzhi(ganzhi):
    """Split '庚午' → ('庚', '午')."""
    if not ganzhi or len(ganzhi) < 2:
        return ("", "")
    return (ganzhi[0], ganzhi[1])

def make_pillar(ganzhi, shishen, naying=None):
    gan, zhi = split_ganzhi(ganzhi)
    pillar = {
        "ganZhi": ganzhi,
        "tianGan": gan,
        "diZhi": zhi,
        "tianGanWuXing": TIAN_GAN_WUXING.get(gan, ""),
        "diZhiWuXing": DI_ZHI_WUXING.get(zhi, ""),
        "shiShen": shishen,
    }
    if naying:
        pillar["naYin"] = naying
    return pillar

def count_wuxing(pillars):
    """Count wuxing occurrences across all pillars (gan+zhi)."""
    counts = {"金": 0, "木": 0, "水": 0, "火": 0, "土": 0}
    for p in pillars:
        tgw = p.get("tianGanWuXing", "")
        dzw = p.get("diZhiWuXing", "")
        if tgw in counts:
            counts[tgw] += 1
        if dzw in counts:
            counts[dzw] += 1
    return counts

# ---------------------------------------------------------------------------
# Almanac helpers
# ---------------------------------------------------------------------------

def get_almanac_data(lunar, date_str=None):
    """Extract almanac data from a Lunar object."""
    solar = lunar.getSolar()
    year_ganzhi = lunar.getYearInGanZhi()
    month_ganzhi = lunar.getMonthInGanZhi()
    day_ganzhi = lunar.getDayInGanZhi()

    return {
        "date": date_str or f"{solar.getYear()}-{solar.getMonth():02d}-{solar.getDay():02d}",
        "lunar": {
            "year": lunar.getYearInChinese(),
            "month": lunar.getMonthInChinese(),
            "day": lunar.getDayInChinese(),
            "yearGanZhi": year_ganzhi,
            "monthGanZhi": month_ganzhi,
            "dayGanZhi": day_ganzhi,
            "shengXiao": lunar.getDayShengXiao(),
            "chongShengXiao": lunar.getDayChongShengXiao(),
        },
        "yi": list(lunar.getDayYi()) if lunar.getDayYi() else [],
        "ji": list(lunar.getDayJi()) if lunar.getDayJi() else [],
        "jiShen": list(lunar.getDayJiShen()) if lunar.getDayJiShen() else [],
        "xiongSha": list(lunar.getDayXiongSha()) if lunar.getDayXiongSha() else [],
        "gods": {
            "tianShen": lunar.getDayTianShen() or "",
            "tianShenType": lunar.getDayTianShenType() or "",
            "tianShenLuck": lunar.getDayTianShenLuck() or "",
        },
        "direction": {
            "caiShen": lunar.getDayPositionCai() or "",
            "caiShenDesc": lunar.getDayPositionCaiDesc() or "",
            "xiShen": lunar.getDayPositionXi() or "",
            "xiShenDesc": lunar.getDayPositionXiDesc() or "",
            "fuShen": lunar.getDayPositionFu() or "",
            "fuShenDesc": lunar.getDayPositionFuDesc() or "",
        },
        "nineStar": lunar.getDayNineStar() or "",
        "jieQi": lunar.getCurrentJieQi() or "",
        "lu": lunar.getDayLu() or "",
        "sha": lunar.getDaySha() or "",
    }

# ---------------------------------------------------------------------------
# HTTP Request Handler
# ---------------------------------------------------------------------------

class RequestHandler(BaseHTTPRequestHandler):
    """Minimal JSON-API handler."""

    def log_message(self, format, *args):
        """Override to print to stdout for Electron capture."""
        print(f"[sidecar] {self.address_string()} - {format % args}", flush=True)

    def _send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return None
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _error(self, status, message, detail=None):
        err = {"error": message}
        if detail:
            err["detail"] = detail
        self._send_json(status, err)

    def _read_raw(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return b""
        return self.rfile.read(length)

    def _send_bytes(self, status, data, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", len(data))
        self.end_headers()
        self.wfile.write(data)

    # --- ASR handler (raw audio bytes -> text) ---
    def _handle_asr(self):
        try:
            audio = self._read_raw()
            if not audio:
                self._error(400, "Empty audio body")
                return
            language = self.headers.get("X-Language", "zh")
            result = transcribe_audio(audio, language=language)
            self._send_json(200, result)
        except ImportError:
            self._error(500, "faster-whisper not installed; run: pip3 install faster-whisper")
        except Exception as e:
            self._error(500, f"ASR failed: {e}", traceback.format_exc())

    # --- TTS handler (JSON {text, voice} -> mp3 bytes) ---
    def _handle_tts(self):
        try:
            body = self._read_body()
            if not body or not body.get("text"):
                self._error(400, "Missing text field")
                return
            text = body["text"][:500]
            voice = body.get("voice") or "zh-CN-XiaoxiaoNeural"
            audio = asyncio.run(synthesize_speech(text, voice))
            self._send_bytes(200, audio, "audio/mpeg")
        except ImportError as e:
            _log_tts_error(f"edge-tts 未安装/导入失败: {e}")
            self._error(500, "edge-tts not installed; run: pip3 install edge-tts")
        except Exception as e:
            # 记录到 tts-error.log（含完整 traceback），供诊断内置 python 下 edge-tts 失效原因
            _log_tts_error(f"TTS failed: {e}\n{traceback.format_exc()}")
            self._error(500, f"TTS failed: {e}", traceback.format_exc())

    # --- Routing ---

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        qs = parse_qs(parsed.query)

        if path == "/health":
            self._send_json(200, {"status": "ok", "version": VERSION})

        elif path == "/almanac/today":
            try:
                date_str = qs.get("date", [None])[0]
                if date_str:
                    parts = date_str.split("-")
                    y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
                    solar = Solar.fromYmd(y, m, d)
                else:
                    now = datetime.now()
                    solar = Solar.fromYmdHms(now.year, now.month, now.day, 12, 0, 0)
                lunar = solar.getLunar()
                data = get_almanac_data(lunar, date_str)
                self._send_json(200, data)
            except Exception as e:
                self._error(500, str(e), traceback.format_exc())

        elif path == "/models/status":
            avail, ver = edge_tts_available()
            status = {
                "model_dir": MODEL_DIR,
                "tts": {"engine": "edge-tts", "available": avail, "version": ver, "voice": "zh-CN-XiaoxiaoNeural"},
            }
            if _asr_model is not None:
                status["asr"] = {"loaded": True, "size": _asr_model_size}
            else:
                status["asr"] = {"loaded": False, "size": None}
            self._send_json(200, status)

        else:
            self._error(404, f"Not found: {path}")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/bazi/paipan":
            self._handle_bazi()
        elif path == "/chart/natal":
            self._handle_natal()
        elif path == "/asr/transcribe":
            self._handle_asr()
        elif path == "/tts/synthesize":
            self._handle_tts()
        else:
            self._error(404, f"Not found: {path}")

    # --- Bazi handler ---

    def _handle_bazi(self):
        try:
            body = self._read_body()
            if not body:
                self._error(400, "Missing request body")
                return

            birth = body.get("birth", "")
            gender = body.get("gender", "male")

            # Parse birth datetime
            try:
                dt = datetime.strptime(birth, "%Y-%m-%d %H:%M")
            except ValueError:
                self._error(400, "Invalid birth format, expected YYYY-MM-DD HH:MM")
                return

            if gender not in ("male", "female"):
                self._error(400, "gender must be 'male' or 'female'")

            # Build Solar → Lunar → EightChar
            solar = Solar.fromYmdHms(dt.year, dt.month, dt.day,
                                     dt.hour, dt.minute, 0)
            lunar = solar.getLunar()
            eight = lunar.getEightChar()

            # Gender for Yun: 0=female, 1=male
            gender_idx = 1 if gender == "male" else 0

            # Four Pillars
            year_ganzhi = eight.getYear()
            month_ganzhi = eight.getMonth()
            day_ganzhi = eight.getDay()
            time_ganzhi = eight.getTime()

            pillars_data = [
                make_pillar(year_ganzhi, eight.getYearShiShenGan(),
                            eight.getYearNaYin()),
                make_pillar(month_ganzhi, eight.getMonthShiShenGan(),
                            eight.getMonthNaYin()),
                make_pillar(day_ganzhi, eight.getDayShiShenGan(),
                            eight.getDayNaYin()),
                make_pillar(time_ganzhi, eight.getTimeShiShenGan(),
                            eight.getTimeNaYin()),
            ]

            # Day Master
            day_gan, _ = split_ganzhi(day_ganzhi)
            day_master = {
                "gan": day_gan,
                "wuXing": TIAN_GAN_WUXING.get(day_gan, ""),
            }

            # Wuxing count
            wuxing_count = count_wuxing(pillars_data)

            # DaYun (大运)
            yun = eight.getYun(gender_idx)
            da_yuns_raw = yun.getDaYun()
            qiyun_age = yun.getStartYear()
            is_forward = yun.isForward()

            da_yuns = []
            for dy in da_yuns_raw[:5]:
                da_yuns.append({
                    "ganZhi": dy.getGanZhi(),
                    "startAge": dy.getStartAge(),
                    "endAge": dy.getEndAge(),
                    "startYear": dy.getStartYear(),
                    "endYear": dy.getEndYear(),
                    "xun": dy.getXun(),
                    "xunKong": dy.getXunKong(),
                })

            # Current LiuNian (流年) for current year
            current_year = date.today().year
            liunian_info = None
            for dy in da_yuns_raw:
                if dy.getStartYear() <= current_year <= dy.getEndYear():
                    for ln in dy.getLiuNian():
                        if ln.getYear() == current_year:
                            liunian_info = {
                                "year": ln.getYear(),
                                "age": ln.getAge(),
                                "ganZhi": ln.getGanZhi(),
                                "xun": ln.getXun() if hasattr(ln, 'getXun') else "",
                                "xunKong": ln.getXunKong() if hasattr(ln, 'getXunKong') else "",
                            }
                    break

            result = {
                "birth": birth,
                "gender": gender,
                "pillars": {
                    "year": pillars_data[0],
                    "month": pillars_data[1],
                    "day": pillars_data[2],
                    "time": pillars_data[3],
                },
                "dayMaster": day_master,
                "wuXingCount": wuxing_count,
                "qiYunAge": qiyun_age,
                "isForward": is_forward,
                "daYun": da_yuns,
                "liuNian": liunian_info,
            }

            self._send_json(200, result)

        except Exception as e:
            self._error(500, str(e), traceback.format_exc())

    # --- Natal chart handler ---

    def _handle_natal(self):
        if not HAS_SWISSEPH:
            self._error(503, "pyswisseph not available")
            return

        try:
            body = self._read_body()
            if not body:
                self._error(400, "Missing request body")
                return

            birth = body.get("birth", "")
            try:
                dt = datetime.strptime(birth, "%Y-%m-%d %H:%M")
            except ValueError:
                self._error(400, "Invalid birth format, expected YYYY-MM-DD HH:MM")
                return

            # Julian day (UT)
            hour_ut = dt.hour + dt.minute / 60.0
            jd = swe.julday(dt.year, dt.month, dt.day, hour_ut)

            # Planet positions
            planets = {}
            for name, info in PLANETS.items():
                try:
                    result = swe.calc_ut(jd, info["id"])
                    lon = result[0][0]  # longitude (first value in tuple)
                    zodiac = lon_to_zodiac(lon)
                    zodiac["planet"] = name
                    zodiac["planetLabel"] = info["label"]
                    planets[name] = zodiac
                except Exception as e:
                    print(f"[sidecar] WARN: Failed to compute {name}: {e}", flush=True)

            # Aspects
            aspects = []
            planet_names = list(planets.keys())
            for i in range(len(planet_names)):
                for j in range(i + 1, len(planet_names)):
                    p1 = planet_names[i]
                    p2 = planet_names[j]
                    lon1 = planets[p1]["longitude"]
                    lon2 = planets[p2]["longitude"]
                    diff = angle_diff(lon1, lon2)
                    for aspect_key, aspect_label, aspect_angle, orb in ASPECTS:
                        if abs(diff - aspect_angle) <= orb:
                            aspects.append({
                                "planet1": p1,
                                "planet1Label": planets[p1]["planetLabel"],
                                "planet2": p2,
                                "planet2Label": planets[p2]["planetLabel"],
                                "type": aspect_key,
                                "label": aspect_label,
                                "angle": round(diff, 2),
                                "exactAngle": aspect_angle,
                                "orb": round(abs(diff - aspect_angle), 2),
                            })

            # Ascendant (Beijing lat/lon as default)
            lat = body.get("latitude", 39.9)
            lon = body.get("longitude", 116.4)
            try:
                cusps, ascmc = swe.houses(jd, float(lat), float(lon), b'P')
                asc_lon = ascmc[0]
                mc_lon = ascmc[1]
                ascendant = lon_to_zodiac(asc_lon)
                ascendant["label"] = f"上升 {ascendant['label']}"
                midheaven = lon_to_zodiac(mc_lon)
                midheaven["label"] = f"天顶 {midheaven['label']}"
            except Exception as e:
                print(f"[sidecar] WARN: Failed to compute houses: {e}", flush=True)
                ascendant = None
                midheaven = None

            result = {
                "birth": birth,
                "latitude": lat,
                "longitude": lon,
                "planets": planets,
                "ascendant": ascendant,
                "midheaven": midheaven,
                "aspects": aspects,
            }
            self._send_json(200, result)

        except Exception as e:
            self._error(500, str(e), traceback.format_exc())

    # --- Disable unsupported methods ---

    def do_PUT(self):
        self._error(405, "PUT not allowed")

    def do_DELETE(self):
        self._error(405, "DELETE not allowed")

    def do_PATCH(self):
        self._error(405, "PATCH not allowed")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_server(port=47821):
    server = HTTPServer(("127.0.0.1", port), RequestHandler)
    print(f"[sidecar] Wealth Calendar Sidecar v{VERSION} listening on 127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("[sidecar] Server shut down.", flush=True)


if __name__ == "__main__":
    port = 47821
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--port" and i + 1 < len(args):
            port = int(args[i + 1])
    run_server(port)
