#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "servo.h"
#include "esp_err.h"
#include "jay_hx711.h"

#define right_SERVO GPIO_NUM_18
#define LeftServoPin GPIO_NUM_17

// Calibrated LEDC duty-count limits for your lid mechanism.
// These are duty counts, not microseconds.
#define SERVO_0_DEG_DUTY   1150
#define SERVO_90_DEG_DUTY  1900

#define SERVO_MIN_ANGLE    0
#define SERVO_MAX_ANGLE    90

// Increasing this value slows the lid down.
// Start with 20 ms because the servo PWM period is also 20 ms.
#define SERVO_STEP_DELAY_MS 30


bool open_close_val_left = false; //if false the servo should stay close 
//if true the servo should stay open 

static uint32_t angle_to_duty(uint16_t angle)
{
    if (angle > SERVO_MAX_ANGLE) {
        angle = SERVO_MAX_ANGLE;
    }

    return SERVO_0_DEG_DUTY +
           ((SERVO_90_DEG_DUTY - SERVO_0_DEG_DUTY) * angle) /
           SERVO_MAX_ANGLE;
}

static void set_left_servo_angle(uint16_t angle)
{
    uint32_t duty = angle_to_duty(angle);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, duty);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);
}

static void set_right_servo_angle(uint16_t angle)
{
    uint32_t duty = angle_to_duty(angle);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
}

static void move_servo2_smoothly(uint16_t start_angle, uint16_t end_angle)
{
    if (start_angle < end_angle) {
        for (int angle = start_angle; angle <= end_angle; angle++) {
            set_left_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS));
        }
    } else {
        for (int angle = start_angle; angle >= end_angle; angle--) {
            set_left_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS));
        }
    }
}

static void move_servo_smoothly_right(uint16_t start_angle, uint16_t end_angle)
{
    if (start_angle > end_angle) {
        for (int angle = start_angle; angle >= end_angle; angle--) {
            set_right_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS));
        }
    } else {
        for (int angle = start_angle; angle <= end_angle; angle++) {
            set_right_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS));
        }
    }
}

void servoEnable (bool val){
    open_close_val_left = val;
}

void servoRotate_task(void *parameters)
{
    ledc_timer_config_t timer_conf = {
        .duty_resolution = LEDC_TIMER_14_BIT,
        .freq_hz = 50,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_1,
        .clk_cfg = LEDC_AUTO_CLK,
    };

     ledc_timer_config_t timer2_conf = {
        .duty_resolution = LEDC_TIMER_14_BIT,
        .freq_hz = 50,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_2,
        .clk_cfg = LEDC_AUTO_CLK,
    };

     ledc_channel_config_t ledc_channel_right = {
        .gpio_num = right_SERVO,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0,
        .timer_sel = LEDC_TIMER_1,
        .intr_type = LEDC_INTR_DISABLE,

        // Begin at a valid position instead of duty = 0.
        .duty = SERVO_0_DEG_DUTY,
        .hpoint = 0
    };

    ledc_channel_config_t ledc_channel_servo2 = {
        .gpio_num = LeftServoPin,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_1,
        .timer_sel = LEDC_TIMER_2,
        .intr_type = LEDC_INTR_DISABLE,

        // Begin at a valid position instead of duty = 0.
        .duty = SERVO_0_DEG_DUTY,
        .hpoint = 0
    };


   

    ESP_ERROR_CHECK(ledc_timer_config(&timer_conf));
        ESP_ERROR_CHECK(ledc_timer_config(&timer2_conf));

    ESP_ERROR_CHECK(ledc_channel_config(&ledc_channel_right));
    ESP_ERROR_CHECK(ledc_channel_config(&ledc_channel_servo2));


    bool last_command = false;

    while (1) {
        
      bool command = open_close_val_left;
       if (command != last_command){
        if (command == true){
               // Smoothly open the lid.
            move_servo2_smoothly(0, 90);
        }else {
          // Smoothly close the lid.
          move_servo2_smoothly(90,0);

       }
       last_command = command; 
       }
       
        //move_servo_smoothly_right(0,20);
      // vTaskDelay(pdMS_TO_TICKS(1000));
     
        //move_servo_smoothly_right(20, 0);


      vTaskDelay(pdMS_TO_TICKS(500));

       
    }
}


