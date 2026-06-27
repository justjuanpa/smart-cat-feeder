#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include <stdbool.h>
#include <string.h>
#include "sdkconfig.h"
#include "driver/ledc.h"
#include "jay_hx711.h"
#include "uart_comm.h"
#include "math.h"

#define PIR_GPIO GPIO_NUM_4
#define SERVO_GPIO GPIO_NUM_38
#define HX711_DOUT GPIO_NUM_4
#define HX711_SCK GPIO_NUM_5

static volatile bool awaiting_pi_decision = false;
static volatile bool motor_busy = false;
static TaskHandle_t servo_task_handle = NULL;

void servoGo_task(void *parameters);

static void trim_command(char *command)
{
    size_t len = strlen(command);
    while (len > 0) {
        char current = command[len - 1];
        if (current != '\r' && current != '\n' && current != ' ' && current != '\t') {
            break;
        }
        command[--len] = '\0';
    }
}

static void start_dispense_cycle(void)
{
    if (motor_busy || servo_task_handle != NULL) {
        //printf("Motor is already active\n");
        return;
    }

    if (xTaskCreate(&servoGo_task, "servoTASK", 2048, NULL, 2, &servo_task_handle) != pdPASS) {
        printf("Failed to start servo task\n");
        servo_task_handle = NULL;
    }
}

void servoGo_task(void *parameters)
{
    int duty = 1150;
    int step = 14;
    int total_cycles = 117;
    int iteration_time = 10; // milliseconds

    motor_busy = true;

    ledc_timer_config_t timer_conf = {
        .duty_resolution = LEDC_TIMER_14_BIT,
        .freq_hz = 50,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_0,
        .clk_cfg = LEDC_AUTO_CLK
    };

    ESP_ERROR_CHECK(ledc_timer_config(&timer_conf));

    ledc_channel_config_t ledc_conf = {
        .channel = LEDC_CHANNEL_0,
        .duty = duty,
        .gpio_num = SERVO_GPIO,
        .intr_type = LEDC_INTR_DISABLE,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_sel = LEDC_TIMER_0,
        .hpoint = 0
    };

    ESP_ERROR_CHECK(ledc_channel_config(&ledc_conf));

    for (int i = 0; i < total_cycles; i++) {
        duty += step;

        ESP_ERROR_CHECK(ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty));
        ESP_ERROR_CHECK(ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0));

        vTaskDelay(pdMS_TO_TICKS(iteration_time));
    }

    // Hold final servo position
    ESP_ERROR_CHECK(ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 1638));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0));

    vTaskDelay(pdMS_TO_TICKS(200));

    motor_busy = false;
    awaiting_pi_decision = false;

    servo_task_handle = NULL;

    // Important: FreeRTOS tasks should not return
    vTaskDelete(NULL);
}

void pirGo_task (void *parameters) {
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << PIR_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&io_conf); 
    int last_state = gpio_get_level(PIR_GPIO);

    while (1) {
        int current_state = gpio_get_level(PIR_GPIO);

        if (current_state == 1 && last_state == 0 && !awaiting_pi_decision && !motor_busy) {
            printf("Trigger detected, notifying vision pipeline\n");
            uart_comm_send_string("TRIGGER\r\n");
            awaiting_pi_decision = true;
        }

        last_state = current_state;
        vTaskDelay(pdMS_TO_TICKS(200));
    }
}



void clockGo_task (void *parameters){
    ledc_timer_config_t timer_conf = {
        .duty_resolution = LEDC_TIMER_1_BIT,
        .freq_hz = 500, 
        .speed_mode = LEDC_SPEED_MODE_MAX,
        .timer_num = LEDC_TIMER_0,
        .clk_cfg = LEDC_AUTO_CLK
    };

    ledc_timer_config(&timer_conf);

    ledc_channel_config_t ledc_conf = {
        .channel = LEDC_CHANNEL_0,
        .duty = 1, 
        .gpio_num = 2,
        .intr_type = LEDC_INTR_DISABLE,
        .speed_mode = LEDC_SPEED_MODE_MAX,
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
    //int32_t offset = 124933;     
    //float scale = 400; //not the weight in grams     
    int32_t offset = -402931;///;
    float scale = 428;
    
    hx711_t assign = {
        .dout = HX711_DOUT,
        .pd_sck = HX711_SCK,
        .gain = HX711_GAIN_A_128
    };

    hx711_init(&assign);
    printf("HX711 task started. DOUT=%d SCK=%d\n", HX711_DOUT, HX711_SCK);

    while (1)
    {
        hx711_is_ready(&assign, &ready);

        if (ready) {
            hx711_read_average(&assign, samples, &raw);

            float grams = (raw - offset) / scale;
            int rounded_grams = (int)(grams + 0.5f);


            printf("Raw = %ld, Weight = %.2f g\n", (long)raw, grams);
            printf("Raw = %ld, Weight = %d g\n", (long)raw, rounded_grams);
        
        } else {
            printf("HX711 not ready\n");
        }

        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

void stepperGo(void *parameters){
    gpio_set_direction(GPIO_NUM_42,GPIO_MODE_OUTPUT);
    gpio_set_direction(GPIO_NUM_41,GPIO_MODE_OUTPUT);
    gpio_set_direction(GPIO_NUM_40,GPIO_MODE_OUTPUT);
    gpio_set_direction(GPIO_NUM_39,GPIO_MODE_OUTPUT);

    while(1) {
        gpio_set_level(GPIO_NUM_42,1);
        gpio_set_level(GPIO_NUM_41, 0);
        gpio_set_level(GPIO_NUM_40,0);
        gpio_set_level(GPIO_NUM_39, 0);
        vTaskDelay(pdMS_TO_TICKS(10));


        gpio_set_level(GPIO_NUM_42,0);
        gpio_set_level(GPIO_NUM_41, 1);
        gpio_set_level(GPIO_NUM_40,0);
        gpio_set_level(GPIO_NUM_39, 0);
        vTaskDelay(pdMS_TO_TICKS(10));


        gpio_set_level(GPIO_NUM_42,0);
        gpio_set_level(GPIO_NUM_41, 0);
        gpio_set_level(GPIO_NUM_40,1);
        gpio_set_level(GPIO_NUM_39, 0);
        vTaskDelay(pdMS_TO_TICKS(10));

        gpio_set_level(GPIO_NUM_42,0);
        gpio_set_level(GPIO_NUM_41, 0);
        gpio_set_level(GPIO_NUM_40,0);
        gpio_set_level(GPIO_NUM_39, 1);
        vTaskDelay(pdMS_TO_TICKS(10));

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
    char command[128];

    //xTaskCreate(&clockGo_task, "CLK", 2048, NULL, 5, NULL );
    //xTaskCreatePinnedToCore(&weightGo, "load cell task", 2048, NULL, 5, NULL, 0); 
    //xTaskCreate(&weightGo, "weights", 2048, NULL, 5, NULL);
    //xTaskCreatePinnedToCore(&servoGo_task, "servoTASK", 2048, NULL, 2, NULL, 1);
    xTaskCreatePinnedToCore(&stepperGo, "stepper motor task", 2048, NULL, 5, NULL, 1);
    //printf("yo");
    // while (1) {
    //         start_dispense_cycle();
    // }


    // if (uart_comm_init() != ESP_OK) {
    //     printf("UART init failed\n");
    //     return;
    // }

    // uart_comm_send_string("ESP32 ready\r\n");
    // xTaskCreate(&pirGo_task, "PIR_TASK", 2048, NULL, 5, NULL);

    // while (1) {
    //     int len = uart_comm_read_string(command, sizeof(command) - 1, 1000);
    //     if (len <= 0) {
    //         vTaskDelay(pdMS_TO_TICKS(50));
    //         continue;
    //     }

    //     trim_command(command);
    //     if (command[0] == '\0') {
    //         continue;
    //     }

    //     printf("Received: %s\n", command);

    //     if (strncmp(command, "ALLOW", 5) == 0 || strcmp(command, "open") == 0) {
    //         awaiting_pi_decision = false;
    //         start_dispense_cycle();
    //     } else if (strcmp(command, "DENY") == 0 || strcmp(command, "close") == 0) {
    //         printf("Vision pipeline denied dispense request\n");
    //         awaiting_pi_decision = false;
    //     }
    // }
}
