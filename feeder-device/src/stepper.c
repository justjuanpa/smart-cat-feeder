#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "stepper.h"
#include "esp_err.h"

#define RIGHTSTEP_1_PIN GPIO_NUM_9
#define RIGHTSTEP_2_PIN GPIO_NUM_10
#define RIGHTSTEP_3_PIN GPIO_NUM_11
#define RIGHTSTEP_4_PIN GPIO_NUM_12

#define LEFTSTEP_1_PIN GPIO_NUM_13
#define LEFTSTEP_2_PIN GPIO_NUM_14
#define LEFTSTEP_3_PIN GPIO_NUM_15
#define LEFTSTEP_4_PIN GPIO_NUM_16


void step_init(){
    gpio_set_direction(LEFTSTEP_1_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(LEFTSTEP_2_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(LEFTSTEP_3_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(LEFTSTEP_4_PIN, GPIO_MODE_OUTPUT);

    gpio_set_direction(RIGHTSTEP_1_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(RIGHTSTEP_2_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(RIGHTSTEP_3_PIN, GPIO_MODE_OUTPUT);
    gpio_set_direction(RIGHTSTEP_4_PIN, GPIO_MODE_OUTPUT);
}

bool enable_left;
bool clean_once_left = true;

bool enable_right;
bool clean_once_right = true; 

void stepperEnableLeft(bool val){
    enable_left = val;
}

void stepperEnableRight(bool val){
    enable_right = val; 
}

void stepper_spin_task (void *parameters){
    //printf("here\n");
    //while (1){
        //printf("hey now here \n");

    while(1) {//for (int i = 0; i < 200; i++){
                //printf("hey now here \n");
        gpio_set_level(LEFTSTEP_1_PIN, 1);
        gpio_set_level(LEFTSTEP_2_PIN, 0);
        gpio_set_level(LEFTSTEP_3_PIN, 0);
        gpio_set_level(LEFTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(LEFTSTEP_1_PIN, 0);
        gpio_set_level(LEFTSTEP_2_PIN, 1);
        gpio_set_level(LEFTSTEP_3_PIN, 0);
        gpio_set_level(LEFTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(LEFTSTEP_1_PIN, 0);
        gpio_set_level(LEFTSTEP_2_PIN, 0);
        gpio_set_level(LEFTSTEP_3_PIN, 1);
        gpio_set_level(LEFTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(LEFTSTEP_1_PIN, 0);
        gpio_set_level(LEFTSTEP_2_PIN, 0);
        gpio_set_level(LEFTSTEP_3_PIN, 0);
        gpio_set_level(LEFTSTEP_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));


        gpio_set_level(RIGHTSTEP_1_PIN, 1);
        gpio_set_level(RIGHTSTEP_2_PIN, 0);
        gpio_set_level(RIGHTSTEP_3_PIN, 0);
        gpio_set_level(RIGHTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(RIGHTSTEP_1_PIN, 0);
        gpio_set_level(RIGHTSTEP_2_PIN, 1);
        gpio_set_level(RIGHTSTEP_3_PIN, 0);
        gpio_set_level(RIGHTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(RIGHTSTEP_1_PIN, 0);
        gpio_set_level(RIGHTSTEP_2_PIN, 0);
        gpio_set_level(RIGHTSTEP_3_PIN, 1);
        gpio_set_level(RIGHTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(RIGHTSTEP_1_PIN, 0);
        gpio_set_level(RIGHTSTEP_2_PIN, 0);
        gpio_set_level(RIGHTSTEP_3_PIN, 0);
        gpio_set_level(RIGHTSTEP_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    //vTaskDelay(pdMS_TO_TICKS(1000));
    // gpio_set_level(LEFTSTEP_1_PIN, 0);
    // gpio_set_level(LEFTSTEP_2_PIN, 0);
    // gpio_set_level(LEFTSTEP_3_PIN, 0);
    // gpio_set_level(LEFTSTEP_4_PIN, 0);
    // vTaskDelay(pdMS_TO_TICKS(10));


    // gpio_set_level(RIGHTSTEP_1_PIN, 0);
    // gpio_set_level(RIGHTSTEP_2_PIN, 0);
    // gpio_set_level(RIGHTSTEP_3_PIN, 0);
    // gpio_set_level(RIGHTSTEP_4_PIN, 0);
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
        gpio_set_level(LEFTSTEP_1_PIN, 0);
        gpio_set_level(LEFTSTEP_2_PIN, 0);
        gpio_set_level(LEFTSTEP_3_PIN, 0);
        gpio_set_level(LEFTSTEP_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(LEFTSTEP_1_PIN, 0);
        gpio_set_level(LEFTSTEP_2_PIN, 0);
        gpio_set_level(LEFTSTEP_3_PIN, 1);
        gpio_set_level(LEFTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(LEFTSTEP_1_PIN, 0);
        gpio_set_level(LEFTSTEP_2_PIN, 1);
        gpio_set_level(LEFTSTEP_3_PIN, 0);
        gpio_set_level(LEFTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(LEFTSTEP_1_PIN, 1);
        gpio_set_level(LEFTSTEP_2_PIN, 0);
        gpio_set_level(LEFTSTEP_3_PIN, 0);
        gpio_set_level(LEFTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));


        gpio_set_level(RIGHTSTEP_1_PIN, 0);
        gpio_set_level(RIGHTSTEP_2_PIN, 0);
        gpio_set_level(RIGHTSTEP_3_PIN, 0);
        gpio_set_level(RIGHTSTEP_4_PIN, 1);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(RIGHTSTEP_1_PIN, 0);
        gpio_set_level(RIGHTSTEP_2_PIN, 0);
        gpio_set_level(RIGHTSTEP_3_PIN, 1);
        gpio_set_level(RIGHTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(RIGHTSTEP_1_PIN, 0);
        gpio_set_level(RIGHTSTEP_2_PIN, 1);
        gpio_set_level(RIGHTSTEP_3_PIN, 0);
        gpio_set_level(RIGHTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(RIGHTSTEP_1_PIN, 1);
        gpio_set_level(RIGHTSTEP_2_PIN, 0);
        gpio_set_level(RIGHTSTEP_3_PIN, 0);
        gpio_set_level(RIGHTSTEP_4_PIN, 0);
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    //vTaskDelay(pdMS_TO_TICKS(1000));
    vTaskDelete(NULL);
}

void stepper_task(void *parameter){
    int cleanLcounter = 0;
    int cleanRcounter = 0;
    
    while (1){
        if (enable_left) {
            gpio_set_level(LEFTSTEP_1_PIN, 1);
            gpio_set_level(LEFTSTEP_2_PIN, 0);
            gpio_set_level(LEFTSTEP_3_PIN, 0);
            gpio_set_level(LEFTSTEP_4_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));

            gpio_set_level(LEFTSTEP_1_PIN, 0);
            gpio_set_level(LEFTSTEP_2_PIN, 1);
            gpio_set_level(LEFTSTEP_3_PIN, 0);
            gpio_set_level(LEFTSTEP_4_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));

            gpio_set_level(LEFTSTEP_1_PIN, 0);
            gpio_set_level(LEFTSTEP_2_PIN, 0);
            gpio_set_level(LEFTSTEP_3_PIN, 1);
            gpio_set_level(LEFTSTEP_4_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));

            gpio_set_level(LEFTSTEP_1_PIN, 0);
            gpio_set_level(LEFTSTEP_2_PIN, 0);
            gpio_set_level(LEFTSTEP_3_PIN, 0);
            gpio_set_level(LEFTSTEP_4_PIN, 1);
            vTaskDelay(pdMS_TO_TICKS(10));
            clean_once_left = 0;
            cleanLcounter = 0;

        } 
        else {
            if (clean_once_left == 0){

                if (cleanLcounter == 100){
                    clean_once_left = 1;
                } 
                else {
                    cleanLcounter++;
                }
                //for (int i = 0; i < 500; i++){
                        gpio_set_level(LEFTSTEP_1_PIN, 0);
                        gpio_set_level(LEFTSTEP_2_PIN, 0);
                        gpio_set_level(LEFTSTEP_3_PIN, 0);
                        gpio_set_level(LEFTSTEP_4_PIN, 1);
                        vTaskDelay(pdMS_TO_TICKS(10));
                        
                        gpio_set_level(LEFTSTEP_1_PIN, 0);
                        gpio_set_level(LEFTSTEP_2_PIN, 0);
                        gpio_set_level(LEFTSTEP_3_PIN, 1);
                        gpio_set_level(LEFTSTEP_4_PIN, 0);
                        vTaskDelay(pdMS_TO_TICKS(10));
                        
                        gpio_set_level(LEFTSTEP_1_PIN, 0);
                        gpio_set_level(LEFTSTEP_2_PIN, 1);
                        gpio_set_level(LEFTSTEP_3_PIN, 0);
                        gpio_set_level(LEFTSTEP_4_PIN, 0);
                        vTaskDelay(pdMS_TO_TICKS(10));
                        
                        gpio_set_level(LEFTSTEP_1_PIN, 1); 
                        gpio_set_level(LEFTSTEP_2_PIN, 0);
                        gpio_set_level(LEFTSTEP_3_PIN, 0);
                        gpio_set_level(LEFTSTEP_4_PIN, 0);
                        vTaskDelay(pdMS_TO_TICKS(10));
                    //}
            }
                //to actually stop spinning
            gpio_set_level(LEFTSTEP_1_PIN, 0);
            gpio_set_level(LEFTSTEP_2_PIN,0);
            gpio_set_level(LEFTSTEP_3_PIN, 0);
            gpio_set_level(LEFTSTEP_4_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));

    }

    if (enable_right) {
            gpio_set_level(RIGHTSTEP_1_PIN, 1);
            gpio_set_level(RIGHTSTEP_2_PIN, 0);
            gpio_set_level(RIGHTSTEP_3_PIN, 0);
            gpio_set_level(RIGHTSTEP_4_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));

            gpio_set_level(RIGHTSTEP_1_PIN, 0);
            gpio_set_level(RIGHTSTEP_2_PIN, 1);
            gpio_set_level(RIGHTSTEP_3_PIN, 0);
            gpio_set_level(RIGHTSTEP_4_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));

            gpio_set_level(RIGHTSTEP_1_PIN, 0);
            gpio_set_level(RIGHTSTEP_2_PIN, 0);
            gpio_set_level(RIGHTSTEP_3_PIN, 1);
            gpio_set_level(RIGHTSTEP_4_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));

            gpio_set_level(RIGHTSTEP_1_PIN, 0);
            gpio_set_level(RIGHTSTEP_2_PIN, 0);
            gpio_set_level(RIGHTSTEP_3_PIN, 0);
            gpio_set_level(RIGHTSTEP_4_PIN, 1);
            vTaskDelay(pdMS_TO_TICKS(10));
            clean_once_right = 0;
            cleanRcounter = 0;
        } 
        else {
            if (clean_once_right == 0){
                if (cleanRcounter == 100){
                    clean_once_right = 1;
                } 
                else {
                    cleanRcounter++;
                }

                gpio_set_level(RIGHTSTEP_1_PIN, 0);
                        gpio_set_level(RIGHTSTEP_2_PIN, 0);
                        gpio_set_level(RIGHTSTEP_3_PIN, 0);
                        gpio_set_level(RIGHTSTEP_4_PIN, 1);
                        vTaskDelay(pdMS_TO_TICKS(10));
                        
                        gpio_set_level(RIGHTSTEP_1_PIN, 0);
                        gpio_set_level(RIGHTSTEP_2_PIN, 0);
                        gpio_set_level(RIGHTSTEP_3_PIN, 1);
                        gpio_set_level(RIGHTSTEP_4_PIN, 0);
                        vTaskDelay(pdMS_TO_TICKS(10));
                        
                        gpio_set_level(RIGHTSTEP_1_PIN, 0);
                        gpio_set_level(RIGHTSTEP_2_PIN, 1);
                        gpio_set_level(RIGHTSTEP_3_PIN, 0);
                        gpio_set_level(RIGHTSTEP_4_PIN, 0);
                        vTaskDelay(pdMS_TO_TICKS(10));
                        
                        gpio_set_level(RIGHTSTEP_1_PIN, 1); 
                        gpio_set_level(RIGHTSTEP_2_PIN, 0);
                        gpio_set_level(RIGHTSTEP_3_PIN, 0);
                        gpio_set_level(RIGHTSTEP_4_PIN, 0);
                        vTaskDelay(pdMS_TO_TICKS(10));

            }
                //to actually stop spinning
            gpio_set_level(RIGHTSTEP_1_PIN, 0);
            gpio_set_level(RIGHTSTEP_2_PIN,0);
            gpio_set_level(RIGHTSTEP_3_PIN, 0);
            gpio_set_level(RIGHTSTEP_4_PIN, 0);
            vTaskDelay(pdMS_TO_TICKS(10));

    }
    }
}