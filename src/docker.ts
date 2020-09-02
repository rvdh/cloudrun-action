import * as core from '@actions/core'

export async function getEnvVarsFromImage(
  name: string
): Promise<string[] | undefined> {
  const Docker = require('dockerode')
  const docker = new Docker({socketPath: '/var/run/docker.sock'})
  try {
    const image = await docker.imageInspect(name)
    core.info(JSON.stringify(image, null, 4))
    return (await image).Config?.Env
  } catch (error) {
    core.setFailed(error.message)
  }

  return undefined
}
