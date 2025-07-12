{
  "Comment": "Generate recap images for every account and notify Teams",
  "StartAt": "RunWeeklyRecap",
  "States": {
    "RunWeeklyRecap": {
    "Type": "Task",
    "Resource": "arn:aws:states:::ecs:runTask.sync",   // 👈 change
    "Parameters": {
        "Cluster":           "${ecs_cluster_arn}",
        "LaunchType":        "FARGATE",
        "TaskDefinition":    "${recap_task_def_arn}",
        "NetworkConfiguration": {
        "AwsvpcConfiguration": {
            "Subnets":        ${subnet_ids},
            "SecurityGroups": ${sg_ids},
            "AssignPublicIp": "ENABLED"
        }
        },
        "Overrides": {
        "ContainerOverrides": [{
            "Name": "weekly_recap",
            "Environment": [
            { "Name": "EVENT_JSON", "Value.$": "States.JsonToString($)" }
            ]
        }]
        }
    },
    "End": true
    }
  }
}
