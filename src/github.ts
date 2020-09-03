import * as core from '@actions/core'
import * as github from '@actions/github'

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

  if (githubToken) {
    const octokit = github.getOctokit(githubToken, {
      userAgent: 'rvdh/cloudrun-action'
    })
    const authenticatedUser = await octokit.users.getAuthenticated()
    core.debug(JSON.stringify(authenticatedUser, null, 4))
  }
  return 'foo'
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
