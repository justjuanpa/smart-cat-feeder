import serial
import time

# Configure the serial port
ser = serial.Serial(
    port="/dev/serial0",
    baudrate=115200,
    timeout=1
)


def send_data(data):
    """Send data over UART."""
    ser.write((data + "\n").encode("utf-8"))
    print(f"Sent: {data}")


def receive_uart_data():
    """Receive and process one UART message from the ESP32."""

    if ser.in_waiting <= 0:
        return

    line = ser.readline().decode("utf-8", errors="ignore").strip()

    if not line:
        return

    if line == "PIR TRIGGERED":
        print(f"Received: {line}")
        send_data("OPEN")

    elif line.startswith("Left Bowl Grams:"):
        try:
            left_grams = int(line.split(":", 1)[1].strip())
            print(f"Left bowl received: {left_grams} grams")
        except ValueError:
            print(f"Invalid left bowl value: {line}")

    elif line.startswith("Right Bowl Grams:"):
        try:
            right_grams = int(line.split(":", 1)[1].strip())
            print(f"Right bowl received: {right_grams} grams")
        except ValueError:
            print(f"Invalid right bowl value: {line}")

    elif line.startswith("Left Access Lid:"):
        left_cover_status = line.split(":", 1)[1].strip()
        print(f"Left access lid is currently: {left_cover_status}")

    elif line.startswith("Right Access Lid:"):
        right_cover_status = line.split(":", 1)[1].strip()
        print(f"Right access lid is currently: {right_cover_status}")

    elif line.startswith("Ledstrip:"):
        ledstrip_status = line.split(":",1)[1].strip()
        printf(f"The ledstrip is currently: {ledstrip_status} ")
        
    else:
        print(f"Unknown UART message: {line}")


try:
    while True:
        receive_uart_data()
        time.sleep(0.01)

except KeyboardInterrupt:
    print("Program interrupted by user")

finally:
    ser.close()
    print("Serial port closed")
