{
  "Comment": "Manual carousel workflow: copy logo, render on ECS (waitForTaskToken), then notify Teams.",
  "StartAt": "GetLogo",
  "States": {
    "GetLogo": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "TimeoutSeconds": 30,
      "Parameters": {
        "FunctionName": "${get_logo_lambda_arn}",
        "Payload.$": "$"
      },
      "ResultSelector": {
        "status.$": "$.Payload.status",
        "logoKey.$": "$.Payload.logoKey",
        "sharedBucket.$": "$.Payload.sharedBucket",
        "targetAccountId.$": "$.Payload.targetAccountId"
      },
      "ResultPath": "$.logoResult",
      "Catch": [
        {
          "ErrorEquals": ["States.ALL"],
          "Next": "LogoFallback"
        }
      ],
      "Next": "RenderCarousel"
    },

    "LogoFallback": {
      "Type": "Pass",
      "Result": {
        "status": "failed"
      },
      "ResultPath": "$.logoResult",
      "Next": "RenderCarousel"
    },

    "RenderCarousel": {
      "Type": "Task",
      "Resource": "arn:aws:states:::ecs:runTask.waitForTaskToken",
      "TimeoutSeconds": 1800,
      "HeartbeatSeconds": 300,
      "Parameters": {
        "Cluster": "${ecs_cluster_arn}",
        "TaskDefinition": "${ecs_task_definition_arn}",
        "LaunchType": "FARGATE",
        "NetworkConfiguration": {
          "AwsvpcConfiguration": {
            "Subnets": ${subnet_id_list_json},
            "SecurityGroups": ${security_group_id_list_json},
            "AssignPublicIp": "ENABLED"
          }
        },
        "Overrides": {
          "ContainerOverrides": [
            {
              "Name": "render_carousel",
              "Environment": [
                {
                  "Name": "EVENT_JSON",
                  "Value.$": "States.JsonToString($)"
                },
                {
                  "Name": "TASK_TOKEN",
                  "Value.$": "$$.Task.Token"
                }
              ]
            }
          ]
        }
      },
      "ResultPath": "$.renderResult",
      "Catch": [
        {
          "ErrorEquals": ["States.Timeout", "States.TaskFailed", "States.ALL"],
          "Next": "RenderFailed"
        }
      ],
      "Next": "HasOutputs?"
    },

    "RenderFailed": {
      "Type": "Pass",
      "Result": {
        "status": "failed"
      },
      "ResultPath": "$.renderResult",
      "Next": "HasOutputs?"
    },

    "HasOutputs?": {
      "Type": "Choice",
      "Choices": [
        {
          "Or": [
            { "Variable": "$.renderResult.imageKeys", "IsPresent": true },
            { "Variable": "$.renderResult.video_key", "IsPresent": true }
          ],
          "Next": "NotifyTeams"
        }
      ],
      "Default": "FailNoOutputs"
    },

    "NotifyTeams": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "TimeoutSeconds": 20,
      "Parameters": {
        "FunctionName": "${notify_post_lambda_arn}",
        "Payload": {
          "accountName.$": "$.accountName",
          "imageKeys.$": "$.renderResult.imageKeys",
          "video_key.$": "$.renderResult.video_key",
          "videoResult.$": "$.renderResult.videoResult"
        }
      },
      "ResultSelector": {
        "status.$": "$.Payload.status",
        "itemCount.$": "$.Payload.itemCount"
      },
      "ResultPath": "$.notifyResult",
      "Catch": [
        {
          "ErrorEquals": ["States.ALL"],
          "Next": "NotifyFailed"
        }
      ],
      "Next": "Success"
    },

    "NotifyFailed": {
      "Type": "Pass",
      "Result": {
        "status": "notify_failed"
      },
      "ResultPath": "$.notifyResult",
      "Next": "Success"
    },

    "FailNoOutputs": {
      "Type": "Fail",
      "Error": "NoOutputs",
      "Cause": "Renderer did not produce any imageKeys or video_key."
    },

    "Success": {
      "Type": "Succeed"
    }
  }
}
