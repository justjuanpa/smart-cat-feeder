from flask import Flask, request, redirect
import html
import subprocess
import threading
import time

app = Flask(__name__)

HOTSPOT_CONNECTION = "PAWS_Setup"
WIFI_INTERFACE = "wlan0"


def run_command(command, timeout=30):
    """Run a command without exposing submitted Wi-Fi passwords in logs."""
    safe_command = command.copy()
    if "password" in safe_command:
        password_index = safe_command.index("password") + 1
        if password_index < len(safe_command):
            safe_command[password_index] = "********"

    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=timeout
        )
        print("COMMAND:", " ".join(safe_command), flush=True)
        print("RETURN CODE:", result.returncode, flush=True)
        print("STDOUT:", result.stdout, flush=True)
        print("STDERR:", result.stderr, flush=True)
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        print("Command timed out:", " ".join(safe_command), flush=True)
        return -1, "", "Command timed out"


def connect_to_wifi(ssid, password):
    time.sleep(3)
    print(f"Switching from PAWS hotspot to: {ssid}", flush=True)
    run_command(["nmcli", "connection", "down", HOTSPOT_CONNECTION], 15)
    time.sleep(2)
    run_command(["nmcli", "radio", "wifi", "on"], 10)
    time.sleep(2)
    run_command(["nmcli", "device", "wifi", "rescan", "ifname", WIFI_INTERFACE], 15)
    time.sleep(4)
    run_command(
        ["nmcli", "-f", "SSID,SIGNAL,CHAN,SECURITY", "device", "wifi", "list", "ifname", WIFI_INTERFACE],
        15,
    )
    run_command(["nmcli", "connection", "delete", "id", ssid], 10)
    return_code, stdout, stderr = run_command(
        [
            "nmcli", "--wait", "40", "device", "wifi", "connect", ssid,
            "password", password, "ifname", WIFI_INTERFACE, "name", ssid,
        ],
        50,
    )
    if return_code == 0:
        print(f"Successfully connected to {ssid}", flush=True)
        return

    print(f"Failed to connect to {ssid}", flush=True)
    print(stderr or stdout, flush=True)
    time.sleep(3)
    run_command(["nmcli", "connection", "up", HOTSPOT_CONNECTION], 20)


@app.route("/")
def setup_page():
    return """<!DOCTYPE html>
<html><head><title>PAWS Wi-Fi Setup</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><h2>PAWS Wi-Fi Setup</h2><form method="POST" action="/connect">
<label for="ssid">Wi-Fi name:</label><br><input id="ssid" name="ssid" required><br><br>
<label for="password">Password:</label><br>
<input id="password" name="password" type="password" required><br><br>
<button type="submit">Connect</button></form></body></html>"""


@app.route("/connect", methods=["POST"])
def connect_wifi_route():
    ssid = request.form.get("ssid", "").strip()
    password = request.form.get("password", "")
    if not ssid:
        return "<h3>Wi-Fi name cannot be empty.</h3>", 400

    print(f"Received SSID: {ssid}", flush=True)
    print(f"Password length: {len(password)}", flush=True)
    safe_ssid = html.escape(ssid)
    threading.Thread(target=connect_to_wifi, args=(ssid, password), daemon=True).start()
    return f"""<!DOCTYPE html><html><head><title>PAWS Wi-Fi Setup</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<h3>Connecting to {safe_ssid}</h3>
<p>The PAWS setup hotspot will disconnect in a few seconds.</p>
<p>Reconnect your phone or computer to {safe_ssid}.</p>
<p>If the connection fails, the PAWS hotspot should return after approximately one minute.</p>
</body></html>"""


@app.route("/generate_204")
@app.route("/gen_204")
@app.route("/hotspot-detect.html")
@app.route("/library/test/success.html")
@app.route("/connecttest.txt")
@app.route("/ncsi.txt")
@app.route("/redirect")
def captive_portal_check():
    return redirect("/", code=302)


@app.errorhandler(404)
def redirect_unknown_page(error):
    return redirect("/", code=302)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80, debug=False, use_reloader=False, threaded=True)
