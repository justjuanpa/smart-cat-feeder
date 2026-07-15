#include <stdio.h> //obviously needed for c applications
#include <assert.h>

#include "freertos/FreeRTOS.h" //need for tasks
#include "freertos/event_groups.h" 
#include "freertos/semphr.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_log.h"          // for ESP_LOGV, ESP_LOGI, esp_log_level_set
#include "servo.h"
#include "stepper.h"
#include "ledstrip.h"
#include "jay_hx711.h"
#include "uart_comm.h"
#include <string.h>


#define PIR_PIN GPIO_NUM_4
#define UART_RX_CHUNK_SIZE 64
#define RIGHTSTEP_1_PIN GPIO_NUM_9
#define RIGHTSTEP_2_PIN GPIO_NUM_10
#define RIGHTSTEP_3_PIN GPIO_NUM_11
#define RIGHTSTEP_4_PIN GPIO_NUM_12

#define LEFTSTEP_1_PIN GPIO_NUM_13
#define LEFTSTEP_2_PIN GPIO_NUM_14
#define LEFTSTEP_3_PIN GPIO_NUM_15
#define LEFTSTEP_4_PIN GPIO_NUM_16

char pi_command[256];
char esp_command[256] = "PIR TRIGGERED\r\n";

//PIR Semaphore
static SemaphoreHandle_t xPIRSem; //maybe i should do the same for the lux sensor 

static SemaphoreHandle_t xStepMutex; //hand of access either to the bttn intrupt or stepper task
static const char *TAG = "example";

//PIR ISR
void IRAM_ATTR PIR_ISR(void *parameter){
    BaseType_t xHigherPrioTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR(xPIRSem, &xHigherPrioTaskWoken);
    if (xHigherPrioTaskWoken == pdTRUE){
        portYIELD_FROM_ISR();
    }
}



static void process_pi_command(char *command)
{
    trim_command(command);
    if (command[0] == '\0'){
        return;
    }

    printf("Recieved: %s\n", command);
    if (strcmp(command, "RIGHT") == 0 || strcmp(command, "ALLOW") == 0 || strcmp(command, "OPEN") == 0){ //if the raspberry pi says to open the right side
        vTaskDelay(pdMS_TO_TICKS(50));
        printf("Starting right dispense cycle\n");
        load_cell_enable_right(true);
    }

    if (strcmp(command, "LEFT") == 0){ //if the raspberry pi says to open the left side
        printf("Starting left dispense cycle\n");
        load_cell_enable_left(true);
    }

    if (strcmp(command, "DENY") == 0){
        printf("Vision denied access; keeping servos closed\n");
        load_cell_stop_all();
    }

    if (strcmp(command, "CLOSE_LEFT") == 0){
        printf("Closing left lid by vision presence check\n");
        load_cell_enable_left(false);
    }

    if (strcmp(command, "CLOSE_RIGHT") == 0){
        printf("Closing right lid by vision presence check\n");
        load_cell_enable_right(false);
    }
}

static void append_uart_bytes(char *line_buffer, size_t *line_len, const char *chunk, int chunk_len)
{
    for (int i = 0; i < chunk_len; i++){
        char current = chunk[i];

        if (current == '\r' || current == '\n'){
            if (*line_len > 0){
                line_buffer[*line_len] = '\0';
                process_pi_command(line_buffer);
                *line_len = 0;
            }
            continue;
        }

        if (*line_len < sizeof(pi_command) - 1){
            line_buffer[*line_len] = current;
            (*line_len)++;
            continue;
        }

        line_buffer[*line_len] = '\0';
        printf("UART command too long, dropping: %s\n", line_buffer);
        *line_len = 0;
    }
}

void UART_task(void *parameters){   
    uart_comm_init(); //initalize UART
    //printf("ESP32 ready\r\n");

      printf("PIR level = %d\n", gpio_get_level(PIR_PIN));
        fflush(stdout);

    TickType_t currentTime = xTaskGetTickCount();
    TickType_t previousTime = 0; //prev 2 are for intrrupt timing
    char rx_chunk[UART_RX_CHUNK_SIZE];
    size_t line_len = 0;

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

        int len = uart_comm_read_string(rx_chunk, sizeof(rx_chunk), 1000);
        if (len <= 0){
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }

        append_uart_bytes(pi_command, &line_len, rx_chunk, len);

                //the if statemments are seperate if statements instead of 
                //if else statement because both pets can have the food dispense at the same time 
                //if order to do this the if statements have to be different 
    }
}

//instead of making a seprate file for the pir sensor im going to implement it here in the main
//i feel like the main is a proper place for this task as the pir sensor is the of the system
//additionally it is implemented as an interrupt so there is no need to make a task for it

// void manual_servo_task(void *para){
//        TickType_t currentTime = xTaskGetTickCount();
//     TickType_t previousTime = 0; //prev 2 are for intrrupt timing
//     while (1)
//     {
//         if (xSemaphoreTake(xBTN1Sem,  portMAX_DELAY) == pdTRUE){
//             previousTime = currentTime;
//             currentTime = xTaskGetTickCount();
        
//            // printf("prev: %lu & curr: %lu \n", previousTime, currentTime);
//             if ((currentTime-previousTime) > 100){ //if the pir sensor interrupt went of time do uart stuff
//                 //vTaskDelay(pdMS_TO_TICKS(3000));
//                 printf("Reached at %lu\n", currentTime);
//             }
//         }
//     }
    
     
// }



void app_main(void)
{
    //step_init();
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

   

    xStepMutex = xSemaphoreCreateMutex();
    assert(xStepMutex); 

    //uart_comm_init(); //initalize UART
    //xTaskCreate(i2c_test_task, "i2c_test_task", 4096, NULL, 5, NULL);

     // xTaskCreatePinnedToCore(lux_data_task,"find light in darkness",8192,NULL, 3,NULL,0); //servo and stepper will be on the same core 

//        BaseType_t ok = xTaskCreatePinnedToCore(
//     lux_data_task,
//     "find light in darkness",
//     8192,
//     NULL,
//     3,
//     NULL,
//     1
// );


    //xTaskCreatePinnedToCore(ledstrip_task,"set brightness using light",4096,NULL, 1,NULL,0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(servoRotate_task,"rotate the servo back a forth", 4096,NULL, 4,NULL,0); //servo and stepper will be on the same core 
    //xTaskCreatePinnedToCore(stepper_spin_task, "rotate the steppper", 4096,NULL, 4,NULL,0); //servo and stepper will be on the same core 
   //xTaskCreatePinnedToCore(load_cell_task,"activate the load cell to read food weight, activate the stepper motors to dispense food",4096,NULL,4, NULL,1); //im putting this on core 1 because it has a task running inside of it 
   //xTaskCreatePinnedToCore(UART_task,"serial data task",4096,NULL,3,NULL,1);
    //xTaskCreatePinnedToCore(manual_stepper_task,"serial data task",4096,NULL,4,NULL,0);
   xTaskCreatePinnedToCore(manual_servo_task,"serial data task",4096,NULL,4,NULL,0);


    while(1){
        //printf("hey not starving\n");
        vTaskDelay(pdMS_TO_TICKS(500));
    }
//     if (ok == pdPASS) {
//     printf("read_TSL2591 task created\n");
//     fflush(stdout);
// } else {
//     printf("FAILED to create read_TSL2591 task\n");
//     fflush(stdout);
// }
        
}