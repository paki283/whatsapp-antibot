package handlers

var GroupSettings = map[string]map[string]bool{}

func SetFeature(group string, feature string, value bool) {

	if GroupSettings[group] == nil {
		GroupSettings[group] = map[string]bool{}
	}

	GroupSettings[group][feature] = value
}

func IsEnabled(group string, feature string) bool {

	if GroupSettings[group] == nil {
		return false
	}

	return GroupSettings[group][feature]
}
