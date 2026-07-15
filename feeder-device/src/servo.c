#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/ledc.h"
#include "driver/gpio.h"
#include "servo.h"
#include "esp_err.h"
#include "jay_hx711.h"
#include "freertos/semphr.h"


#define RightServoPin GPIO_NUM_18
#define LeftServoPin GPIO_NUM_17
#define RBTN GPIO_NUM_39
#define LBTN GPIO_NUM_40


// Calibrated LEDC duty-count limits for your lid mechanism.
// These are duty counts, not microseconds.
#define SERVO_0_DEG_DUTY   1240
#define SERVO_90_DEG_DUTY  2120

#define SERVO_0_DUTY_RIGHT 430
#define SERVO_90_DUTY_RIGHT 1350

#define SERVO_MIN_ANGLE    0
#define SERVO_MAX_ANGLE    90

// Increasing this value slows the lid down.
// Start with 20 ms because the servo PWM period is also 20 ms.
#define SERVO_STEP_DELAY_MS_L 15
#define SERVO_STEP_DELAY_MS_R 15

#define SERVO_STEP_DELAY_MS_L_CLOSE 20
#define SERVO_STEP_DELAY_MS_R_CLOSE 20

#define BUTTON_DEBOUNCE_MS       120
#define DOUBLE_CLICK_WINDOW_MS   400

static int right_servo_current_angle = 90;
static int left_servo_current_angle = 0;

bool servoStatusLeft;
bool servoStatusRight; 
volatile bool manual_overide_servo_r = false;
volatile bool manual_overide_servo_l = false; 

static SemaphoreHandle_t xBTNRSem; 
static SemaphoreHandle_t xBTNLSem;


bool open_close_val_left = false; //if false the servo should stay close 
//if true the servo should stay open 

bool open_close_val_right = false; 

//RBTN ISR
void IRAM_ATTR SERVOBTTN_RIGHT_ISR(void *parameter){
    BaseType_t xHigherPrioTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR(xBTNRSem, &xHigherPrioTaskWoken);
    if (xHigherPrioTaskWoken == pdTRUE){
        portYIELD_FROM_ISR();
    }
}

//LBTN ISR
void IRAM_ATTR SERVOBTTN_LEFT_ISR(void *parameter){
    BaseType_t xHigherPrioTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR(xBTNLSem, &xHigherPrioTaskWoken);
    if (xHigherPrioTaskWoken == pdTRUE){
        portYIELD_FROM_ISR();
    }
}

void servoEnableLeft (bool val){
    open_close_val_left = val;
}

void servoEnableRight (bool val){
    open_close_val_right = val; 
}

bool rightServoStatus(void){
    return servoStatusRight;
}

bool leftServoStatus(void){
    return servoStatusLeft;
}

static uint32_t left_angle_to_duty(uint16_t angle){
    if (angle > SERVO_MAX_ANGLE) {
        angle = SERVO_MAX_ANGLE;
    }

    return SERVO_0_DEG_DUTY +
           ((SERVO_90_DEG_DUTY - SERVO_0_DEG_DUTY) * angle) /
           SERVO_MAX_ANGLE;
}

static uint32_t right_angle_to_duty(uint16_t angle){
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
    left_servo_current_angle = angle;
}

static void set_right_servo_angle(uint16_t angle)
{
    uint32_t duty = right_angle_to_duty(angle);

    ESP_ERROR_CHECK(
        ledc_set_duty(
            LEDC_LOW_SPEED_MODE,
            LEDC_CHANNEL_0,
            duty
        )
    );

    ESP_ERROR_CHECK(
        ledc_update_duty(
            LEDC_LOW_SPEED_MODE,
            LEDC_CHANNEL_0
        )
    );

    right_servo_current_angle = angle;
}

void moveLEFTservoTo(uint16_t target_angle)
{
    if (target_angle > SERVO_MAX_ANGLE) {
        target_angle = SERVO_MAX_ANGLE;
    }

    if (left_servo_current_angle == target_angle) {
        printf("Left servo already at %u degrees\n", target_angle);
        return;
    }

    if (left_servo_current_angle < target_angle) {
        for (int angle = left_servo_current_angle;
             angle <= target_angle;
             angle++) {

            set_left_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS_L));
        }
    } else {
        for (int angle = left_servo_current_angle;
             angle >= target_angle;
             angle--) {

            set_left_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS_L_CLOSE));
        }
    }

    servoStatusLeft = (target_angle == 90);
}

static void moveRIGHTservoTo(uint16_t target_angle)
{
    if (target_angle > SERVO_MAX_ANGLE) {
        target_angle = SERVO_MAX_ANGLE;
    }

    if (right_servo_current_angle == target_angle) {
        printf("Right servo already at %u degrees\n", target_angle);
        return;
    }

    if (right_servo_current_angle < target_angle) {
        for (int angle = right_servo_current_angle;
             angle <= target_angle;
             angle++) {

            set_right_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS_R_CLOSE));
        }
    } else {
        for (int angle = right_servo_current_angle;
             angle >= target_angle;
             angle--) {

            set_right_servo_angle(angle);
            vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_DELAY_MS_R));
        }
    }

    servoStatusRight = (target_angle == 0);
}


void manual_right_servo_task(void *para){
    bool manual_right_servo_lid = rightServoStatus();
    bool stored_right_position = rightServoStatus();


    TickType_t last_accepted_click_r = 0;

    xBTNRSem = xSemaphoreCreateBinary();
    gpio_install_isr_service(0);

    assert(xBTNRSem);
    gpio_reset_pin(RBTN);
    gpio_set_direction(RBTN, GPIO_MODE_INPUT); //PIR Sensor will input a signal
    gpio_pulldown_en(RBTN);
    gpio_pullup_dis(RBTN);
    gpio_set_intr_type(RBTN, GPIO_INTR_POSEDGE);
    gpio_isr_handler_add(RBTN,SERVOBTTN_RIGHT_ISR, NULL);

    while (1) {
        //Wait for the first button press.
        if (xSemaphoreTake(xBTNRSem, portMAX_DELAY) != pdTRUE) {
            continue;
        }

        TickType_t first_click_time_r = xTaskGetTickCount();

        //Ignore switch bounce from the previous accepted click.
        if ((first_click_time_r - last_accepted_click_r) <
            pdMS_TO_TICKS(BUTTON_DEBOUNCE_MS)) {
            continue;
        }
        last_accepted_click_r = first_click_time_r;

        //A click enters manual mode and toggles the servo.
        if (!manual_overide_servo_r) {
            stored_right_position = rightServoStatus();
            manual_right_servo_lid = stored_right_position;
            manual_overide_servo_r = true;
            printf("Entering manual mode\n");
        }

        if (manual_right_servo_lid) {
            printf("Button pressed: closing lid\n");
            moveRIGHTservoTo(90);  // closed
            manual_right_servo_lid = false;
        } 
        else {
            printf("Button pressed: opening lid\n");
            moveRIGHTservoTo(0);   // open
            manual_right_servo_lid = true;
        }

        //Remove any semaphore caused by bouncing while the servo moved.
        while (xSemaphoreTake(xBTNRSem, 0) == pdTRUE) {}

        //Wait briefly for an intentional second click.
        BaseType_t second_click_r = xSemaphoreTake(
            xBTNRSem,
            pdMS_TO_TICKS(DOUBLE_CLICK_WINDOW_MS)
        );

        if (second_click_r == pdTRUE) {
            TickType_t second_click_time_r = xTaskGetTickCount();

            //Reject events that happened too quickly and are likely bounce.
            if ((second_click_time_r - first_click_time_r) >= pdMS_TO_TICKS(BUTTON_DEBOUNCE_MS)) {
                printf("Double click: returning to automatic mode\n");
                //Keep manual override enabled while restoring the servo.
                //This prevents servoRotate_task from controlling the same servo.
                if (stored_right_position) {
                    printf("Restoring open position\n");
                    moveRIGHTservoTo(0);   // open
                    manual_right_servo_lid = true;
                } else {
                    printf("Restoring closed position\n");
                    moveRIGHTservoTo(90);  // closed
                    manual_right_servo_lid = false;
                }

                //Only release the servo to automatic control after movement finishes.
                manual_overide_servo_r = false;
                last_accepted_click_r = second_click_time_r;
            }
        }

        //Remove any remaining bounce events.
        while (xSemaphoreTake(xBTNRSem, 0) == pdTRUE) {}
    }
}

void manual_left_servo_task(void *para){
    bool manual_left_servo_lid = leftServoStatus();
    bool stored_left_position = leftServoStatus();
    TickType_t last_accepted_click_l = 0;
    xBTNLSem = xSemaphoreCreateBinary();
    gpio_install_isr_service(0);
    assert(xBTNLSem); 
    gpio_reset_pin(LBTN);
    gpio_set_direction(LBTN, GPIO_MODE_INPUT); //PIR Sensor will input a signal
    gpio_pulldown_en(LBTN);
    gpio_pullup_dis(LBTN);
    gpio_set_intr_type(LBTN, GPIO_INTR_POSEDGE);
    gpio_isr_handler_add(LBTN,SERVOBTTN_LEFT_ISR, NULL);

    while(1){
         //Wait for the first left button press.
        if (xSemaphoreTake(xBTNLSem, portMAX_DELAY) != pdTRUE) {
            continue;
        }
        TickType_t first_click_time_l = xTaskGetTickCount();

        //Ignore switch bounce from the previous accepted click.
        if ((first_click_time_l - last_accepted_click_l) <
            pdMS_TO_TICKS(BUTTON_DEBOUNCE_MS)) {

            continue;
        }
        last_accepted_click_l = first_click_time_l;

        //A click enters manual mode and toggles the servo.
        if (!manual_overide_servo_l) {
            stored_left_position = leftServoStatus();
            manual_left_servo_lid = stored_left_position;
            manual_overide_servo_l = true;

            printf("Entering manual mode\n");
        }
        if (manual_left_servo_lid) {
            printf("Button pressed: closing left lid\n");

            moveLEFTservoTo(0);  // closed
            manual_left_servo_lid = false;
        } else {
            printf("Button pressed: opening left lid\n");

            moveLEFTservoTo(90);   // open
            manual_left_servo_lid = true;
        }

        //Remove any semaphore caused by bouncing while the servo moved.
        while (xSemaphoreTake(xBTNLSem, 0) == pdTRUE) {}

        //Wait briefly for an intentional second click.
        BaseType_t second_click_l = xSemaphoreTake(
            xBTNLSem,
            pdMS_TO_TICKS(DOUBLE_CLICK_WINDOW_MS)
        );

        if (second_click_l == pdTRUE) {
            TickType_t second_click_time_l = xTaskGetTickCount();
            //Reject events that happened too quickly and are likely bounce.
            if ((second_click_time_l - first_click_time_l) >= pdMS_TO_TICKS(BUTTON_DEBOUNCE_MS)) {
                printf("Double click: returning to automatic mode\n");
                //Keep manual override enabled while restoring the servo.
                //This prevents servoRotate_task from controlling the same servo.
                if (stored_left_position) {
                    printf("Restoring open position on the left cover\n");
                    moveLEFTservoTo(90);   // open
                    manual_left_servo_lid = true;
                } else {
                    printf("Restoring closed position on the left cover\n");
                    moveLEFTservoTo(0);  // closed
                    manual_left_servo_lid = false;
                }

                //Only release the servo to automatic control after movement finishes.
                manual_overide_servo_l = false;
                last_accepted_click_l = second_click_time_l;
            }
        }

         //Remove any remaining bounce events.
        while (xSemaphoreTake(xBTNLSem,0) == pdTRUE) {}
    }


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
      if (!manual_overide_servo_l){
       // printf("left servo should be locked\n");
        if (command_left != last_command_left){
        if (command_left == true){
            // Smoothly open the lid.
            moveLEFTservoTo(90);
        }
        else {
          // Smoothly close the lid.
          moveLEFTservoTo(0);
        }
        last_command_left = command_left; 
       }
      }
      

       if (!manual_overide_servo_r){
        if (command_right != last_command_right){
        if (command_right == true){
             moveRIGHTservoTo(0); //Open right lid
        }
        else{
            moveRIGHTservoTo(90); //Close right lid
        }
        last_command_right = command_right; 
       }
       }
      vTaskDelay(pdMS_TO_TICKS(250)); 
    }
}


