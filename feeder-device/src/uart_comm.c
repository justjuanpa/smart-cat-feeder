#include "uart_comm.h"
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

esp_err_t uart_comm_init(void){
    uart_config_t uart_config = {
        .baud_rate = UART_COMM_BAUD_RATE,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT
    };

    
    // If already installed, remove it first
    uart_driver_delete(UART_COMM_PORT);

    esp_err_t ret;
    ret = uart_param_config(UART_COMM_PORT, &uart_config);
    if (ret != ESP_OK){
        return ret; 
    }

    ret = uart_set_pin (UART_COMM_PORT,
                            UART_COMM_TX_PIN,
                            UART_COMM_RX_PIN,
                            UART_PIN_NO_CHANGE,
                        UART_PIN_NO_CHANGE);

    if (ret != ESP_OK) {
        return ret;
    }

    ret = uart_driver_install(UART_COMM_PORT,
                    UART_COMM_BUF_SIZE,
                    UART_COMM_BUF_SIZE,
                0,
            NULL,
        0);

    if (ret != ESP_OK) {
        return ret; 
    }

    return ESP_OK;
}

esp_err_t uart_comm_send_bytes(const uint8_t *data, size_t len)
{
    if (data == NULL || len == 0){
        return ESP_ERR_INVALID_ARG;
    }

    int bytes_written = uart_write_bytes(UART_COMM_PORT, data, len);

    if (bytes_written < 0){
        return ESP_FAIL;
    }

    return ESP_OK;
}



esp_err_t uart_comm_send_string(const char *str)
{
    if (str == NULL){
        return ESP_ERR_INVALID_ARG;
    }

    int bytes_written = uart_write_bytes(UART_COMM_PORT, str, strlen(str));

    if (bytes_written < 0){
        return ESP_FAIL;
    }

    return ESP_OK;
}



int uart_comm_read_bytes(uint8_t *buffer, size_t max_len, uint32_t timeout_ms)
{
    if (buffer == NULL || max_len == 0){
        return -1;
    }

    int len = uart_read_bytes(UART_COMM_PORT,
                              buffer,
                              max_len,
                            pdMS_TO_TICKS(timeout_ms)                   
    );

    return len; 
}

esp_err_t uart_comm_recieve_bytes(const uint8_t *data, size_t len)
{
    if (data == NULL || len == 0){
        return ESP_ERR_INVALID_ARG;
    }

    int bytes_read = uart_read_bytes(UART_COMM_PORT, data, (len-1),
                                                pdMS_TO_TICKS(1000));


    if (bytes_read < 0){
        return ESP_FAIL;
    }

    return ESP_OK; 
}

int uart_comm_read_string(char *str, size_t max_len, uint32_t timeout_ms)
{
    if (str == NULL || max_len == 0){
        return -1;
    }

    int bytes_read = uart_read_bytes(UART_COMM_PORT, (uint8_t*)str, (max_len-1), 
                                                        pdMS_TO_TICKS(timeout_ms));

    if (bytes_read < 0){
        return bytes_read;
    }

    str[bytes_read] = '\0';
    return bytes_read;
}