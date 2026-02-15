#!/usr/bin/env python3
"""
Native Messaging Host para Monitor de Bloqueos de Red

Este script actúa como puente entre la extensión de Firefox y el sistema
de whitelist. Recibe solicitudes de la extensión y ejecuta comandos del
sistema para verificar o añadir dominios.

Instalación:
  1. Copiar a /usr/local/bin/openpath-native-host.py
  2. Hacer ejecutable: chmod +x /usr/local/bin/openpath-native-host.py
  3. Registrar el manifest en Firefox

Protocolo:
  - Recibe: JSON con estructura {"action": "...", "domains": [...]}
  - Envía: JSON con estructura {"success": bool, "results": [...]}
"""

import sys
import json
import struct
import subprocess
import os
import hashlib
from pathlib import Path
from datetime import datetime

WHITELIST_CMD = "/usr/local/bin/whitelist"
MAX_DOMAINS = 50
MAX_PATH_RULES = 500
MAX_LOG_SIZE_MB = 5


def get_log_path():
    xdg_data = os.environ.get("XDG_DATA_HOME")
    if xdg_data:
        log_dir = Path(xdg_data) / "openpath"
    else:
        log_dir = Path.home() / ".local" / "share" / "openpath"

    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        return log_dir / "native-host.log"
    except (PermissionError, OSError):
        return Path("/tmp/openpath-native-host.log")


LOG_FILE = get_log_path()


def rotate_log_if_needed():
    try:
        if (
            LOG_FILE.exists()
            and LOG_FILE.stat().st_size > MAX_LOG_SIZE_MB * 1024 * 1024
        ):
            backup = LOG_FILE.with_suffix(".log.old")
            if backup.exists():
                backup.unlink()
            LOG_FILE.rename(backup)
    except Exception:
        pass


def log_debug(message):
    try:
        with open(LOG_FILE, "a") as f:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"[{timestamp}] {message}\n")
    except Exception:
        pass


def read_message():
    """Lee un mensaje del stdin en formato Native Messaging"""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None

    message_length = struct.unpack("@I", raw_length)[0]

    # Límite de seguridad: max 1MB
    if message_length > 1024 * 1024:
        return None

    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)


def send_message(message):
    """Envía un mensaje al stdout en formato Native Messaging"""
    encoded_message = json.dumps(message).encode("utf-8")
    encoded_length = struct.pack("@I", len(encoded_message))

    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_message)
    sys.stdout.buffer.flush()


def check_domain(domain):
    """
    Verifica si un dominio está en la whitelist y si resuelve.

    Returns:
        dict: {
            "domain": str,
            "in_whitelist": bool,
            "resolves": bool,
            "resolved_ip": str or None
        }
    """
    result = {
        "domain": domain,
        "in_whitelist": False,
        "resolves": False,
        "resolved_ip": None,
    }

    try:
        # Ejecutar whitelist check
        proc = subprocess.run(
            [WHITELIST_CMD, "check", domain], capture_output=True, text=True, timeout=10
        )

        output = proc.stdout

        # Parsear resultado
        if "SÍ" in output or "YES" in output:
            result["in_whitelist"] = True

        if "→" in output:
            result["resolves"] = True
            # Extraer IP
            import re

            ip_match = re.search(r"→\s*(\S+)", output)
            if ip_match:
                result["resolved_ip"] = ip_match.group(1)

    except subprocess.TimeoutExpired:
        log_debug(f"Timeout checking domain: {domain}")
    except Exception as e:
        log_debug(f"Error checking domain {domain}: {e}")

    return result


def check_domains(domains):
    """Verifica múltiples dominios"""
    results = []

    # Limitar cantidad de dominios
    domains = domains[:MAX_DOMAINS]

    for domain in domains:
        # Validación básica del dominio
        if not domain or not isinstance(domain, str):
            continue

        # Sanitizar: solo permitir caracteres válidos para dominios
        domain = domain.strip().lower()
        if not all(c.isalnum() or c in ".-" for c in domain):
            continue

        result = check_domain(domain)
        results.append(result)

    return results


def get_whitelist_domains():
    """Obtiene la lista de dominios en la whitelist"""
    try:
        proc = subprocess.run(
            [WHITELIST_CMD, "domains"], capture_output=True, text=True, timeout=10
        )

        domains = [d.strip() for d in proc.stdout.split("\n") if d.strip()]
        return domains

    except Exception as e:
        log_debug(f"Error getting domains: {e}")
        return []


def get_system_status():
    """Obtiene el estado del sistema whitelist"""
    try:
        proc = subprocess.run(
            [WHITELIST_CMD, "status"], capture_output=True, text=True, timeout=10
        )

        return {
            "output": proc.stdout,
            "active": "activo" in proc.stdout.lower()
            or "active" in proc.stdout.lower(),
        }

    except Exception as e:
        log_debug(f"Error getting status: {e}")
        return {"output": "", "active": False}


def get_whitelist_file_path():
    """Detecta la ruta activa del archivo whitelist local"""
    candidates = []

    env_path = os.environ.get("OPENPATH_WHITELIST_FILE")
    if env_path:
        candidates.append(Path(env_path))

    candidates.extend(
        [Path("/var/lib/openpath/whitelist.txt"), Path("/etc/openpath/whitelist.txt")]
    )

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate

    return None


def get_blocked_paths():
    """Obtiene reglas de ## BLOCKED-PATHS del whitelist local"""
    whitelist_file = get_whitelist_file_path()
    if whitelist_file is None:
        return {
            "success": False,
            "action": "get-blocked-paths",
            "error": "Whitelist file not found",
        }

    blocked_paths = []
    section = ""

    try:
        with open(whitelist_file, "r", encoding="utf-8", errors="ignore") as f:
            for raw_line in f:
                line = raw_line.strip()

                if line == "## WHITELIST":
                    section = "whitelist"
                    continue
                if line == "## BLOCKED-SUBDOMAINS":
                    section = "blocked_sub"
                    continue
                if line == "## BLOCKED-PATHS":
                    section = "blocked_path"
                    continue

                if not line or line.startswith("#"):
                    continue

                if not section:
                    section = "whitelist"

                if section == "blocked_path":
                    blocked_paths.append(line)
                    if len(blocked_paths) >= MAX_PATH_RULES:
                        break

        digest = hashlib.sha256("\n".join(blocked_paths).encode("utf-8")).hexdigest()
        mtime = int(whitelist_file.stat().st_mtime)

        return {
            "success": True,
            "action": "get-blocked-paths",
            "paths": blocked_paths,
            "count": len(blocked_paths),
            "hash": digest,
            "mtime": mtime,
            "source": str(whitelist_file),
        }
    except Exception as e:
        log_debug(f"Error getting blocked paths: {e}")
        return {"success": False, "action": "get-blocked-paths", "error": str(e)}


def handle_message(message):
    """Procesa un mensaje y devuelve la respuesta"""

    if not isinstance(message, dict):
        return {"success": False, "error": "Invalid message format"}

    action = message.get("action", "")

    if action == "check":
        domains = message.get("domains", [])
        if not domains:
            return {"success": False, "error": "No domains provided"}

        results = check_domains(domains)
        return {"success": True, "action": "check", "results": results}

    elif action == "list":
        domains = get_whitelist_domains()
        return {"success": True, "action": "list", "domains": domains}

    elif action == "status":
        status = get_system_status()
        return {"success": True, "action": "status", "status": status}

    elif action == "ping":
        return {"success": True, "action": "ping", "message": "pong"}

    elif action == "get-hostname":
        # Return the system hostname for token generation
        import socket

        hostname = socket.gethostname()
        return {"success": True, "action": "get-hostname", "hostname": hostname}

    elif action == "update-whitelist":
        # Trigger whitelist update script
        try:
            update_script = "/usr/local/bin/openpath-update.sh"
            if os.path.exists(update_script):
                proc = subprocess.run(
                    [update_script, "--update"],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                return {
                    "success": proc.returncode == 0,
                    "action": "update-whitelist",
                    "output": proc.stdout,
                    "error": proc.stderr if proc.returncode != 0 else None,
                }
            else:
                return {
                    "success": False,
                    "action": "update-whitelist",
                    "error": "Update script not found",
                }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "action": "update-whitelist",
                "error": "Update timed out",
            }
        except Exception as e:
            return {"success": False, "action": "update-whitelist", "error": str(e)}

    elif action == "get-blocked-paths":
        return get_blocked_paths()

    else:
        return {"success": False, "error": f"Unknown action: {action}"}


def main():
    rotate_log_if_needed()
    log_debug("Native host started")

    while True:
        message = read_message()

        if message is None:
            log_debug("No message received, exiting")
            break

        log_debug(f"Received: {message}")

        response = handle_message(message)

        log_debug(f"Sending: {response}")
        send_message(response)


if __name__ == "__main__":
    main()
