#include <stdio.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "sdkconfig.h"
#include "esp_ws28xx.h"
#include "lux_to_led.h"
#include "math.h"
#include <stdbool.h>
#include <uart_comm.h>
#include <string.h>

#define I2C_MASTER_TIMEOUT_MS 1000
#define SDA_PIN GPIO_NUM_1
#define SCL_PIN GPIO_NUM_2
#define LED_PIN GPIO_NUM_21
#define LED_NUM 35
#define LED_NUM_W_END 31
#define LED_NUM_W_STR 4
#define TSL2591_ADDR     0x29

// TSL2591 command byte parts
#define TSL2591_COMMAND  0xA0   // CMD bit = 1, normal transaction = 01

// Registers
#define TSL2591_ENABLE   0x00
#define TSL2591_CONFIG   0x01
#define TSL2591_ID       0x12
#define TSL2591_STATUS   0x13
#define TSL2591_C0DATAL  0x14

// ENABLE bits
#define TSL2591_ENABLE_PON  0x01
#define TSL2591_ENABLE_AEN  0x02

// CONFIG options
#define TSL2591_GAIN_LOW    0x00  // 1x
#define TSL2591_GAIN_MED    0x10  // 25x
#define TSL2591_GAIN_HIGH   0x20  // 428x
#define TSL2591_GAIN_MAX    0x30  // 9876x

#define TSL2591_ATIME_100MS 0x00
#define TSL2591_ATIME_200MS 0x01
#define TSL2591_ATIME_300MS 0x02
#define TSL2591_ATIME_400MS 0x03
#define TSL2591_ATIME_500MS 0x04
#define TSL2591_ATIME_600MS 0x05

float lux = 0;

static const char *TAG = "TSL2591";
TaskHandle_t TSL2591ReadHandle = NULL;

CRGB* ws2812_buffer;
int match = 0;
//match codes 
//0 = off/idle can lowkey make them with in idle 
//1 = match turn led green
//2 = not a match turn led red 
//then it should turn back to white to idle 
int led_val = 0;
//if led_val 0 lux is high
//led_val 25 
//led_val 50
//led_val 75 
//if led_val 100 lux is low

volatile bool pir_on_off;
char pi_command_r[256];
char pi_command_l[256];
char pi_command_deny[256];
bool left_manual_mode = false;
bool right_manual_mode = false; 
char right_spin_mode[256];
char left_spin_mode[256]; 
static TickType_t last_command_r_time = 0;
static TickType_t last_command_l_time = 0;
static TickType_t last_command_deny_time = 0;


//Function to intialize I2C bus 
static void i2c_master_init_bus(i2c_master_bus_handle_t *bus_handle){
    i2c_master_bus_config_t bus_config = {
        .i2c_port = I2C_NUM_0,
        .sda_io_num = SDA_PIN,
        .scl_io_num = SCL_PIN,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_config, bus_handle));
}

//Function for initializing I2C handle
static void i2c_master_init_handle(i2c_master_bus_handle_t *bus_handle, i2c_master_dev_handle_t *dev_handle, uint8_t address){
    i2c_device_config_t dev_config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = address,
        .scl_speed_hz = 400000,
    };
    ESP_ERROR_CHECK(i2c_master_bus_add_device(*bus_handle, &dev_config, dev_handle));
}

static esp_err_t read_bytes_i2c(
    i2c_master_dev_handle_t dev_handle,
    uint8_t reg_addr,
    uint8_t *data,
    size_t len
)
{
    uint8_t reg = TSL2591_COMMAND | reg_addr;

    return i2c_master_transmit_receive(
        dev_handle,
        &reg,
        1,
        data,
        len,
        I2C_MASTER_TIMEOUT_MS
    );
}

static esp_err_t write_byte_i2c(
    i2c_master_dev_handle_t dev_handle,
    uint8_t reg_addr,
    uint8_t data
)
{
    uint8_t write_buf[2] = {
        TSL2591_COMMAND | reg_addr,
        data
    };

    return i2c_master_transmit(
        dev_handle,
        write_buf,
        sizeof(write_buf),
        I2C_MASTER_TIMEOUT_MS
    );
}

void check_address_task(void *arg){
    i2c_master_bus_handle_t bus_handle = (i2c_master_bus_handle_t) arg;
    while (1) {
        esp_err_t err;
        //using i2c_master_probe on a for loop going through all avaible address
        for (uint8_t i = 3; i < 0x78; i++){
            err = i2c_master_probe(bus_handle, i, I2C_MASTER_TIMEOUT_MS);
            if (err == ESP_OK){
                printf("I2C Scanner found I2C device @: 0x%X \n", i);
            }
            printf("I2C Scanner complete\n");
        vTaskDelay(1000 / portTICK_PERIOD_MS);
        }
        vTaskDelete(NULL);
    }
}

//Read bytes from I2C device but you need to specify the register address to read from and len or how many 
//bytes you will read


static float calculate_lux(uint16_t ch0, uint16_t ch1, float atime_ms, float again){
    if (ch0 == 0){
        return 0.0f;
    }

    float cp1 = (atime_ms * again) / 408.0f;

    float lux1 = ((float)ch0 - (1.64f*(float)ch1))/cp1;
    float lux2 = ((0.59f*(float)ch0)- (0.86f*(float)ch1))/cp1;

    float lux = lux1 > lux2 ? lux1 : lux2;

    if (lux < 0){
        lux = 0;
    }
    
    return lux;
}

void match_val_receive(int val){
    match = val; 
}

void led_receive_command_r (char *command){
    strcpy(pi_command_r,command);
    last_command_r_time = xTaskGetTickCount();
}

void led_receive_command_l (char *command){
    strcpy(pi_command_l,command);
    last_command_l_time = xTaskGetTickCount();
} 

void led_receive_command_deny (char *command){
    strcpy(pi_command_deny, command);
    last_command_deny_time = xTaskGetTickCount();
}

void led_receieve_manual_right (bool led){
    right_manual_mode = led; 
}

void led_receieve_manual_left (bool led){
    left_manual_mode = led;
}

void led_spinLcommand(char *command){
    strcpy(left_spin_mode, command);
}

void led_spinRcommand(char *command){
    strcpy(right_spin_mode, command);
}

void detection_led_task(void *para)
{
    ESP_ERROR_CHECK_WITHOUT_ABORT(
        ws28xx_init(LED_PIN, WS2812B, LED_NUM, &ws2812_buffer)
    );


    bool command_active_r = false;
    bool command_active_l = false; 
    while (1) {

        // Reset at the start of every loop iteration.
        command_active_l = false;
        command_active_r = false;
    TickType_t currTime = xTaskGetTickCount();


        /*
         * RIGHT command:
         * Blink the right-side detection LEDs green.
         */
        if (!right_manual_mode || (((strcmp(right_spin_mode, "S")) == 0))){
                if (strcmp(pi_command_r, "RIGHT") == 0) {
                if ((currTime - last_command_r_time) < pdMS_TO_TICKS(5000)){
                    command_active_r = true;
                    for (int i = 0; i < LED_NUM_W_STR; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 0,
                            .g = 50,
                            .b = 0
                        };
                    }
                    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                    vTaskDelay(pdMS_TO_TICKS(500));
                    for (int i = 0; i < LED_NUM_W_STR; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 0,
                            .g = 0,
                            .b = 0
                        };
                    }
                    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                    vTaskDelay(pdMS_TO_TICKS(500));
                } else {
                    command_active_r = false;
                }
            }

            /*
            * CLOSE_RIGHT command:
            * Blink the right-side detection LEDs red.
            */
            else if (strcmp(pi_command_r, "CLOSE_RIGHT") == 0) {
                if  ((currTime - last_command_r_time) < pdMS_TO_TICKS(3000)){
                    command_active_r = true;
                    for (int i = 0; i < LED_NUM_W_STR; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 50,
                            .g = 0,
                            .b = 0
                        };
                    }

                    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                    vTaskDelay(pdMS_TO_TICKS(500));

                    for (int i = 0; i < LED_NUM_W_STR; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 0,
                            .g = 0,
                            .b = 0
                        };
                    }

                    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                    vTaskDelay(pdMS_TO_TICKS(500));
                } else {
                    command_active_r = false;
                }
            }
        }

        /*
         * LEFT command:
         * Blink the left-side detection LEDs green.
         */
        if (!left_manual_mode){
                if (strcmp(pi_command_l, "LEFT") == 0) {
                if  ((currTime - last_command_l_time) < pdMS_TO_TICKS(5000)){
                    command_active_l = true;
                    for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 0,
                            .g = 50,
                            .b = 0
                        };
                    }

                    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                    vTaskDelay(pdMS_TO_TICKS(500));

                    for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 0,
                            .g = 0,
                            .b = 0
                        };
                    }

                    // pi_command_l[0] = '\0';
                    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                    vTaskDelay(pdMS_TO_TICKS(500));
                } else {
                    command_active_l = false;
                }
            }

            /*
            * CLOSE_LEFT command:
            * Blink the left-side detection LEDs red.
            */
            else if (strcmp(pi_command_l, "CLOSE_LEFT") == 0) {
                if  ((currTime - last_command_l_time) < pdMS_TO_TICKS(3000)){
                    command_active_l = true;
                    for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 50,
                            .g = 0,
                            .b = 0
                        };
                    }

                    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                    vTaskDelay(pdMS_TO_TICKS(500));

                    for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 0,
                            .g = 0,
                            .b = 0
                        };
                    }

                    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                    vTaskDelay(pdMS_TO_TICKS(500));
                } else {
                    command_active_l = false;
                }
            }
        }

        /*
         * DENY command:
         * Blink both detection LED sections red.
         */
        if (!left_manual_mode || !right_manual_mode){
             if ((strcmp(pi_command_deny, "DENY") == 0)) {
            if  ((currTime - last_command_deny_time) < pdMS_TO_TICKS(3000)){
                command_active_l = true;
                command_active_r = true;
                for (int i = 0; i < LED_NUM_W_STR; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 50,
                        .g = 0,
                        .b = 0
                    };
                }

                for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 50,
                        .g = 0,
                        .b = 0
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                vTaskDelay(pdMS_TO_TICKS(500));

                for (int i = 0; i < LED_NUM_W_STR; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 0,
                        .g = 0,
                        .b = 0
                    };
                }

                for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 0,
                        .g = 0,
                        .b = 0
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                vTaskDelay(pdMS_TO_TICKS(500));
            }
            else {
                command_active_l = false;
                command_active_r = false; 
            }
        }
        }

        /*
         * Idle mode:
         * This runs only when none of the commands above matched.
         */
        if (!command_active_r ) {
             if (!right_manual_mode || ((strcmp(right_spin_mode, "S")) == 0)){
                    if (lux >= 120){
                    for (int i = 0; i < LED_NUM_W_STR; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 0,
                            .g = 0,
                            .b = 0
                        };
                    }

                    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
            else if (lux <= 120 && lux >= 85){
            for (int i = 0; i < LED_NUM_W_STR; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 25,
                        .g = 24,
                        .b = 21
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
            else if (lux <= 85 && lux >= 60){
                for (int i = 0; i < LED_NUM_W_STR; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 50,
                        .g = 48,
                        .b = 40
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
            else if (lux <= 60 && lux >= 35){
                for (int i = 0; i < LED_NUM_W_STR; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 75,
                        .g = 72,
                        .b = 60
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
            else if (lux <= 35 && lux >= 0){
            for (int i = 0; i < LED_NUM_W_STR; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 100,
                        .g = 96,
                        .b = 80
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
             } 
             else if (strcmp(right_spin_mode, "F") == 0){
                    for (int i = 0; i < LED_NUM_W_STR; i++) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 100,
                            .g = 35,
                            .b = 0
                        };
                        ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                        vTaskDelay(pdMS_TO_TICKS(100));

                    }
            }             
            else if (strcmp(right_spin_mode, "R") == 0){
                    for (int i = LED_NUM_W_STR; i > 0; i--) {
                        ws2812_buffer[i] = (CRGB){
                            .r = 100,
                            .g = 35,
                            .b = 0
                        };
                       ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
                        vTaskDelay(pdMS_TO_TICKS(100));
                    }
            }
            
             else { //in manual mode

                //idle 
                for (int i = 0; i < LED_NUM_W_STR; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 100,
                        .g = 35,
                        .b = 0
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());

             }
            
        }

        if (!command_active_l){
           if (!left_manual_mode){
             if (lux >= 120){
                for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 0,
                        .g = 0,
                        .b = 0
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
            else if (lux <= 120 && lux >= 85){
            for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 25,
                        .g = 24,
                        .b = 20
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
            else if (lux <= 85 && lux >= 60){
                for (int i = LED_NUM_W_END; i < LED_NUM; i++){
                    ws2812_buffer[i] = (CRGB){
                        .r = 50,
                        .g = 48,
                        .b = 40
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
            else if (lux <= 60 && lux >= 35){
                for (int i = LED_NUM_W_END; i < LED_NUM; i++){
                    ws2812_buffer[i] = (CRGB){
                        .r = 75,
                        .g = 72,
                        .b = 60
                    };
                }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
            else if (lux <= 35 && lux >= 0){
            for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 100,
                        .g = 96,
                        .b = 80
                    };
            }

                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
            }
           } else {
             for (int i = LED_NUM_W_END; i < LED_NUM; i++) {
                    ws2812_buffer[i] = (CRGB){
                        .r = 100,
                        .g = 35,
                        .b = 0
                    };
              }
                ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
           }
        }

        // Prevent the task from running continuously with no pause.
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}


void lux_data_task(void *arg){
    i2c_master_bus_handle_t bus_handle;
    i2c_master_dev_handle_t dev_handle;

    i2c_master_init_bus(&bus_handle);
    i2c_master_init_handle(&bus_handle, &dev_handle, TSL2591_ADDR);

    //Check device ID
    uint8_t id = 0;
    esp_err_t err = read_bytes_i2c(dev_handle, TSL2591_ID, &id, 1);

    if (err != ESP_OK){
        ESP_LOGE(TAG, "Failed to read TSL2591 ID");
        vTaskDelete(NULL);
    }

    //ESP_LOGI(TAG, "TSL2591 ID: 0x%02X", id);

    if (id != 0x50){
        ESP_LOGW(TAG, "Unexpected ID. Check wiring");
    }

    //Enable oscillator + ALS
    ESP_ERROR_CHECK(write_byte_i2c(dev_handle, TSL2591_ENABLE, TSL2591_ENABLE_PON|TSL2591_ENABLE_AEN));


    //Use medium gain and 100 ns integration to start 

    uint8_t config = TSL2591_GAIN_MED | TSL2591_ATIME_100MS;
    ESP_ERROR_CHECK(write_byte_i2c(dev_handle, TSL2591_CONFIG, config));

    float atime_ms = 100.0f;
    float again = 25.0f; 

    //Wait for first inegration cycle to complete 
    vTaskDelay(pdMS_TO_TICKS(120));

    while(1){
        uint8_t data[4] = {0};

        err = read_bytes_i2c(dev_handle, TSL2591_C0DATAL, data, 4);

        if (err != ESP_OK) {
            //ESP_LOGE(TAG, "Failed to read ALS data");
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        //Datasheet register order:
        //0x14 = C0DATAL, 0x15 = C0DATAH
        //0x16 = C1DATAL, 0x17 = C1DATAH

        uint16_t ch0 = ((uint16_t)data[1] << 8) | data[0];
        uint16_t ch1 = ((uint16_t)data[3] << 8) | data[2];

        lux = calculate_lux(ch0, ch1, atime_ms, again);

    printf("CH0: %u, CH1: %u, Lux: %.2f\n", ch0, ch1, lux);
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void PirLedDoor(bool val){
    pir_on_off = val; 
}
void LUX_to_LED_task(void *para){ //brightness next lux
    ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_init(LED_PIN, WS2812B, LED_NUM, &ws2812_buffer));

    while (1) {
       //if (pir_on_off){ //true on 
         if (lux >= 120){
            for (int i = LED_NUM_W_STR; i < LED_NUM_W_END; i++){
                ws2812_buffer[i] = (CRGB) {.r=0, .g=0, .b=0};
            }
            led_val = 0; //the room is well lit
            ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
         }
        else if (lux <= 120 && lux >= 85){
            for (int i = LED_NUM_W_STR; i < LED_NUM_W_END; i++){
                ws2812_buffer[i] = (CRGB) {.r=25, .g=24, .b=20};
            }
            led_val = 25;
            ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
        }
        else if (lux <= 85 && lux >= 60){
            for (int i = LED_NUM_W_STR; i < LED_NUM_W_END; i++){
                ws2812_buffer[i] = (CRGB) {.r=50, .g=48, .b=40};
            }
            led_val = 50;
            ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
        }
        else if (lux <= 60 && lux >= 35){
            for (int i = LED_NUM_W_STR; i < LED_NUM_W_END; i++){
                ws2812_buffer[i] = (CRGB) {.r=75, .g=72, .b=60};
            }
            led_val = 75;
            ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update()); 
        }
        else if (lux <= 35 && lux >= 0){
            for (int i = LED_NUM_W_STR; i < LED_NUM_W_END; i++){
                ws2812_buffer[i] = (CRGB) {.r=100, .g=96, .b=80};
            }
            led_val = 100;
            ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
        }
       //}
        // else {
        //     for (int i = LED_NUM_W_STR; i < LED_NUM_W_END; i++) {
        //         ws2812_buffer[i] = (CRGB){.r = 0, .g = 0, .b = 0};
        //     }

        //     led_val = 0;
        //     ESP_ERROR_CHECK_WITHOUT_ABORT(ws28xx_update());
        // }
        vTaskDelay(pdMS_TO_TICKS(100));

    } 
   
    
}

int ledStats(void){
    return led_val;
}
