{
  "Comment": "Manual carousel workflow",
  "StartAt": "GetLogo",
  "States": {
    "GetLogo": {
      "Type": "Task",
      "Resource": "${get_logo_lambda_arn}",
      "InputPath": "$",
      "ResultPath": "$.logoResult",
      "Next": "RenderCarousel"
    },

    "RenderCarousel": {
      "Type": "Task",
      "Resource": "arn:aws:states:::ecs:runTask.waitForTaskToken",
      "Parameters": {
        "Cluster": "${ecs_cluster_arn}",
        "LaunchType": "FARGATE",
        "TaskDefinition": "${render_carousel_task_def_arn}",
        "NetworkConfiguration": {
          "AwsvpcConfiguration": {
            "Subnets": ${subnet_ids},
            "SecurityGroups": ${sg_ids},
            "AssignPublicIp": "ENABLED"
          }
        },
        "Overrides": {
          "ContainerOverrides": [
            {
              "Name": "render_carousel",
              "Environment": [
                { "Name": "TASK_TOKEN", "Value.$": "$$.Task.Token" },
                { "Name": "EVENT_JSON", "Value.$": "States.JsonToString($)" }
              ]
            }
          ]
        }
      },
      "TimeoutSeconds": 7200,
      "Catch": [
        {
          "ErrorEquals": ["States.ALL"],
          "ResultPath": "$.renderError",
          "Next": "NotifyFailure"
        }
      ],
      "Next": "NotifySuccess"
    },

    "NotifySuccess": {
      "Type": "Task",
      "Resource": "${notify_post_lambda_arn}",
      "InputPath": "$",
      "ResultPath": "$.notifyResult",
      "Next": "DeleteLogo"
    },

    "NotifyFailure": {
      "Type": "Task",
      "Resource": "${notify_post_lambda_arn}",
      "Parameters": {
        "error.$": "$.renderError",
        "accountName.$": "$.accountName"
      },
      "ResultPath": "$.notifyResult",
      "Next": "DeleteLogo"
    },

    "DeleteLogo": {
      "Type": "Task",
      "Resource": "${delete_logo_lambda_arn}",
      "InputPath": "$",
      "ResultPath": "$.deleteResult",
      "End": true
    }
  }
}
