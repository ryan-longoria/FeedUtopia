{
  "Comment": "State machine for automating anime post workflow with MoviePy",
  "StartAt": "FetchRSS",
  "States": {
    "FetchData": {
      "Type": "Task",
      "Resource": "${fetch_data_arn}",
      "ResultPath": "$.fetched",
      "Next": "CheckNews"
    },
    "CheckNews": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.fetched.status",
          "StringEquals": "post_found",
          "Next": "CheckDuplicate"
        }
      ],
      "Default": "EndWorkflow"
    },
    "CheckDuplicate": {
      "Type": "Task",
      "Resource": "${check_duplicate_arn}",
      "InputPath": "$.fetched",
      "ResultPath": "$.dupCheck",
      "Next": "CheckPost"
    },
    "CheckPost": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.dupCheck.status",
          "StringEquals": "duplicate",
          "Next": "EndWorkflow"
        },
        {
          "Variable": "$.dupCheck.status",
          "StringEquals": "post_found",
          "Next": "NotifyUser"
        }
      ],
      "Default": "EndWorkflow"
    },
    "NotifyUser": {
      "Type": "Task",
      "Resource": "${notify_post_arn}",
      "InputPath": "$.fetched",
      "ResultPath": "$.notificationResult",
      "End": true
    },
    "EndWorkflow": {
      "Type": "Succeed"
    }
  }
}
