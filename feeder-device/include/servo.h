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

#endif // SERVO_H
