#ifndef WIFI_STA_H
#define WIFI_STA_H

#include "esp_err.h"

#define WIFI_STA_CONNECTED_BIT BIT0
#define WIFI_STA_IPV4_OBTAINED_BIT BIT1
#define WIFI_STA_IPV6_OBTAINED_BIT BIT2 

/** 
 * @brief Initalize WiFi in station (STA) mode
 * 
 * Set up the WiFi interfrace ad connect to a WiFi network. You can use the 
 * event group to wait for a connection and IP address assignment.
 * 
 * Important! You must call esp_netif_init() and eso_event_loop_create_default()
 * before calling this function
 * 
 * @param[in] event_group Event group handle for WiFi and IP events. Pass Null
 *                        to use the existing event group.
 * 
 * @return 
 *  - ESP_OK on success
 *  - Other errors on failure. See esp_err.h for error codes 
 */
esp_err_t wifi_sta_init(EventGroupHandle_t event_group);

/**
 * @brief Disable WiFi 
 * 
 * @return 
 *  - ESP_OK on suceess 
 *  - Other errors on failure 
 * 
 */
esp_err_t wifi_sta_stop(void);

/**
 * @brief Attempt to reconnect WiFi
 * 
 * @return 
 * - ESP_OK on success 
 * = Other errors on failure 
 */

esp_err_t wifi_sta_reconnect(void); 
#endif //WIFI_STA_H