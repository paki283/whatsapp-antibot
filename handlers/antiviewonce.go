package handlers

import "fmt"

func HandleViewOnce(group string, media string) {

	if !IsEnabled(group, "antiviewonce") {
		return
	}

	fmt.Println("ViewOnce Media:", media)
}
