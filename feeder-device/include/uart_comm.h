#pragma once //header file protection ensures file is not included more than once

#include <stddef.h>
#include <stdint.h>
#include "driver/uart.h"
#include "esp_err.h"

#define UART_COMM_PORT UART_NUM_1
#define UART_COMM_TX_PIN 17
#define UART_COMM_RX_PIN 16
#define UART_COMM_BAUD_RATE 115200
#define UART_COMM_BUF_SIZE 1024

#ifdef __cplusplus
extern "C" {
#endif


//sets up uart 
esp_err_t uart_comm_init(void);

//sends raw binary data 
esp_err_t uart_comm_send_bytes(const uint8_t *data, size_t len);

//sends text
esp_err_t uart_comm_send_string(const char *str);

//read received data into a buffer 
int uart_comm_read_bytes(uint8_t *buffer, size_t max_len, uint32_t timeout_ms);

//reads raw binary data 
esp_err_t uart_comm_recieve_bytes(const uint8_t *data, size_t len);

//reads text
int uart_comm_read_string(char *str, size_t max_len, uint32_t timeout_ms);

#ifdef __cplusplus
}
#endif

