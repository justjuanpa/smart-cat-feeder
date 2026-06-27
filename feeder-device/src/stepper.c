#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "stepper.h"
#include "esp_err.h"

#define STEPPER1_1_PIN GPIO_NUM_9
#define STEPPER1_2_PIN GPIO_NUM_10
#define STEPPER1_3_PIN GPIO_NUM_11
#define STEPPER1_4_PIN GPIO_NUM_12

#define STEPPER2_1_PIN GPIO_NUM_13
#define STEPPER2_2_PIN GPIO_NUM_14
#define STEPPER2_3_PIN GPIO_NUM_15
#define STEPPER2_4_PIN GPIO_NUM_16


void step_init(){
    gpio_set_direction(STEPPER1_1_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(STEPPER1_2_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(STEPPER1_3_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(STEPPER1_4_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(STEPPER2_1_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(STEPPER2_2_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(STEPPER2_3_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(STEPPER2_4_PIN, GPIO_MODE_OUTPUT);
}

bool enable;
bool clean_once = true;

void stepper_enable(bool val){
    enable = val;
}

void stepper_spin_task (void *parameters){
    //printf("here\n");
    //while (1){
        //printf("hey now here \n");

    while(1) {//for (int i = 0; i < 200; i++){
                //printf("hey now here \n");
        gpio_set_level(STEPPER1_1_PIN, 1);
        gpio_set_level(STEPPER1_2_PIN, 0);
        gpio_set_level(STEPPER1_3_PIN, 0);
        gpio_set_level(STEPPER1_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER1_1_PIN, 0);
        gpio_set_level(STEPPER1_2_PIN, 1);
        gpio_set_level(STEPPER1_3_PIN, 0);
        gpio_set_level(STEPPER1_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER1_1_PIN, 0);
        gpio_set_level(STEPPER1_2_PIN, 0);
        gpio_set_level(STEPPER1_3_PIN, 1);
        gpio_set_level(STEPPER1_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER1_1_PIN, 0);
        gpio_set_level(STEPPER1_2_PIN, 0);
        gpio_set_level(STEPPER1_3_PIN, 0);
        gpio_set_level(STEPPER1_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));


        gpio_set_level(STEPPER2_1_PIN, 1);
        gpio_set_level(STEPPER2_2_PIN, 0);
        gpio_set_level(STEPPER2_3_PIN, 0);
        gpio_set_level(STEPPER2_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER2_1_PIN, 0);
        gpio_set_level(STEPPER2_2_PIN, 1);
        gpio_set_level(STEPPER2_3_PIN, 0);
        gpio_set_level(STEPPER2_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER2_1_PIN, 0);
        gpio_set_level(STEPPER2_2_PIN, 0);
        gpio_set_level(STEPPER2_3_PIN, 1);
        gpio_set_level(STEPPER2_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER2_1_PIN, 0);
        gpio_set_level(STEPPER2_2_PIN, 0);
        gpio_set_level(STEPPER2_3_PIN, 0);
        gpio_set_level(STEPPER2_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    //vTaskDelay(pdMS_TO_TICKS(1000));
    // gpio_set_level(STEPPER1_1_PIN, 0);
    // gpio_set_level(STEPPER1_2_PIN, 0);
    // gpio_set_level(STEPPER1_3_PIN, 0);
    // gpio_set_level(STEPPER1_4_PIN, 0);
    // vTaskDelay(pdMS_TO_TICKS(10));


    // gpio_set_level(STEPPER2_1_PIN, 0);
    // gpio_set_level(STEPPER2_2_PIN, 0);
    // gpio_set_level(STEPPER2_3_PIN, 0);
    // gpio_set_level(STEPPER2_4_PIN, 0);
    // vTaskDelay(pdMS_TO_TICKS(10));

    vTaskDelete(NULL);
}

void stepper_stop_task(void *parameters){ 
    //void step_init(); //this is more so a safety, the stepper spin task 
    //should always come before the stepper stop task meaning the stepper pins
    //are init. already but you never know 


    //the point of this task is to spin in reverse so 4->3->2->1
    //easy

    for (int i = 0; i < 2000; i++){
        gpio_set_level(STEPPER1_1_PIN, 0);
        gpio_set_level(STEPPER1_2_PIN, 0);
        gpio_set_level(STEPPER1_3_PIN, 0);
        gpio_set_level(STEPPER1_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER1_1_PIN, 0);
        gpio_set_level(STEPPER1_2_PIN, 0);
        gpio_set_level(STEPPER1_3_PIN, 1);
        gpio_set_level(STEPPER1_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER1_1_PIN, 0);
        gpio_set_level(STEPPER1_2_PIN, 1);
        gpio_set_level(STEPPER1_3_PIN, 0);
        gpio_set_level(STEPPER1_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER1_1_PIN, 1);
        gpio_set_level(STEPPER1_2_PIN, 0);
        gpio_set_level(STEPPER1_3_PIN, 0);
        gpio_set_level(STEPPER1_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));


        gpio_set_level(STEPPER2_1_PIN, 0);
        gpio_set_level(STEPPER2_2_PIN, 0);
        gpio_set_level(STEPPER2_3_PIN, 0);
        gpio_set_level(STEPPER2_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER2_1_PIN, 0);
        gpio_set_level(STEPPER2_2_PIN, 0);
        gpio_set_level(STEPPER2_3_PIN, 1);
        gpio_set_level(STEPPER2_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER2_1_PIN, 0);
        gpio_set_level(STEPPER2_2_PIN, 1);
        gpio_set_level(STEPPER2_3_PIN, 0);
        gpio_set_level(STEPPER2_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER2_1_PIN, 1);
        gpio_set_level(STEPPER2_2_PIN, 0);
        gpio_set_level(STEPPER2_3_PIN, 0);
        gpio_set_level(STEPPER2_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    //vTaskDelay(pdMS_TO_TICKS(1000));
    vTaskDelete(NULL);
}

void stepper_task(void *parameter){
    while (1){
        if (enable) {
        //printf("enable: %d clean once: %d \n", enable, clean_once);
                //printf("hey now here \n");
        gpio_set_level(STEPPER1_1_PIN, 1);
        gpio_set_level(STEPPER1_2_PIN, 0);
        gpio_set_level(STEPPER1_3_PIN, 0);
        gpio_set_level(STEPPER1_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER1_1_PIN, 0);
        gpio_set_level(STEPPER1_2_PIN, 1);
        gpio_set_level(STEPPER1_3_PIN, 0);
        gpio_set_level(STEPPER1_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER1_1_PIN, 0);
        gpio_set_level(STEPPER1_2_PIN, 0);
        gpio_set_level(STEPPER1_3_PIN, 1);
        gpio_set_level(STEPPER1_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER1_1_PIN, 0);
        gpio_set_level(STEPPER1_2_PIN, 0);
        gpio_set_level(STEPPER1_3_PIN, 0);
        gpio_set_level(STEPPER1_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));


        gpio_set_level(STEPPER2_1_PIN, 1);
        gpio_set_level(STEPPER2_2_PIN, 0);
        gpio_set_level(STEPPER2_3_PIN, 0);
        gpio_set_level(STEPPER2_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER2_1_PIN, 0);
        gpio_set_level(STEPPER2_2_PIN, 1);
        gpio_set_level(STEPPER2_3_PIN, 0);
        gpio_set_level(STEPPER2_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER2_1_PIN, 0);
        gpio_set_level(STEPPER2_2_PIN, 0);
        gpio_set_level(STEPPER2_3_PIN, 1);
        gpio_set_level(STEPPER2_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(STEPPER2_1_PIN, 0);
        gpio_set_level(STEPPER2_2_PIN, 0);
        gpio_set_level(STEPPER2_3_PIN, 0);
        gpio_set_level(STEPPER2_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));
        clean_once = 0;
        } 
        else {
            //printf("enable: %d clean once: %d \n", enable, clean_once);
            if (clean_once == 0){
                clean_once = 1;
                for (int i = 0; i < 500; i++){
                    gpio_set_level(STEPPER1_1_PIN, 0);
                    gpio_set_level(STEPPER1_2_PIN, 0);
                    gpio_set_level(STEPPER1_3_PIN, 0);
                    gpio_set_level(STEPPER1_4_PIN, 1);
                    vTaskDelay(pdMS_TO_TICKS(10));
                    gpio_set_level(STEPPER1_1_PIN, 0);
                    gpio_set_level(STEPPER1_2_PIN, 0);
                    gpio_set_level(STEPPER1_3_PIN, 1);
                    gpio_set_level(STEPPER1_4_PIN, 0);
                    vTaskDelay(pdMS_TO_TICKS(10));
                    gpio_set_level(STEPPER1_1_PIN, 0);
                    gpio_set_level(STEPPER1_2_PIN, 1);
                    gpio_set_level(STEPPER1_3_PIN, 0);
                    gpio_set_level(STEPPER1_4_PIN, 0);
                    vTaskDelay(pdMS_TO_TICKS(10));
                    gpio_set_level(STEPPER1_1_PIN, 1);
                    gpio_set_level(STEPPER1_2_PIN, 0);
                    gpio_set_level(STEPPER1_3_PIN, 0);
                    gpio_set_level(STEPPER1_4_PIN, 0);
                    vTaskDelay(pdMS_TO_TICKS(10));


                    gpio_set_level(STEPPER2_1_PIN, 0);
                    gpio_set_level(STEPPER2_2_PIN, 0);
                    gpio_set_level(STEPPER2_3_PIN, 0);
                    gpio_set_level(STEPPER2_4_PIN, 1);
                    vTaskDelay(pdMS_TO_TICKS(10));

                    gpio_set_level(STEPPER2_1_PIN, 0);
                    gpio_set_level(STEPPER2_2_PIN, 0);
                    gpio_set_level(STEPPER2_3_PIN, 1);
                    gpio_set_level(STEPPER2_4_PIN, 0);
                    vTaskDelay(pdMS_TO_TICKS(10));

                    gpio_set_level(STEPPER2_1_PIN, 0);
                    gpio_set_level(STEPPER2_2_PIN, 1);
                    gpio_set_level(STEPPER2_3_PIN, 0);
                    gpio_set_level(STEPPER2_4_PIN, 0);
                    vTaskDelay(pdMS_TO_TICKS(10));

                    gpio_set_level(STEPPER2_1_PIN, 1);
                    gpio_set_level(STEPPER2_2_PIN, 0);
                    gpio_set_level(STEPPER2_3_PIN, 0);
                    gpio_set_level(STEPPER2_4_PIN, 0);
                    vTaskDelay(pdMS_TO_TICKS(10));
                }
            }
            //to actually stop spinning
            gpio_set_level(STEPPER1_1_PIN, 0);
            gpio_set_level(STEPPER1_2_PIN,0);
            gpio_set_level(STEPPER1_3_PIN, 0);
            gpio_set_level(STEPPER1_4_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));

            gpio_set_level(STEPPER2_1_PIN, 0);
            gpio_set_level(STEPPER2_2_PIN, 0);
            gpio_set_level(STEPPER2_3_PIN, 0);
            gpio_set_level(STEPPER2_4_PIN, 0);

    }
    }
}