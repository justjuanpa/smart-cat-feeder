#ifndef LEDSTRIP_H
#define LEDSTRIP_H

void ledstrip_task(void *parameters);
void lux_data_task(void *parameters);
void i2c_test_task(void *parameters);
bool ledStats(void);

#endif // LEDSTRIP_H
