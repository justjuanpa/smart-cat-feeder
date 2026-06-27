#ifndef FEEDER_CONTROL_H
#define FEEDER_CONTROL_H

#include <stdbool.h>

void feeder_control_init(void);

void feeder_open_start(void);
void feeder_stepper_start(void);

bool feeder_motor_is_busy(void);

#endif // FEEDER_CONTROL_H