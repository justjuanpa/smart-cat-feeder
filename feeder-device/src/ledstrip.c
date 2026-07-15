#include <stdio.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "sdkconfig.h"
#include "driver/ledc.h"

#define LED_PIN GPIO_NUM_21 //mosfet drain output 
#define SDA_PIN GPIO_NUM_1
#define SCL_PIN GPIO_NUM_2
#define LEDC_LED_CHANNEL LEDC_CHANNEL_2
#define LEDC_MAX_DUTY       1023

#define I2C_MASTER_TIMEOUT_MS 1000
#define TSL2591_ADDR     0x29

// TSL2591 command byte parts
#define TSL2591_COMMAND  0xA0   // CMD bit = 1, normal transaction = 01

// Registers
#define TSL2591_ENABLE   0x00
#define TSL2591_CONFIG   0x01
#define TSL2591_ID       0x12
#define TSL2591_STATUS   0x13
#define TSL2591_C0DATAL  0x14

// ENABLE bits
#define TSL2591_ENABLE_PON  0x01
#define TSL2591_ENABLE_AEN  0x02

// CONFIG options
#define TSL2591_GAIN_LOW    0x00  // 1x
#define TSL2591_GAIN_MED    0x10  // 25x
#define TSL2591_GAIN_HIGH   0x20  // 428x
#define TSL2591_GAIN_MAX    0x30  // 9876x

#define TSL2591_ATIME_100MS 0x00
#define TSL2591_ATIME_200MS 0x01
#define TSL2591_ATIME_300MS 0x02
#define TSL2591_ATIME_400MS 0x03
#define TSL2591_ATIME_500MS 0x04
#define TSL2591_ATIME_600MS 0x05

float lux = 0;
float max_lux = 0; //get the max lux in the room

static const char *TAG = "TSL2591";
TaskHandle_t TSL2591ReadHandle = NULL;

bool ledStatus;

//Function to intialize I2C bus 
static void i2c_master_init_bus(i2c_master_bus_handle_t *bus_handle){
    i2c_master_bus_config_t bus_config = {
        .i2c_port = I2C_NUM_0,
        .sda_io_num = SDA_PIN,
        .scl_io_num = SCL_PIN,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_config, bus_handle));
}

//Function for initializing I2C handle
static void i2c_master_init_handle(i2c_master_bus_handle_t *bus_handle, i2c_master_dev_handle_t *dev_handle, uint8_t address){
    i2c_device_config_t dev_config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = address,
        .scl_speed_hz = 100000,
    };
    ESP_ERROR_CHECK(i2c_master_bus_add_device(*bus_handle, &dev_config, dev_handle));
}

static esp_err_t read_bytes_i2c(i2c_master_dev_handle_t dev_handle, uint8_t reg_addr, uint8_t *data, size_t len){
    uint8_t command = TSL2591_COMMAND | reg_addr; 
    return i2c_master_transmit_receive(dev_handle, &command, 1, data, len, I2C_MASTER_TIMEOUT_MS);
}

//Write a byte to the I2C register address of the device 
static esp_err_t write_byte_i2c(i2c_master_dev_handle_t dev_handle, uint8_t reg_addr, uint8_t data){
    uint8_t write_buf[2] = {TSL2591_COMMAND|reg_addr, data};
    return i2c_master_transmit(dev_handle, write_buf, sizeof(write_buf), I2C_MASTER_TIMEOUT_MS);
}

static float calculate_lux(uint16_t ch0, uint16_t ch1, float atime_ms, float again){
    if (ch0 == 0){
        return 0.0f;
    }

    float cp1 = (atime_ms * again) / 408.0f;

    float lux1 = ((float)ch0 - (1.64f*(float)ch1))/cp1;
    float lux2 = ((0.59f*(float)ch0)- (0.86f*(float)ch1))/cp1;

    float lux = lux1 > lux2 ? lux1 : lux2;

    if (lux < 0){
        lux = 0;
    }
    
    return lux;
}

void lux_data_task(void *arg){
i2c_master_bus_handle_t bus_handle = NULL;
    i2c_master_dev_handle_t dev_handle = NULL;

    i2c_master_init_bus(&bus_handle);

    esp_err_t probe_err = i2c_master_probe(
        bus_handle,
        TSL2591_ADDR,
        I2C_MASTER_TIMEOUT_MS
    );

    // ESP_LOGI(TAG, "Probe 0x29 result: %s",
    //          esp_err_to_name(probe_err));

    if (probe_err != ESP_OK) {
        ESP_LOGE(TAG, "No TSL2591 found at 0x29");

        for (uint8_t address = 1; address < 127; address++) {
            esp_err_t scan_err = i2c_master_probe(
                bus_handle,
                address,
                50
            );

            if (scan_err == ESP_OK) {
                ESP_LOGI(TAG,
                         "Found I2C device at 0x%02X",
                         address);
            }
        }

        vTaskDelete(NULL);
        return;
    }

    i2c_master_init_handle(
        &bus_handle,
        &dev_handle,
        TSL2591_ADDR
    );

    uint8_t id = 0;

    esp_err_t err = read_bytes_i2c(
        dev_handle,
        TSL2591_ID,
        &id,
        1
    );

    // ESP_LOGI(TAG, "ID read result: %s",
    //          esp_err_to_name(err));

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read TSL2591 ID");

        vTaskDelete(NULL);
        return;
    }

    // ESP_LOGI(TAG, "TSL2591 ID: 0x%02X", id);

if (id != 0x50) {
    ESP_LOGE(TAG, "Unexpected ID: 0x%02X", id);

    vTaskDelete(NULL);
    return;
}

    // ESP_LOGI(TAG, "About to enable TSL2591");

err = write_byte_i2c(
    dev_handle,
    TSL2591_ENABLE,
    TSL2591_ENABLE_PON | TSL2591_ENABLE_AEN
);

// ESP_LOGI(TAG, "Enable transaction returned: %s",
//          esp_err_to_name(err));

if (err != ESP_OK) {
    ESP_LOGE(TAG, "Failed to enable TSL2591");
    vTaskDelete(NULL);
    return;
}

// ESP_LOGI(TAG, "About to configure TSL2591");

uint8_t config =
    TSL2591_GAIN_MED |
    TSL2591_ATIME_100MS;

err = write_byte_i2c(
    dev_handle,
    TSL2591_CONFIG,
    config
);

// ESP_LOGI(TAG, "Configuration transaction returned: %s",
//          esp_err_to_name(err));

if (err != ESP_OK) {
    ESP_LOGE(TAG, "Failed to configure TSL2591");
    vTaskDelete(NULL);
    return;
}

// ESP_LOGI(TAG, "Configuration completed");

    float atime_ms = 100.0f;
    float again = 25.0f; 

    //Wait for first inegration cycle to complete 

    ESP_LOGI(TAG, "Starting integration delay");

vTaskDelay(pdMS_TO_TICKS(300));

ESP_LOGI(TAG, "Integration delay finished");

while (1) {
    uint8_t status = 0;

    // ESP_LOGI(TAG, "About to read STATUS");

    err = read_bytes_i2c(
        dev_handle,
        TSL2591_STATUS,
        &status,
        1
    );

    // ESP_LOGI(TAG, "STATUS read returned: %s",
    //          esp_err_to_name(err));

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read STATUS: %s",
                 esp_err_to_name(err));

        vTaskDelay(pdMS_TO_TICKS(1000));
        continue;
    }

    // ESP_LOGI(TAG, "STATUS = 0x%02X", status);

    if (!(status & 0x01)) {
        ESP_LOGW(TAG, "ALS conversion is not ready");
        vTaskDelay(pdMS_TO_TICKS(100));
        continue;
    }

    uint8_t data[4] = {0};

    // ESP_LOGI(TAG, "About to read channel data");

    err = read_bytes_i2c(
        dev_handle,
        TSL2591_C0DATAL,
        data,
        sizeof(data)
    );

    // ESP_LOGI(TAG, "Channel read returned: %s",
    //          esp_err_to_name(err));

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read ALS data: %s",
                 esp_err_to_name(err));

        vTaskDelay(pdMS_TO_TICKS(1000));
        continue;
    }

    uint16_t ch0 =
        ((uint16_t)data[1] << 8) | data[0];

    uint16_t ch1 =
        ((uint16_t)data[3] << 8) | data[2];

    lux = calculate_lux(ch0, ch1, 100.0f, 25.0f);

    ESP_LOGI(TAG, "CH0=%u, CH1=%u, Lux=%.2f",
             ch0, ch1, lux);

    vTaskDelay(pdMS_TO_TICKS(1000));
}
}

static void led_set_brightness(float brightness)
{
    if (brightness < 0.0f) {
        brightness = 0.0f;
    }

    if (brightness > 1.0f) {
        brightness = 1.0f;
    }

    uint32_t duty = (uint32_t)(brightness * LEDC_MAX_DUTY);

    ESP_ERROR_CHECK(ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_LED_CHANNEL, duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_LED_CHANNEL));
}

void ledstrip_task(void *parameters){
    ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_0,
        .duty_resolution = LEDC_TIMER_10_BIT,
        .freq_hz = 5000,
        .clk_cfg = LEDC_AUTO_CLK
    };

    ESP_ERROR_CHECK(ledc_timer_config(&timer));

    ledc_channel_config_t channel = {
        .gpio_num = LED_PIN,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_LED_CHANNEL,
        .timer_sel = LEDC_TIMER_0,
        .duty = 0,
        .hpoint = 0,
        .intr_type = LEDC_INTR_DISABLE
    };
    
    ESP_ERROR_CHECK(ledc_channel_config(&channel));

    // Wait until the TSL2591 has taken its first real reading
    // while (!sensor_ready) {
    //     printf("Waiting for TSL2591 first reading...\n");
    //     led_set_brightness(0.0f);
    //     vTaskDelay(pdMS_TO_TICKS(250));
    // }

    while (1) {
        float brightness = 0.0f;

        if (lux < 50.0f) {
            ledStatus = true; //led is on
            brightness = 1.0f;   // dark room, LED strip ON

        } else {
            ledStatus = false; 
            brightness = 0.0f;   // bright room, LED strip OFF
        }

        led_set_brightness(brightness);

        printf("Lux = %.2f, Brightness = %.2f\n", lux, brightness);

        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}


bool ledStats(void){
    return ledStatus;
}