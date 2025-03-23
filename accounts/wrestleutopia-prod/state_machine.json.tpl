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
          "Next": "ProcessContent"
        }
      ],
      "Default": "EndWorkflow"
    },
    "ProcessContent": {
      "Type": "Task",
      "Resource": "${process_content_arn}",
      "InputPath": "$.fetched",
      "ResultPath": "$.processedContent",
      "Next": "StoreData"
    },
    "StoreData": {
      "Type": "Task",
      "Resource": "${store_data_arn}",
      "ResultPath": "$.storeResult",
      "Next": "RenderVideo"
    },
    "RenderVideo": {
      "Type": "Task",
      "Resource": "${render_video_arn}",
      "ResultPath": "$.videoResult",
      "Next": "NotifyUser"
    },
    "NotifyUser": {
      "Type": "Task",
      "Resource": "${notify_post_arn}",
      "InputPath": "$.videoResult",
      "ResultPath": "$.notificationResult",
      "End": true
    },
    "EndWorkflow": {
      "Type": "Succeed"
    }
  }
}
