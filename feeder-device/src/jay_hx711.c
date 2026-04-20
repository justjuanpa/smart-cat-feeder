// hx711.c
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "jay_hx711.h"


static uint32_t hx711_read_raw(gpio_num_t dout, gpio_num_t pd_sck, hx711_gain_t gain)
{
    uint32_t data = 0;

    for (int i = 0; i < 24; i++) {
        gpio_set_level(pd_sck, 1);
        esp_rom_delay_us(1);

        data |= (gpio_get_level(dout) << (23 - i));

        gpio_set_level(pd_sck, 0);
        esp_rom_delay_us(1);
    }

    for (int i = 0; i <= gain; i++) {
        gpio_set_level(pd_sck, 1);
        esp_rom_delay_us(1);
        gpio_set_level(pd_sck, 0);
        esp_rom_delay_us(1);
    }

    return data;
}

esp_err_t hx711_init(hx711_t *dev)
{
    if (!dev) return ESP_ERR_INVALID_ARG;

    gpio_config_t in_conf = {
        .pin_bit_mask = 1ULL << dev->dout,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = 0,
        .pull_down_en = 0,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&in_conf);

    gpio_config_t out_conf = {
        .pin_bit_mask = 1ULL << dev->pd_sck,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = 0,
        .pull_down_en = 0,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&out_conf);

    gpio_set_level(dev->pd_sck, 0);
    return hx711_set_gain(dev, dev->gain);
}

esp_err_t hx711_is_ready(hx711_t *dev, bool *ready)
{
    if (!dev || !ready) return ESP_ERR_INVALID_ARG;
    *ready = (gpio_get_level(dev->dout) == 0);
    return ESP_OK;
}

esp_err_t hx711_wait(hx711_t *dev, uint32_t timeout_ms)
{
    if (!dev) return ESP_ERR_INVALID_ARG;

    uint64_t start = esp_timer_get_time() / 1000;
    while ((esp_timer_get_time() / 1000 - start) < timeout_ms) {
        if (gpio_get_level(dev->dout) == 0) {
            return ESP_OK;
        }
        vTaskDelay(pdMS_TO_TICKS(1));
    }

    return ESP_ERR_TIMEOUT;
}

esp_err_t hx711_set_gain(hx711_t *dev, hx711_gain_t gain)
{
    if (!dev) return ESP_ERR_INVALID_ARG;

    esp_err_t err = hx711_wait(dev, 500);
    if (err != ESP_OK) return err;

    hx711_read_raw(dev->dout, dev->pd_sck, gain);
    dev->gain = gain;
    return ESP_OK;
}

esp_err_t hx711_read_data(hx711_t *dev, int32_t *data)
{
    if (!dev || !data) return ESP_ERR_INVALID_ARG;

    uint32_t raw = hx711_read_raw(dev->dout, dev->pd_sck, dev->gain);

    if (raw & 0x800000) {
        raw |= 0xFF000000;
    }

    *data = (int32_t)raw;
    return ESP_OK;
}

esp_err_t hx711_read_average(hx711_t *dev, uint32_t times, int32_t *data)
{
    if (!dev || !data || times == 0) return ESP_ERR_INVALID_ARG;

    int64_t sum = 0;
    int32_t sample = 0;

    for (uint32_t i = 0; i < times; i++) {
        esp_err_t err = hx711_wait(dev, 500);
        if (err != ESP_OK) return err;

        err = hx711_read_data(dev, &sample);
        if (err != ESP_OK) return err;

        sum += sample;
    }

    *data = (int32_t)(sum / times);
    return ESP_OK;
}