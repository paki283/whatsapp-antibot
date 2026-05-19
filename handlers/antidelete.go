package handlers

import "fmt"

func HandleDelete(group string, msg string) {

	if !IsEnabled(group, "antidelete") {
		return
	}

	fmt.Println("Deleted Message:", msg)
}
