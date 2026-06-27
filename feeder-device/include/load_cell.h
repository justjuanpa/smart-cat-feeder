#ifndef LOAD_CELL_H
#define LOAD_CELL_H

void load_cell_init(void);
float load_cell_get_grams(void);
void load_cell_task(void *parameters);

#endif //LOAD_CELL_H