{
  "Comment": "State machine for automating post workflow",
  "StartAt": "FetchData",
  "States": {
    "FetchData": {
      "Type": "Task",
      "Resource": "${fetch_data_arn}",
      "ResultPath": "$.Data",
      "Next": "CheckPost"
    },
    "CheckPost": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.Data.status",
          "StringEquals": "post_found",
          "Next": "ProcessContent"
        }
      ],
      "Default": "EndWorkflow"
    },
    "ProcessContent": {
      "Type": "Task",
      "Resource": "${process_content_arn}",
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
