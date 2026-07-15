//open cover
//close cover
//configuration for pin 
#ifndef SERVO_H
#define SERVO_H

#include <stdbool.h>

void open_cover();
void close_cover(); 
void servo_init();
void servoRotate_task(void *parameters);
void servoEnableLeft(bool val);
void servoEnableRight(bool val);

bool rightServoStatus(void);
bool leftServoStatus(void);
void manual_right_servo_task(void *para);
void manual_left_servo_task(void *para);


#endif // SERVO_H
