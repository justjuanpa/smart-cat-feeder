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
#include "lux_to_led.h"
#include "jay_hx711.h"
#include "uart_comm.h"
#include <string.h>


#define PIR_PIN GPIO_NUM_4
#define UART_RX_CHUNK_SIZE 64
#define PIR_TRIGGER_INTERVAL_MS 3000
#define TELEMETRY_INTERVAL_MS 2500
#define UART_READ_TIMEOUT_MS 20
char pi_command[256];
char esp_command[256] = "PIR TRIGGERED\r\n";

//PIR Semaphore
static SemaphoreHandle_t xPIRSem; //maybe i should do the same for the lux sensor 
static const char *TAG = "example";

volatile bool PirLedKey; 

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
        printf("Vision denied access; not starting a dispense cycle\n");
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

    TickType_t last_pir_sent_time = 0;
    TickType_t last_telemetry_sent_time = 0;
    char rx_chunk[UART_RX_CHUNK_SIZE];
    size_t line_len = 0;
    int left_grams;
    int right_grams; 
    char leftGramCommand[256];
    char rightGramCommand[256];
    bool rightCoverstats;
    bool leftCoverstats;
    char leftCoverCommand[256];
    char rightCoverCommand[256];
    int ledStripVal;
    char ledStripCommand[256];  

    while(1) {
        TickType_t now = xTaskGetTickCount();

        if (xSemaphoreTake(xPIRSem, 0) == pdTRUE){
            if (last_pir_sent_time == 0 ||
                (now - last_pir_sent_time) > pdMS_TO_TICKS(PIR_TRIGGER_INTERVAL_MS)){
                printf("Reached\n");
                PirLedKey = true; //good to turn led on 
                PirLedDoor(PirLedKey);
                uart_comm_send_string(esp_command); //send the pir trigger command from esp to pi 
                printf("Sent %s:", esp_command);
                last_pir_sent_time = now;
            } else {
                PirLedKey = false; //good to turn led off  
                PirLedDoor(PirLedKey);
            }
        }

        if (last_telemetry_sent_time == 0 ||
            (now - last_telemetry_sent_time) >= pdMS_TO_TICKS(TELEMETRY_INTERVAL_MS)){
            left_grams = leftGramData();
            right_grams = rightGramData();
        
            rightCoverstats = rightServoStatus();
            leftCoverstats = leftServoStatus();

            ledStripVal = ledStats();

            snprintf(ledStripCommand, sizeof(ledStripCommand), "Ledstrip: Active, Currently at %d brightness\r\n", ledStripVal);
            uart_comm_send_string(ledStripCommand);

            if (leftCoverstats) {
                snprintf(leftCoverCommand, sizeof(leftCoverCommand), "Left Access Lid: open\r\n");
                uart_comm_send_string(leftCoverCommand);

            } else {
                snprintf(leftCoverCommand, sizeof(leftCoverCommand), "Left Access Lid: closed\r\n");
                uart_comm_send_string(leftCoverCommand);
            }

            if (rightCoverstats) {
                snprintf(rightCoverCommand, sizeof(rightCoverCommand), "Right Access Lid: open\r\n");
                uart_comm_send_string(rightCoverCommand);
            } else {
                snprintf(rightCoverCommand, sizeof(rightCoverCommand), "Right Access Lid: closed\r\n");
                uart_comm_send_string(rightCoverCommand);
            }

            snprintf(leftGramCommand, sizeof(leftGramCommand), "Left Bowl Grams: %d\r\n", left_grams);
            snprintf(rightGramCommand, sizeof(rightGramCommand), "Right Bowl Grams: %d\r\n", right_grams);

            uart_comm_send_string(leftGramCommand);
            uart_comm_send_string(rightGramCommand);

            last_telemetry_sent_time = now;
        }

        int len = uart_comm_read_string(rx_chunk, sizeof(rx_chunk), UART_READ_TIMEOUT_MS);
        if (len > 0){
            append_uart_bytes(pi_command, &line_len, rx_chunk, len);
        }

        vTaskDelay(pdMS_TO_TICKS(5));

                //the if statemments are seperate if statements instead of 
                //if else statement because both pets can have the food dispense at the same time 
                //if order to do this the if statements have to be different 
    }
      esp_err_t err = uart_comm_init();

    if (err != ESP_OK) {
        return;   // wrong for a FreeRTOS task
    }

}



//instead of making a seprate file for the pir sensor im going to implement it here in the main
//i feel like the main is a proper place for this task as the pir sensor is the of the system
//additionally it is implemented as an interrupt so there is no need to make a task for it
void app_main(void)
{
    //vTaskDelay(pdTICKS_TO_MS(1000));
    //uart_comm_send_string("HELP");
//step_init(); 
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

   // uart_comm_init(); //initalize UART
               //moveLEFTservo(0, 90);


    //xTaskCreatePinnedToCore(ledstrip_task,"set brightness using light",4096,NULL, 2,NULL,0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(LUX_to_LED_task,"set brightness using light",4096,NULL, 2,NULL,0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(lux_data_task,"find light in darkness",4096,NULL, 2   ,NULL,    0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(servoRotate_task,"rotate the servo back a forth", 4096,NULL, 4,NULL,0); //servo and stepper will be on the same core 
    // //xTaskCreatePinnedToCore(stepper_spin_task, "rotate the steppper", 4096,NULL, 4,NULL,0); //servo and stepper will be on the same core 
    xTaskCreatePinnedToCore(load_cell_task,"activate the load cell to read food weight, activate the stepper motors to dispense food",4096,NULL,4, NULL,1); //im putting this on core 1 because it has a task running inside of it 
    xTaskCreatePinnedToCore(UART_task,"serial data task",4096,NULL,3,NULL,1);
    xTaskCreatePinnedToCore(manual_right_stepper_task, "manual right stepper control", 2048, NULL,5,NULL,1);
    xTaskCreatePinnedToCore(manual_left_stepper_task, "manual left stepper control", 2048, NULL,5,NULL,1);
    xTaskCreatePinnedToCore(manual_right_servo_task, "manual right servo control", 2048, NULL,5,NULL,1);
    xTaskCreatePinnedToCore(manual_left_servo_task, "manual left servo control", 2048, NULL,5,NULL,1);
    xTaskCreatePinnedToCore(detection_led_task, "led detection task", 2048, NULL, 4, NULL, 0);

    int match_val = 0;
    while(1){
        
        if (match_val == 3){
            match_val = 0;
        } else {
            match_val++;
        }

        match_val_receive(match_val);
        vTaskDelay(pdMS_TO_TICKS(5000));//wait 10 secs

    }
        
}
