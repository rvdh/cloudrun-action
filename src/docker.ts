import * as core from '@actions/core'

export async function getEnvVarsFromImage(
  name: string
): Promise<string[] | undefined> {
  const Docker = require('dockerode')
  const docker = new Docker({socketPath: '/var/run/docker.sock'})
  const serviceAccountKey: string = core.getInput('service_account_key', {
    required: true
  })

  const imageUrl = new URL(`https://${name}`)

  const auth = {
    username: '_json_key',
    password: serviceAccountKey,
    auth: '',
    email: '',
    serveraddress: `https://${imageUrl.host}/v2`
  }

  try {
    const image = await docker.pull(name, {authconfig: auth})
    const imageInspect = image.inspect()
    core.info(JSON.stringify(imageInspect, null, 4))
    core.info(JSON.stringify(image, null, 4))
    return (await image).Config?.Env
  } catch (error) {
    core.setFailed(error.message)
  }

  return undefined
}
