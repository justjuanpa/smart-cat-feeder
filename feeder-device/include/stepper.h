//rotate foward
//rotate backwards
//configuration if needed 
//will be used in the load cell task
#ifndef STEPPER_H
#define STEPPER_H

//6/6/26 note:
//hey future jay the code for the stepper is almost done 
//the only major thing that needs to happen is making work
//with the pi commands 
//for example if the pi detects that the pet for the right side
//only the rightmost stepper should move 
//you can either have a seprate task
//a sepreate function
//or maybe even a semaphore
//maybe for that last one lmao

void rotate_foward();
void rotate_backward();
void step_init();
void stepper_spin_task(void *parameters); //spin the servo forward 
void stepper_stop_task(void *parameters); //spin the servo backwards for cleanning 
void stepper_spin_stop(bool val);
void stepper_task(void *para);
void stepperEnableLeft(bool val);
void stepperEnableRight(bool val);
//and to get rid of extra food 

#endif // STEPPER_H