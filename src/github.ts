import * as core from '@actions/core'
import * as github from '@actions/github'
import {getCloudRunEnvironmentVariables} from './gcloud'

export async function addPullRequestComment(comment: string): Promise<number> {
  const githubToken = core.getInput('github_token')

  if (githubToken) {
    const octokit = github.getOctokit(githubToken, {
      userAgent: 'rvdh/cloudrun-action'
    })

    if (github.context.payload.pull_request) {
      const {data: issueComment} = await octokit.issues.createComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.issue.number,
        body: comment
      })

      return issueComment.id
    }
  }
  return -1
}

export async function getUsername(): Promise<string> {
  const githubToken = core.getInput('github_token')

  const octokit = github.getOctokit(githubToken, {
    userAgent: 'rvdh/cloudrun-action'
  })
  const authenticatedUser = await octokit.users.getAuthenticated()
  return authenticatedUser.data.login
}

export async function updatePullRequestComment(
  comment_id: number,
  comment: string
): Promise<number> {
  const githubToken = core.getInput('github_token')

  if (githubToken) {
    const octokit = github.getOctokit(githubToken, {
      userAgent: 'rvdh/cloudrun-action'
    })

    if (github.context.payload.pull_request) {
      const {data: issueComment} = await octokit.issues.updateComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        comment_id,
        body: comment
      })

      return issueComment.id
    }
  }
  return -1
}

export async function getConfiguredEnvVars(
  supportedEnvVars: string[]
): Promise<{name: string; value: string}[]> {
  // get environment variables from workflow file
  const envVars = getCloudRunEnvironmentVariables()

  // get labels from pull request
  const githubToken = core.getInput('github_token')
  const trigger_label = core.getInput('trigger_label')

  if (githubToken) {
    const octokit = github.getOctokit(githubToken, {
      userAgent: 'rvdh/cloudrun-action'
    })

    const {data: issueLabels} = await octokit.issues.listLabelsOnIssue({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: github.context.issue.number
    })

    const supportedEnvVarNames = []
    for (const key of supportedEnvVars) {
      core.debug(key)
      core.debug(JSON.stringify(key.split('='), null, 4))
      const envVarName = key.split('=', 2)[0]
      supportedEnvVarNames.push(envVarName)
    }
    core.debug(
      `supportedEnvVarNames: ${JSON.stringify(supportedEnvVarNames, null, 4)}`
    )

    for (const key of issueLabels) {
      core.debug(`issue label: ${key.name}`)
      if (key.name === trigger_label) continue

      if (key.name in supportedEnvVarNames) {
        envVars.push({
          name: key.name,
          value: key.description
        })
      } else {
        core.debug(`${key.name} not in ${supportedEnvVarNames}`)
      }
    }
  }

  return envVars
}
