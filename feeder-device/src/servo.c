#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "servo.h"
#include "esp_err.h"
#include "jay_hx711.h"

#define RightServoPin GPIO_NUM_18
#define LeftServoPin GPIO_NUM_17

// Calibrated LEDC duty-count limits for your lid mechanism.
// These are duty counts, not microseconds.
#define SERVO_0_DEG_DUTY   1150
#define SERVO_90_DEG_DUTY  1900

#define SERVO_0_DUTY_RIGHT 600
#define SERVO_90_DUTY_RIGHT 1400

#define SERVO_MIN_ANGLE    0
#define SERVO_MAX_ANGLE    90

// Increasing this value slows the lid down.
// Start with 20 ms because the servo PWM period is also 20 ms.
#define SERVO_STEP_DELAY_MS 30
#define SERVO_STEP_DELAY_MS_R 15


bool open_close_val_left = false; //if false the servo should stay close 
//if true the servo should stay open 

bool open_close_val_right = false; 

static uint32_t left_angle_to_duty(uint16_t angle)
{
    if (angle > SERVO_MAX_ANGLE) {
        angle = SERVO_MAX_ANGLE;
    }

    return SERVO_0_DEG_DUTY +
           ((SERVO_90_DEG_DUTY - SERVO_0_DEG_DUTY) * angle) /
           SERVO_MAX_ANGLE;
}

static uint32_t right_angle_to_duty(uint16_t angle)
{
    if (angle > SERVO_MAX_ANGLE) {
        angle = SERVO_MAX_ANGLE;
    }

    return SERVO_0_DUTY_RIGHT +
           ((SERVO_90_DUTY_RIGHT - SERVO_0_DUTY_RIGHT) * angle) /
           SERVO_MAX_ANGLE;
}

static void set_left_servo_angle(uint16_t angle)
{
    uint32_t duty = left_angle_to_duty(angle);

    ESP_ERROR_CHECK(ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1));
}

static void set_right_servo_angle(uint16_t angle)
{
    uint32_t duty = right_angle_to_duty(angle);

    ESP_ERROR_CHECK(ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty));
    ESP_ERROR_CHECK(ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0));
}

static void moveLEFTservo(uint16_t start_angle, uint16_t end_angle)
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

static void moveRIGHTservo(uint16_t start_angle, uint16_t end_angle)
{
    if (start_angle > end_angle) {
        for (int angle = start_angle; angle >= end_angle; angle--) {
            set_right_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS_R));
        }
    } else {
        for (int angle = start_angle; angle <= end_angle; angle++) {
            set_right_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS_R));
        }
    }
}

void servoEnableLeft (bool val){
    open_close_val_left = val;
}

void servoEnableRight (bool val){
    open_close_val_right = val; 
}

void servoRotate_task(void *parameters)
{
    ledc_timer_config_t rightservotimer = {
        .duty_resolution = LEDC_TIMER_14_BIT,
        .freq_hz = 50,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_1,
        .clk_cfg = LEDC_AUTO_CLK,
    };

     ledc_timer_config_t leftservotimer = {
        .duty_resolution = LEDC_TIMER_14_BIT,
        .freq_hz = 50,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_2,
        .clk_cfg = LEDC_AUTO_CLK,
    };

     ledc_channel_config_t ledc_channel_right = {
        .gpio_num = RightServoPin,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0,
        .timer_sel = LEDC_TIMER_1,
        .intr_type = LEDC_INTR_DISABLE,

        // Begin at a valid position instead of duty = 0.
        .duty = SERVO_90_DUTY_RIGHT,
        .hpoint = 0
    };

    ledc_channel_config_t ledc_channel_left = {
        .gpio_num = LeftServoPin,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_1,
        .timer_sel = LEDC_TIMER_2,
        .intr_type = LEDC_INTR_DISABLE,

        // Begin at a valid position instead of duty = 0.
        .duty = SERVO_0_DEG_DUTY,
        .hpoint = 0
    };


   

    ESP_ERROR_CHECK(ledc_timer_config(&rightservotimer));
    ESP_ERROR_CHECK(ledc_timer_config(&leftservotimer));

    ESP_ERROR_CHECK(ledc_channel_config(&ledc_channel_right));
    ESP_ERROR_CHECK(ledc_channel_config(&ledc_channel_left));

    bool last_command_left = false;
    bool last_command_right = false;

    while (1) {
      bool command_left = open_close_val_left;
      bool command_right = open_close_val_right;

      if (command_left != last_command_left){
        if (command_left == true){
            // Smoothly open the lid.
            moveLEFTservo(0, 90);
        }
        else {
          // Smoothly close the lid.
          moveLEFTservo(90,0);
        }
        last_command_left = command_left; 
       }

       if (command_right != last_command_right){
        if (command_right == true){
                        moveRIGHTservo(90,0);

        }
        else{
                        moveRIGHTservo(0,90);

        }
        last_command_right = command_right; 
       }
       
      vTaskDelay(pdMS_TO_TICKS(250));

       
    }
}


