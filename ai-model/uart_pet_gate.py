import argparse
import time

import serial

from live_pet_capture import DEFAULT_CONFIDENCE, detect_allowed_pet


def send_line(connection, message):
    connection.write(f"{message}\r\n".encode("utf-8"))
    connection.flush()


def main():
    parser = argparse.ArgumentParser(
        description="UART bridge for trigger-driven pet detection"
    )
    parser.add_argument("--port", default="/dev/serial0", help="UART device path")
    parser.add_argument("--baud", type=int, default=115200, help="UART baud rate")
    parser.add_argument(
        "--frames",
        type=int,
        default=8,
        help="Frames to evaluate after each trigger",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_CONFIDENCE,
        help="Minimum confidence required for an allow decision",
    )
    parser.add_argument(
        "--warmup",
        type=float,
        default=1.0,
        help="Camera warmup time in seconds after a trigger",
    )
    args = parser.parse_args()

    with serial.Serial(args.port, args.baud, timeout=1.0) as connection:
        time.sleep(2)
        connection.reset_input_buffer()
        connection.reset_output_buffer()

        print(f"Listening for trigger events on {args.port} @ {args.baud}")

        while True:
            raw_message = connection.readline()
            if not raw_message:
                continue

            message = raw_message.decode("utf-8", errors="ignore").strip()
            if not message:
                continue

            print(f"UART <= {message}")

            if message != "TRIGGER":
                print("Ignoring unsupported UART message")
                continue

            detection = detect_allowed_pet(
                frame_count=args.frames,
                conf_threshold=args.threshold,
                warmup_seconds=args.warmup,
            )

            if detection is None:
                send_line(connection, "DENY")
                print("UART => DENY")
                continue

            response = (
                f"ALLOW {detection['label']} {detection['confidence']:.2f}"
            )
            send_line(connection, response)
            print(f"UART => {response}")


if __name__ == "__main__":
    main()
