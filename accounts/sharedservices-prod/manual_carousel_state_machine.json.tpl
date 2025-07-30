{
  "Comment": "Manual carousel workflow",
  "StartAt": "GetLogo",
  "States": {
    "GetLogo": {
      "Type": "Task",
      "Resource": "${get_logo_lambda_arn}",
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
                { "Name": "EVENT_JSON", "Value.$": "States.JsonToString($)" },
                { "Name": "TASK_TOKEN", "Value.$": "$$.Task.Token" }
              ]
            }
          ]
        }
      },
      "TimeoutSeconds": 7200,
      "ResultPath": "$.renderResult",
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
      "Parameters": {
        "accountName.$": "$.accountName",
        "spinningArtifact.$": "$.spinningArtifact",
        "backgroundType": "carousel",
        "title.$": "$.title",
        "description.$": "$.description",
        "highlightWordsTitle.$": "$.highlightWordsTitle",
        "highlightWordsDescription.$": "$.highlightWordsDescription",
        "folder.$": "$.renderResult.folder",
        "imageKeys.$": "$.renderResult.imageKeys"
      },
      "ResultPath": "$.notifyResult",
      "Next": "DeleteLogo"
    },

    "NotifyFailure": {
      "Type": "Task",
      "Resource": "${notify_post_lambda_arn}",
      "Parameters": {
        "status": "failed",
        "reason": "carousel_render_failed",
        "accountName.$": "$.accountName",
        "spinningArtifact.$": "$.spinningArtifact",
        "error.$": "$.renderError"
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
