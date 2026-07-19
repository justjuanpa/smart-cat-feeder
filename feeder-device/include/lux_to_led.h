#ifndef LEDSTRIPNEW_H
#define LEDSTRIPNEW_H
#include <stdbool.h>

void LUX_to_LED_task(void *parameters);
void lux_data_task(void *parameters);
void i2c_test_task(void *parameters);
void detection_led_task(void *para);
void match_val_receive(int para);
void PirLedDoor(bool val); 
void led_receive_command_l(char *command);
void led_receive_command_r(char *command);
void led_receive_command_deny(char *command);

int ledStats(void);

#endif // LEDSTRIPNEW_H0