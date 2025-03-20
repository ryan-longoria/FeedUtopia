{
  "Comment": "State machine for the manual post workflow",
  "StartAt": "GetLogo",
  "States": {
    "GetLogo": {
      "Type": "Task",
      "Resource": "${get_logo_arn}", 
      "ResultPath": "$.logoResult",
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
    }
  }
}
