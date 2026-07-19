# # This file was automatically generated for projects
# # without default 'CMakeLists.txt' file.

# FILE(GLOB_RECURSE app_sources ${CMAKE_SOURCE_DIR}/src/*.*)

# idf_component_register(SRCS ${app_sources})

idf_component_register(
    SRCS 
    "main.c" 
    "jay_hx711.c"
    "uart_comm.c" 
    "servo.c"
    "stepper.c"
    "esp_ws28xx.c"
    #  "ledstrip.c"
    #"lux_stuff.c"
    "lux_to_led.c"
    INCLUDE_DIRS "../include"
)
