// hx711.c
#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "jay_hx711.h"
#include "servo.h"
#include "stepper.h"
#include "uart_comm.h"

#define HX711_DOUT_1 GPIO_NUM_5 //servo onto of the servo 
#define HX711_SCK_1 GPIO_NUM_6 //left servo
#define HX711_DOUT_2 GPIO_NUM_7 //load cell on the bottom 
#define HX711_SCK_2 GPIO_NUM_8 //right load cell 

#define LOAD_CELL_SAMPLES 15
#define LEFT_TARGET_GRAMS 5
#define RIGHT_TARGET_GRAMS 5

static volatile bool left_dispense_enabled = false;
static volatile bool right_dispense_enabled = false;

int gramDataL;
int gramDateR;



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

void load_cell_task_en(bool val){
    load_cell_enable_left(val);
    load_cell_enable_right(val);
}

void load_cell_enable_left(bool val){
    left_dispense_enabled = val;

    if (!val) {
        stepperEnableLeft(false);
        servoEnableLeft(false);
    } else {
        stepperEnableLeft(false);
    }
}

void load_cell_enable_right(bool val){
    right_dispense_enabled = val;

    if (!val) {
        stepperEnableRight(false);
        servoEnableRight(false);
    } else {
        stepperEnableRight(false);
    }
}

void load_cell_stop_all(void){
    load_cell_enable_left(false);
    load_cell_enable_right(false);
}

static void update_left_dispense(bool ready, int grams)
{
    if (!left_dispense_enabled) {
        return;
    }

    if (!ready) {
        printf("Left HX711 not ready; waiting before continuing left dispense\n");
        stepperEnableLeft(false);
        return;
    }

    if (grams < LEFT_TARGET_GRAMS) {
        printf("Left bowl dispensing: %d/%d g\n", grams, LEFT_TARGET_GRAMS);
        servoEnableLeft(false);
        stepperEnableLeft(true);
        return;
    }

    printf("Left bowl target reached: %d/%d g\n", grams, LEFT_TARGET_GRAMS);
    left_dispense_enabled = false;
    stepperEnableLeft(false);
    servoEnableLeft(true);
    uart_comm_send_string("OPENED_LEFT\r\n");
}

static void update_right_dispense(bool ready, int grams)
{
    if (!right_dispense_enabled) {
        return;
    }

    if (!ready) {
        printf("Right HX711 not ready; waiting before continuing right dispense\n");
        stepperEnableRight(false);
        return;
    }

    if (grams < RIGHT_TARGET_GRAMS) {
        printf("Right bowl dispensing: %d/%d g\n", grams, RIGHT_TARGET_GRAMS);
        servoEnableRight(false);
        stepperEnableRight(true);
        return;
    }

    printf("Right bowl target reached: %d/%d g\n", grams, RIGHT_TARGET_GRAMS);
    right_dispense_enabled = false;
    stepperEnableRight(false);
    servoEnableRight(true);
    uart_comm_send_string("OPENED_RIGHT\r\n");
}

void load_cell_task(void *parameters){
    bool ready_1 = false;
    int32_t raw_1 = 0;
    int32_t offset_1 = -147637;
    float scale_1 = -428; 
    float grams_1 = 0;
    int rounded_grams_1 = 0;

    hx711_t assign_1 = {
        .dout = HX711_DOUT_1,
        .pd_sck = HX711_SCK_1,
        .gain = HX711_GAIN_A_128
    };

    hx711_init(&assign_1);

    bool ready_2 = false;
    int32_t raw_2 = 0;
    int32_t offset_2 = 379963;
    float scale_2 = -428; 
    float grams_2 = 0;
    int rounded_grams_2 = 0;

    hx711_t assign_2 = {
        .dout = HX711_DOUT_2,
        .pd_sck = HX711_SCK_2,
        .gain = HX711_GAIN_A_128
    };

    hx711_init(&assign_2);
    
    step_init(); //initalize stepper
    
    //xTaskCreatePinnedToCore(stepper_stop_task, "rotate the steppper backwards", 1024,NULL, 4,NULL,0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(stepper_task, "rotate the steppper", 4096,NULL, 4,NULL,0); //servo and stepper will be on the same core 
        //xTaskCreatePinnedToCore(servoRotate_task,"rotate the servo back a forth", 32768,NULL, 4,NULL,0); //servo and stepper will be on the same core 



    while(1){
        hx711_is_ready(&assign_1, &ready_1);
        hx711_is_ready(&assign_2, &ready_2);

        if (ready_1){
            hx711_read_average(&assign_1, LOAD_CELL_SAMPLES, &raw_1);
            grams_1 = (raw_1 - offset_1) / scale_1;
            rounded_grams_1 = (int)(grams_1 + 0.5f);
            printf("Raw = %ld, Weight = %d g for left load cell\n", (long)raw_1, rounded_grams_1);
        }else{
            printf("L\n");
        }

        if (ready_2){
            hx711_read_average(&assign_2, LOAD_CELL_SAMPLES, &raw_2);
            grams_2 = (raw_2-offset_2) / scale_2;
            rounded_grams_2 = (int)(grams_2 + 0.5f);
            printf("Raw = %ld, Weight = %d g for right load cell\n", (long)raw_2, rounded_grams_2);
        }

        update_left_dispense(ready_1, rounded_grams_1);
        update_right_dispense(ready_2, rounded_grams_2);

        gramDataL = rounded_grams_1;
        gramDateR = rounded_grams_2;

        vTaskDelay(pdMS_TO_TICKS(500));
    }

}

//to send weight data via uart 
int leftGramData(void){
    return gramDataL;
}

int rightGramData(void){
    return gramDateR;
}
