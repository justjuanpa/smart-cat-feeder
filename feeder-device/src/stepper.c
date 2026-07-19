#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "stepper.h"
#include "esp_err.h"
#include "freertos/semphr.h"
#include "lux_to_led.h"
#include "uart_comm.h"


#define RIGHTSTEP_1_PIN GPIO_NUM_9
#define RIGHTSTEP_2_PIN GPIO_NUM_10
#define RIGHTSTEP_3_PIN GPIO_NUM_11
#define RIGHTSTEP_4_PIN GPIO_NUM_12

#define LEFTSTEP_1_PIN GPIO_NUM_13
#define LEFTSTEP_2_PIN GPIO_NUM_14
#define LEFTSTEP_3_PIN GPIO_NUM_15
#define LEFTSTEP_4_PIN GPIO_NUM_16
#define RSTEP_PIN GPIO_NUM_47
#define LSTEP_PIN GPIO_NUM_48

volatile bool manual_overide_r = false;
volatile bool manual_overide_l = false;
static SemaphoreHandle_t xRStepSem; 
static SemaphoreHandle_t xLStepSem;


static SemaphoreHandle_t xStepRMutex = NULL; //hand of access either to the bttn intrupt or stepper task
esp_err_t rightStepTake(TickType_t wait_time)
{
    return xSemaphoreTake(xStepRMutex, wait_time);
}

void rightStepGive(void)
{
    printf("i gave it up - rightsteptask\n");
                //vTaskDelay(pdMS_TO_TICKS(1000));

    xSemaphoreGive(xStepRMutex);
}

//stepperbttnright ISR
void IRAM_ATTR RSTEPBTTN_ISR(void *parameter){
    BaseType_t xHigherPrioTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR(xRStepSem, &xHigherPrioTaskWoken);
    if (xHigherPrioTaskWoken == pdTRUE){
        portYIELD_FROM_ISR();
    }
}

//stepperbttnleft ISR
void IRAM_ATTR LSTEPBTTN_ISR(void *parameter){
    BaseType_t xHigherPrioTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR(xLStepSem, &xHigherPrioTaskWoken);
    if (xHigherPrioTaskWoken == pdTRUE){
        portYIELD_FROM_ISR();
    }
}


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


volatile bool enable_left;
bool clean_once_left = true;

volatile bool enable_right;
bool clean_once_right = true; 

void stepperEnableLeft(bool val){
    enable_left = val;
}

void stepperEnableRight(bool val){
    enable_right = val; 
}

void stepperStopLeftNoClean(void){
    enable_left = false;
    clean_once_left = true;
    gpio_set_level(LEFTSTEP_1_PIN, 0);
    gpio_set_level(LEFTSTEP_2_PIN, 0);
    gpio_set_level(LEFTSTEP_3_PIN, 0);
    gpio_set_level(LEFTSTEP_4_PIN, 0);
}

void stepperStopRightNoClean(void){
    enable_right = false;
    clean_once_right = true;
    gpio_set_level(RIGHTSTEP_1_PIN, 0);
    gpio_set_level(RIGHTSTEP_2_PIN, 0);
    gpio_set_level(RIGHTSTEP_3_PIN, 0);
    gpio_set_level(RIGHTSTEP_4_PIN, 0);
}

void stepper_spin_task (void *parameters){
    //printf("here\n");
    //while (1){
        //printf("hey now here \n");
        step_init();

    while(1) {
        
        if ( manual_overide_r == false) {
            printf("yessir\n");
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
            rightStepGive();
        } else {
                        printf("nosir\n");
    //                     gpio_set_level(RIGHTSTEP_1_PIN, 0);
    // gpio_set_level(RIGHTSTEP_2_PIN, 0);
    // gpio_set_level(RIGHTSTEP_3_PIN, 0);
    // gpio_set_level(RIGHTSTEP_4_PIN, 0);

        }

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

void manual_right_stepper_task(void *para){
    TickType_t currentTime = xTaskGetTickCount();
    TickType_t previousTime = 0; //prev 2 are for intrrupt timing

    xRStepSem = xSemaphoreCreateBinary();
    assert(xRStepSem);
    gpio_install_isr_service(0);
    printf("button configuration done\n");
    gpio_reset_pin(RSTEP_PIN);
    gpio_set_direction(RSTEP_PIN, GPIO_MODE_INPUT); //PIR Sensor will input a signal
    gpio_pullup_en(RSTEP_PIN);
    gpio_set_intr_type(RSTEP_PIN, GPIO_INTR_NEGEDGE);
    printf("we are getting stuck\n");
    gpio_isr_handler_add(RSTEP_PIN,RSTEPBTTN_ISR, NULL);
    printf("we made it here\n");

    while (1)
    {
        if (xSemaphoreTake(xRStepSem,  portMAX_DELAY) == pdTRUE){
                        manual_overide_r = true;

                printf("Button was pressed\n");
                previousTime = currentTime;
                currentTime = xTaskGetTickCount();
                // printf("prev: %lu & curr: %lu \n", previousTime, currentTime);
                if ((currentTime-previousTime) > 25){ //if the pir sensor interrupt went of time do uart stuff
                    while(gpio_get_level(RSTEP_PIN) == 0){

                        printf("button is pressed mane forward direction\n");
                        led_spinRcommand("F");
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

                    gpio_set_level(RIGHTSTEP_1_PIN, 0);
                    gpio_set_level(RIGHTSTEP_2_PIN, 0);
                    gpio_set_level(RIGHTSTEP_3_PIN, 0);
                    gpio_set_level(RIGHTSTEP_4_PIN, 0);
                }
                else if ((currentTime - previousTime) < 25){
                    while(gpio_get_level(RSTEP_PIN) == 0){
                        led_spinRcommand("R");
                        printf("button is pressed mane reverse direction\n");
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

                    gpio_set_level(RIGHTSTEP_1_PIN, 0);
                    gpio_set_level(RIGHTSTEP_2_PIN, 0);
                    gpio_set_level(RIGHTSTEP_3_PIN, 0);
                    gpio_set_level(RIGHTSTEP_4_PIN, 0);
                }
                manual_overide_r = false;
                                        led_spinRcommand("S") //s for stop;
        } else {
            printf("semaphore fail");
        }
    }
}

void manual_left_stepper_task(void *para){
    TickType_t currentTime = xTaskGetTickCount();
    TickType_t previousTime = 0; //prev 2 are for intrrupt timing
        xLStepSem = xSemaphoreCreateBinary();
    assert(xLStepSem);
    gpio_reset_pin(LSTEP_PIN);
    gpio_set_direction(LSTEP_PIN, GPIO_MODE_INPUT);
    gpio_pullup_en(LSTEP_PIN);
    gpio_set_intr_type(LSTEP_PIN, GPIO_INTR_NEGEDGE);
    gpio_isr_handler_add(LSTEP_PIN, LSTEPBTTN_ISR, NULL);
    while(1){
         if (xSemaphoreTake(xLStepSem,  portMAX_DELAY) == pdTRUE){
                        manual_overide_l = true;

                printf("Button was pressed\n");
                previousTime = currentTime;
                currentTime = xTaskGetTickCount();
                // printf("prev: %lu & curr: %lu \n", previousTime, currentTime);
                if ((currentTime-previousTime) > 25){ //if the pir sensor interrupt went of time do uart stuff
                    while(gpio_get_level(LSTEP_PIN) == 0){
                        printf("button is pressed mane forward direction\n");
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
                    }

                    gpio_set_level(LEFTSTEP_1_PIN, 0);
                    gpio_set_level(LEFTSTEP_2_PIN, 0);
                    gpio_set_level(LEFTSTEP_3_PIN, 0);
                    gpio_set_level(LEFTSTEP_4_PIN, 0);
                }
                else if ((currentTime - previousTime) < 25){
                    while(gpio_get_level(LSTEP_PIN) == 0){
                        printf("button is pressed mane reverse direction\n");
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
                    }

                    gpio_set_level(LEFTSTEP_1_PIN, 0);
                    gpio_set_level(LEFTSTEP_2_PIN, 0);
                    gpio_set_level(LEFTSTEP_3_PIN, 0);
                    gpio_set_level(LEFTSTEP_4_PIN, 0);
                }
                manual_overide_l = false;
        } else {
            printf("semaphore fail");
        }
    }
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
       if (!manual_overide_l){
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
       }

    if (!manual_overide_r){
        led_spinRcommand("S") //s for stop;

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
}
