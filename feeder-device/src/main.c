#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include <stdbool.h>
#include <string.h>
#include "sdkconfig.h"
#include "jay_hx711.h"
#include "uart_comm.h"
#include "driver/ledc.h"



#define HX711_DOUT GPIO_NUM_7
#define HX711_SCK  GPIO_NUM_18
uint8_t movement = 0;

void servoGo_task(void *parameters) {
    int duty = 1638;
    int step = 14; 
    int total_cycles = 117;
    bool pos_direction = true;
    int iteration_time = 10; //millseconds

    ledc_timer_config_t timer_conf = {
        .duty_resolution = LEDC_TIMER_15_BIT,
        .freq_hz = 50,
        .speed_mode = LEDC_HIGH_SPEED_MODE,
        .timer_num = LEDC_TIMER_0,
        .clk_cfg = LEDC_AUTO_CLK
    };

    ledc_timer_config(&timer_conf); //apply timer config

    ledc_channel_config_t ledc_conf = {
        .channel = LEDC_CHANNEL_0,
        .duty = duty,
        .gpio_num = 18, 
        .intr_type = LEDC_INTR_DISABLE,
        .speed_mode = LEDC_HIGH_SPEED_MODE,
        .timer_sel = LEDC_TIMER_0,
    };

    ledc_channel_config(&ledc_conf);

    int i;
    while (1) {
        for (i = 0; i < total_cycles; i++){
           pos_direction ? (duty += step) : (duty -= step); 

           ledc_set_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_0, duty);
           ledc_update_duty(LEDC_HIGH_SPEED_MODE, LEDC_CHANNEL_0);
           vTaskDelay(iteration_time/ portTICK_PERIOD_MS);
        }

        pos_direction = !pos_direction;
    }
           vTaskDelay(pdMS_TO_TICKS(50));

}

void pirGo_task (void *parameters) {
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << 4),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&io_conf); 
    int last_state = 0;
    while (1) {
        int current_state = gpio_get_level(4);
        if (current_state != last_state) { //just need to see if this value is high 
            printf("detection activate uart\n");
            movement = 1;
            uart_comm_send_string("write open\r\n");
            last_state = current_state; 
        }
       vTaskDelay(pdMS_TO_TICKS(2500));
    }
}



void clockGo_task (void *parameters){
    ledc_timer_config_t timer_conf = {
        .duty_resolution = LEDC_TIMER_1_BIT,
        .freq_hz = 500, 
        .speed_mode = LEDC_HIGH_SPEED_MODE,
        .timer_num = LEDC_TIMER_0,
        .clk_cfg = LEDC_AUTO_CLK
    };

    ledc_timer_config(&timer_conf);

    ledc_channel_config_t ledc_conf = {
        .channel = LEDC_CHANNEL_0,
        .duty = 1, 
        .gpio_num = 18,
        .intr_type = LEDC_INTR_DISABLE,
        .speed_mode = LEDC_HIGH_SPEED_MODE,
        .timer_sel = LEDC_TIMER_0,
    };

    ledc_channel_config(&ledc_conf);

    while(1){
        
        printf("clock period");
        //vTaskDelay(portMAX_DELAY);
    }
}


void weightGo(void *parameters)
{
    bool ready = false;
    int32_t raw = 0;
    uint32_t samples = 15;

    // Replace these after calibration
    int32_t offset = 392966;     
    float scale = 52.58;         

    hx711_t assign = {
        .dout = 19,
        .pd_sck = 18,
        .gain = HX711_GAIN_A_128
    };

    hx711_init(&assign);
    printf("HX711 task started. DOUT=%d SCK=%d\n", 19, 18);

    while (1)
    {
        hx711_is_ready(&assign, &ready);

        if (ready) {
            hx711_read_average(&assign, samples, &raw);

            float grams = (offset - raw) / scale;

            printf("Raw = %ld, Weight = %.2f g\n", (long)raw, grams);
        } else {
            printf("HX711 not ready\n");
        }

        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

//make this a function
static void uartGo(void *parameters)
{
    uint8_t rx_buff[128];
    uart_comm_send_string("UART task started\r\n");

    while (1) {
        int len = uart_comm_read_bytes(rx_buff, sizeof(rx_buff) - 1, 100);

        if (len > 0){
            rx_buff[len] = '\0';
            printf("Received: %s\n", (char*)rx_buff);

            //Echo back what was recevied 
            uart_comm_send_string("ESP32 got: ");
            uart_comm_send_bytes(rx_buff, len);
            uart_comm_send_string("\r\n");
        }

        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

//make this a function 
static void uart_txGo(void *parameters)
{
    while (1){
        uart_comm_send_string("Periodic hello from ESP32\r\n");
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
    
}

void app_main(void) {
    //xTaskCreate(&servoGo_task, "servoTASK", 2048, NULL, 5, NULL);
    //xTaskCreate(&clockGo_task, "CLK", 2048, NULL, 5, NULL );
    //xTaskCreate(&loadCellGo, "load cell task", 2048, NULL, 5, NULL); 
    //xTaskCreate(&weightGo, "weights", 2048, NULL, 5, NULL);
    xTaskCreate(&pirGo_task, "PIR_TASK", 2048, NULL, 5, NULL);


        uint8_t rx_buff[128];
        char command[128];
        if (uart_comm_init() != ESP_OK) {
           printf("UART init failed\n");
           return;
        }else {
                       uart_comm_send_string("ESP32 ready\r\n");

        }

    

    while (1){

        // if (movement == 1){
        //printf("movement %d", movement);
    
        int len = uart_comm_read_string((char*)rx_buff, sizeof(rx_buff)- 1, 5000);
        strncpy(command, (char*)rx_buff, sizeof(command) - 1);
        command[sizeof(command)-1] = '\0';
        printf("Received: %s\n", command);

            
        char open[] = "open";
        char close[] = "close";
        int Opencmp = strcmp (command, open);
        if (Opencmp == 0){
            xTaskCreate(&servoGo_task, "servoTASK", 2048, NULL, 2, NULL);
        }
        int Closecmp = strcmp(command, close);
        if (Closecmp == 0){
            //stop the task
        }
        uart_comm_send_string("You typed: ");
        uart_comm_send_bytes(rx_buff, len);
        uart_comm_send_string("\r\n");
        vTaskDelay(pdMS_TO_TICKS(500));
        movement = 0;

    //}
}

}