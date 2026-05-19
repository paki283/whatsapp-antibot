package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func main() {

	go startWebPanel()

	fmt.Println("WhatsApp Bot Started")

	select {}
}

func startWebPanel() {
	r := gin.Default()

	r.Static("/",
		"./web")

	r.GET("/pair", func(c *gin.Context) {
		number := c.Query("number")

		if number == "" {
			c.JSON(400, gin.H{
				"error": "number required",
			})
			return
		}

		code := "123-456"

		c.JSON(200, gin.H{
			"pair_code": code,
		})
	})

	http.ListenAndServe(":8080", r)
}
