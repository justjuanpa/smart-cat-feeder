import json
import urllib.error
import urllib.request


def fetch_device_schedules(url, serial_number, token):
    body = {
        "serial_number": serial_number,
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-paws-device-token": token,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        return error.code, {"error": detail}
