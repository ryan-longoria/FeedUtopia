{
  "Comment": "State machine for automating post workflow",
  "StartAt": "FetchData",
  "States": {
    "FetchData": {
      "Type": "Task",
      "Resource": "${fetch_data_arn}",
      "ResultPath": "$.fetched",
      "Next": "CheckDuplicate"
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