// hx711.c
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "jay_hx711.h"
#include "servo.h"
#include "stepper.h"

#define HX711_DOUT_1 GPIO_NUM_5
#define HX711_SCK_1 GPIO_NUM_6
#define HX711_DOUT_2 GPIO_NUM_7
#define HX711_SCK_2 GPIO_NUM_8

bool cell_enable;



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
    cell_enable = val;
}

void load_cell_task(void *parameters){
    bool ready_1 = false;
    int32_t raw_1 = 0;
    uint32_t samples_1 = 15;
    int32_t offset_1 = 148603;
    float scale_1 = 428; 
    float grams_1 = 0;
    int rounded_grams_1 = 0;
    int userSet_grams_1 = 5;

    hx711_t assign_1 = {
        .dout = HX711_DOUT_1,
        .pd_sck = HX711_SCK_1,
        .gain = HX711_GAIN_A_128
    };

    hx711_init(&assign_1);

    bool ready_2 = false;
    int32_t raw_2 = 0;
    uint32_t samples_2 = 15;
    int32_t offset_2 = 149623;
    float scale_2 = 428; 
    float grams_2 = 0;
    int rounded_grams_2 = 0;
    int userSet_grams_2 = 5;

    hx711_t assign_2 = {
        .dout = HX711_DOUT_2,
        .pd_sck = HX711_SCK_2,
        .gain = HX711_GAIN_A_128
    };

    hx711_init(&assign_2);
    
    step_init(); //initalize stepper
    
    //xTaskCreatePinnedToCore(stepper_stop_task, "rotate the steppper backwards", 1024,NULL, 4,NULL,0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(stepper_task, "rotate the steppper", 2048,NULL, 4,NULL,0); //servo and stepper will be on the same core 



    while(1){
        //if (cell_enable) {
            hx711_is_ready(&assign_1, &ready_1);
            hx711_is_ready(&assign_2, &ready_2);


            if (ready_1){
                hx711_read_average(&assign_1, samples_1, &raw_1);
                grams_1 = (raw_1 - offset_1) / scale_1; 
                rounded_grams_1 = (int)(grams_1 + 0.5f);
                //printf("Raw = %ld, Weight = %.2f g for load cell 1\n", (long)raw_1, grams_1);
                printf("Raw = %ld, Weight = %d g for load cell 1\n", (long)raw_1, rounded_grams_1);
            vTaskDelay(pdMS_TO_TICKS(250));
            } 
            else {
                printf("HX711 1 not ready\n");
            }

            if (ready_2){
                hx711_read_average(&assign_2, samples_2, &raw_2);
                grams_2 = (raw_2 - offset_2) / scale_2; 
                rounded_grams_2 = (int)(grams_2 + 0.5f);
                //printf("Raw = %ld, Weight = %.2f g for load cell 2\n", (long)raw_2, grams_2);
                //printf("Raw = %ld, Weight = %d g for load cell 2\n", (long)raw_2, rounded_grams_2);
            } 
            else {
                //printf("HX711 2 not ready\n");
            }
            vTaskDelay(pdMS_TO_TICKS(500));

            if ((rounded_grams_1 < userSet_grams_1) && ready_1){ //meaning nothing is in the bowl 
                //if the alloted user time has passed 
                //the stepper should start spinning 
                //if not just idle and chill
                //create the stepper task here
                stepper_enable(true);
                servoEnable(true);
                //printf("Bowl 1 %d grams of food\n", rounded_grams_1);

            } else if (((userSet_grams_1 == rounded_grams_1 || userSet_grams_1 < rounded_grams_1)) && ready_1){ //the second condition is just for safety
                //printf("Bowl 1 has %d grams of food\n", rounded_grams_1);
                
                stepper_enable(false);
                servoEnable(false);
                //the stepper should spinning
                //so i guess I create the the stepper task here
                //or rather delete the stepper task
                //or maybe a different task one that cause the self cleanning than the ending of spinning 
                //is a higher number higher prority? idk 
                //also what core do you what this on?
                //does it matter?
            }
        //}
    }

}