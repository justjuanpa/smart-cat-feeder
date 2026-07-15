def parse_embedded_message(line):
    """Parse optional ESP32 telemetry lines into cloud-ingestion payload fields.

    The UART bridge owns the serial port. This module only parses lines so it can
    be safely imported by uart_pet_gate.py without opening /dev/serial0 twice.
    """
    if line.startswith("Left Bowl Grams:"):
        grams = parse_int_value(line)
        if grams is None:
            return None

        return {
            "kind": "telemetry",
            "payload": {
                "current_weight_grams": grams,
                "left_bowl_weight_grams": grams,
                "notes": f"Left bowl weight: {grams} g",
                "raw_payload": {
                    "left_bowl_grams": grams,
                },
            },
        }

    if line.startswith("Right Bowl Grams:"):
        grams = parse_int_value(line)
        if grams is None:
            return None

        return {
            "kind": "telemetry",
            "payload": {
                "current_weight_grams": grams,
                "right_bowl_weight_grams": grams,
                "notes": f"Right bowl weight: {grams} g",
                "raw_payload": {
                    "right_bowl_grams": grams,
                },
            },
        }

    if line.startswith("Left Access Lid:"):
        status = parse_text_value(line)
        return {
            "kind": "telemetry",
            "payload": {
                "notes": f"Left access lid: {status}",
                "raw_payload": {
                    "left_access_lid": status,
                },
            },
        }

    if line.startswith("Right Access Lid:"):
        status = parse_text_value(line)
        return {
            "kind": "telemetry",
            "payload": {
                "notes": f"Right access lid: {status}",
                "raw_payload": {
                    "right_access_lid": status,
                },
            },
        }

    if line.startswith("Ledstrip:"):
        status = parse_text_value(line)
        return {
            "kind": "telemetry",
            "payload": {
                "notes": f"LED strip: {status}",
                "raw_payload": {
                    "ledstrip": status,
                },
            },
        }

    return None


def parse_int_value(line):
    try:
        return int(line.split(":", 1)[1].strip())
    except (IndexError, ValueError):
        return None


def parse_text_value(line):
    try:
        return line.split(":", 1)[1].strip()
    except IndexError:
        return ""
