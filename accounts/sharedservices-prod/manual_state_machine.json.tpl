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
      "Resource": "arn:aws:states:::ecs:runTask.sync",
      "Parameters": {
        "Cluster": "${ecs_cluster_arn}",
        "LaunchType": "FARGATE",
        "TaskDefinition": "${render_task_def_arn}",
        "NetworkConfiguration": {
          "AwsvpcConfiguration": {
            "Subnets": ${subnet_ids},
            "SecurityGroups": ${sg_ids},
            "AssignPublicIp": "ENABLED"
          }
        },
        "Overrides": {
          "ContainerOverrides": [{
            "Name": "render_video",
            "Environment": [
              {
                "Name": "EVENT_JSON",
                "Value.$": "States.JsonToString($)"   ←─ stringify the whole input
              }
            ]
          }]
        }
      },
      "ResultPath": "$.videoResult",
      "Next": "DeleteLogo"
    },

    "DeleteLogo": {
      "Type": "Task",
      "Resource": "${delete_logo_arn}",
      "ResultPath": "$.deleteLogoResult",
      "Next": "NotifyUser"
    },

    "NotifyUser": {
      "Type": "Task",
      "Resource": "${notify_post_arn}",
      "InputPath": "$",
      "ResultPath": "$.notificationResult",
      "End": true
    }
  }
}