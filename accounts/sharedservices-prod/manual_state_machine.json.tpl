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
        "Cluster": "${aws_ecs_cluster.render_cluster.id}",
        "LaunchType": "FARGATE",
        "TaskDefinition": "${aws_ecs_task_definition.render_video.arn}",
        "NetworkConfiguration": {
          "AwsvpcConfiguration": {
            "Subnets": [
              "${aws_subnet.API_public_subnet_1.id}",
              "${aws_subnet.API_public_subnet_2.id}"
            ],
            "SecurityGroups": ["${aws_security_group.efs_sg.id}"],
            "AssignPublicIp": "ENABLED"
          }
        },
        "Overrides": {
          "ContainerOverrides": [{
            "Name": "render_video",
            "Environment": [
              { "Name": "EVENT_JSON", "Value.$": "$" }
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
