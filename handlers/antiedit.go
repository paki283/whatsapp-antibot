package handlers

import "fmt"

func HandleEdit(group string, oldMsg string, newMsg string) {

	if !IsEnabled(group, "antiedit") {
		return
	}

	fmt.Println("OLD:", oldMsg)
	fmt.Println("NEW:", newMsg)
}
