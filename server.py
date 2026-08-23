import hashlib
import http.cookies
import json
import os
import secrets
import sqlite3
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

DB_PATH = os.environ.get("DB_PATH", "/data/app.sqlite3")
HOST = "0.0.0.0"
PORT = 3000
SESSION_TTL = 60 * 60 * 24 * 30
DEFAULTS = {
    "tomas": {"interval": 3, "times": ["02:30", "05:30", "08:30", "11:30", "14:30", "17:30", "20:30", "23:30"]},
    "extracciones": {"interval": 2, "times": ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"]},
}
sessions = {}


def connection():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def initialize():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with connection() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'family' CHECK (role IN ('admin', 'family')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS schedules (
                group_name TEXT PRIMARY KEY,
                interval_hours INTEGER NOT NULL,
                times TEXT NOT NULL
            );
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
        if "role" not in columns:
            db.execute("ALTER TABLE users RENAME TO users_legacy")
            db.execute("""
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'family' CHECK (role IN ('admin', 'family')),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            db.execute("INSERT INTO users (id, username, password_hash, role, created_at) SELECT id, username, password_hash, 'family', created_at FROM users_legacy")
            db.execute("DROP TABLE users_legacy")
        for group, config in DEFAULTS.items():
            db.execute(
                "INSERT OR IGNORE INTO schedules (group_name, interval_hours, times) VALUES (?, ?, ?)",
                (group, config["interval"], json.dumps(config["times"])),
            )


def password_hash(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"


def password_matches(password, encoded):
    try:
        algorithm, salt_hex, digest_hex = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 600_000)
        return secrets.compare_digest(actual.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def admin_exists():
    with connection() as db:
        return db.execute("SELECT 1 FROM users WHERE role = 'admin'").fetchone() is not None


def valid_time(value):
    if not isinstance(value, str) or len(value) != 5 or value[2] != ":":
        return False
    try:
        hour, minute = (int(part) for part in value.split(":"))
        return 0 <= hour <= 23 and 0 <= minute <= 59
    except ValueError:
        return False


def valid_schedule(value):
    return isinstance(value, list) and len(value) == 8 and all(valid_time(item) for item in value)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format_string, *args):
        print(f"{self.address_string()} - {format_string % args}")

    def send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            return json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            return None

    def current_session(self):
        cookies = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookies.get("session")
        if not morsel:
            return None
        session = sessions.get(morsel.value)
        if not session or session["expires"] < time.time():
            sessions.pop(morsel.value, None)
            return None
        return session

    def require_session(self):
        if not self.current_session():
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "No autenticado"})
            return False
        return True

    def require_admin(self):
        session = self.current_session()
        if not session:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "No autenticado"})
            return False
        if session["role"] != "admin":
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Se requiere una cuenta de administrador"})
            return False
        return True

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/healthz":
            self.send_json(HTTPStatus.OK, {"status": "ok"})
        elif path == "/api/auth/status":
            session = self.current_session()
            self.send_json(HTTPStatus.OK, {"configured": admin_exists(), "authenticated": bool(session), "role": session["role"] if session else None})
        elif path == "/api/auth/me":
            session = self.current_session()
            if not session:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "No autenticado"})
            else:
                self.send_json(HTTPStatus.OK, {"username": session["username"], "role": session["role"]})
        elif path == "/api/schedules":
            if not self.require_session():
                return
            with connection() as db:
                rows = db.execute("SELECT group_name, interval_hours, times FROM schedules").fetchall()
            self.send_json(HTTPStatus.OK, {row["group_name"]: {"interval": row["interval_hours"], "times": json.loads(row["times"])} for row in rows})
        elif path == "/api/users":
            if not self.require_admin():
                return
            with connection() as db:
                rows = db.execute("SELECT id, username, role, created_at FROM users ORDER BY id").fetchall()
            self.send_json(HTTPStatus.OK, {"users": [dict(row) for row in rows]})
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada"})

    def do_POST(self):
        path = urlparse(self.path).path
        data = self.read_json() or {}
        if path == "/api/auth/setup":
            if admin_exists():
                self.send_json(HTTPStatus.CONFLICT, {"error": "El usuario ya está configurado"})
                return
            self.create_user(data, "admin")
        elif path == "/api/auth/login":
            with connection() as db:
                user = db.execute("SELECT id, username, password_hash, role FROM users WHERE username = ?", (data.get("username", ""),)).fetchone()
            if not user or not isinstance(data.get("username"), str) or not password_matches(data.get("password", ""), user["password_hash"]) or data["username"] != user["username"]:
                self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Usuario o contraseña incorrectos"})
                return
            token = secrets.token_urlsafe(32)
            sessions[token] = {"user_id": user["id"], "username": user["username"], "role": user["role"], "expires": time.time() + SESSION_TTL}
            self.send_json(HTTPStatus.OK, {"username": user["username"]}, {"Set-Cookie": f"session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL}"})
        elif path == "/api/auth/logout":
            cookies = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
            morsel = cookies.get("session")
            if morsel:
                sessions.pop(morsel.value, None)
            self.send_json(HTTPStatus.OK, {}, {"Set-Cookie": "session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"})
        elif path == "/api/schedules/reset":
            if not self.require_session():
                return
            with connection() as db:
                for group, config in DEFAULTS.items():
                    db.execute("UPDATE schedules SET interval_hours = ?, times = ? WHERE group_name = ?", (config["interval"], json.dumps(config["times"]), group))
            self.send_json(HTTPStatus.OK, {"message": "Horarios restablecidos"})
        elif path == "/api/users":
            if not self.require_admin():
                return
            self.create_user(data, data.get("role", "family"))
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada"})

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/users/") and path.endswith("/password"):
            if not self.require_admin():
                return
            try:
                user_id = int(path.split("/")[3])
            except (IndexError, ValueError):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Usuario inválido"})
                return
            data = self.read_json() or {}
            password = data.get("password", "")
            if not isinstance(password, str) or len(password) < 8:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "La contraseña debe tener al menos 8 caracteres"})
                return
            with connection() as db:
                updated = db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash(password), user_id)).rowcount
            if not updated:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Usuario no encontrado"})
                return
            self.send_json(HTTPStatus.OK, {"message": "Contraseña actualizada"})
            return
        if path != "/api/schedules":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada"})
            return
        if not self.require_session():
            return
        data = self.read_json() or {}
        with connection() as db:
            for group in DEFAULTS:
                item = data.get(group, {})
                interval = item.get("interval")
                times = item.get("times")
                if not isinstance(interval, int) or not 1 <= interval <= 24 or not valid_schedule(times):
                    self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Configuración de horarios inválida"})
                    return
                db.execute("UPDATE schedules SET interval_hours = ?, times = ? WHERE group_name = ?", (interval, json.dumps(times), group))
        self.send_json(HTTPStatus.OK, data)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/users/"):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada"})
            return
        if not self.require_admin():
            return
        try:
            user_id = int(path.split("/")[3])
        except (IndexError, ValueError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Usuario inválido"})
            return
        session = self.current_session()
        if session["user_id"] == user_id:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "No puedes eliminar tu propia cuenta"})
            return
        with connection() as db:
            user = db.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
            if not user:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Usuario no encontrado"})
                return
            if user["role"] == "admin" and db.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0] <= 1:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Debe existir al menos un administrador"})
                return
            db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        self.send_json(HTTPStatus.OK, {"message": "Usuario eliminado"})

    def create_user(self, data, role):
        username = data.get("username", "")
        password = data.get("password", "")
        if role not in ("admin", "family") or not isinstance(username, str) or not 3 <= len(username) <= 80 or not username.strip() or not isinstance(password, str) or len(password) < 8:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Usa un usuario válido y una contraseña de al menos 8 caracteres"})
            return
        with connection() as db:
            try:
                db.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", (username.strip(), password_hash(password), role))
            except sqlite3.IntegrityError:
                self.send_json(HTTPStatus.CONFLICT, {"error": "Ese usuario ya existe"})
                return
        self.send_json(HTTPStatus.CREATED, {"message": "Usuario creado"})


if __name__ == "__main__":
    initialize()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
