#include <stdio.h> //obviously needed for c applications

#include "freertos/FreeRTOS.h" //need for tasks
#include "freertos/event_groups.h" 
#include "esp_err.h"
#include "esp_log.h"          // for ESP_LOGV, ESP_LOGI, esp_log_level_set
#include "servo.h"
#include "stepper.h"
#include "ledstrip.h"
#include "jay_hx711.h"
#include "uart_comm.h"
#include <string.h>


#define PIR_PIN GPIO_NUM_4
char pi_command[256];
char esp_command[256] = "PIR TRIGGERED\r\n";

//PIR Semaphore
static SemaphoreHandle_t xPIRSem; //maybe i should do the same for the lux sensor 
static const char *TAG = "example";

//PIR ISR
void IRAM_ATTR PIR_ISR(void *parameter){
    BaseType_t xHigherPrioTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR(xPIRSem, &xHigherPrioTaskWoken);
    if (xHigherPrioTaskWoken == pdTRUE){
        portYIELD_FROM_ISR();
    }
}

void UART_task(void *parameters){   
    uart_comm_init(); //initalize UART
    //printf("ESP32 ready\r\n");

      printf("PIR level = %d\n", gpio_get_level(PIR_PIN));
        fflush(stdout);

    TickType_t currentTime = xTaskGetTickCount();
    TickType_t previousTime = 0; //prev 2 are for intrrupt timing

    while(1) {
        if (xSemaphoreTake(xPIRSem, pdMS_TO_TICKS(20)) == pdTRUE){
            previousTime = currentTime;
            currentTime = xTaskGetTickCount();
            printf("prev: %lu & curr: %lu \n", previousTime, currentTime);
            if ((currentTime-previousTime) > pdMS_TO_TICKS(3000)){ //if the pir sensor interrupt went of time do uart stuff
                //vTaskDelay(pdMS_TO_TICKS(3000));
                printf("Reached\n");
                vTaskDelay(pdMS_TO_TICKS(50));
                uart_comm_send_string(esp_command); //send the pir trigger command from esp to pi 
                vTaskDelay(pdMS_TO_TICKS(50));
                printf("Sent %s:", esp_command);
            }
        }

        int len = uart_comm_read_string(pi_command, sizeof(pi_command) - 1, 1000);
        if (len <= 0){
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }


       trim_command(pi_command);
        if (pi_command[0] == '\0'){
            continue;
        }

        printf("Recieved: %s\n", pi_command);
        if (strcmp(pi_command, "RIGHT") == 0 || strcmp(pi_command, "ALLOW") == 0 || strcmp(pi_command, "OPEN") == 0){ //if the raspberry pi says to open the right side
            vTaskDelay(pdMS_TO_TICKS(50));
            printf("This is where you should open the right servo and load cell task\n");
            load_cell_task_en(true); //what should happen when this is false? 
            //also should i make this for like the right side or something 
            //for now ill make the command allow or open cause thats what the code has

            //open right servo 
            //activate the load cell task for right load cell and the stepper 
            //ill need load cell enable functions 
            //and servo enable functions
        }

        if (strcmp(pi_command, "LEFT") == 0){ //if the raspberry pi says to open the left side 
            printf("This is where you should open the left servo and load cell task");
            //open the left servo 
            //activate the load cell task for left load cell and the stepper 
        }

        // if (strcmp(pi_command, "NONE") == 0){ //if the raspberry pi saus to do nothing
            //ths one may not be nessary at the moment
        // }

                //the if statemments are seperate if statements instead of 
                //if else statement because both pets can have the food dispense at the same time 
                //if order to do this the if statements have to be different 
    }
}

//instead of making a seprate file for the pir sensor im going to implement it here in the main
//i feel like the main is a proper place for this task as the pir sensor is the of the system
//additionally it is implemented as an interrupt so there is no need to make a task for it
void app_main(void)
{
    //vTaskDelay(pdTICKS_TO_MS(1000));
    //uart_comm_send_string("HELP");
    xPIRSem = xSemaphoreCreateBinary();
    if( xPIRSem != NULL ){
       // The semaphore was created successfully.
       // The semaphore can now be used.
       printf("Sema made\n");
    }
    assert(xPIRSem);
    gpio_install_isr_service(0);
    ESP_LOGI(TAG,"configuring PIR sensor\n");
    printf("configuration done\n");
    gpio_reset_pin(PIR_PIN);
    gpio_set_direction(PIR_PIN, GPIO_MODE_INPUT); //PIR Sensor will input a signal
    gpio_pullup_en(PIR_PIN);
    gpio_set_intr_type(PIR_PIN, GPIO_INTR_POSEDGE);
    printf("we are getting stuck\n");
    gpio_isr_handler_add(PIR_PIN, PIR_ISR, NULL);
    printf("we made it here\n");

    //uart_comm_init(); //initalize UART

    xTaskCreatePinnedToCore(ledstrip_task,"set brightness using light",4096,NULL, 2,NULL,0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(read_TSL2591,"find light in darkness",4096,NULL, 2,NULL,0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(servoRotate_task,"rotate the servo back a forth", 4096,NULL, 4,NULL,0); //servo and stepper will be on the same core 
    //xTaskCreatePinnedToCore(stepper_spin_task, "rotate the steppper", 4096,NULL, 4,NULL,0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(load_cell_task,"activate the load cell to read food weight, activate the stepper motors to dispense food",4096,NULL,4, NULL,1); //im putting this on core 1 because it has a task running inside of it 
    xTaskCreatePinnedToCore(UART_task,"serial data task",4096,NULL,3,NULL,1);
        
}