import * as core from '@actions/core'
import * as gcloud from './gcloud'
import * as github from './github'
import * as docker from './docker'

async function create(): Promise<void> {
  const name: string = core.getInput('name', {required: true})
  const serviceAccountKey: string = core.getInput('service_account_key', {
    required: true
  })
  const runRegion: string = core.getInput('run_region', {required: true})
  const image: string = core.getInput('image', {required: true})
  const serviceAccountName: string = core.getInput('service_account_name', {
    required: true
  })
  const vpcConnectorName: string = core.getInput('vpc_connector_name')

  core.info(`Deploying docker image ${image}...`)

  // add github comment
  let comment = `🤖&nbsp;Cloud Run Deployment in progress 🤖\n`
  const comment_id = await github.addPullRequestComment(comment)

  // update comment (checking for image)
  comment += `<details><summary>Waiting for the docker image to be available on Google Container Registry.</summary>Image: ${image}</details>\n`
  // wait for image
  github.updatePullRequestComment(comment_id, comment)

  if (!(await gcloud.waitForDockerImage(image, serviceAccountKey))) {
    comment += `Docker image not found, stopping.\n`
    github.updatePullRequestComment(comment_id, comment)
    core.setFailed('Docker image not found, stopping.')
    return
  }

  const envVars = await docker.getEnvVarsFromImage(image)
  if (envVars !== undefined) {
    comment += `<details><summary>Configurable environment variables</summary><ul>\n`

    comment += `\n\`\`\`bash\n`
    for (let i = 0; i < envVars?.length; i++) {
      comment += `${envVars[i]}\n`
    }
    comment += '```\n'

    comment += `</details>\nConfigure environment variables by commenting '@${await github.getUsername()} set KEY=VALUE'\n`
    github.updatePullRequestComment(comment_id, comment)
  }

  try {
    const {url, logsUrl} = await gcloud.createOrUpdateCloudRunService(
      name,
      runRegion,
      image,
      serviceAccountName,
      serviceAccountKey,
      vpcConnectorName
    )
    comment += `🤖  Cloud Run Deployment: Deployment succesful, url: ${url}.\n`
    comment += `Logs: ${logsUrl}\n`
    github.updatePullRequestComment(comment_id, comment)
  } catch (error) {
    comment += `🤖  Cloud Run Deployment: Deployment failed: ${error.message}.\n`
    github.updatePullRequestComment(comment_id, comment)
    throw error
  }
}

async function destroy(): Promise<void> {
  try {
    const name: string = core.getInput('name', {required: true})
    const serviceAccountKey: string = core.getInput('service_account_key', {
      required: true
    })
    const runRegion: string = core.getInput('run_region', {required: true})
    core.info(`Deleting Cloud Run deployment ${name}...`)

    // add github comment
    let comment = `🤖  Cloud Run Deployment: Deleting\n`
    const comment_id = await github.addPullRequestComment(comment)
    try {
      await gcloud.deleteCloudRunService(name, runRegion, serviceAccountKey)
      comment += `🤖  Cloud Run Deployment: Deployment succesfully deleted.\n`
      github.updatePullRequestComment(comment_id, comment)
    } catch (error) {
      comment += `🤖  Cloud Run Deployment: Deployment deletion failed: ${error.message}.\n`
      github.updatePullRequestComment(comment_id, comment)
      throw error
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function main(): Promise<void> {
  try {
    if (core.getInput('delete_service') === 'false') {
      create()
    } else {
      destroy()
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
